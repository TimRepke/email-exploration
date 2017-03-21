#!/usr/bin/python

from email import parser as ep
import os
import logging
from optparse import OptionParser
from arango import ArangoClient


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
    def __init__(self, maildir, limit=None, skip=0):
        self.maildir = maildir
        self.mailparser = ep.Parser()
        self.limit = limit
        self.current_root = ''
        self.current_stripped = ''
        self.skip = skip

    def __iter__(self):
        self.run = 0
        self.os_walker = os.walk(self.maildir)
        self.current_dirs = []
        self.current_files = iter([])
        log('INFO', 'Created Source Iterator. It will skip %d files, then read %d files from %s',
            self.skip, self.limit, self.maildir)

        for i in range(self.skip):
            self.run += 1
            self._next_file(skipmode=True)
        return self

    def _next_dir(self):
        self.current_root, self.current_dirs, files = next(self.os_walker)
        self.current_stripped = self.current_root[len(self.maildir):]
        logging.info('Entering directory with %d files and %d subdirectories: %s/',
                     len(files), len(self.current_dirs), self.current_stripped)

        if len(files) > 0:
            self.current_files = iter(files)
        else:
            self._next_dir()

    def _next_file(self, skipmode=False):
        try:
            filename = next(self.current_files)
            log('DEBUG', 'Iterator is looking at this file (skip=%s): %s/%s', skipmode, self.current_root, filename)

            # save some effort when result is dumped anyway during skip-ahead
            if not skipmode:
                with open(self.current_root + "/" + filename, "r", errors='ignore') as f:
                    self.run += 1
                    file = f.read()

                    # must be something off here, skipping
                    if len(file) < 100:
                        log('WARNING', 'Skipping file because it is too small (%d chars): %s/%s',
                            len(file), self.current_root, filename)
                        return self._next_file()

                    return self.current_stripped, filename, self.mailparser.parsestr(file)
        except StopIteration:
            self._next_dir()
            log('DEBUG', 'Iterator had to switch directories')
            return self._next_file()

    def __next__(self):
        if self.limit is not None and (self.limit + self.skip) <= self.run:
            logging.info('max number of mails (LIMIT=%d) is reached.', self.limit)
            raise StopIteration()

        return self._next_file()


class DataSinkArango:
    def __init__(self, user, pw, port=8529, db='enron', collection='mails', save=True, logging=True):
        self.client = ArangoClient(
            protocol='http',
            host='localhost',
            port=port,
            username=user,
            password=pw,
            enable_logging=logging
        )
        self.collection = self.client.database(db).collection(collection)
        self.save = save
        log('INFO', 'DataSink connects to port %d for collection "%s" in database "%s", active: %s',
            port, collection, db, save)

    def push(self, doc):
        if self.save:
            d = self.collection.insert(doc)


oparser = OptionParser()
oparser.add_option("-d", "--maildir",
                   dest="maildir",
                   metavar="DIR",
                   type="str",
                   help="starting at the root of DIR, all subfolders are read recursively and "
                        "files are interpreted by the pipeline into a sink",
                   default='/home/tim/Uni/HPI/workspace/enron/data/original')
oparser.add_option("-n", "--limit",
                   dest="limit",
                   metavar="NUM",
                   help="limit number of mails to read to NUM",
                   type='int',
                   default=None)
oparser.add_option("-s", "--skip",
                   dest="skip",
                   metavar="NUM",
                   help="number (NUM) of mails to skip reading",
                   type='int',
                   default=0)
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
oparser.add_option("--no-save",
                   dest="arango_no_save",
                   help="set this flag to disable the database sink!",
                   action="store_false",
                   default=True)
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
oparser.add_option("--log-file",
                   dest="log_file",
                   metavar="FILE",
                   type="str",
                   help="log is written to FILE according to selected log LEVEL",
                   default=None)
oparser.add_option("--log-file-level",
                   dest="log_file_level",
                   metavar="LEVEL",
                   help="set log level to LEVEL",
                   type='choice',
                   choices=['MICROTRACE', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
                   default='INFO')
oparser.add_option("-l", "--log-level",
                   dest="log_level",
                   metavar="LEVEL",
                   help="set log level to LEVEL",
                   type='choice',
                   choices=['MICROTRACE', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
                   default='INFO')

if __name__ == "__main__":
    (options, args) = oparser.parse_args()

    logging.addLevelName(5, 'TRACE')
    logging.addLevelName(3, 'MICROTRACE')
    logformat = '%(asctime)s - [%(module)s] %(levelname)s - %(message)s'
    logging.basicConfig(level=logging.getLevelName(options.log_level),
                        format=logformat, datefmt='%H:%M:%S')

    if options.log_file:
        log('INFO', 'Writing log to file: %s at level %s', options.log_file, options.log_file_level)
        hdlr = logging.FileHandler(options.log_file, mode='w')
        hdlr.setLevel(logging.getLevelName(options.log_file_level))
        hdlr.setFormatter(logging.Formatter(logformat, datefmt='%H:%M:%S'))
        logging.root.addHandler(hdlr)
    else:
        log('INFO', 'No log file specified.')

    from splitting_feature_rnn import Splitter
    from mixins import BodyCleanup, Tuples2Dicts
    from header_parsing_rules import ParseHeaderComponents, ParseAuthors, ParseDate
    import io
    from pprint import pprint

    pipeline = Pipeline()
    pipeline.add(Splitter(options.path_annotated, window_size=8, include_signature=options.include_signature,
                          features=None, training_epochs=10, nb_slack_lines=4, retrain=options.keras_retrain,
                          model_path=options.keras_model))
    pipeline.add(Tuples2Dicts())
    pipeline.add(ParseHeaderComponents())
    pipeline.add(ParseAuthors())
    pipeline.add(ParseDate())
    pipeline.add(BodyCleanup())

    # pipeline.prepare()

    read_cnt = 0

    data_source = SourceFiles(options.maildir, skip=options.skip, limit=options.limit)
    data_sink = DataSinkArango(options.arango_user, options.arango_pw, options.arango_port,
                               options.arango_db, options.arango_collection, save=options.arango_no_save)

    for path, filename, mail in data_source:
        log('TRACE', 'Got mail from source: %s/%s', path, filename)
        mail, transformed = pipeline.transform(mail)

        if logging.root.level < 5:
            tmp = io.StringIO()
            pprint(transformed, stream=tmp)
            log('MICROTRACE', tmp.getvalue())

        maildoc = {
            "message_id": mail['Message-ID'],
            "folder": '/'.join(path.split('/')[2:]),
            "file": path + '/' + filename,
            "owner": path.split('/')[1],
            "header_raw": dict(mail.items()),
            "body_raw": mail.get_payload(),
            "parts": transformed
        }
        data_sink.push(maildoc)
