# Flowbox — Lexique et wording utilisateur

## 1. Objectif du wording

Flowbox doit être compréhensible dès la première ouverture. Le wording guide l’utilisateur dans un parcours simple, sans synonymes concurrents ni jargon technique.

Le service repose sur une boîte liée à un lieu, une session temporaire, un dépôt, des points et des chansons à révéler. Chaque texte doit aider l’utilisateur à comprendre ce qu’il peut faire maintenant et pourquoi l’action est utile.

## 2. Parcours utilisateur de référence

“Ouvre une boîte sur place. Écoute ce que les autres ont laissé. Dépose ta chanson pour gagner des points. Utilise tes points pour révéler d’autres morceaux.”

Le parcours se décrit dans cet ordre :

- ouvrir la boîte sur place ;
- vérifier la proximité avec le lieu ;
- explorer les chansons de la boîte ;
- déposer une chanson ;
- gagner des points ;
- révéler des chansons cachées ;
- répondre ou réagir à une chanson ;
- mettre une chanson en avant ;
- terminer la session quand la boîte est refermée.

## 3. Lexique obligatoire

| Terme | Quand l’utiliser | Ce qu’il remplace | Exemple de phrase |
| --- | --- | --- | --- |
| boîte | Pour parler de l’espace musical lié à un lieu. | espace, box, vitrine | Cette boîte est liée à un lieu précis. |
| ouvrir la boîte | Pour l’action d’entrée dans une Flowbox. | entrer dans la box, accéder au contenu | Ouvre la boîte pour écouter les chansons déposées. |
| explorer la boîte | Pour l’action générale pendant la session. | naviguer, consulter, parcourir | Tu peux explorer cette boîte encore 10 minutes. |
| déposer une chanson | Pour l’action principale de l’utilisateur. | partager une chanson, ajouter une chanson | Dépose une chanson pour gagner des points. |
| chanson déposée | Pour une chanson ajoutée dans la boîte par un utilisateur. | partage, ajout, contribution | Cette chanson n’avait pas encore été déposée dans cette boîte. |
| gagner des points | Pour la récompense liée au dépôt. | cumuler, obtenir un bonus sans contexte | Tu gagnes des points. |
| révéler une chanson | Pour afficher une chanson cachée. | débloquer une chanson, découvrir par paiement | Utilise tes points pour révéler cette chanson. |
| chanson cachée | Pour une chanson non révélée. | chanson bloquée, chanson verrouillée | Les points servent à révéler les chansons cachées. |
| répondre à une chanson | Pour un commentaire sous un dépôt. | commenter, écrire un message | Connecte-toi pour répondre à cette chanson. |
| mettre une chanson en avant | Pour l’action utilisateur liée au pinned song. | épingler, pin, mettre en tête | Mettre une chanson en avant. |
| chanson mise en avant | Pour la chanson affichée en haut ou dans une zone dédiée pendant un temps limité. | chanson épinglée, pinned song, chanson en tête | Aucune chanson mise en avant pour le moment. |
| boîte refermée | Pour la fin de session. | session expirée, temps terminé | La boîte est refermée. |

## 4. Termes à éviter

- Éviter “partager une chanson” pour le dépôt Flowbox : le terme est trop flou et peut aussi désigner le partage d’un lien.
- Éviter “ajouter une chanson” pour le dépôt Flowbox : le terme est moins spécifique que “déposer une chanson”.
- Éviter “débloquer” : le terme est moins clair que “révéler” pour les chansons cachées.
- Éviter “mission” : le ton est trop ludique pour l’explication du service.
- Éviter “trace musicale” : la métaphore est trop poétique et moins directe.
- Éviter “en vitrine” : la métaphore concurrence “boîte” et “mise en avant”.
- Éviter “prendre la place” : la formulation peut sembler compétitive ou confuse.
- Éviter “éviter la triche” : la formulation est accusatrice ; préférer expliquer la vérification de proximité.

Ces termes sont à éviter parce qu’ils sont trop flous, trop ludiques, moins alignés avec le ton pédagogique ou moins clairs que le lexique choisi.

## 5. Noms des actions

| Action technique / UX | Wording utilisateur |
| --- | --- |
| Entrer dans une Flowbox | Ouvrir la boîte |
| Naviguer dans la session | Explorer la boîte |
| Ajouter sa chanson | Déposer une chanson |
| Afficher une chanson cachée | Révéler une chanson |
| Commenter | Répondre à une chanson |
| Réagir | Réagir à une chanson |
| Pin / pinned song | Mettre une chanson en avant |
| Pinned song affichée | Chanson mise en avant |
| Session terminée | La boîte est refermée |

## 6. Noms des éléments de page

| Élément | Nom utilisateur recommandé |
| --- | --- |
| Discover page | Les chansons de cette boîte |
| Search drawer de dépôt | Choisis la chanson à déposer |
| MyDeposit | Ta chanson est dans la boîte |
| Achievements panel | Points gagnés avec ton dépôt |
| PinnedSongSection | Chanson mise en avant |
| Comments | Réponses |
| ClosedBoxPage | La boîte est refermée |

## 7. Ton à utiliser

Utiliser :

- des phrases courtes ;
- un vocabulaire concret ;
- le tutoiement ;
- des formulations rassurantes ;
- des explications simples sur les points, présentés comme un outil pour révéler des chansons.

Éviter :

- les formulations accusatrices ;
- le jargon technique ;
- les métaphores trop poétiques ;
- les mécaniques de jeu trop complexes.

Bons exemples :

- “Tu gagnes des points. Ils servent à révéler les chansons cachées.”
- “Cette boîte est liée à un lieu précis.”
- “Rapproche-toi du lieu où se trouve la boîte, puis réessaie.”

Exemples à éviter :

- “Pour éviter la triche...”
- “Débloque ta mission...”
- “Prends la tête de la boîte...”
- “Laisse ta trace musicale...”

## 8. Règles pour les futurs développements

- Tout nouveau texte Flowbox doit utiliser ce lexique.
- Si une action est liée au dépôt, utiliser “déposer une chanson”.
- Si une action est liée au coût en points, utiliser “révéler une chanson”.
- Si une action est liée au pinned song, utiliser “mettre une chanson en avant” côté utilisateur, même si le code garde “pinned”.
- Ne pas renommer les modèles ou props techniques uniquement pour suivre le wording.
- Les textes backend destinés à l’utilisateur doivent suivre le même lexique.
