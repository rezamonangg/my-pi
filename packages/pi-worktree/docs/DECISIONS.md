# pi-worktree Decisions

Use this file for decisions that are hard to reverse, surprising without context, and involve real trade-offs.

## 0001 — Natural-language activation is extension-automatic

Status: accepted

Decision: `pi-worktree` detects natural-language activation phrases in the extension, not only through skill/model behavior.

Examples:

- `use worktree for this feature`
- `use worktree for this bug`
- `use worktree for this fix`
- `don't touch main checkout`
- `isolate this task`

Meaning: create/activate a worktree and continue the conversation/session plan in that active worktree before implementation continues. It does not mean copying uncommitted main-checkout files into the worktree.

Reason: skill loading is model-mediated and therefore not reliable enough for a safety boundary. Extension-level input detection makes activation deterministic.

Consequence: the skill remains a behavior guide; the extension owns activation and enforcement.

## 0002 — Active worktree state survives reload and resume for same session

Status: accepted

Decision: when a Pi session has activated `pi-worktree`, that active worktree state survives `/reload` and `/resume` for the same session.

On restore, the extension must:

- recover the active worktree for that session
- restore path and bash routing into that worktree
- clearly show the full worktree path from repo root plus branch name, e.g. `/repo/.worktree/feat/chat` on `feat/chat`

The extension must not silently activate a worktree for unrelated new sessions.

Reason: reload/resume should not drop the safety boundary or make future tool calls fall back to the main checkout.

Consequence: active state must be persisted in session history or session-keyed state, not only in process memory.

## 0003 — Worktree cwd is virtual/tool cwd, not process cwd

Status: accepted

Decision: when a session is worktree-routed, Pi's process cwd remains the main repo. File tools and bash tools behave as if their cwd is the active worktree. The UI/status/title must show the full active worktree path from repo root plus branch name, e.g. `/repo/.worktree/feat/chat` on `feat/chat`, on activation/reload/resume.

Reason: changing global process cwd risks breaking Pi resource discovery, package paths, and the original mental model that the session belongs to the main repo.

Consequence: routing must be enforced at tool execution boundaries. UI must avoid ambiguity by showing the effective worktree cwd.

## 0004 — Main checkout paths remap to active worktree paths

Status: accepted

Decision: while worktree routing is active, explicit paths inside the main checkout remap to equivalent paths inside the active worktree. Ordinary read-only escape to main is not allowed by default.

Example: `/repo/package.json` is treated as `/repo/.worktree/feat/chat/package.json`.

Reason: the user's mental model is "use worktree for this task". Allowing normal reads from main would create split-brain context where the agent reads one tree and writes another.

Consequence: if main-checkout inspection is needed later, add an explicit debug/special-purpose tool rather than weakening default routing.

## 0005 — Sync/rebase must update worktree without touching main checkout

Status: accepted

Decision: `pi-worktree` must support updating the active worktree on top of latest main/upstream. This must operate through git refs and the active worktree, not by checking out or mutating the main checkout working tree.

Default target detection:

1. `origin/HEAD`
2. `origin/main`
3. local `main`

Candidate flow:

```bash
git -C "$repoRoot" fetch --all --prune
git -C "$worktreeRoot" rebase <detected-target>
```

Reason: feature/bug/fix work often needs to catch up with main. The safety boundary still applies during sync.

Consequence: add a `worktree_sync` tool or equivalent command path. It must expose conflicts clearly, keep routing active inside the conflicted worktree, and block normal package-driven work until the user resolves conflicts manually.

## 0006 — Include worktree_commit with mandatory confirmation

Status: accepted

Decision: v0.1 includes a `worktree_commit` extension tool. It commits only inside the active worktree and requires explicit user confirmation before running `git commit`.

Reason: committing from the active worktree is useful enough to standardize, but commits are durable project history and should not happen from model intent alone.

Consequence: `worktree_commit` must show status plus diff stat before confirmation and must never run against the main checkout. Full diff inspection stays available through `worktree_diff`.

## 0007 — v0.1 uses local exclude for `.worktree/`

Status: accepted

Decision: before creating a worktree, `pi-worktree` checks whether `.worktree/` is already ignored. If not, v0.1 adds `.worktree/` to local `.git/info/exclude`. It does not edit tracked `.gitignore` during isolation setup.

Reason: editing `.gitignore` changes project policy and modifies the main checkout before the isolated worktree exists. Local exclude avoids that side effect.

Consequence: v0.1 has no ignore-location prompt. A future version may offer tracked `.gitignore` as an explicit project-policy action outside automatic isolation setup.

## 0008 — Branch names follow existing project conventions

Status: accepted

Decision: `pi-worktree` does not introduce a `wt/` branch namespace by default. Branches follow common existing conventions such as `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`, or project-specific equivalents.

Reason: worktree usage is an implementation detail of the local workflow. Branch names should remain normal feature/fix branch names.

Consequence: the extension must infer or ask for branch type from the user request. The worktree directory can still live under `.worktree/`, but the branch name should not encode `wt` unless the user explicitly asks.

Default inference:

- feature → `feat/<slug>`
- bug/fix → `fix/<slug>`
- docs → `docs/<slug>`
- refactor → `refactor/<slug>`
- test → `test/<slug>`
- unclear intent → ask user for branch name/type

## 0009 — GitHub-installable before npm publishing

Status: accepted

Decision: `pi-worktree` should be GitHub-installable first, not npm-published from day one.

Reason: the workflow and Pi extension APIs need hardening through real local use before npm package ceremony and compatibility promises.

Consequence: package structure must still be valid Pi package structure, but release path is `pi install git:github.com/<user>/my-pi@<ref>` first.

## 0010 — Trust mise config for initial worktree setup

Status: accepted

Decision: if `mise.toml` or `.mise.toml` is detected, `pi-worktree` should trust the active worktree copy during initial worktree setup before running project commands.

Reason: each worktree has its own filesystem path, and mise may require path-specific trust before activating tool versions/tasks.

Consequence: `worktree_start` must detect mise config, check whether the main checkout config is already trusted, run trust against `$PI_WORKTREE_ROOT/mise.toml` or `$PI_WORKTREE_ROOT/.mise.toml` when allowed, and report the action/status.

Trust policy:

- main checkout config already trusted → auto-trust active worktree copy
- main checkout config not trusted → ask user before trusting active worktree copy
- mise unavailable → skip with visible note

## 0011 — Natural-language activation asks required setup questions first

Status: accepted

Decision: when `pi-worktree` detects a natural-language activation phrase, it must ask required setup questions before creating the worktree. It must not silently choose defaults for branch type or untrusted mise config. Ignore handling is not a setup question in v0.1 because `.worktree/` is written only to local `.git/info/exclude` when needed.

Reason: worktree creation chooses durable branch names and may trust executable/tooling configuration. Those choices should remain user-approved. Ignore handling is local-only in v0.1 and is not a setup question.

Consequence: activation can enter a pending state. While pending, implementation tools should be blocked or deferred until the user answers the setup questions or cancels activation.

## 0012 — Pending activation blocks all file and bash tools

Status: accepted

Decision: while natural-language worktree activation is pending, `pi-worktree` blocks all file and bash tools until setup completes or the user cancels activation.

Reason: allowing reads during pending setup can make the agent build context from the main checkout even though the requested task should run inside an isolated worktree.

Consequence: the extension must fail closed during pending activation and show a clear reason plus the setup question that needs an answer.

## 0013 — Pending setup uses one combined prompt

Status: accepted

Decision: when natural-language activation requires multiple setup answers, `pi-worktree` asks them in one combined prompt instead of one prompt at a time.

Reason: branch naming, latest-main choice, and mise trust are related setup choices. Combining them keeps activation explicit without creating repeated interruptions.

Consequence: the extension must gather known defaults and unresolved choices first, then present one concise setup prompt before creating the worktree.

## 0014 — Cancelling pending setup stops the turn

Status: accepted

Decision: if the user cancels pending worktree setup, `pi-worktree` stops the turn instead of continuing the requested task in the main checkout.

Reason: the user asked for isolated work. Continuing in the main checkout after cancelled setup would violate that intent.

Consequence: cancellation must leave routing inactive and show a clear message that no implementation work was performed.

## 0015 — Existing active worktree is reused only for clear continuation

Status: accepted

Decision: if worktree activation is requested while a worktree is already active in the same Pi session, `pi-worktree` reuses the active worktree when continuation is obvious. If unsure, it asks whether to reuse the current worktree or create a new one.

Reason: same-session continuation is usually obvious. Silently creating new worktrees fragments work; silently reusing an unrelated worktree mixes tasks.

Consequence: active-state status must include enough branch/path identity for the user/model to decide whether reuse is appropriate. Ambiguous reuse must prompt.

## 0016 — Merged session branch suggests cleanup

Status: accepted

Decision: if the user tries to continue a session worktree whose branch has already been merged to main, `pi-worktree` suggests cleanup instead of continuing implementation.

Reason: merged branches usually mean implementation is complete. Continuing work there risks reopening completed work and accumulating stale worktree copies.

Consequence: continuation checks should inspect whether the branch is already merged to latest main/upstream and present cleanup as the recommended next phase. Cleanup means show worktree status, warn about any leftover local changes, offer guided leftover rescue into another worktree when needed, remove the original worktree directory after confirmation, then ask whether to delete the local branch with default keep. Leftover rescue creates a new worktree/branch from latest main only, applies tracked leftover changes there via patch after confirmation, and never modifies main. Untracked non-ignored files are listed and copied only after explicit confirmation and path validation. Ignored files are excluded in v0.1. If patch apply fails, stop and report. v0.1 never deletes remote branches.

## 0017 — Missing restored worktree asks before recovery

Status: accepted

Decision: if `/reload` or `/resume` restores active worktree state but the worktree directory no longer exists, `pi-worktree` asks before recovery. It suggests recreating a worktree, normally with the same branch name. If the saved branch exists remotely and has not been merged to main, it should suggest a different branch name instead of risking confusion with existing remote work.

Reason: silently becoming inactive drops the safety boundary; silently recreating may attach the session to the wrong branch state.

Consequence: restore logic must inspect saved state, local worktrees, local branches, remote branches, and merge status before presenting recovery choices.

## 0018 — Existing local branch collision asks before attaching

Status: accepted

Decision: if `worktree_start` wants to use a branch name that already exists locally, `pi-worktree` asks before attaching to it or creating a different branch. When an existing local worktree is already using that branch, the recommended choice is to use that local worktree.

Reason: an existing local branch may contain prior work the user intends to continue, or unrelated work that should not be mixed with the new task.

Consequence: branch creation must inspect local branches and worktree mappings before running `git worktree add -b`.

## 0019 — Existing remote branch collision asks before tracking

Status: accepted

Decision: if `worktree_start` wants to use a branch name that exists remotely but not locally, `pi-worktree` asks before tracking that remote branch or choosing a different branch name.

Reason: a remote branch may be the intended continuation point, or it may be someone else's/unrelated work. Guessing can mix histories.

Consequence: branch creation must inspect remote refs before creating a local branch.

## 0020 — Dirty main checkout warns but never seeds worktree changes

Status: accepted

Decision: if the main checkout has uncommitted changes when starting a worktree, `pi-worktree` warns but does not block solely for that reason. It must never copy, apply, stash, or otherwise move uncommitted main-checkout code changes or new files into the worktree.

Reason: the worktree must represent work from a selected git ref, not a hidden mixture of committed history plus accidental main-checkout edits.

Consequence: continuation means continuing the conversation/session plan inside the worktree, not transferring filesystem changes from the main checkout.

## 0021 — Worktree removal and branch deletion require explicit confirmation

Status: accepted

Decision: `worktree_stop({ remove: true })` must warn and ask for explicit confirmation before removing the worktree directory, even when it is clean. After confirmed removal, branch deletion is a separate prompt, defaults to keeping the branch, and must never happen silently.

Reason: removing worktrees helps avoid accumulating full checkout copies, but deleting files and branches is destructive enough to require user confirmation.

Consequence: deactivation remains always allowed. Directory removal and branch deletion are explicit cleanup steps with separate confirmations. If removal is forced while dirty, the extension must show status/diff summary before confirmation; force permits dirty removal but does not skip confirmation.

## 0022 — Sync blocks on dirty worktree and asks next action

Status: accepted

Decision: if the active worktree has uncommitted changes, `worktree_sync` blocks and asks the user for the next action. It must never auto-stash.

Reason: auto-stashing can hide work and complicate conflict recovery. The user should choose whether to commit, stash manually, discard, or cancel.

Consequence: sync preflight must inspect active worktree status before fetch/rebase/merge and fail closed with clear options.

## 0023 — Worktree activation asks whether to update from latest main first

Status: accepted

Decision: when the user asks to use a worktree, `pi-worktree` asks whether they want to use latest main first before implementation starts, defaulting to yes. For a new branch, this means creating the branch from latest main. For an existing branch, this means rebasing/updating that branch onto latest main.

Reason: starting from latest main reduces avoidable conflicts later.

Consequence: activation setup prompt includes the latest-main question. If accepted, the extension uses the sanctioned sync/update path without touching the main checkout working tree. If fetching/updating latest main fails, the extension asks whether to continue from current refs or stop, defaulting to stop. If rebase/update hits conflicts, routing stays active inside the conflicted worktree and normal work is blocked. Only `worktree_status`, `worktree_diff`, and `worktree_stop` are allowed; bash, file tools, commit, sync, and start are blocked. The extension tells the user: "Resolve conflicts manually in your editor/terminal. Then run `worktree_status` in Pi to unlock normal worktree tools." Conflict resolution is out of scope for this package. After manual conflict resolution, `worktree_status` detects clear rebase/merge state and unlocks normal tools.

## 0024 — Package tools may run controlled git operations

Status: accepted

Decision: package tools may run their own controlled git operations that normal `bash` would block. For example, normal `bash` may block `git -C <repoRoot> fetch`, while `worktree_sync` may run a controlled fetch/update flow.

Reason: safety comes from narrow package code paths, not from allowing arbitrary shell text.

Consequence: package tools can bypass bash block rules only for their internal fixed operations. User-provided paths and refs still must be validated.

## 0025 — User-provided refs must resolve as git refs

Status: accepted

Decision: user-provided refs such as `baseRef` and sync `target` must resolve through `git rev-parse --verify`. Shell-like or invalid ref strings are rejected.

Examples:

- `origin/main` → allowed if it resolves
- `main` → allowed if it resolves
- `main && rm -rf .` → rejected

Reason: package tools may run controlled git commands, so ref inputs must not become command injection or ambiguous revision strings.

Consequence: all git commands must pass refs as argv values, not interpolated shell text, and must verify refs before use.

## 0026 — Branch names must pass git validation

Status: accepted

Decision: branch names must pass `git check-ref-format --branch <name>`. Shell-like or invalid branch names are rejected and the user is asked again.

Examples:

- `feat/worktree-router` → allowed
- `feat/x && rm -rf .` → rejected
- `../main` → rejected

Reason: branch names are passed to git commands and become durable project refs.

Consequence: inferred and user-provided branch names use the same validation path.

## 0027 — Symlink escapes are blocked

Status: accepted

Decision: file routing blocks paths inside the active worktree when their real path resolves outside the active worktree.

Reason: symlinks can otherwise bypass path restrictions and read/write the main checkout or unrelated filesystem paths.

Consequence: path validation must use real filesystem resolution for existing paths and nearest-existing-parent resolution for new write targets.

## 0028 — Submodules are basic-only in v0.1

Status: accepted

Decision: v0.1 handles only the main repository. If `.gitmodules` exists, `pi-worktree` warns that submodules are separate attached repositories and does not initialize or update them automatically.

Reason: submodules are separate repositories attached inside the main repo. Routing/safety for them is a different boundary than main-repo worktree routing.

Consequence: implementation may create a main-repo worktree that contains submodule entries, but submodule setup remains outside v0.1 automation.

## 0029 — Nested git repositories are blocked by default

Status: accepted

Decision: v0.1 blocks nested git repositories inside the active worktree by default. Any nested `.git` file or directory is blocked. The exception is the active worktree root's normal Git-created `.git` file, which points back to main repo metadata and is required for git worktree operation.

Reason: nested `.git` directories/files represent another repository boundary. v0.1 handles only the main repo.

Consequence: path routing and bash safety checks should treat nested git repos like submodule boundaries unless explicit support is added later.

## 0030 — Worktree routing preserves repo-relative cwd

Status: accepted

Decision: if Pi starts in a subdirectory of a repo, worktree routing preserves that repo-relative cwd inside the active worktree.

Example: Pi cwd `/repo/packages/app` maps to `/repo/.worktree/feat/chat/packages/app` for relative file paths and bash cwd.

Reason: monorepos often run package-specific commands from subdirectories. Routing to the worktree root would change command behavior.

Consequence: active state must record both `repoRoot` and the original repo-relative cwd used for tool routing. If the equivalent subdirectory does not exist in the worktree, routing blocks and asks instead of falling back to the worktree root.

## 0031 — Bash is cwd-safe, not a total filesystem sandbox

Status: accepted

Decision: v0.1 bash safety uses cwd/env routing plus obvious-danger blocking. For absolute paths outside the repo, it blocks obvious writes/dangerous commands only. It does not attempt to block every possible outside-repo read or filesystem access.

Reason: full shell parsing/sandboxing is out of scope and easy to get wrong. The core safety target is preventing accidental main-checkout writes while running normal relative commands inside the worktree.

Consequence: documentation and status text must not claim that bash is a complete filesystem sandbox.

## 0032 — Worktree path follows branch path

Status: accepted

Decision: the worktree path under `.worktree/` follows the branch path. Example: branch `feat/chat` uses `/repo/.worktree/feat/chat`. There is no separate task id. If the worktree path collides, `pi-worktree` suggests a different branch/name instead of auto-suffixing.

Reason: showing and using the full path from repo root is simpler than inventing another task identifier.

Consequence: active state stores the full `worktreeRoot`, repo-relative `worktreeRelPath`, and `branch`. Worktree creation must fail/prompt on path collision rather than inventing a suffixed path.

## 0033 — Tool names stay concise

Status: accepted

Decision: keep concise tool names: `worktree_start`, `worktree_status`, `worktree_stop`, `worktree_diff`, `worktree_commit`, `worktree_sync`, `worktree_resolve_file`, and `worktree_rescue_leftovers`. Do not add a `pi_` prefix.

Reason: current names are concise and clear enough in Pi tool context.

Consequence: implementation and docs use the current names consistently. Leftover rescue is a separate tool, not part of `worktree_stop`, because it is its own workflow.
