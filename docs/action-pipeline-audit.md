# Audit final pipeline actions

## Verdict global

La pipeline Confiture présente dans ce dépôt est alignée avec la séparation attendue :

```txt
UX / builder de transaction
→ applyLocalTransaction()
→ localDb
→ projectJamState()
→ applyEvent()
→ resolveOrderAfterTransaction()
→ buildColumns()
→ syncQueue / hydrateFromPayload()
```

Les fichiers de documentation Confiture cités dans les prompts ne sont pas présents dans ce checkout. Le présent audit documente donc le comportement réel du code ajouté dans `frontend/src/features`.

## Pipeline réelle finale

1. `hydrateFromPayload(jamId, payload)` persiste le payload serveur dans `localDb`.
2. `localDb` fusionne les transactions serveur et pending par `transactionId` / `id` / `clientTransactionId`.
3. `reloadFromLocalDb(jamId)` récupère `baseState` + transactions fusionnées.
4. `projectJamState(baseState, transactions)` rejoue les transactions actives.
5. `applyEvent()` applique uniquement les faits bruts des events.
6. `resolveOrderAfterTransaction()` calcule les conséquences d’ordre.
7. `buildColumns()` expose les colonnes triées selon l’ordre résolu.
8. `getPendingSyncQueue()` expose les transactions pending restantes.

## Écarts corrigés

- `npm test -- --run` passait `--run` directement à Jest, qui ne supporte pas cette option. Le script `frontend/runJest.js` filtre maintenant cet argument tout en conservant les autres filtres de test.
- Les relations `link` / `conflict` supprimées sont ignorées par le resolver au lieu de rester des contraintes actives.
- `buildColumns()` expose maintenant `column.instrument.instrumentId`, utilisé par les assertions de plateau index visible.

## Écarts restants

- Les builders UX réels (`buildLinkModeTransaction.js`, `buildMoveCardTransaction.js`, etc.) ne sont pas présents dans ce checkout. Les tests pipeline utilisent donc des builders de test déterministes.
- IndexedDB/Dexie réel n’est pas présent ; `localDb.js` est une implémentation locale en mémoire qui reproduit les règles de merge nécessaires aux tests.
- Aucun endpoint backend d’append/sync Confiture n’est présent dans ce checkout.

## Tableau par action

| Action | Builder | Event type | applyEvent | Resolver | Tests | Verdict |
|---|---|---|---|---|---|---|
| Mise à jour participant | Builder de test `tx()` | `participant_updated` | Met à jour `participants` | Pas d’impact ordre | `jamPipeline.test.js` | OK |
| Ajout participation | Builder de test `tx()` | `participation_added` | Ajoute les appearances/cards | Place selon round/base et pins | `jamPipeline.test.js`, `orderResolution.test.js` | OK |
| Drag / move | Builder de test `tx()` | `appearance_moved_between` | Stocke l’intention/manualOrder | Applique anchor/manual sans déplacer played/locked | `jamPipeline.test.js`, `orderResolution.test.js` | OK |
| Reveal round | Builder de test `tx()` | `round_revealed` | Ajoute le round révélé | Aucun tri final hors resolver | `jamPipeline.test.js` | OK |
| Played | Builder de test `tx()` | `plateau_played` | Marque `played` | Fige `playedAtPlateauIndex` | `jamPipeline.test.js`, `orderResolution.test.js` | OK |
| Lock/unlock | Builder de test `tx()` | `lock_toggled` | Marque `locked` | Fige `lockedAtPlateauIndex` tant que locked | `jamPipeline.test.js`, `orderResolution.test.js` | OK |
| Link créé | Builder de test `tx()` | `link_created` | Crée la contrainte link | Aligne / suppress selon conflict/frozen | `jamPipeline.test.js`, `orderResolution.test.js` | OK |
| Link supprimé | Builder de test `tx()` | `link_removed` | Marque le link removed | Ignore les relations removed | `jamPipeline.test.js` | OK |
| Conflict créé | Builder de test `tx()` | `conflict_created` | Crée la contrainte conflict | Gagne contre links incompatibles | `jamPipeline.test.js`, `orderResolution.test.js` | OK |
| Conflict supprimé | Builder de test `tx()` | `conflict_removed` | Marque le conflict removed | Ignore les relations removed | `jamPipeline.test.js` | OK |
| Skip / call drawer | Builder de test `tx()` | `appearance_skipped` | Marque la décision d’appel | Respecte pins et anchor | `jamPipeline.test.js`, `orderResolution.test.js` | OK |
| Play without | Builder de test `tx()` | `hole_added` + `link_created` | Ajoute le hole + link | Aligne appearance et hole | `jamPipeline.test.js` | OK |
| Participant left/removed | Builder de test `tx()` | `participant_left`, `participant_removed` | Marque les cards `left` | Filtre les cards left | `jamPipeline.test.js` | OK |
| Undo | Builder de test `tx(..., { undone: true })` | Transaction inactive | Pas appliqué par `projectJamState` | Replay actif uniquement | `jamPipeline.test.js` | OK |

## Anciennes logiques supprimées ou conservées

Recherche effectuée dans `frontend/src` :

- `reapplyActiveLinks` : aucune occurrence.
- `applyLink` : aucune occurrence concurrente.
- `orderScore` : aucune occurrence.
- `positionInRound` : aucune occurrence.
- `roundOrder` : aucune occurrence.
- `manualRoundOrder` : aucune occurrence.
- `sortByColumnOrder` : aucune occurrence.
- `arrayMove` : aucune occurrence.
- `movedLinkedGroup` : aucune occurrence.

Conclusion : aucune ancienne logique frontend concurrente n’est présente dans ce checkout.

## Tests ajoutés ou modifiés

- `frontend/src/features/jam/jamPipeline.test.js` couvre la pipeline complète local-first avant/après refresh.
- `frontend/src/features/jam/jamStore.test.js` couvre hydrate serveur + pending locale.
- `frontend/src/features/projection/orderResolution.test.js` couvre resolver, pins, links/conflicts et replay déterministe.

## Documentation modifiée

- Ajout de ce rapport `docs/action-pipeline-audit.md`.

## Risques restants / prochaines tâches

- Remplacer `localDb.js` par l’adaptateur IndexedDB/Dexie réel quand il sera présent.
- Brancher les builders UX réels sur les mêmes transactions quand les composants Confiture seront présents.
- Ajouter des tests React d’interaction utilisateur quand la table UI Confiture existera dans ce checkout.
