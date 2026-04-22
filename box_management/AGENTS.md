# box_management/AGENTS.md

## Scope
Applies to `box_management/`.

This directory contains a large part of the core business logic.

## Backend rules
- Treat backend as the source of truth for business rules, permissions, points, and costs.
- Preserve API contracts unless the task explicitly changes them.
- Prefer focused helpers and local extractions over widening already large files.
- Do not introduce broad refactors while fixing a local bug.

## Data and business rules
- `Deposit`, `DiscoveredSong`, reactions, comments, pinning, link discovery, and article import all carry business behavior.
- Be careful when editing points, reveal flows, pin flows, favorite flows, and discovery/session logic.
- If a change affects points or access rules, explicitly check the corresponding backend path instead of assuming the frontend behavior is correct.

## Error handling
- Do not use broad `except Exception` unless there is a clear boundary reason and the exception is intentionally swallowed.
- Prefer catching precise exceptions.
- If swallowing an exception is truly required, make the reason explicit.

## External requests
- Every outbound HTTP request must use an explicit timeout.
- Do not add new network calls without a clear reason.

## Legacy hotspots
Be especially careful in these files. Prefer small, surgical edits.
- `box_management/views.py`
- `box_management/utils.py`
- `box_management/models.py`

## SCSS policy
- Backend tasks must not trigger SCSS edits unless the user explicitly authorizes style changes.
- If backend work reveals that matching SCSS changes are required, stop and request authorization before touching styles.

## Validation
```bash
ruff check .
ruff format --check .
```
