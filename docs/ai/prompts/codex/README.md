# Codex prompt kit

These prompts are starting points for Codex sessions on this repository.

## Usage
- Open Codex at the repository root unless the task is clearly limited to a single area.
- For backend work, also rely on `box_management/AGENTS.md` when relevant.
- For frontend work, also rely on `frontend/AGENTS.md` when relevant.
- Do not modify SCSS unless the user explicitly authorizes it.
- If SCSS changes are required, stop and ask first.

## Prompt files
- `audit.md`: explain current behavior without changing files
- `bugfix.md`: smallest safe patch for a bug
- `feature.md`: plan first, then implement with a minimal patch
- `front-no-scss.md`: frontend implementation with an explicit no-style rule
- `backend-strict.md`: backend implementation with strict source-of-truth constraints
- `personal-codex-agents.example.md`: optional personal defaults to copy into `~/.codex/AGENTS.md`
