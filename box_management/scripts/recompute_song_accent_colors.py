from box_management.models import Song
from box_management.services.deposits.accent_color import refresh_song_accent_color


def run(*args):
    raw_args = list(args or [])
    args_set = set(raw_args)

    force = "force" in args_set
    dry_run = "dry-run" in args_set
    limit = None

    for arg in raw_args:
        if isinstance(arg, str) and arg.startswith("limit="):
            try:
                limit = int(arg.split("=", 1)[1])
            except (TypeError, ValueError):
                limit = None

    queryset = Song.objects.all().order_by("id")
    if not force:
        queryset = queryset.filter(accent_color="")
    if limit is not None and limit > 0:
        queryset = queryset[:limit]

    songs = list(queryset)

    print("=== Recompute song accent colors ===")
    print(f"[INFO] Songs ciblées : {len(songs)}")
    print(f"[INFO] Mode force : {'oui' if force else 'non'}")
    print(f"[INFO] Dry run : {'oui' if dry_run else 'non'}")

    updated = 0
    unchanged = 0
    failed = 0

    for song in songs:
        previous_color = (song.accent_color or "").strip()
        next_color = refresh_song_accent_color(song, force=force) or ""

        if not next_color:
            failed += 1
            print(f"[MISS] {song.id} · {song.title} - {song.artist} · aucune couleur")
            continue

        if next_color == previous_color:
            unchanged += 1
            print(f"[SKIP] {song.id} · {song.title} - {song.artist} · {next_color}")
            continue

        if not dry_run:
            song.save(update_fields=["accent_color"])

        updated += 1
        print(f"[OK] {song.id} · {song.title} - {song.artist} · {previous_color or '-'} -> {next_color}")

    print("=== Terminé ===")
    print(f"[INFO] Mis à jour : {updated}")
    print(f"[INFO] Inchangées : {unchanged}")
    print(f"[INFO] Sans couleur : {failed}")
