# AGENTS.md — règles globales Musik Map / Boîte à Chanson

Ces règles s’appliquent à tout le dépôt, sauf règle plus précise dans un `AGENTS.md` plus proche du fichier modifié.

## Intention générale
- Le projet est en refonte active, pas en production stabilisée.
- Quand une tâche demande un refacto, privilégier un résultat propre et complet plutôt qu’une compatibilité legacy artificielle.
- L’API backend est consommée uniquement par le frontend du projet : ne pas maintenir de rétrocompatibilité externe sauf demande explicite.
- Supprimer le code mort, les anciens endpoints, les anciens composants et les tests obsolètes quand la tâche remplace clairement un comportement.
- Ne pas ajouter de couche de compatibilité temporaire, de fallback legacy ou de fichier relais si le comportement cible est clair.

## Méthode de travail attendue
- Lire le `AGENTS.md` global puis le plus proche du fichier concerné avant de modifier.
- Inspecter le comportement actuel avant de coder : routes, appels API, composants, tests existants, stockage local et contrats de payload.
- Avant un changement large, résumer brièvement : fonctionnement actuel, fichiers à modifier, plan d’implémentation, risques.
- Si une ambiguïté bloque vraiment l’implémentation, poser des questions fermées avec options et proposer une recommandation.
- Si la demande est suffisamment cadrée, appliquer directement les recommandations cohérentes avec ces règles.
- Ne pas faire de nettoyage opportuniste hors périmètre, mais supprimer ce qui devient réellement inutilisé à cause du changement demandé.
- À la fin, lister les fichiers modifiés et les commandes de validation exécutées ou à exécuter.

## Commandes de validation usuelles
Backend :
```bash
python manage.py check
python manage.py test box_management.tests users.tests private_messages.tests
```

Frontend :
```bash
cd frontend
npm run lint
npm test -- --runInBand
npm run build
```

Adapter ces commandes au périmètre réel de la tâche. Pour une modification ciblée, exécuter au minimum les tests ciblés pertinents.

## Architecture backend
- Garder les vues API minces : validation HTTP, permissions, orchestration.
- Mettre la logique métier dans `services/`, la lecture spécialisée dans `selectors/`, la construction de payloads dans `builders/` ou services dédiés.
- Centraliser les constantes métier dans des fichiers de domaine plutôt que disperser des nombres ou chaînes dans les vues.
- Ne pas dupliquer la logique de points, sessions, permissions, provider resolution ou sérialisation de dépôts dans plusieurs vues.
- Utiliser des transactions et verrouillages quand une action peut être doublée par clic rapide, réseau lent ou appels concurrents.

## Contrat d’erreur API
- Les erreurs API doivent suivre le format :
```json
{
  "status": 403,
  "code": "UPPER_SNAKE_CODE",
  "title": "Forbidden",
  "detail": "Message utile si nécessaire"
}
```
- Utiliser `la_boite_a_son.api_errors.api_error` ou `api_error_payload`.
- `code` est le code applicatif stable pour le frontend.
- `detail` doit rester utile et court ; ne pas y mettre de debug technique.
- `reason_code` est réservé à la modération ou aux décisions métier qui ont besoin d’un motif stocké. Ne pas l’utiliser comme code HTTP, code d’erreur générique ou remplacement de `code`.
- Ne pas renvoyer des formats d’erreur ad hoc comme `{"error": ...}` ou `{"message": ...}` dans du nouveau code.

## Refacto, imports et fichiers relais
- Lors d’un refacto, ne pas laisser de fichiers qui servent uniquement à réexporter ou rediriger des imports.
- Mettre à jour tous les imports pour pointer directement vers la nouvelle cible finale.
- Les réexports temporaires ne sont acceptés que s’ils sont explicitement justifiés comme étape de migration, avec une raison et une suppression prévue.
- Quand un fichier devient inutile après déplacement ou refacto, le supprimer dans la même tâche.
- Mettre à jour les tests et mocks qui pointent vers les anciens chemins.

## Nommage des dossiers
- Les nouveaux dossiers applicatifs, composants ou modules créés dans le cadre du projet doivent utiliser le PascalCase, avec une majuscule au début de chaque mot, par exemple `CommeCeciParExemple`.
- Ne pas introduire de nouveaux dossiers en `snake_case`, `kebab-case` ou minuscules concaténées lorsqu’ils relèvent de cette convention.
- Ne pas renommer un dossier existant uniquement pour appliquer cette règle, sauf si la tâche prévoit explicitement ce renommage et la mise à jour complète des imports, chemins, tests et références.

## Données, migrations et compatibilité
- Créer une migration Django uniquement si le modèle change réellement.
- Ne pas modifier une ancienne migration déjà existante sauf correction explicitement demandée sur une base jetable.
- Quand un champ, endpoint ou composant legacy est retiré, supprimer aussi les tests, imports, mocks, fixtures et branches conditionnelles qui ne servent plus.
- Ne pas ajouter de données seedées irréalistes ou mécaniques si l’objectif est une démo crédible.

## UI et comportement produit global
- Le produit est mobile-first.
- Les comportements importants doivent être observables côté utilisateur, pas seulement techniquement corrects.
- Préférer les retours UI intégrés : MUI `Alert`, `Dialog`, `Drawer`, loaders, états vides clairs.
- Ne pas utiliser `window.alert`, `window.confirm` ou messages bruts navigateur dans du nouveau code.
- Les actions destructives ou irréversibles doivent passer par un `Dialog` MUI de confirmation.
- Le bouton le plus à droite d’un dialog doit être celui qui valide/procède à l’action.

## Recherche de chansons à publier
- Toute recherche de songs à publier doit passer par `frontend/src/components/Common/Search/SearchPanel.js`.
- Ne pas intégrer une recherche de chansons avec un composant local ad hoc.
- `SearchPanel` s’affiche uniquement dans une page ou dans un `Drawer` MUI fullscreen slide-in depuis la droite.
- Hors code interne de `Common/Search`, ne jamais importer `SearchBar` directement.

## Qualité durable
- Préférer une solution simple et explicite à une abstraction prématurée.
- Éviter les gros fichiers orchestrateurs qui accumulent logique métier, UI, appels API et mapping de payload.
- Isoler les helpers testables.
- Ajouter ou adapter des tests pour les règles métier, les payloads API, les permissions, les doubles actions et les changements de navigation.
- Ne pas masquer une erreur par un `catch` silencieux sauf si le silence est une décision UX explicitement voulue.
