Read `AGENTS.md` and `box_management/AGENTS.md` first.

Task: implement the requested backend change with a minimal patch.

Hard constraints:
- do not refactor unrelated code,
- avoid growing legacy files unnecessarily,
- prefer precise exceptions over broad exception handling,
- preserve backend source-of-truth behavior,
- do not change API contracts unless explicitly requested.

If the task also appears to require frontend or SCSS changes, say so explicitly but do not make them unless requested.

At the end, run:
- `ruff check .`
- `ruff format --check .`

Return:
1. Summary
2. Files changed
3. Commands run
4. Remaining risks or assumptions
