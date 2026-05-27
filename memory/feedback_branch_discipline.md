---
name: feedback-branch-discipline
description: Always work on a feature branch, never commit directly to main
metadata:
  type: feedback
---

Never commit or push directly to `main`. Always create a feature branch before starting work, then commit there and open a PR.

**Why:** TQ-3b was accidentally committed and pushed straight to main; branch protection blocked the force-push fix, so the PR flow was lost.

**How to apply:** At the start of every task, check `git branch` — if on `main`, run `git checkout -b <branch-name>` before touching any files. Use branch names like `feat/`, `fix/`, `refactor/` matching the task being done.
