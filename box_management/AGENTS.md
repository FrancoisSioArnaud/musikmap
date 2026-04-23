# box_management/AGENTS.md

## Scope
Applies to `box_management/`.

This directory contains a large part of the core business logic.

## Backend rules
- Treat backend as the source of truth for business rules, permissions, points, and costs.
- Preserve API contracts unless the task explicitly changes them.
- Prefer the local architecture and explicit module responsibilities over adding more logic to generic files.
- Do not introduce broad refactors while fixing a local bug.

## Architecture rules
Use these responsibilities consistently:

- `api/views/`: HTTP layer only. Parse requests, validate input, call the service layer, return responses.
- `services/`: business use cases, orchestration, and transaction boundaries.
- `selectors/`: read-only database access and query composition.
- `integrations/`: outbound services and external HTTP calls.
- `builders/` or response serializers: response payload shaping.
- `utils/`: generic pure helpers only, with no hidden business rules.


## API error contract
- API views must return JSON errors through the shared project error mechanism.
- The standard error payload shape is: `status`, `code`, `title`, `detail`.
- `code` is the stable application/API error code consumed by the frontend; it does not replace the HTTP status code.
- The HTTP status code must remain aligned with the nature of the error.
- `detail` must be populated when it adds real differentiation, display value, or debugging value.
- Do not make frontend logic depend on exact `detail` string matching.
- Do not introduce local variants of the shared error contract without an explicit project-wide reason.

## API views and business errors
- Views should map business failures to the shared HTTP/JSON error contract.
- Do not return ad-hoc error payloads from views when the endpoint follows the app JSON contract.
- Keep business failure mapping explicit and stable so frontend behavior can rely on `code` rather than message text.

## Views policy
- Views must stay thin.
- Do not place business rules, points logic, permission rules, complex ORM queries, or outbound HTTP calls directly in views when an existing service/selector/integration layer can own them.
- Views should mainly validate input, call one or more services, and return the response.

## Utils policy
- `utils/` must not become a business-logic catch-all.
- If code knows about deposits, reveals, reactions, comments, pinning, discovery, points, costs, or permissions, it does not belong in generic utils.
- Business helpers must live in a clearly named domain module under `services/`, `selectors/`, `builders/`, `integrations/`, or `domain/`.

## Read/write split
- Put read-only query logic in `selectors/`.
- Put state changes, orchestration, and business rules in `services/`.
- Do not hide writes inside selectors.

## Transactions
- Transaction boundaries belong in the service entry point for the business action.
- Do not manage transactions in views unless there is a very explicit boundary reason.

## Data and business rules
- `Deposit`, `DiscoveredSong`, reactions, comments, pinning, link discovery, and article import all carry business behavior.
- Be careful when editing points, reveal flows, pin flows, favorite flows, and discovery/session logic.
- If a change affects points or access rules, explicitly check the corresponding backend path instead of assuming the frontend behavior is correct.

## External integrations
- Outbound HTTP calls must live in `integrations/` or a clearly named client module.
- Services may orchestrate integrations, but should not inline raw request details when an integration module exists.
- Every outbound HTTP request must use an explicit timeout.
- Do not add new network calls without a clear reason.

## Response shaping
- Avoid building large API payload dictionaries inline in views.
- Shared or non-trivial response payloads should be assembled in dedicated builders or response serializers.

## Business errors
- Prefer explicit domain/business exceptions over scattered ad-hoc error returns in deep logic.
- Map business errors to HTTP responses at the API layer.
- Do not use broad `except Exception` unless the boundary and fallback behavior are intentional.
- Prefer catching precise exceptions.

## Service granularity
- Prefer services named after a concrete use case, such as `create_deposit`, `reveal_song`, `create_comment`, or `add_reaction`.
- Do not replace a large `views.py` with a large `services.py`.
- When a service file becomes broad or mixes multiple responsibilities, split it by use case.

## ORM discipline
- Complex query composition belongs in selectors.
- Use `select_related`, `prefetch_related`, and annotations deliberately in selectors rather than spreading query tuning across views and services.
- Avoid hidden N+1 behavior in builders and serializers.

## When editing a business flow
For deposit, reveal, reactions, comments, pinned flows, discovery/session logic, article import, or points-related behavior:
- identify the service entry point first
- identify the selector(s) that provide the read model
- confirm whether an external integration is involved
- preserve API contracts unless the task explicitly changes them
- run the relevant backend validation and the most relevant existing tests for that flow

## Legacy hotspots
Be especially careful in these files. Prefer small, surgical edits when touching legacy code during the transition.
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
