# ~/.codex/AGENTS.md example

Copy this into `~/.codex/AGENTS.md` if you want personal Codex defaults outside the repository.

```md
# Personal Codex defaults

## Working style
- Prefer minimal patches over broad refactors.
- For multi-file, ambiguous, or risky tasks, plan before coding.
- Restate the relevant repository constraints before editing.
- Inspect the smallest relevant set of files first.
- Reuse existing patterns and wrappers before introducing new abstractions.

## Safety and scope
- Do not change behavior outside the requested scope.
- Do not add dependencies unless explicitly authorized.
- Do not modify lockfiles unless dependency changes are explicitly authorized.
- Do not edit generated files unless explicitly asked.
- Do not perform broad renames or sweeping formatting-only changes unless explicitly asked.

## Frontend and styles
- Do not modify SCSS unless explicitly authorized.
- If SCSS changes appear necessary to complete the task, stop and ask for authorization first.
- Prefer React/JS changes over style changes when both are possible.

## Validation
- Run the smallest relevant validation commands after changes.
- Report exactly which commands were run.
- If validation cannot be run, say so explicitly.

## Response contract
Always end with:
1. Summary
2. Files changed
3. Commands run
4. Remaining risks or assumptions
```
