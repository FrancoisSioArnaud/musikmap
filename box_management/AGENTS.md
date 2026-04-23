## Refacto & imports
- Lors d’un refacto backend, ne pas laisser de fichiers relais servant uniquement à rediriger des imports.
- Mettre à jour tous les imports vers la cible finale dans la même tâche.
- Les exceptions doivent être explicitement justifiées comme migration temporaire.

## Nommage des dossiers
- Les nouveaux dossiers métier ou techniques créés dans ce périmètre doivent utiliser un nom en PascalCase, avec une majuscule au début de chaque mot, par exemple `CommeCeciParExemple`.
- Ne pas introduire de nouveaux dossiers en `snake_case`, `kebab-case` ou en minuscules concaténées lorsqu’ils relèvent de cette convention.
- Ne pas renommer un dossier existant uniquement pour appliquer cette règle, sauf si le chantier prévoit explicitement le renommage complet et la mise à jour de toutes les références associées.
