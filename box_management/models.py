from box_management.models import Emoji
from random import choice

# Basic
for c in ['🔥','👽','🤯']:
    Emoji.objects.get_or_create(char=c, defaults={"active": True, "basic": True, "cost": 0})

# Payants
bucket = list(range(50, 301, 25))
for c in ['🥹','🥲','😇','🥰','😍','😌','😎','🤓','🥸','🤩','😤','😢','😳','🫠','🥱','👻','🤖','🤝','✌️','🤘','🕺','💃']:
    Emoji.objects.get_or_create(char=c, defaults={"active": True, "basic": False, "cost": choice(bucket)})

print("Seed OK:", Emoji.objects.count(), "emojis")
exit()
