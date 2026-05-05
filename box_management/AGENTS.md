# box_management/AGENTS.md — règles métier Flowbox / Boîte à Chanson

Ces règles s’appliquent à `box_management/`.

## Rôle de ce périmètre
`box_management` porte le cœur métier de la Boîte à Chanson / Flowbox : boîtes, stickers, sessions, dépôts, chansons, articles, incitations, commentaires, réactions, épingles, points et découverte.

## Parcours Flowbox à respecter
- Entrée typique : QR/sticker → onboarding → autorisation localisation → vérification distance → recherche LiveSearch → dépôt → Discover.
- La session de boîte est la frontière métier principale : si l’utilisateur n’est pas dans une session active, les actions liées à une boîte doivent être refusées côté serveur.
- La vérification de distance et l’état de session doivent être contrôlés côté backend. Le frontend peut masquer des actions, mais ne doit jamais être la source de vérité.
- Utiliser `box.slug` comme identifiant fonctionnel privilégié dans les contrats Flowbox quand c’est possible.
- Ne pas réintroduire de comportement basé uniquement sur un état local frontend pour autoriser une action métier.

## Sessions de boîte
- Les dépôts de type `box` et `pinned` sont liés à une boîte et doivent respecter le gating `BoxSession`.
- Les actions sensibles sur un dépôt de boîte doivent retourner une erreur stable, par exemple `BOX_SESSION_REQUIRED`, quand la session manque ou expire.
- Une session expirée doit produire un refus clair, pas une action partielle.
- Ne pas dupliquer la logique de session dans chaque vue : utiliser les services/helpers existants ou les consolider.

## Dépôts et chansons
- Les types de dépôt attendus sont notamment `box`, `pinned`, `favorite` et les éventuels dépôts de lien/profil selon les modèles existants.
- Un dépôt doit toujours rapporter un minimum de points strictement positif quand le parcours métier indique qu’un dépôt est validé.
- La chanson canonique doit être stable autant que possible : privilégier les données normalisées et les liens provider stockés plutôt qu’un identifiant frontend volatile.
- Ne pas recréer une logique parallèle de normalisation de track : utiliser les services provider existants.
- Les payloads de dépôts doivent être construits via les builders/services dédiés pour conserver un contrat homogène côté frontend.

## Points et économie
- Le backend est la source de vérité pour les points.
- Les prix, coûts et paliers doivent être centralisés dans des constantes ou fichiers de données dédiés, pas dispersés dans les vues.
- Les réponses d’actions qui modifient les points doivent renvoyer `points_balance` quand le frontend en a besoin pour mettre à jour l’UI.
- Ne pas faire confiance à un prix envoyé par le frontend sans recalcul ou validation serveur.
- En cas de points insuffisants, utiliser un code stable comme `INSUFFICIENT_POINTS` et un message compatible avec l’UX frontend.

## Pinned songs
- `deposit_type = "pinned"` représente une chanson épinglée dans une boîte.
- Les durées/prix doivent venir de `box_management/data/pinned_price_steps.json` ou d’une source métier centralisée équivalente.
- Un pin expiré ne doit pas rester actif dans les payloads Discover.
- Ne pas réintroduire de logique de prolongation si le comportement cible ne la prévoit pas.
- Le backend doit renvoyer les informations nécessaires au frontend : expiration, durée, utilisateur, chanson, coût et points restants si applicable.

## Commentaires, réactions et doubles actions
- Protéger les actions contre les doublons : double clic, retry réseau, appels concurrents.
- Utiliser `transaction.atomic()` et `select_for_update()` quand une contrainte métier peut être violée par concurrence.
- Conserver ou ajouter des tests ciblés dans `box_management/tests/test_double_actions.py` pour les cas à risque.
- Les commentaires peuvent utiliser `reason_code` uniquement pour la modération ou les décisions stockées.
- Ne pas confondre `reason_code` avec le `code` d’erreur API.
- Quand un commentaire est bloqué, supprimé, reporté ou modéré, le payload admin doit rester exploitable sans exposer de détails inutiles au public.

## Articles, incitations et client admin
- Les incitations sont des phrases courtes affichées sous la recherche de chanson à déposer.
- Elles servent de communication subtile dans une boîte : garder les payloads simples et directement consommables par le frontend.
- Les fenêtres d’affichage d’incitations/articles doivent rester prévisibles ; signaler les chevauchements sans forcément bloquer si le métier l’autorise.
- Les articles peuvent être créés manuellement ou importés depuis un lien ; l’import doit récupérer titre, résumé court, image et favicon quand disponible.
- Ne pas stocker ou renvoyer un article entier si le contrat prévoit un `short_text` court côté carte.
- Les endpoints client-admin doivent vérifier l’accès client et le rôle avant toute mutation.

## Stickers et redirections
- Les stickers appartiennent à des clients et peuvent être générés, téléchargés, assignés puis utilisés via QR.
- Une redirection sticker assigné/non assigné doit rester explicite et testée.
- Ne pas casser les routes publiques de stickers sans mettre à jour les tests de contrat public.

## Organisation du code
- `api/views/` : validation HTTP, permissions, orchestration, réponses.
- `services/` : mutations métier, règles transactionnelles, opérations réutilisables.
- `selectors/` : requêtes de lecture réutilisables.
- `builders/` : payloads front stables.
- `domain/` : constantes et règles métier pures.
- `integrations/` : appels externes et scraping.
- Éviter d’ajouter de la logique métier lourde dans `models.py`, `serializers.py` ou directement dans les vues.

## Scripts de seed et commandes Django
- Les scripts de seed doivent produire une impression d’usage réel : noms réalistes, profils variés, interactions cohérentes, commentaires crédibles, réactions non mécaniques.
- Pour simuler l’usage, utiliser les endpoints API autant que possible afin de tester le vrai parcours.
- Créer les utilisateurs directement en BDD uniquement si la tâche le demande, puis utiliser les endpoints pour les interactions.
- Les logs de commande doivent être lisibles avec statuts `[OK]`, `[WARNING]`, `[ERROR]` et explication utile.
- Si Spotify ou un provider externe renvoie un rate limit, attendre puis retry avec une limite claire.
- Ne révéler que les dépôts nécessaires quand l’objectif est de générer commentaires ou réactions réalistes.

## Tests attendus
Pour une modification dans ce périmètre, envisager au minimum :
```bash
python manage.py check
python manage.py test box_management.tests
```

Tests ciblés utiles selon le sujet :
```bash
python manage.py test box_management.tests.test_double_actions
python manage.py test box_management.tests.test_points_flows
python manage.py test box_management.tests.test_contract_and_public_views
python manage.py test box_management.tests.test_client_admin_articles_incitations
python manage.py test box_management.tests.test_client_admin_stickers
python manage.py test box_management.tests.test_seed_activity_command
```

## Refacto local
- Lors d’un refacto backend, ne pas laisser de fichiers relais servant uniquement à rediriger des imports.
- Mettre à jour tous les imports vers la cible finale dans la même tâche.
- Supprimer les endpoints, helpers et tests qui ne correspondent plus au comportement cible.
- Les exceptions doivent être explicitement justifiées comme migration temporaire.

## Nommage des dossiers
- Les nouveaux dossiers métier ou techniques créés dans ce périmètre doivent utiliser le PascalCase, avec une majuscule au début de chaque mot, par exemple `CommeCeciParExemple`.
- Ne pas renommer un dossier existant uniquement pour appliquer cette règle, sauf si le chantier prévoit explicitement le renommage complet et la mise à jour de toutes les références associées.
