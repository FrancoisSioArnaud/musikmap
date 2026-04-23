## Refacto & imports
- Lors d’un refacto frontend, ne pas laisser de fichiers relais servant uniquement à rediriger des imports.
- Préférer modifier tous les imports pour qu’ils pointent vers la nouvelle cible.
- Les réexports temporaires doivent être explicitement justifiés et supprimés ensuite.

## Nommage des dossiers
- Les nouveaux dossiers de composants, pages ou modules front doivent utiliser un nom en PascalCase, avec une majuscule au début de chaque mot, par exemple `CommeCeciParExemple`.
- Ne pas créer de nouveaux dossiers en `snake_case`, `kebab-case` ou en minuscules concaténées lorsqu’ils relèvent de cette convention.
- Ne pas renommer un dossier existant uniquement pour appliquer cette règle, sauf si la tâche inclut explicitement la mise à jour complète des imports, chemins et références.

## Search (songs à publier uniquement)
- Toute recherche de songs à publier doit utiliser `frontend/src/components/Common/Search/SearchPanel.js`.
- Ce composant ne doit être affiché que dans une page ou un Drawer MUI fullscreen avec animation slide-in depuis la droite.
