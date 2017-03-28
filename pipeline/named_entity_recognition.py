from logger import log
from spacy_singleton import get_nlp_model


class NamedEntityRecognition:
    def __init__(self):
        log('INFO', 'Created NamedEntityRecognition instance.')

    @property
    def is_prepared(self):
        return True

    def prepare(self, *args, **kwargs):
        pass

    def transform(self, mail, processed):
        nlp = get_nlp_model()

        ents = [(e.root.ent_type_, e.text.strip()) for p in processed for e in nlp(p['body']).ents]

        return ents