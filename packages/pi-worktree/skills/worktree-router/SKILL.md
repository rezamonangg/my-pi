---
name: worktree-router
description: Use when user asks for isolated implementation, worktree safety, git worktree routing, or says not to touch the main checkout.
---

# worktree-router

Use when user asks for isolated implementation, worktree safety, or says not to touch main checkout.

Behavior:

- Call `worktree_start` before reading, editing, writing, or running bash for implementation.
- Use conventional branch names: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `refactor/<slug>`, `test/<slug>`.
- If branch intent unclear, ask user for branch/type before starting.
- If mise config exists, ask user before passing `trustMise:true`.
- After activation, normal paths route into active worktree automatically.
- Use `worktree_status` to verify active root and branch.
- Use `worktree_diff` for review.
- Use `worktree_sync` to rebase active worktree onto latest upstream.
- Use `worktree_commit` only after explicit confirmation.
- Use `worktree_stop` to deactivate; remove dirty worktrees only after rescue/review.

Never intentionally read or mutate the main checkout while pi-worktree is active.
