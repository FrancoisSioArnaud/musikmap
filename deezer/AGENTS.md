# deezer/AGENTS.md — règles intégration Deezer

Ces règles s’appliquent à `deezer/`.

## Rôle du périmètre
Deezer peut servir à la recherche/résolution provider et aux liens de chansons, mais ne doit pas être traité comme un OAuth frontend actif si le produit cible ne le prévoit pas.

## Règles provider
- Ne pas réintroduire un flow OAuth Deezer frontend si le comportement cible l’a supprimé.
- Garder Deezer utile pour la résolution de liens provider quand les services existants l’utilisent.
- Une indisponibilité Deezer ne doit pas bloquer tout le dépôt si une recherche ou un autre provider permet de continuer.
- Ne pas dupliquer dans `deezer` une logique de chanson canonique qui appartient à `box_management`.

## Erreurs API
- Utiliser le format global `api_error` pour les nouvelles erreurs.
- Les messages utilisateur doivent rester génériques et en français.

## Tests attendus
```bash
python manage.py check
```

Puis exécuter les tests métier qui couvrent le flow impacté, notamment côté `box_management` si la résolution chanson est modifiée.
