# frontend/assets/AGENTS.md — règles SCSS et assets de style

Ces règles s’appliquent à `frontend/assets/`.

## Rôle du dossier
- Ce dossier contient les SCSS globaux, variables, styles partagés et tooling de build des assets.
- Les changements ici ont un impact transversal : éviter les modifications opportunistes.

## Quand modifier ce dossier
- Modifier ce dossier si la demande mentionne explicitement un changement de style global, SCSS, thème visuel, classe CSS, animation, layout partagé ou comportement visuel impossible à traiter proprement avec MUI `sx`.
- Ne pas modifier ce dossier pour un simple ajustement local faisable proprement dans le composant.
- Ne pas migrer ou réorganiser les SCSS sans demande explicite.

## Règles de style
- Garder les changements petits, ciblés et liés à un composant ou une feature précise.
- Préserver les noms de classes, ids, keyframes et sélecteurs existants sauf si la tâche demande leur remplacement.
- Ne pas toucher aux fichiers CSS générés sauf si la tâche cible explicitement les assets générés.
- Utiliser les variables CSS existantes, notamment `--mm-color-*`, plutôt que des couleurs hardcodées.
- Respecter les contraintes mobile-first, iOS Safari, `100dvh`, safe-area et overscroll déjà présentes.
- Ne pas mélanger une refonte visuelle large avec une correction fonctionnelle ciblée.

## Organisation SCSS
- Mettre les styles de recherche dans les fichiers de recherche existants.
- Mettre les styles Deposit/commentaires/réactions dans les fichiers Deposit existants quand ils existent.
- Préférer une classe explicite et stable à un sélecteur fragile basé sur la profondeur DOM MUI.
- Ne pas surcharger massivement des classes MUI générées.

## Validation
Si le tooling SCSS est disponible :
```bash
cd frontend/assets
npm run lint:scss
```

Si aucun script SCSS n’existe ou ne fonctionne dans ce dossier, signaler honnêtement que la validation SCSS dédiée n’a pas pu être exécutée et exécuter au minimum :
```bash
cd frontend
npm run lint
npm run build
```
