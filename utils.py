import os
from uuid import uuid4


def generate_unique_filename(instance, filename):
    ext = os.path.splitext(filename)[1]
    unique_filename = f"{uuid4().hex}{ext}"
    return unique_filename
