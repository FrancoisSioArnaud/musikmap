## Refacto & imports
- Lors d’un refacto, ne pas laisser de fichiers relais servant uniquement à rediriger des imports.
- Préférer mettre à jour tous les imports pour viser directement la cible finale.
- Les réexports temporaires ne sont acceptés que s’ils sont explicitement justifiés comme étape de migration.

## Nommage des dossiers
- Les dossiers applicatifs créés ou renommés doivent utiliser un nom en PascalCase, avec une majuscule au début de chaque mot, par exemple `CommeCeciParExemple`.
- Ne pas introduire de nouveaux dossiers en `snake_case`, `kebab-case` ou en minuscules concaténées lorsqu’ils relèvent de cette convention de nommage.
- Ne pas renommer un dossier existant uniquement pour appliquer cette règle, sauf si la tâche porte explicitement sur ce renommage et inclut la mise à jour complète des imports, chemins et références associés.

## Search (songs à publier uniquement)
- Toute recherche de songs à publier doit utiliser `frontend/src/components/Common/Search/SearchPanel.js`.
- Ce composant ne doit être utilisé que dans une page ou un Drawer MUI fullscreen (slide-in from right).
