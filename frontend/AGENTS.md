## Refacto & imports
- Lors d’un refacto frontend, ne pas laisser de fichiers relais servant uniquement à rediriger des imports.
- Préférer modifier tous les imports pour qu’ils pointent vers la nouvelle cible.
- Les réexports temporaires doivent être explicitement justifiés et supprimés ensuite.

## Search (songs à publier uniquement)
- Toute recherche de songs à publier doit utiliser `frontend/src/components/Common/Search/SearchPanel.js`.
- Ce composant ne doit être affiché que dans une page ou un Drawer MUI fullscreen avec animation slide-in depuis la droite.
