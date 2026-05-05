# la_boite_a_son/AGENTS.md — règles cœur Django et erreurs API

Ces règles s’appliquent à `la_boite_a_son/`.

## Rôle du périmètre
Ce dossier contient la configuration centrale Django et les helpers globaux comme le format d’erreur API.

## Configuration globale
- Ne pas modifier la configuration globale Django pour contourner un problème local à une app.
- Tout changement de settings, middleware, auth, CORS/CSRF, REST framework ou exception handler doit être justifié par un besoin transversal.
- Vérifier l’impact sur les apps `box_management`, `users`, `private_messages`, `spotify` et `deezer`.

## Erreurs API
- `api_errors.py` définit le contrat global d’erreur.
- Ne pas casser le format : `status`, `code`, `title`, `detail`.
- Ne pas ajouter de clés globales obligatoires sans mettre à jour les vues et tests consommateurs.
- `reason_code` ne doit pas devenir une convention globale d’erreur ; il reste réservé aux domaines qui stockent un motif métier/modération.
- L’exception handler doit transformer les erreurs DRF en payload stable et exploitable par le frontend.

## CSRF/session/auth
- Les changements CSRF ou session peuvent casser le flow localisation, dépôt, auth provider et messages privés.
- Corriger la cause d’un 403 plutôt que désactiver globalement la protection.
- Ne pas élargir les exemptions CSRF sans raison précise et testée.

## Validation
```bash
python manage.py check
python manage.py test box_management.tests users.tests private_messages.tests
```
