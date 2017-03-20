import re
import logging


def log(lvl, msg, *args, **kwargs):
    logging.log(logging.getLevelName(lvl), msg, *args, **kwargs)


class BodyCleanup:
    def __init__(self, include_signature=True):
        log('INFO', 'Created BodyCleanup instance. include_signature=%s', include_signature)
        self.include_signature = include_signature
        self._is_prepared = True

    @property
    def is_prepared(self):
        return self._is_prepared

    def prepare(self, *args, **kwargs):
        pass

    def _transform_string(self, s):
        # remove annotation (if present)
        s = re.sub("^(H|S|B)>", "", s, flags=re.M)

        # remove known common rubbish
        s = s.replace('=\n', '').replace('=20', '').replace('=09', '').replace('=01\&', '') \
            .replace('=01&', '').replace('=18', '').replace('=018', '')

        # remove indentation
        # s = re.sub(r"^(\s*>)+","", s)

        # remove attachments
        s = re.sub(r"\s*\[IMAGE\]\s*", "", s, flags=re.I)
        s = re.sub(r"<<.{3,50}\.(xls|xlsx|png|gif|jpg|jpeg|doc|docx|ppt|pptx|pst)>>%?", "", s, flags=re.I)
        s = re.sub(r"^\s*-.{3,50}\.(xls|xlsx|png|gif|jpg|jpeg|doc|docx|ppt|pptx|pst)%?", "", s, flags=re.I)
        return s

    def _transform_list_item(self, item):
        if type(item) == tuple:
            return item[0], \
                   self._transform_string(item[1]), \
                   self._transform_string(item[2]) if self.include_signature else item[2]
        if type(item) == dict:
            item['body_clean'] = self._transform_string(item['body_raw'])
            if self.include_signature:
                item['sign_clean'] = self._transform_string(item['sign_raw'])
            return item
        return item  # fallback

    def transform(self, mail, processed):
        log('TRACE', 'cleaning up %s', type(processed))
        if type(processed) == str:
            return self._transform_string(processed)
        if type(processed) == list:
            return [self._transform_list_item(item) for item in processed]
        return processed  # fallback


class Tuples2Dicts:
    def __init__(self):
        log('INFO', 'Created Tuple2Dicts instance.')

    @property
    def is_prepared(self):
        return True

    def prepare(self, *args, **kwargs):
        pass

    def _head2str(self, mail):
        return 'Date: %s\nFrom: %s\nTo: %s\nCc: %s\nBcc: %s\nSubject: %s'.format(
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
                   "body_raw": p[1],
                   "sign_raw": p[2]
               } for p in processed]
        ret[0]['head_raw'] = self._head2str(mail)
        return ret
