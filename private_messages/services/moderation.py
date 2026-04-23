import re

FORBIDDEN_INSULTS = {"connard", "connasse", "fdp", "pute", "enculé", "encule"}
LINK_RE = re.compile(r"(https?://|www\.)", re.IGNORECASE)
EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
PHONE_RE = re.compile(r"\+?\d[\d\s().-]{7,}\d")


def validate_message_text(text):
    cleaned = str(text or "").strip()
    if not cleaned:
        return True, ""
    if len(cleaned) > 300:
        return False, "Le message ne peut pas dépasser 300 caractères."
    low = cleaned.lower()
    if LINK_RE.search(cleaned):
        return False, "Les liens ne sont pas autorisés en messagerie."
    if EMAIL_RE.search(cleaned):
        return False, "Les adresses email ne sont pas autorisées en messagerie."
    if PHONE_RE.search(cleaned):
        return False, "Les numéros de téléphone ne sont pas autorisés en messagerie."
    if any(token in low for token in FORBIDDEN_INSULTS):
        return False, "Le message contient du contenu inapproprié."
    if low.count("!!!") >= 2:
        return False, "Le message ressemble à du spam."
    return True, cleaned
