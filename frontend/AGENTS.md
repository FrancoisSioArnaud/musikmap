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
```bash
cd frontend && npm run lint -- --quiet
```
