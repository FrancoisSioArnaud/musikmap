# AGENTS.md

## Purpose
This repository is a Django + React + SCSS application for MusikMap / La Boîte à Son.

This file is the root contract for coding agents. Nearest `AGENTS.md` files override this file for their directory.

Additional context lives in:
- `docs/ai/project-map.md`
- `docs/ai/domain-glossary.md`
- `docs/ai/checklists/definition-of-done.md`

## Global rules
- Make the smallest change that solves the requested problem.
- Do not refactor outside the requested scope.
- Do not add dependencies unless explicitly authorized.
- Do not add migrations unless the task clearly requires a schema change.
- Do not rename files, public APIs, routes, CSS classes, or storage keys unless explicitly required.
- Prefer existing abstractions and project conventions over inventing parallel patterns.
- Do not reuse an existing utility or helper if doing so would hide business logic in the wrong layer.
- Preserve current business behavior unless the task explicitly asks to change it.
- When a change has meaningful risk, state the risk clearly.

## Architecture preservation
- When a directory already defines a local architecture (for example services/selectors/builders/integrations), extend that architecture instead of adding new logic to catch-all files.
- Do not introduce new `helpers.py`, `misc.py`, or broad `utils.py` patterns when a clearer module name fits the change.
- New code should be placed where its responsibility is explicit from the file name.

## Naming
- Prefer file and function names that state the responsibility directly.
- Avoid vague names such as `helpers`, `misc`, `common`, `manager`, `process_data`, or `handle_*` unless the responsibility is genuinely broad and well-defined.

## Separation of concerns
- Keep request/response handling separate from business rules and data access whenever the local directory architecture supports it.
- Avoid mixing transport concerns, business decisions, database querying, and response shaping in the same function when a local structure exists to separate them.

## SCSS policy
- Do not modify SCSS, CSS, theme styles, or class names unless the user explicitly authorizes it.
- If SCSS changes seem required to complete the task, stop and ask for authorization before touching any style file.
- Do not silently compensate for missing SCSS permission by changing markup or behavior in risky ways.

## Working method
- Inspect the smallest relevant set of files first.
- Identify the source of truth before editing.
- Keep changes local when possible.
- If the task is ambiguous, prefer one clear recommendation and identify what still needs confirmation.
- If a requested change appears to require SCSS edits, dependency changes, or schema changes, call that out explicitly before doing it.

## Validation
Run only the validations relevant to the area you touched.

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

## Output contract
Unless the user asks for something else, respond with:
1. What changed
2. Files changed
3. Validation run
4. Remaining risks or follow-ups

## Tool-specific notes
### Codex
- `AGENTS.md` is the primary instruction file.
- Read the nearest `AGENTS.md` before editing files.
- Use the docs in `docs/ai/` for project context, not as a reason to widen the scope.

### Dust
- Dust does not reliably infer repository-specific instructions from `AGENTS.md` alone.
- When using Dust, paste or sync the relevant content from this file and the nearest subdirectory `AGENTS.md` into the Dust agent instructions.
- For Dust tasks on this repo, always include the SCSS policy and the output contract in the agent instructions.
