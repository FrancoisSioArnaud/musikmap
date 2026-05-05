# private_messages/AGENTS.md — règles chat et conversations privées

Ces règles s’appliquent à `private_messages/`.

## Rôle du périmètre
`private_messages` gère les demandes de conversation, threads, messages texte/song, invitations, refus, expiration, lecture et payloads de chat.

## Contrat principal
- Les nouveaux accès à un thread depuis le frontend doivent se faire par `username` quand le endpoint username existe.
- Ne pas réintroduire un endpoint legacy par ID si la tâche demande explicitement de le supprimer.
- Une conversation entre deux utilisateurs doit être unique, quel que soit l’ordre user A / user B.
- Utiliser la paire triée existante pour éviter les doublons.
- Un utilisateur ne peut pas s’écrire à lui-même.
- Les guests ne peuvent pas utiliser les messages privés comme comptes complets.

## Invitations et statuts
- Statuts attendus : `pending`, `accepted`, `refused`, `expired`.
- Une invitation pending reçue doit apparaître dans les invitations, pas dans les conversations acceptées.
- Une conversation accepted doit apparaître dans conversations.
- Une invitation expirée ne doit pas rester actionnable.
- Respecter le cooldown après refus si le modèle/service le prévoit.

## Messages
- Types attendus : texte, chanson, système.
- La première demande peut exiger une chanson si le comportement métier le prévoit.
- Valider le texte via le service de modération existant.
- Protéger l’envoi contre le spam avec le rate limit existant.
- En cas d’envoi de chanson, utiliser les services provider/song de `box_management` plutôt qu’une logique locale.

## Lecture et unread
- Mettre à jour `last_read_at` uniquement pour le participant concerné.
- Les compteurs unread doivent être dérivés du vrai thread et pas maintenus à la main côté frontend.
- Les payloads summary doivent rester cohérents avec les payloads detail.

## Architecture
- `views.py` orchestre HTTP et permissions.
- `selectors/threads.py` lit les threads.
- `services/payloads.py` construit les payloads frontend.
- `services/read_state.py` gère l’état de lecture.
- `services/moderation.py` valide les contenus.
- Ne pas déplacer de logique chat dans le frontend pour compenser un contrat backend incomplet.

## Erreurs API
- Utiliser `api_error` pour tout nouveau refus.
- Codes utiles à préserver : `AUTH_REQUIRED`, `ACCOUNT_COMPLETION_REQUIRED`, `USER_NOT_FOUND`, `TARGET_USER_NOT_FOUND`, `SELF_CHAT_FORBIDDEN`, `THREAD_COOLDOWN_ACTIVE`, `MESSAGE_TEXT_INVALID`, `SONG_REQUIRED`.
- Garder des messages en français, courts et exploitables par l’UI.

## Tests attendus
```bash
python manage.py check
python manage.py test private_messages.tests
```

Ajouter des tests si la tâche touche : création de thread, thread par username, invitations, unread, expiration, refus/cooldown, rate limit ou suppression d’un endpoint legacy.
