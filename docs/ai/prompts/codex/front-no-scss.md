Read `AGENTS.md` and `frontend/AGENTS.md` first.

Task: implement the requested frontend change with a minimal patch.

Hard constraints:
- do not modify SCSS,
- do not rename CSS classes,
- do not introduce style-only workarounds,
- if SCSS changes are required, stop and ask for authorization first.

Prefer:
- React/JS logic changes,
- existing wrappers,
- existing component patterns,
- local changes over broad refactors.

At the end, run:
- `cd frontend && npm run lint -- --quiet`

Return:
1. Summary
2. Files changed
3. Commands run
4. Remaining risks or assumptions
