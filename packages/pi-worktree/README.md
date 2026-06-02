# pi-worktree

Pi package that keeps agent work out of the main checkout by routing file and shell tools into an isolated Git worktree.

## What it does

`pi-worktree` bundles:

- a Pi extension that creates and activates task worktrees
- safety routing for file tools and bash
- lifecycle tools for status, diff, sync, commit, stop, and cleanup
- a `worktree-router` skill that teaches agents when to use the workflow
- a colored footer status item showing the active worktree path and branch

When active, Pi stays attached to the original repository, but tool execution happens inside the active worktree.

```text
⧉ .worktree/refactor/selector-code-style | ⎇ refactor/selector-code-style
```

## Install

From this checkout:

```bash
pi install /Users/mrscraper56/Projects/Code/Personal/monang/my-pi/packages/pi-worktree
```

Or from any directory with the same absolute path:

```bash
cd /
pi install /Users/mrscraper56/Projects/Code/Personal/monang/my-pi/packages/pi-worktree
```

Restart Pi or run `/reload` after reinstalling.

## Quick test

Open Pi inside any Git repository:

```bash
cd /path/to/repo
pi
```

Ask:

```text
use worktree for this feature: add a small README note
```

The extension detects the activation phrase and blocks file/bash tools until `worktree_start` succeeds.

Verify:

```text
Call worktree_status
```

Expected shape:

```text
pi-worktree active: /path/to/repo/.worktree/feat/example on feat/example
```

Check bash routing:

```text
Run bash: pwd && echo "$PI_WORKTREE_ROOT" && git branch --show-current
```

Expected:

```text
/path/to/repo/.worktree/feat/example
/path/to/repo/.worktree/feat/example
feat/example
```

## Tools

### `worktree_start`

Creates and activates a worktree.

Inputs:

```ts
{
  prompt?: string;
  branch?: string;
  baseRef?: string;
  trustMise?: boolean;
}
```

Branch inference:

- feature → `feat/<slug>`
- bug/fix → `fix/<slug>`
- docs → `docs/<slug>`
- refactor → `refactor/<slug>`
- test → `test/<slug>`

Worktree path preserves branch segments:

```text
branch: refactor/selector-code-style
path:   .worktree/refactor/selector-code-style
```

### `worktree_status`

Shows active state, full worktree path, branch, and `git status --short --branch`.

### `worktree_resolve_file`

Shows where a path will route without reading or writing it.

```text
worktree_resolve_file({ path: "src/main.ts" })
```

Expected while active:

```text
src/main.ts -> /repo/.worktree/<branch>/src/main.ts
```

### `worktree_diff`

Shows `git diff --stat` and `git diff` for the active worktree. Output is truncated safely.

### `worktree_sync`

Fetches and rebases the active worktree onto latest upstream without touching the main checkout.

Default target detection:

1. `origin/HEAD`
2. `origin/main`
3. local `main`
4. `HEAD`

### `worktree_commit`

Commits inside the active worktree only. Requires explicit UI confirmation.

Inputs:

```ts
{
  message: string;
  all?: boolean;
}
```

### `worktree_stop`

Deactivates routing. Optionally removes the worktree.

Inputs:

```ts
{
  remove?: boolean;
  force?: boolean;
}
```

Dirty worktrees are not removed unless `force: true` is passed.

### `worktree_rescue_leftovers`

Lists leftover `.worktree` directories and can remove clean leftovers.

## Routing behavior

When active:

| Input path | Result |
|---|---|
| `src/a.ts` | routes to active worktree |
| `./src/a.ts` | routes to active worktree |
| `/repo/src/a.ts` | remaps to `/repo/.worktree/<branch>/src/a.ts` |
| `/repo/.worktree/<active>/src/a.ts` | allowed |
| `/repo/.worktree/<other>/src/a.ts` | blocked |
| `~/.pi/agent/skills/tdd/SKILL.md` | allowed as a Pi-managed path |
| `/etc/passwd` | blocked |
| `../outside` | blocked |

Safety checks use real filesystem resolution and block symlink escapes. Pi-managed paths (`~/.pi` and the running Pi package) pass through so skills, package docs, and Pi internals remain readable while routing is active.

## Bash behavior

The package overrides Pi's `bash` tool with a spawn hook.

When active:

- cwd is the active worktree root
- `PI_WORKTREE_ROOT` is set
- `PI_WORKTREE_BRANCH` is set
- `PI_WORKTREE_REPO_ROOT` is set

Pi's process cwd and status bar may still show the original repo. Use `worktree_status` or `pwd` to verify effective execution location.

## Footer

The extension installs a compact custom footer with the fields used during agent work:

```text
⧉ .worktree/refactor/selector-code-style @ ⎇ refactor/selector-code-style | my-pi | GPT-5.5 think:high | ctx 29.5%/272k AC | cache 3.0M
```

Fields:

- model name
- thinking effort
- current directory basename
- worktree label/path (`main-worktree` when routing is inactive)
- branch
- context usage with auto-compaction marker (`AC`)
- cache-read total

Colors:

- model/thinking: magenta
- directory/worktree icon/path: cyan
- branch icon/name: green
- context/cache: blue
- separator: dim gray
- pending: yellow
- conflict: red warning

If a Pi version does not support custom footers, `pi-worktree` falls back to its old extension status item.

## `@` picker limitation

The package routes execution, not Pi's resource index.

Worktree-only new files may not appear in Pi's `@` picker because the picker indexes the original repo context. You can still type normal relative paths manually; file tools route them to the active worktree.

Example:

```text
docs/plans/2026-06-01-selector-code-style.md
```

Future work: hook Pi resource/autocomplete events if the API supports path source override.

## Development

```bash
cd packages/pi-worktree
npm install
npm test
npm run typecheck
```

## Package resources

```json
{
  "pi": {
    "extensions": ["./extensions/index.ts"],
    "skills": ["./skills"]
  }
}
```
