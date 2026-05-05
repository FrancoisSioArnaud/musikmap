# spotify/AGENTS.md — règles intégration Spotify

Ces règles s’appliquent à `spotify/`.

## Rôle du périmètre
Spotify sert aux connexions provider, résultats personnalisés, recent plays et résolution de liens/chansons quand disponible.

## Règles provider
- Ne pas supposer qu’un utilisateur est connecté à Spotify.
- Si OAuth est absent, expiré ou invalide, le frontend doit pouvoir retomber sur une recherche non personnalisée sans casser le flow.
- Lors d’un 401 provider, désactiver ou rafraîchir proprement selon le comportement existant ; ne pas boucler indéfiniment.
- Lors d’un 429/rate limit, appliquer retry/backoff seulement si la tâche le demande ou si le service existant le prévoit.
- Ne jamais logger les access tokens ou refresh tokens.

## Contrats avec users et box_management
- Les connexions provider utilisateur vivent côté `users.UserProviderConnection`.
- La création ou résolution de chansons doit rester cohérente avec les services de `box_management`.
- Ne pas réintroduire `preferred_platform` si le projet utilise `last_platform`.

## Erreurs API
- Utiliser le format d’erreur global via `api_error` pour les nouvelles vues API.
- Les erreurs provider affichées à l’utilisateur doivent rester génériques : connexion impossible, provider indisponible, réessayer.

## Tests attendus
```bash
python manage.py check
python manage.py test spotify
```

S’il n’existe pas de suite dédiée, exécuter les tests qui couvrent les flows provider dans `box_management` ou `users`.
