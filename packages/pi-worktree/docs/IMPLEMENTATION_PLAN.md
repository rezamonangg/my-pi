# pi-worktree Implementation Plan

Status: planning / grilled draft
Source seed: `~/pi-worktree-router-extension-skill-plan.md`
Target package: `packages/pi-worktree`

## Package intent

`pi-worktree` is one Pi package that bundles:

- an extension that enforces runtime worktree routing and safety
- a skill that teaches the model when and how to use the worktree tools

The package should be GitHub-installable first:

```bash
pi install git:github.com/<user>/my-pi@<ref>
```

During local development, it can also be installed from this repo:

```bash
pi install ~/Projects/Code/Personal/monang/my-pi/packages/pi-worktree
```

or loaded from `.pi/settings.json` / `~/.pi/agent/settings.json` via `packages`.

## Pi package shape

```text
packages/pi-worktree/
├── package.json
├── README.md
├── extensions/
│   └── pi-worktree/
│       ├── index.ts
│       ├── state.ts
│       ├── git.ts
│       ├── paths.ts
│       ├── routing.ts
│       └── tools.ts
├── skills/
│   └── worktree-router/
│       └── SKILL.md
└── docs/
    ├── IMPLEMENTATION_PLAN.md
    └── DECISIONS.md
```

`package.json` must declare package resources explicitly:

```json
{
  "name": "pi-worktree",
  "version": "0.1.0",
  "private": true,
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions/index.ts"],
    "skills": ["./skills"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-tui": "*",
    "typebox": "*"
  }
}
```

## Core decision

Use virtual routing, not `process.chdir()`.

Pi remains attached to the original repo root. When worktree mode is active, the extension rewrites or blocks tool calls so actual filesystem and shell effects happen inside:

```text
<repo-root>/.worktree/<branch>

Example: `/repo/.worktree/feat/chat` for branch `feat/chat`.
```

This keeps the session mentally attached to the main checkout while protecting the main checkout from accidental writes.

## Runtime model

### Active state

Minimum active state:

```ts
type WorktreeState = {
  active: boolean;
  repoRoot: string;
  worktreeRoot: string;
  worktreeRelPath: string; // e.g. .worktree/feat/chat
  branch: string; // e.g. feat/chat
  baseRef: string;
  createdAt: string;
};
```

Recommended state split:

- session state: active worktree for this Pi session, reconstructed from tool result `details` / `pi.appendEntry()`
- disk registry: `.pi/worktree-router/state.json` for reload recovery and cross-session inspection

Do not make one global active worktree silently affect unrelated Pi sessions.

## Extension responsibilities

The extension owns enforcement. The skill owns model behavior.

Extension must:

1. register worktree tools
2. detect or receive activation intent
3. create git worktree under the branch path, e.g. `.worktree/feat/chat`
4. store active state
5. route file tools into active worktree
6. route shell tools into active worktree
7. block path escapes and sibling worktrees
8. expose status/diff/commit/stop helpers
9. allow package tools to run their own controlled git operations that normal bash may block, while still validating any user-provided paths
10. fail closed on ambiguous unsafe operations

## Tools

Tool names stay concise. Planned tools: `worktree_start`, `worktree_status`, `worktree_stop`, `worktree_diff`, `worktree_commit`, `worktree_sync`, `worktree_resolve_file`, and `worktree_rescue_leftovers`. Do not rename them with a `pi_` prefix.

### `worktree_start`

Creates and activates a worktree.

Inputs:

```ts
{
  taskName?: string;
  baseRef?: string;
  branch?: string;
  force?: boolean;
}
```

`baseRef` must resolve through `git rev-parse --verify`; reject shell-like or invalid ref strings.

Behavior:

- discover repo root via `git rev-parse --show-toplevel`
- create branch name using existing project convention, e.g. `feat/<slug>`, `fix/<slug>`, `chore/<slug>`
- validate branch names with `git check-ref-format --branch <name>`; reject shell-like or invalid branch names and ask again
- create path `<repoRoot>/.worktree/<branch>`; example branch `feat/chat` uses `/repo/.worktree/feat/chat`
- if the worktree path collides, suggest a different branch/name instead of auto-suffixing
- warn if the main checkout has uncommitted changes, but do not block worktree creation solely for that reason
- create worktree from the selected git ref only; never copy, apply, stash, or otherwise move uncommitted main-checkout code changes or new files into the worktree
- if `.gitmodules` exists, warn that submodules are separate attached repositories and v0.1 only handles the main repo; do not initialize/update submodules automatically
- expect each git worktree directory to contain Git's normal `.git` file pointing back to the main repo metadata; this is allowed
- run `git worktree add -b <branch> <path> <baseRef>` when branch does not exist
- if requested branch already exists locally, ask before attaching or creating another branch; recommend using the existing local worktree when one is available
- if requested branch exists remotely but not locally, ask before tracking it or choosing a different branch name
- recover existing clean matching worktree when possible
- save active state
- return exact repo root, worktree root, branch, base ref, and routing summary

### `worktree_status`

Returns current active state plus:

- `git -C <worktreeRoot> status --short --branch`
- whether worktree exists
- whether worktree has uncommitted changes
- whether main checkout has uncommitted changes

### `worktree_stop`

Deactivates routing and optionally removes the active worktree.

Inputs:

```ts
{
  remove?: boolean;
  force?: boolean;
}
```

Rules:

- always allow deactivation
- if `remove: true`, warn that the worktree directory will be removed and ask for explicit confirmation before removal
- refuse removal if worktree is dirty unless `force: true`
- if `force: true` and worktree is dirty, show status/diff summary before confirmation; force allows dirty removal but does not skip confirmation
- after confirmed clean/forced worktree removal, ask whether to delete the branch; do not delete it silently; default to keeping the branch
- never remove sibling worktrees
- never remove main repo

### `worktree_diff`

Runs:

```bash
git -C "$PI_WORKTREE_ROOT" diff --stat && git -C "$PI_WORKTREE_ROOT" diff
```

Output must be truncated safely.

### `worktree_commit`

Commits inside the worktree only.

Inputs:

```ts
{
  message: string;
  all?: boolean;
}
```

Rules:

- run `git -C <worktreeRoot> status --short` first
- show status plus diff stat before confirmation
- commit only inside worktree
- require explicit user confirmation before commit
- return commit hash and branch

### `worktree_rescue_leftovers`

Moves leftover local changes from a merged session worktree into a new worktree.

Rules:

- only offered during cleanup for a branch already merged to main/upstream
- create a new worktree/branch from latest main only
- show tracked diff summary and list untracked non-ignored files
- require explicit confirmation before applying leftovers
- apply tracked changes via patch
- copy untracked non-ignored files only after explicit confirmation and path validation
- exclude ignored files in v0.1
- never modify main checkout
- if patch apply fails, stop and report; do not remove the original worktree

### `worktree_sync`

Updates the active worktree on top of latest main/upstream without checking out or mutating the main checkout working tree.

Inputs:

```ts
{
  target?: string;
  strategy?: "rebase" | "merge";
  fetch?: boolean;
}
```

`target` must resolve through `git rev-parse --verify`; reject shell-like or invalid ref strings.

Default target detection:

1. `origin/HEAD`
2. `origin/main`
3. local `main`

Default behavior candidate:

```bash
git -C "$repoRoot" fetch --all --prune
git -C "$worktreeRoot" rebase <detected-target>
```

Rules:

- operate from the active worktree
- never run `git checkout main` in the main checkout
- if active worktree has uncommitted changes, block sync and ask the user for next action; never auto-stash
- expose conflict state clearly and stop normal work; keep routing active inside the conflicted worktree; allow only `worktree_status`, `worktree_diff`, and `worktree_stop`; block bash, file tools, commit, sync, and start; tell the user: "Resolve conflicts manually in your editor/terminal. Then run `worktree_status` in Pi to unlock normal worktree tools." Conflict resolution itself is out of scope for this package
- support configurable target because not every repo uses `main` or `origin/main`
- report the detected target before running rebase/merge

### `worktree_resolve_file`

Debug/helper tool that maps a user-visible path to the actual worktree path.

Inputs:

```ts
{
  path: string;
}
```

Returns:

```ts
{
  inputPath: string;
  repoRelativePath: string;
  resolvedPath: string;
  reason: "relative" | "main-absolute" | "active-worktree-absolute";
}
```

## Tool routing design

Pi supports two viable mechanisms:

1. `tool_call` event: mutate built-in tool inputs before execution.
2. built-in tool override: register a tool with the same name and delegate to `createReadTool`, `createWriteTool`, `createEditTool`, `createBashTool`, etc.

Recommended phases:

### Phase A: `tool_call` routing

Use `tool_call` mutation for `read`, `write`, `edit`, `ls`, `grep`, `find`.

- If inactive: do nothing.
- If active: rewrite path arguments to absolute paths inside active worktree.
- If path resolves outside active worktree: block.

For `bash`, Phase A may wrap command:

```bash
cd "$PI_WORKTREE_ROOT" && export PI_WORKTREE_ROOT="..." && <original-command>
```

But this is only acceptable for early prototype. It is shell-fragile.

### Phase B: override built-in tools

Override built-in `bash` with `createBashTool(ctx.cwd, { spawnHook })` so cwd/env are set before process spawn.

Preferred bash behavior:

- cwd becomes the active worktree equivalent of Pi's original repo-relative cwd; for example `/repo/packages/app` maps to `/repo/.worktree/feat/chat/packages/app`; if that subdirectory does not exist, block and ask instead of falling back to worktree root
- env includes `PI_WORKTREE_ROOT`, `PI_REPO_ROOT`, `PI_WORKTREE_BRANCH`
- command text is not string-rewritten except for hard blocking unsafe obvious cases

Also consider overriding `read`, `write`, `edit`, `ls`, `grep`, `find` if `tool_call` mutation cannot preserve desired rendering/details.

## Path routing rules

When active:

| Input path | Action |
|---|---|
| `src/a.ts` | route to `<worktreeRoot>/src/a.ts` |
| `./src/a.ts` | route to `<worktreeRoot>/src/a.ts` |
| `<repoRoot>/src/a.ts` | route to `<worktreeRoot>/src/a.ts` |
| `<worktreeRoot>/src/a.ts` | allow |
| `<repoRoot>/.worktree/<active>/src/a.ts` | allow |
| `<repoRoot>/.worktree/<other>/src/a.ts` | block |
| `/etc/passwd` | block unless explicitly read-only exception is added later |
| `../outside` | block |

Use real filesystem resolution:

- normalize leading `@` from file tags
- resolve relative paths against the active worktree equivalent of Pi's original repo-relative cwd, not process cwd
- resolve main absolute paths to repo-relative paths, then remap to active worktree
- use `realpath` for existing paths
- for non-existing write targets, realpath nearest existing parent
- verify final target is inside active worktree
- block symlinks that resolve outside the active worktree
- allow the active worktree root's normal Git-created `.git` file
- block nested `.git` files or directories inside the worktree by default, except the active worktree root's normal Git-created `.git` file; v0.1 handles the main repo only
- verify final target is not inside a sibling worktree

Never rely on raw string prefix checks alone.

## Bash safety model

Do not pretend arbitrary shell rewriting is safe.

Recommended contract:

- safe by cwd/env, not by rewriting every path in shell text
- block obvious dangerous commands that name main repo absolute paths for writes
- for absolute paths outside the repo, block obvious writes/dangerous commands only in v0.1; bash is cwd-safe, not a total filesystem sandbox
- block `git -C <repoRoot> ...` while active unless read-only allowlist says otherwise
- allow sanctioned sync through `worktree_sync`, which can run controlled git fetch/rebase/merge operations that normal bash may block
- block commands referencing `<repoRoot>/.worktree/<other>`
- allow normal relative commands, e.g. `npm test`, `go test ./...`, `git status`
- run those relative commands from the active worktree equivalent of Pi's original repo-relative cwd

Initial blocklist patterns:

```text
> <repoRoot>/...
>> <repoRoot>/...
rm ... <repoRoot>/...
mv ... <repoRoot>/...
cp ... <repoRoot>/...
git -C <repoRoot> commit|reset|checkout|switch|merge|rebase|clean|worktree remove
<repoRoot>/.worktree/<other>/...
```

This is not a full shell parser or total filesystem sandbox. Treat unknown high-risk cases as blocked with a clear reason.

## Natural language activation

The seed plan relies on the model loading the skill from natural language. That is not strong enough as the only activation path.

Recommended design:

1. Skill description triggers model behavior.
2. Extension also detects activation phrases in `input` or `before_agent_start`.
3. When detected, extension starts the setup flow before the agent turn.

Preferred: extension auto-starts for reliability, but only after required setup questions are answered. Activation may enter a pending state that blocks all file and bash tools until branch/latest-main/trust choices are resolved. Then the skill explains how to operate once active.

Trigger phrases:

```text
use isolated worktree
use a worktree
worktree mode
safe branch work
parallel implementation
do not touch main checkout
don't touch my main checkout
isolate this task
```

## Skill behavior

`skills/worktree-router/SKILL.md` should say:

- Use `worktree_start` before reads/writes/bash for isolated tasks.
- After activation, keep using normal file/bash tools; extension routes them.
- Use `worktree_status` before destructive cleanup.
- Use `worktree_diff` before summarizing changes.
- Use `worktree_commit` only when user asks to commit.
- Never write explicit paths under the main checkout while active.
- If a path looks ambiguous, call `worktree_resolve_file`.

Skill should not claim safety by itself. Safety comes from extension enforcement.

## Acceptance tests

Acceptance coverage should focus on core safety paths plus decision-specific regression tests for risky items, not one exhaustive test per decision.

Risky regression tests to include:

- pending activation blocks all file/bash tools
- no uncommitted main-checkout code changes or new files are copied/applied/stashed into worktree
- symlink escapes are blocked
- conflict-blocked mode allows only `worktree_status`, `worktree_diff`, and `worktree_stop`
- cleanup/rescue requires confirmations and never deletes remote branches
- repo-relative cwd is preserved inside worktree
- branch/ref validation rejects shell-like strings
- worktree path collision asks instead of auto-suffixing
- v0.1 writes `.worktree/` only to `.git/info/exclude`, not tracked `.gitignore`

### 1. Package discovery

Install local package. Pi discovers one extension and one skill.

### 2. Natural language activation

Prompt:

```text
Use an isolated worktree for this task and edit README.md.
```

Expected:

- worktree is created under the branch path, e.g. `.worktree/feat/chat`
- README edit happens only inside worktree
- main README unchanged

### 3. Relative path routing

With active worktree, model reads `package.json`.

Expected actual file read:

```text
<repoRoot>/.worktree/feat/chat/package.json
```

### 4. Absolute main path routing

With active worktree, model reads `<repoRoot>/src/main.ts`.

Expected actual file read:

```text
<repoRoot>/.worktree/feat/chat/src/main.ts
```

### 5. Escape blocking

Attempt to write `../outside.txt`.

Expected: blocked.

### 6. Sibling worktree blocking

Attempt to read/write `<repoRoot>/.worktree/other-task/src/main.ts`.

Expected: blocked.

### 7. Bash cwd routing

Run:

```bash
pwd
```

Expected output cwd is the active worktree equivalent of Pi's original repo-relative cwd.

### 8. Main repo git protection

Run:

```bash
git -C <repoRoot> reset --hard
```

Expected: blocked while active.

### 9. Dirty removal protection

Make uncommitted change in worktree, call `worktree_stop({ remove: true })`.

Expected: refuses removal unless `force: true`.

When `force: true`, status/diff summary is shown before confirmation. Clean removal also requires explicit confirmation before deleting the worktree directory. Branch deletion is a separate prompt after removal and must never happen silently.

### 10. Reload recovery

Activate worktree, `/reload`, call `worktree_status`.

Expected: active state recovered or explicit safe inactive state with registry entry shown.

## Mise handling

If the repo contains `mise.toml` or `.mise.toml`, initial worktree setup must handle mise trust before running project commands from the worktree.

Candidate behavior:

```bash
mise trust "$PI_WORKTREE_ROOT/mise.toml"
# or
mise trust "$PI_WORKTREE_ROOT/.mise.toml"
```

Rules:

- detect both `mise.toml` and `.mise.toml`
- check whether the main checkout config is already trusted
- if main checkout config is already trusted, automatically trust the active worktree copy
- if main checkout config is not trusted, ask the user before trusting the worktree copy
- run trust against the active worktree copy, not main checkout copy
- perform during `worktree_start` before tests/build/install commands
- surface trust action in `worktree_status`
- do not assume mise exists; skip with note if command unavailable

## Implementation phases

1. Package skeleton and manifest
2. `worktree_start` + `worktree_status`
3. Path resolver with unit tests
4. File tool `tool_call` routing
5. Bash cwd routing prototype
6. Safety blocks for escape/main/sibling paths
7. `worktree_diff`, `worktree_commit`, `worktree_stop`
8. Reload/session persistence
9. Bash override via `createBashTool` spawn hook
10. Natural-language auto-start
11. Mise detection/trust during initial worktree setup
12. `worktree_rescue_leftovers` cleanup workflow
13. Acceptance/regression tests for core safety paths and risky decisions
14. Documentation and demo transcript

## Grilled findings

### Finding 1: natural language trigger is under-specified

Original plan says natural language should trigger behavior. Pi skills are progressive disclosure; the model may or may not load the skill. If this must be reliable, extension-level phrase detection is required.

Recommended answer: extension detects activation intent and auto-starts.

### Finding 2: bash routing is the hard part

File path routing is tractable. Shell command routing is not if we attempt string rewriting. The safer design is cwd/env routing plus blocking unsafe explicit main paths.

Recommended answer: use `createBashTool` override/spawn hook for real cwd control.

### Finding 3: state scope must be explicit

A global state file can surprise users if one Pi session activates a worktree and another session inherits it.

Recommended answer: active state is session-scoped; disk registry is informational/recovery only.

### Finding 4: worktree root under `.worktree` can collide with tooling

Some tools may scan `.worktree` recursively from the main repo. `.worktree/` should be ignored before or during worktree creation.

Decision for v0.1: use local `.git/info/exclude` only when `.worktree/` is not already ignored. Do not modify tracked `.gitignore` during isolation setup. Inspect ignore state first to see whether `.worktree/` is already ignored.

### Finding 5: file tags are not a separate safety boundary

`@path` normalization helps, but the real boundary is tool execution. Autocomplete may show main paths; execution must remap or block.

Recommended answer: normalize leading `@`, route at tool execution.

Future fix: extension must hook Pi resource/autocomplete events if API supports path source override. Current implementation routes execution, not `@` picker indexing.

## Resolved decisions

1. Activation is extension-automatic from natural-language input phrases.
2. User phrases like `use worktree for this feature`, `use worktree for this bug`, or `use worktree for this fix` mean: create/activate a worktree and continue the conversation/session plan there before implementation continues. They do not mean copying uncommitted main-checkout files into the worktree.
3. Active worktree state survives `/reload` and `/resume` for the same Pi session.
4. On `/reload` or `/resume`, a worktree-related session must restore the active worktree routing and clearly show the full worktree path from repo root, e.g. `/repo/.worktree/feat/chat`. If saved session state points to a missing worktree directory, ask before recovery. Suggest recreating a worktree, normally with the same branch name; use a different branch name when the saved branch exists remotely and has not been merged to main.
5. Active worktree state must not silently activate for unrelated new sessions.
6. "Working directory in worktree" means virtual/tool cwd plus UI/status display; Pi process cwd remains the main repo or original repo subdirectory.
7. While active, explicit main-checkout paths remap to equivalent paths inside the active worktree. The extension does not allow ordinary read-only escape to main by default.
8. Worktree flow must support updating the active worktree on top of latest main without touching the main checkout working tree.
9. `worktree_sync` default target is auto-detected: `origin/HEAD` first, then `origin/main`, then local `main`.
10. Include `worktree_commit` in v0.1, but require explicit user confirmation before creating a commit.
11. Before creating a worktree, check whether `.worktree/` is already ignored. If not, add it to local `.git/info/exclude` for v0.1; do not edit tracked `.gitignore` during isolation setup.
12. Branch names use existing project conventions such as `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, not a new `wt/` convention.
13. Branch prefix is inferred from user language: feature → `feat`, bug/fix → `fix`, docs → `docs`, refactor → `refactor`, test → `test`; unclear intent prompts the user for branch name/type.
14. Package should be GitHub-installable first, not npm-published yet.
15. If the repo uses mise and a `mise.toml`/`.mise.toml` is detected, initial worktree setup should trust it for the active worktree session before running project commands.
16. Mise trust is automatic only when the main checkout's mise config is already trusted; otherwise ask before trusting the worktree copy.
17. Natural-language activation asks required setup questions before creating the worktree. It must not silently choose defaults for branch type or untrusted mise config. Ignore handling is automatic local `.git/info/exclude` only in v0.1.
18. During worktree activation, ask whether the user wants to use latest main first, defaulting to yes, to reduce later conflict risk. For a new branch, this means create the branch from latest main. For an existing branch, this means rebase/update that branch onto latest main. If fetching/updating latest main fails, ask whether to continue from current refs or stop; default to stop. If rebase/update hits conflicts, keep routing active inside the conflicted worktree, stop normal work, and allow only `worktree_status`, `worktree_diff`, and `worktree_stop`. Tell the user: "Resolve conflicts manually in your editor/terminal. Then run `worktree_status` in Pi to unlock normal worktree tools." Conflict resolution is out of scope for this package.
19. While activation is pending, all file and bash tools are blocked. This prevents the agent from reading the main checkout and building context from the wrong tree.
20. Pending setup asks one combined prompt when multiple decisions are needed, rather than interrupting the user repeatedly.
21. If the user cancels pending setup, stop the turn instead of continuing in the main checkout.
22. If activation is requested while a worktree is already active in the same Pi session, reuse it when the continuation is obvious. Ask whether to reuse or create a new worktree when unsure.
23. If the user tries to continue a session worktree whose branch has already been merged to main, suggest the cleanup phase instead of continuing implementation. Cleanup means show worktree status, warn about any leftover local changes, offer a guided leftover-rescue flow into another worktree when needed, remove the original worktree directory after confirmation, then ask whether to delete the local branch with default keep. Leftover rescue creates a new worktree/branch from latest main only, applies tracked leftover changes there via patch after confirmation, and never modifies main. Untracked non-ignored files are listed and copied only after explicit confirmation and path validation. Ignored files are excluded in v0.1. If patch apply fails, stop and report. Never delete remote branches in v0.1.
24. Future `@` picker support should hook Pi resource/autocomplete events if the API supports path source override. Current implementation routes execution only; it does not make worktree-only files appear in `@` picker indexing.

## Open questions to resolve before code

None currently. New questions should come from implementation discoveries.

## Recommended v0.1 decision set

- one GitHub-installable Pi package named `pi-worktree` inside `my-pi`
- extension detects natural-language activation phrases and starts only after required setup questions are answered
- pending activation blocks all file and bash tools until setup completes or is cancelled
- pending setup questions are combined into one prompt when possible
- cancelling pending setup stops the turn; it does not continue work in the main checkout
- if a worktree is already active in the same Pi session, reuse it when continuation is obvious; ask when unsure
- if the active/session worktree branch has already been merged to main, suggest cleanup instead of continuing implementation
- cleanup phase shows status, warns about leftover local changes, offers `worktree_rescue_leftovers` when needed, confirms original worktree removal, asks whether to delete local branch with default keep, and never deletes remote branches in v0.1
- leftover rescue creates a new worktree/branch from latest main only, applies tracked leftover changes there via patch after confirmation, and never modifies main; untracked non-ignored files are listed and copied only after explicit confirmation and path validation; ignored files are excluded in v0.1; if patch apply fails, stop and report
- activation phrases include `use worktree for this feature/bug/fix`
- if a plan exists in the conversation/session, continue implementation in the newly active worktree; never copy uncommitted main-checkout code changes or new files into the worktree
- active state is session-scoped and survives `/reload` plus `/resume` for that session
- if restored state references a missing worktree directory, ask before recovery; suggest same branch unless an unmerged remote branch requires a different name
- if requested branch already exists locally, ask; recommend the existing local worktree when available
- if requested branch exists remotely but not locally, ask before tracking it or choosing a different branch
- dirty main checkout warns but does not block; uncommitted main-checkout code changes and new files are never copied/applied/stashed into the worktree
- active/restored sessions clearly display the full active worktree path from repo root plus branch name, e.g. `/repo/.worktree/feat/chat` on `feat/chat`
- Pi process cwd remains main repo/subdirectory; tool/file/bash cwd is virtually routed to the equivalent repo-relative path inside the worktree; missing routed cwd blocks/asks rather than falling back
- disk registry is recovery/status only and must not silently activate unrelated new sessions
- file tools route via `tool_call` mutation first
- bash uses overridden built-in with spawn hook before release
- no arbitrary shell path rewriting
- bash safety is cwd/env routing plus obvious-danger blocking, not a total filesystem sandbox
- symlinks that resolve outside the active worktree are blocked
- submodules are basic-only in v0.1: warn when `.gitmodules` exists, but do not initialize/update submodules; package handles main repo only
- nested git repositories inside the worktree are blocked by default: any nested `.git` file or directory is blocked, except the active worktree root's normal Git-created `.git` file
- package tools may run controlled git operations that normal bash blocks; user-provided paths and refs are still validated
- user-provided refs such as `baseRef` and sync `target` must pass `git rev-parse --verify`; shell-like strings are rejected
- include `worktree_commit` in v0.1 with mandatory user confirmation after showing status plus diff stat
- `worktree_stop({ remove: true })` warns and asks for confirmation before removing the worktree directory; branch deletion is prompted separately, defaults to keep branch, and never happens silently
- include `worktree_rescue_leftovers` in v0.1, implemented after core routing/stop/sync
- include `worktree_sync` design for rebasing active worktree onto auto-detected latest main/upstream without touching main checkout
- worktree sync blocks and asks next action when active worktree has uncommitted changes; never auto-stash
- rebase/update conflicts keep routing active inside the conflicted worktree and stop normal work; only `worktree_status`, `worktree_diff`, and `worktree_stop` are allowed; user resolves conflicts manually in editor/terminal, then runs `worktree_status` to unlock
- after manual conflict resolution, `worktree_status` detects clear rebase/merge state and unlocks normal tools
- when user asks to use worktree, ask whether to use latest main first to avoid conflicts; default yes; new branches start from latest main, existing branches rebase/update onto latest main; if fetch/update fails, ask whether to continue from current refs or stop, default stop
- before worktree creation, check whether `.worktree/` is already ignored
- if not already ignored, add `.worktree/` to local `.git/info/exclude`; v0.1 does not edit tracked `.gitignore` during isolation setup
- branch format follows existing project convention, e.g. `feat/<slug>` or `fix/<slug>`
- branch names must pass `git check-ref-format --branch <name>`; shell-like or invalid names are rejected
- worktree path collisions do not auto-suffix; suggest a different branch/name
- infer branch prefix from request; ask when unclear
- if mise config exists, trust the active worktree copy during initial setup before project commands
