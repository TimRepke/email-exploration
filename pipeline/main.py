#!/usr/bin/python

import sys, getopt
from pymongo import MongoClient
from email import parser as ep
from pprint import pprint
import os
import re
import logging
from optparse import OptionParser
import pyArango.connection as ara

logging.addLevelName(5, 'TRACE')
logging.addLevelName(3, 'MICROTRACE')
logging.basicConfig(format='%(asctime)s - [%(module)s] %(levelname)s - %(message)s',
                    datefmt='%H:%M:%S')


def log(lvl, msg, *args, **kwargs):
    logging.log(logging.getLevelName(lvl), msg, *args, **kwargs)


class Pipeline:
    def __init__(self):
        self.pipeline = []
        self._is_prepared = False

    @property
    def is_prepared(self):
        return self._is_prepared

    def add(self, step):
        self.pipeline.append(step)

    def prepare(self):
        for pipeline_part in self.pipeline:
            if not pipeline_part.is_prepared:
                log('DEBUG', 'Preparing pipeline part of type %s', type(pipeline_part))
                pipeline_part.prepare()
        self._is_prepared = True

    def transform(self, raw_mail):
        if not self.is_prepared:
            log('WARN', 'Forgot to prepare pipeline before using. Doing it for you!')
            self.prepare()

        transformed = raw_mail.get_payload()
        for pipeline_part in self.pipeline:
            log('TRACE', 'Calling pipeline part %s', type(pipeline_part))
            transformed = pipeline_part.transform(raw_mail, transformed)
        return raw_mail, transformed


class SourceFiles:
    def __init__(self, maildir, limit=None):
        self.maildir = maildir
        self.mailparser = ep.Parser()
        self.limit = limit
        self.current_root = ''
        self.current_stripped = ''

    def __iter__(self):
        self.run = 0
        self.os_walker = os.walk(self.maildir)
        self.current_dirs = []
        self.current_files = iter([])
        return self

    def _next_dir(self):
        self.current_root, self.current_dirs, files = next(self.os_walker)
        self.current_stripped = self.current_root[len(self.maildir):]
        logging.info('Entering directory ./%s/ with %d files and %d directories',
                     self.current_stripped, len(files), len(self.current_dirs))

        if len(files) > 0:
            self.current_files = iter(files)
        else:
            self._next_dir()

    def _next_file(self):
        try:
            file = next(self.current_files)
            with open(self.current_root + "/" + file, "r", errors='ignore') as f:
                self.run += 1
                return self.current_stripped, file, self.mailparser.parsestr(f.read())
        except StopIteration:
            self._next_dir()
            return self._next_file()

    def __next__(self):
        if self.limit is not None and self.limit <= self.run:
            logging.info('max number of mails (LIMIT=%d) is reached.', self.limit)
            raise StopIteration()

        return self._next_file()


class DataSinkArango:
    def __init__(self, user, pw, port=8529, db='enron', collection='mails'):
        self.connection = ara.Connection(arangoURL='http://127.0.0.1:' + str(port), username=user, password=pw)
        self.collection = self.connection[db][collection]

    def push(self, doc):
        self.collection.createDocument()


oparser = OptionParser()
oparser.add_option("-d", "--maildir",
                   dest="maildir",
                   metavar="DIR",
                   type="str",
                   help="starting at the root of DIR, all subfolders are read recursively and "
                        "files are interpreted by the pipeline into a sink",
                   default='/home/tim/Uni/HPI/workspace/enron/data/original')
oparser.add_option("-l", "--log-level",
                   dest="log_level",
                   metavar="LEVEL",
                   help="set log level to LEVEL",
                   type='choice',
                   choices=['MICROTRACE', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
                   default='INFO')
oparser.add_option("-n", "--limit",
                   dest="limit",
                   metavar="NUM",
                   help="limit number of mails to read to NUM",
                   type='int',
                   default=None)
oparser.add_option("--keras-model",
                   dest="keras_model",
                   metavar="FILE",
                   type="str",
                   help="path to FILE where weights of neural net for splitting mails is/should be stored",
                   default='/home/tim/Uni/HPI/workspace/enron/pipeline/model.hdf5')
oparser.add_option("--retrain-keras",
                   dest="keras_retrain",
                   help="set this flag to train the neural net for splitting mails",
                   action="store_true")
oparser.add_option("--include-signatures",
                   dest="include_signature",
                   help="set this flag to include signature detection, empty fields are added either way!",
                   action="store_true")
oparser.add_option("--path-annotated",
                   dest="path_annotated",
                   metavar="DIR",
                   type="str",
                   help="path to the DIR containing annotated emails to train neural net for splitting mails",
                   default='/home/tim/Uni/HPI/workspace/enron/pipeline/annotated_mails/')
oparser.add_option("-u", "--db-user",
                   dest="arango_user",
                   metavar="USER",
                   type="str",
                   help="username to the arangodb",
                   default='root')
oparser.add_option("-p", "--db-pw",
                   dest="arango_pw",
                   metavar="PW",
                   type="str",
                   help="user password to the arangodb",
                   default='test')
oparser.add_option("--db-port",
                   dest="arango_port",
                   metavar="NUM",
                   type="int",
                   help="the port on localhost the arangodb is listening on",
                   default=8529)
oparser.add_option("--db-name",
                   dest="arango_db",
                   metavar="DB",
                   type="str",
                   help="name of the database (DB) to use",
                   default='enron')
oparser.add_option("--db-collection",
                   dest="arango_collection",
                   metavar="COLL",
                   type="str",
                   help="name of the collection (COLL) in the database (DB) to use",
                   default='mails')

if __name__ == "__main__":
    (options, args) = oparser.parse_args()

    logging.root.setLevel(logging.getLevelName(options.log_level))

    from splitting_feature_rnn import Splitter
    from mixins import BodyCleanup, Tuples2Dicts
    from header_parsing_rules import ParseHeaderComponents, ParseAuthors, ParseDate

    pipeline = Pipeline()
    pipeline.add(BodyCleanup())
    pipeline.add(Splitter(options.path_annotated, window_size=8, include_signature=options.include_signature,
                          features=None, training_epochs=10, nb_slack_lines=4, retrain=options.keras_retrain,
                          model_path=options.keras_model))
    pipeline.add(Tuples2Dicts())
    pipeline.add(ParseHeaderComponents())
    pipeline.add(ParseAuthors())
    pipeline.add(ParseDate())

    # pipeline.prepare()

    read_cnt = 0

    data_source = SourceFiles(options.maildir, limit=options.limit)
    data_sink = DataSinkArango(options.arango_user, options.arango_pw, options.arango_port,
                               options.arango_db, options.arango_collection)

    for path, filename, mail in data_source:
        log('TRACE', 'Got mail from source: %s/%s', path, filename)
        mail, transformed = pipeline.transform(mail)

        maildoc = {
            "message_id": mail['Message-ID'],
            "folder": '/'.join(path.split('/')[2:]),
            "file": path + '/' + filename,
            "owner": path.split('/')[1],
            "header_raw": mail.items(),
            "body_raw": mail.get_payload(),
            "parts": transformed
        }
        data_sink.push(maildoc)
