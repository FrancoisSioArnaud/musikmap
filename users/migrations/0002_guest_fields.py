from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="customuser",
            name="converted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="customuser",
            name="guest_device_token",
            field=models.CharField(blank=True, db_index=True, max_length=128, null=True, unique=True),
        ),
        migrations.AddField(
            model_name="customuser",
            name="is_guest",
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name="customuser",
            name="last_seen_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
    ]
