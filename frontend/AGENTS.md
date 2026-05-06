# frontend/AGENTS.md — règles frontend React / MUI / Flowbox

Ces règles s’appliquent à `frontend/`, sauf règle plus précise dans un sous-dossier.

## Intention frontend
- Le frontend est mobile-first.
- Le comportement observable utilisateur prime sur la simple compilation.
- Le projet utilise React, React Router, MUI et SCSS global dans `frontend/assets`.
- Respecter le thème MUI et les tokens existants avant d’ajouter du style local.
- Ne pas maintenir de compatibilité avec des composants legacy si la tâche demande explicitement le nouveau comportement.

## Commandes de validation
Depuis `frontend/` :
```bash
npm run lint
npm test -- --runInBand
npm run build
```

Pour des tests ciblés :
```bash
npm test -- --runInBand SearchPanel
npm test -- --runInBand RecentlyPlayed
npm test -- --runInBand PinnedSongSection
npm test -- --runInBand MessageComposer
```

Adapter les noms au test réellement concerné.

## MUI et surfaces d’erreur
- Ne pas utiliser `window.alert`, `window.confirm` ou des erreurs navigateur brutes.
- Utiliser `Alert` pour les états inline : erreur de chargement, état vide informatif, avertissement récupérable.
- Utiliser `Dialog` pour les blocages, confirmations, actions destructives ou messages qui doivent interrompre le flux.
- Utiliser `Drawer` MUI fullscreen slide-in depuis la droite pour les panneaux secondaires importants sur mobile.
- Le bouton de confirmation/progression d’un `Dialog` doit être le bouton le plus à droite.
- Les messages visibles doivent être en français clair, orientés utilisateur, sans détails techniques inutiles.

## Navigation, drawers et bouton retour navigateur
- Tout drawer qui représente un état utilisateur distinct doit être piloté par l’URL avec `frontend/src/components/Utils/drawerHistory.js`.
- Utiliser `openDrawerWithHistory`, `closeDrawerWithHistory`, `getDrawerParamValue` et `matchesDrawerSearch` plutôt qu’un simple `useState` local si le bouton retour doit fermer le drawer.
- Fermer un drawer ouvert par historique doit revenir à l’état précédent via `navigate(-1)` quand c’est le comportement attendu.
- Les paramètres d’URL doivent rester lisibles et spécifiques : par exemple `conversation`, `comments`, `reaction`, `search`, selon le contexte.
- Sur mobile, ne pas afficher une sélection visuelle dans une liste si l’élément est déjà ouvert dans un drawer au-dessus, sauf indication contraire.

## Recherche de chansons à publier
- Toute recherche de chansons à publier doit passer par `frontend/src/components/Common/Search/SearchPanel.js`.
- Les pages et fonctionnalités doivent importer `SearchPanel`, jamais `SearchBar` directement.
- `SearchBar` est un détail interne de `Common/Search`.
- `SearchPanel` doit être rendu soit dans une page explicitement prévue pour une recherche globale, soit dans un `Drawer` MUI fullscreen slide-in depuis la droite.
- Dans le flow Flowbox, la recherche de chanson à déposer doit être ouverte depuis Discover dans un drawer piloté par l’URL. Ne pas créer une page `LiveSearch`.
- Pour les recherches ouvertes depuis un drawer ou une modale, respecter la navigation par URL si le retour navigateur doit restaurer l’état précédent.
- Les recherches personnalisées doivent respecter les providers connectés, `last_platform`, les logos providers et les états de connexion existants.
- Garder un micro-loader si les résultats viennent du cache afin d’éviter une UI qui saute brutalement.

## Flowbox et stockage local
- Le flow principal est : Onboarding → EnableLocation → Discover.
- Ne pas réintroduire une page `LiveSearch` ni une route `/flowbox/:boxSlug/search` pour le dépôt de chanson dans une boîte.
- Discover est la page centrale in-box : elle charge son snapshot via `GET /box-management/box-content/?boxSlug=<slug>` quand une session active existe et que le snapshot local est absent.
- La recherche de chanson à déposer dans une boîte est une section optionnelle de Discover. Elle doit ouvrir `SearchPanel` dans un drawer, pas naviguer vers une page dédiée.
- L’état de la section de dépôt est dérivé de `myDeposit` : sans `myDeposit`, afficher l’appel à l’action ; avec `myDeposit`, afficher la confirmation de dépôt.
- Après `POST /box-management/box-deposit/?boxSlug=<slug>`, patcher le snapshot local avec `myDeposit`, `successes` et `pointsBalance` sans recharger `box-content`.
- `POST box-deposit` ne renvoie pas `current_user`; mettre à jour les points du user courant depuis `points_balance` si présent.
- Ne pas autoriser visuellement une action que le backend refusera par session expirée sans afficher un message clair.
- Préférer les données de session Flowbox sous la clé `mm_flowbox_box::${boxSlug}` pour les nouveaux comportements.
- Ne pas réintroduire d’usage de `mm_box_content` dans du nouveau code si le chantier vise sa suppression.
- `mm_current_box` ne doit rester qu’un cache léger d’entrée de flow si encore nécessaire.
- Nettoyer les états de scroll Discover quand un nouveau snapshot de session doit réinitialiser la découverte.
- Le header de session doit rester cohérent : nom de boîte, compte à rebours, seuils visuels et explication au clic.

## Composants Deposit, commentaires et réactions
- `frontend/src/components/Common/Deposit/Deposit.js` doit rester l’orchestrateur.
- Les sous-parties doivent rester séparées : user, song, link, comments, reactions.
- Ne pas rajouter toute la logique dans l’ancien `frontend/src/components/Common/Deposit.js` si le refacto vise les sous-composants.
- Les commentaires doivent avoir des états vides explicites, par exemple un `Alert` info pour “Aucune réponse pour l’instant”.
- Les blocages utilisateur comme “Tu ne peux pas envoyer deux réponses d’affilée” doivent s’afficher au moment de l’action concernée, pas constamment.
- Les actions liées aux commentaires/réactions doivent gérer les loaders, erreurs et répétitions de clic.
- Pour un affichage utilisateur réutilisable, préférer le composant commun existant plutôt qu’un nouveau markup avatar + nom dupliqué.

## Messages privés
- Les routes et appels frontend vers une conversation doivent utiliser les usernames quand le backend expose le thread par username.
- Ne pas réintroduire une page legacy de conversation supprimée si le comportement cible est un drawer ou une page unifiée.
- Depuis un profil utilisateur, l’entrée vers le chat doit viser la route username attendue, pas un identifiant interne.
- Les tabs “Conversations” et “Invitations” doivent être de vrais états contrôlés et testables, sans dépendre d’un état de sélection cassé par le drawer.
- Sur mobile, la liste ne doit pas suggérer qu’une conversation est sélectionnée si le drawer masque déjà la conversation ouverte.

## Thème, styles et SCSS
- Préférer `sx` et le thème MUI pour les ajustements locaux simples.
- Utiliser les tokens existants : palette, spacing, radius, `clientThemes`, variables CSS `--mm-color-*`.
- Pour un style partagé, durable ou lié à un composant existant en SCSS, modifier `frontend/assets` en respectant son `AGENTS.md`.
- Ne pas mettre de gros blocs de style inline si le style appartient au système visuel global.
- Ne pas créer de couleurs hardcodées si une couleur de thème ou variable existe.
- Pour les icônes MUI, utiliser de préférence les variantes `Rounded`. Si une icône existante est `Outlined` par intention visuelle, choisir l’équivalent rounded/outlined le plus proche quand disponible.

## Auth, profil et utilisateurs
- Les guests doivent rester limités dans les actions nécessitant un compte complet.
- Les écrans de profil doivent préserver les états utiles : tab actif, scroll, favorite song, library.
- Les actions follow/unfollow et messages privés doivent utiliser les contrats backend stables et mettre à jour l’UI sans incohérence.
- Ne pas exposer des IDs internes dans l’URL si le comportement cible utilise `username`.

## Contrats API côté frontend
- Mapper les erreurs via `code` plutôt que parser un texte de `detail`.
- Ne pas afficher les codes techniques à l’utilisateur sauf besoin admin/debug explicite.
- Prévoir les cas `AUTH_REQUIRED`, `ACCOUNT_COMPLETION_REQUIRED`, `BOX_SESSION_REQUIRED`, `INSUFFICIENT_POINTS`, `VALIDATION_ERROR` et erreurs provider.
- En cas d’erreur réseau récupérable, afficher une surface claire et éventuellement un bouton “Réessayer”.
- En cas de provider indisponible, ne pas vider brutalement une liste existante si le cache ou l’état précédent reste valable.

## Refacto frontend
- Lors d’un refacto frontend, ne pas laisser de fichiers relais servant uniquement à rediriger des imports.
- Modifier tous les imports pour qu’ils pointent vers la nouvelle cible.
- Supprimer les composants, tests, mocks et styles devenus obsolètes.
- Les réexports temporaires doivent être explicitement justifiés et supprimés ensuite.
- Ne pas refactorer tout un écran si la tâche porte sur un comportement isolé, mais ne pas conserver une branche legacy inutile dans le même fichier.

## Nommage des dossiers
- Les nouveaux dossiers de composants, pages ou modules front doivent utiliser le PascalCase, avec une majuscule au début de chaque mot, par exemple `CommeCeciParExemple`.
- Ne pas créer de nouveaux dossiers en `snake_case`, `kebab-case` ou minuscules concaténées lorsqu’ils relèvent de cette convention.
- Ne pas renommer un dossier existant uniquement pour appliquer cette règle, sauf si la tâche inclut explicitement la mise à jour complète des imports, chemins et références.
