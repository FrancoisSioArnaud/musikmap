from django.db import migrations, models
from django.db.models.functions import Lower


def assert_no_casefold_duplicates(apps, schema_editor):
    CustomUser = apps.get_model("users", "CustomUser")
    duplicates = (
        CustomUser.objects.annotate(username_lower=Lower("username"))
        .values("username_lower")
        .annotate(n=models.Count("id"))
        .filter(n__gt=1)
    )

    seen = {}
    for row in duplicates:
        key = row["username_lower"]
        seen.setdefault(key, []).append(key)

    if seen:
        examples = ", ".join(
            f"{lower}: {sorted(set(usernames))}" for lower, usernames in sorted(seen.items())[:5]
        )
        raise RuntimeError(
            "Impossible d’ajouter la contrainte d’unicité case-insensitive sur users_customuser.username: "
            f"doublons existants détectés ({examples})."
        )


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0009_userfollow"),
    ]

    operations = [
        migrations.RunPython(assert_no_casefold_duplicates, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="customuser",
            constraint=models.UniqueConstraint(Lower("username"), name="users_customuser_username_ci_unique"),
        ),
    ]
