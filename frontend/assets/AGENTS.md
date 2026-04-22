# frontend/assets/AGENTS.md

## Scope
Applies to `frontend/assets/`.

This directory contains SCSS and style build tooling.

## Default rule
- Do not modify anything in this directory unless the user explicitly authorizes SCSS/style work.

## Required behavior for agents
- If a task appears to require SCSS changes, say so explicitly and ask for authorization before editing any file here.
- Do not perform opportunistic style cleanup.
- Do not rename classes, ids, keyframes, or selectors as part of unrelated work.
- Do not migrate naming conventions, structure, or theming patterns unless the user explicitly asks for that migration.
- Do not touch generated CSS output unless the task explicitly targets generated assets.

## If SCSS work is explicitly authorized
- Keep changes as small as possible.
- Preserve existing selector names unless the task explicitly changes them.
- Avoid broad formatting or convention migrations mixed with feature work.
- State clearly whether the change is style-only or also requires markup/component changes.

## Validation
```bash
cd frontend/assets && npm run lint:scss
```
