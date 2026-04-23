# frontend/AGENTS.md

## Scope
Applies to `frontend/`.

Frontend is React in JavaScript, with MUI, React Router, and existing storage/network helpers.

## Frontend rules
- Keep frontend changes minimal and local.
- Do not move business rules from backend to frontend.
- Prefer existing components and utilities over new patterns.
- Preserve current routing, storage keys, and payload shapes unless the task explicitly changes them.
- Do not replace current patterns with TypeScript, new state libraries, or new data layers.


## Error display and confirmations
- Never use `window.alert`, `window.confirm`, or `window.prompt`.
- Use MUI components for all user-facing confirmations and error displays.
- Any destructive irreversible action must be protected by a confirmation dialog.
- In dialogs with a primary action, the right-most button is always the button that continues or confirms the current action.
- The secondary cancel / close / back button must stay on the left.
- Keep this button order consistent across the application.
- Use a MUI `Dialog` for:
  - destructive irreversible actions,
  - explicit confirmations,
  - blocking errors.
- Use an inline MUI `Alert` for:
  - non-blocking errors,
  - local loading failures,
  - contextual messages inside an already visible area.
- A dialog may contain a MUI `Alert` when that improves readability.
- Prefer explicit primary button labels such as `Supprimer`, `Déconnecter`, `Retirer`, or `Confirmer` instead of generic labels.

## Song publishing / depositing search UX
- This rule applies only to song search used to publish / deposit a song.
- Any new song search UX for publishing / depositing must use `frontend/src/components/Common/Search/SearchPanel.js`.
- `SearchPanel` for song publishing / depositing must only be rendered in:
  - a dedicated page,
  - or a fullscreen MUI `Drawer` sliding in from the right.
- Do not create a parallel song publishing / depositing search component without an explicit reason.

## API error handling
- Keep frontend behavior tied to stable API fields such as `code`, not to exact `detail` string matches.
- Use `detail` when it brings real display value to the user.
- Do not introduce silent fallback behavior that hides API failures.

## Storage rules
- Do not use `localStorage` directly if an existing wrapper already covers the need.
- Prefer existing wrappers such as:
  - `frontend/src/components/Utils/mmStorage.js`
  - `frontend/src/components/Utils/pageStateStorage.js`
  - `frontend/src/components/Flowbox/runtime/flowboxSessionStorage.js`
- If no wrapper fits, prefer adding a small local helper instead of scattering direct storage access.

## Network rules
- Prefer existing API / provider helpers before adding new fetch logic.
- Keep request and response shapes aligned with backend expectations.
- Do not introduce silent fallback behavior that hides API failures.

## React rules
- Respect hook dependency rules unless there is a deliberate, justified exception.
- Avoid increasing the size of already large legacy files unless the task is specifically about those files.
- Do not add broad architectural refactors while fixing a local issue.
- Keep component props and public behavior stable unless explicitly asked otherwise.

## Failure handling
- Do not add silent fallbacks that hide an API or state bug.
- Do not swallow frontend errors by default.
- Do not change loading behavior, retries, or caching semantics unless requested.

## SCSS policy
- Do not modify SCSS, CSS, MUI theme styling, style files, or class names unless explicitly authorized by the user.
- If a frontend task cannot be completed safely without style changes, say so and ask for authorization first.

## High-risk legacy areas
Be especially careful in these files. Prefer small, surgical edits.
- `frontend/src/components/Common/Deposit.js`
- `frontend/src/components/Flowbox/PinnedSongSection.js`
- `frontend/src/components/UserProfilePage.js`
- `frontend/src/components/ClientAdmin/ArticleEdit.js`

## Validation
Do not commit frontend changes until the relevant frontend checks pass.

### Minimum required when editing JS under `frontend/src/`
```bash
cd frontend && npm run lint -- --quiet
cd frontend && npm run build
```

If relevant frontend tests already exist for the touched area, run the smallest relevant subset before commit.
If none exist, say so explicitly.
