import re
import logging


def log(lvl, msg, *args, **kwargs):
    logging.log(logging.getLevelName(lvl), msg, *args, **kwargs)


class ParseHeaderComponents:
    @property
    def is_prepared(self):
        return True

    def prepare(self, *args, **kwargs):
        pass

    def _clean_head(self, s):
        return s.replace('\n', '')

    def _kw2key(self, kw):
        kw = kw.lower().strip()
        if kw == 'from':
            return 'from'
        if kw == 'to':
            return 'to'
        if kw == 'cc':
            return 'cc'
        if kw == 'bcc':
            return 'bcc'
        if kw == 'subj' or kw == 'subject':
            return 'subject'
        if kw == 'date' or kw == 'sent':
            return 'date'

    def _clean_subject(self, s):
        return re.sub(r"fw:?|re:?", '', s, flags=re.IGNORECASE).strip()

    def _transform_head(self, raw):
        # put default in all fields
        raw['head'] = {
            'from': '',
            'to': '',
            'cc': '',
            'bcc': '',
            'subject': '',
            'date': ''
        }
        # clean the extracted head
        head = self._clean_head(raw['head_raw'])

        keywords = re.finditer(r"(from|to|cc|bcc|subj|subject|date|sent):", head,
                               re.IGNORECASE | re.DOTALL | re.VERBOSE)
        try:
            grp = next(keywords)
            kw = grp.group(1)
            kw_end = grp.end()

            for grp in keywords:
                txt = head[kw_end:grp.start()]
                raw['head'][self._kw2key(kw)] = txt
                kw = grp.group(1)
                kw_end = grp.end()

            if ' on ' in raw['head']['from'].lower() and not raw['head']['date']:
                tmp = raw['head']['from'].lower().split(' on ')
                raw['head']['from'] = tmp[0]
                raw['head']['date'] = tmp[1]

            raw['subject'] = self._clean_subject(raw['head']['subject'])
        except StopIteration:
            log('WARNING', 'Failed to split head into its parts!')

        return raw

    def transform(self, mail, processed):
        return [self._transform_head(p) for p in processed]


class ParseAuthors:
    @property
    def is_prepared(self):
        return True

    def prepare(self, *args, **kwargs):
        pass

    def _prepare_string(self, s):
        s = re.sub(r'\n', '', (s or ''))
        s = re.sub(r'<(/\w+=[^/>]+)+>,', ';', (s or ''))
        s = re.sub(r'<(/\w+=[^/>]+)+>', '', (s or ''))
        s = re.sub(r'([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}) ?\[[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\]',
                   '\g<1>', (s or ''), flags=re.IGNORECASE)
        s = re.sub(r"'([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})',", '\g<1>;', (s or ''), flags=re.IGNORECASE)
        s = re.sub(r"'([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})'", '\g<1>', (s or ''), flags=re.IGNORECASE)
        s = re.sub(r'.+on behalf of ((?:[A-Z0-9._%+-]| )+@[A-Z0-9.-]+(:?\.[A-Z]{2,})?)',
                   '\g<1>', (s or ''), flags=re.IGNORECASE)
        s = re.sub(r"'?([^',]+, ?[^',]+)'? <[^>]+>,", '\g<1>;', (s or ''), flags=re.IGNORECASE)
        s = re.sub(r"'?([^',]+, ?[^',]+)'? <[^>]+>", '\g<1>', (s or ''), flags=re.IGNORECASE)
        s = re.sub(r"'?([^',]+)'? ?<[^>]+>", '\g<1>', (s or ''), flags=re.IGNORECASE)
        s = re.sub(r"'?((?:[^', ]+){2,3})'? \[[^>]+\]", '\g<1>', (s or ''))
        s = re.sub(r'\\|"', '', (s or ''))
        s = s.strip().lower()
        s = re.sub(r'^\W*(.+?)\W*$', '\g<1>', (s or ''), flags=re.IGNORECASE)
        s = re.sub(r'^([^/]+)/.*$', '\g<1>', (s or ''), flags=re.IGNORECASE)
        s = re.sub(r'^"?([a-z\', ]+)', '\g<1>', (s or ''), flags=re.IGNORECASE)
        s = re.sub(r'\s+\d+/\d+/\d+\s*\d+:\d+\s*(am|pm)?', '', (s or ''), re.IGNORECASE | re.MULTILINE)

        return s.strip().lower()

    def _process_author(self, s, i, kind):
        return {
            'name': s,
            'pos': i,
            'kind': kind
        }

    def _split_authors(self, s, kind):
        authors = self._prepare_string(s).split(';')
        ret = []
        for i, author in enumerate(authors):
            tmp = self._process_author(author, i, kind)
            if tmp['name']:
                ret.append(tmp)
        return ret

    def _transform_recipients(self, head):
        ret = []
        for kind in ['to', 'cc', 'bcc']:
            ret += self._split_authors(head[kind], kind)
        return ret

    def transform(self, mail, processed):
        for i, part in enumerate(processed):
            processed[i]['recipients'] = self._transform_recipients(processed[i]['head'])
            processed[i]['sender'] = {
                'name': self._prepare_string(processed[i]['head']['from'])
            }

        return processed


class ParseDate:
    @property
    def is_prepared(self):
        return True

    def prepare(self, *args, **kwargs):
        pass

    def transform(self, mail, processed):
        return processed

# def parseUser(s):
#     # TODO: remove placeholders (i.e. no.address@)
#     address = '' if not s else s
#     address = address.replace('\n', '').replace('\t', '').strip()
#
#     # fetch address that has the format "e-mail <'name'bla@enron.com>"
#     m = re.search(r"e-mail <'?(.*?)['\.](.+?)@(.+?)>", address)
#     if m:
#         return {
#             "raw": s,
#             "name": m.group(1),
#             "mail": m.group(2) + '@' + m.group(3),
#             "domain": m.group(3)
#         }
#
#     address = repl(["'", '"', '<', '>'], address)
#
#     if len(address) > 0:
#         return {
#             "raw": s,
#             "name": '',
#             "mail": address,
#             "domain": '' if '@' not in address else address.split('@')[1]
#         }
#
#     return None
#
#
# def parseUsers(to, cc, bcc):
#     ret = []
#     for k, v in {'to': to, 'cc': cc, 'bcc': bcc}.items():
#         for i, a in enumerate(('' if not v else v).split(',')):
#             t = parseUser(a)
#             if t:
#                 t['kind'] = k
#                 t['pos'] = i
#                 ret.append(t)
#     return ret
#
