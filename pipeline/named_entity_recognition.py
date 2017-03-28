from pipeline.logger import log
from pipeline.spacy_singleton import get_nlp_model
nlp = get_nlp_model()


class Tuples2Dicts:
    def __init__(self):
        log('INFO', 'Created Tuple2Dicts instance.')

    @property
    def is_prepared(self):
        return True

    def prepare(self, *args, **kwargs):
        pass

    def _head2str(self, mail):
        return 'Date: {}\nFrom: {}\nTo: {}\nCc: {}\nBcc: {}\nSubject: {}'.format(
            mail.get('Date', ''),
            mail.get('X-From', '') or mail.get('X-from', '') or mail.get('From', ''),
            mail.get('X-To', '') or mail.get('X-to', '') or mail.get('To', ''),
            mail.get('X-Cc', '') or mail.get('X-cc', '') or mail.get('Cc', ''),
            mail.get('X-Bcc', '') or mail.get('X-bcc', '') or mail.get('Bcc', ''),
            mail.get('Subject', ''))

    def transform(self, mail, processed):
        log('TRACE', 'transforming tuples to dicts (parts=%d)', len(processed))
        ret = [{
                   "head_raw": p[0],
                   "body": p[1],
                   "signature": p[2]
               } for p in processed]
        ret[0]['head_raw'] = self._head2str(mail)
        return ret