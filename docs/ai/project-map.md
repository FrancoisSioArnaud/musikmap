# Project map

## Goal of this document
This file gives coding agents a compact map of the repository so they do not guess architecture or source of truth.

## Stack
- Backend: Django + Django REST Framework
- Frontend: React in JavaScript
- Styling: SCSS + MUI
- Tooling already present: Ruff, ESLint, Stylelint, Semgrep

## Repository map
### Backend
- `box_management/`: main business domain
- `users/`: user account, profile, points-related helpers, guest/full-user flows
- `spotify/`, `deezer/`: provider integration and auth/search helpers
- `la_boite_a_son/`: Django project configuration

### Frontend
- `frontend/src/`: React application code
- `frontend/src/components/Flowbox/`: onboarding, live search, discover, in-box session runtime
- `frontend/src/components/Common/`: shared UI including deposits, search, article, reactions
- `frontend/src/components/UserProfile/`: profile views and related features
- `frontend/src/components/ClientAdmin/`: back-office / client admin UI
- `frontend/src/components/Utils/`: storage, markdown, time, streaming utilities

### Styles
- `frontend/assets/scss/`: SCSS source files
- `frontend/assets/`: style tooling and gulp pipeline

## Source-of-truth guidance
### Business logic
Backend is the source of truth for:
- points
- reveal cost / pin cost and related rules
- permissions and access checks
- deposit creation behavior
- discovery state and link logic

Do not re-implement or redefine these rules in the frontend unless the task explicitly changes the contract.

### Frontend state and storage
Frontend uses storage/session helpers and cached snapshots for user experience. Do not invent new storage patterns when existing wrappers already cover the need.

Relevant wrappers/helpers include:
- `frontend/src/components/Utils/mmStorage.js`
- `frontend/src/components/Utils/pageStateStorage.js`
- `frontend/src/components/Flowbox/runtime/flowboxSessionStorage.js`

## High-risk legacy zones
These files are large and should be edited carefully.

### Backend
- `box_management/views.py`
- `box_management/utils.py`
- `box_management/models.py`

### Frontend
- `frontend/src/components/Common/Deposit.js`
- `frontend/src/components/Flowbox/PinnedSongSection.js`
- `frontend/src/components/UserProfilePage.js`
- `frontend/src/components/ClientAdmin/ArticleEdit.js`

Default behavior in these zones:
- prefer minimal edits
- avoid broad cleanup mixed with feature work
- avoid expanding the file further unless necessary

## Style policy
Style files are intentionally separated from code work.

Default rule for agents:
- do not touch SCSS or style files unless explicitly authorized by the user
- if style changes are required to complete the task, say so and ask for authorization first

## Validation map
### Backend
```bash
ruff check .
ruff format --check .
```

### Frontend
```bash
cd frontend && npm run lint -- --quiet
```

### Styles
```bash
cd frontend/assets && npm run lint:scss
```

## Tool-specific note
### Codex
Codex should rely primarily on `AGENTS.md` files plus this document for architecture context.

### Dust
Dust users should copy the relevant rules from `AGENTS.md` and the closest subdirectory `AGENTS.md` into the Dust agent instructions, then use this file as repository context.
