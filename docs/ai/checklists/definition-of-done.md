# Definition of done

Use this checklist before considering a coding task complete.

## Scope
- The change stays within the requested scope.
- No unrelated refactor was mixed into the task.
- No new dependency was added unless explicitly authorized.
- No schema migration was added unless the task clearly required it.

## Behavior
- The requested behavior is implemented.
- Existing business rules were preserved unless the task explicitly changed them.
- Backend remains the source of truth for points, permissions, and costs.
- No silent contract change was introduced between frontend and backend.

## Code quality
- The change is as small as reasonably possible.
- Existing helpers/wrappers were reused when appropriate.
- Risky legacy files were edited surgically.
- Error handling is intentional, not accidental.

## SCSS / style safety
- No SCSS, CSS, theme style, or selector was modified unless the user explicitly authorized style work.
- If style changes were necessary but not authorized, that was called out instead of being changed silently.

## Validation
Run only what is relevant to the touched area.

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

## Response checklist
A good completion message should include:
1. what changed
2. which files changed
3. what validation was run
4. remaining risks, assumptions, or blocked items

## Not done yet if
- the task still depends on unauthorized SCSS changes
- validations that should have been run were skipped without saying so
- the solution changed behavior outside the request
- the patch widened into unrelated cleanup
