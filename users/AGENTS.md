# users/AGENTS.md — règles utilisateurs, profils, guests et follows

Ces règles s’appliquent à `users/`.

## Rôle du périmètre
`users` gère les comptes complets, guests, profils publics, préférences, connexions provider, follow/unfollow, points utilisateur et accès client admin.

## Utilisateurs et usernames
- Les usernames ne doivent pas contenir d’espace.
- Respecter l’unicité case-insensitive des usernames.
- Pour les routes publiques et les conversations, privilégier `username` plutôt qu’un ID interne si le contrat existant le prévoit.
- Ne pas exposer inutilement les IDs internes dans les payloads publics.
- Les scripts de seed doivent générer des usernames réalistes mais valides : minuscules, chiffres/underscore si nécessaire, sans espaces.

## Guests et comptes complets
- Un guest peut parcourir certains flows, mais les actions nécessitant identité durable doivent exiger un compte complet.
- Pour une action réservée aux comptes complets, retourner une erreur stable comme `ACCOUNT_COMPLETION_REQUIRED`.
- Ne pas convertir silencieusement un guest sans passer par le flux prévu.
- `guest_device_token`, `is_guest`, `converted_at` et `last_seen_at` doivent rester cohérents.

## Points utilisateur
- Le backend est la source de vérité du solde de points.
- Ne pas modifier les points depuis le frontend ou via un payload non validé.
- Quand une action liée aux points renvoie une réponse utilisée par l’UI, inclure le solde actualisé si nécessaire.
- Centraliser les règles de coût/gain hors des vues utilisateur si elles concernent aussi `box_management`.

## Provider connections
- `UserProviderConnection` représente une connexion provider active ou inactive.
- `last_platform` sert à mémoriser le dernier provider utile ; ne pas réintroduire `preferred_platform` si le modèle cible l’a supprimé.
- Lors d’une déconnexion provider, désactiver proprement la connexion et remettre les préférences dépendantes dans un état cohérent.
- Ne pas stocker ou logger des tokens provider en clair dans les logs applicatifs.

## Follows et profils
- Les actions follow/unfollow doivent être idempotentes ou protégées contre les doubles clics.
- Les payloads profil doivent inclure uniquement les informations nécessaires au frontend : affichage, relation follow, favorite song, stats utiles.
- Les listes de followers/following doivent respecter les permissions et éviter les requêtes N+1.
- Les profils guests ne doivent pas être exposés comme profils sociaux complets.

## Architecture
- Garder les vues minces et déplacer les règles réutilisables dans `utils.py`, services ou selectors si le périmètre grossit.
- Éviter de dupliquer dans `users` des règles appartenant à `box_management` ou `private_messages`.
- Utiliser `la_boite_a_son.api_errors.api_error` pour les nouvelles erreurs API.

## Tests attendus
```bash
python manage.py check
python manage.py test users.tests
```

Tests ciblés utiles :
```bash
python manage.py test users.tests.test_profile_contracts
python manage.py test users.tests.test_user_follow
python manage.py test users.tests.test_username_case_insensitive
```
