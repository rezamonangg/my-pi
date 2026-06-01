# my-pi

Curated Pi packages, extensions, and skills I use.

## My Pi packages

| Package | Location |
|---|---|
| `pi-worktree` | [`packages/pi-worktree`](packages/pi-worktree) |

### `pi-worktree`

Git worktree routing package for Pi.

It creates an isolated worktree for a task, then routes Pi file tools and bash execution into that worktree instead of the main checkout.

Highlights:

- natural-language activation, e.g. `use worktree for this feature`
- `worktree_start`, `worktree_status`, `worktree_diff`, `worktree_sync`, `worktree_commit`, `worktree_stop`
- path routing from main checkout paths into active worktree
- escape/sibling-worktree/symlink safety checks
- bash cwd routing with `PI_WORKTREE_ROOT`, `PI_WORKTREE_BRANCH`, and `PI_WORKTREE_REPO_ROOT`
- colored footer status showing active worktree path and branch
- `worktree-router` skill for model behavior guidance

Install:

```bash
pi install /Users/mrscraper56/Projects/Code/Personal/monang/my-pi/packages/pi-worktree
```

Docs:

- [`packages/pi-worktree/README.md`](packages/pi-worktree/README.md)
- [`packages/pi-worktree/docs/IMPLEMENTATION_PLAN.md`](packages/pi-worktree/docs/IMPLEMENTATION_PLAN.md)
- [`packages/pi-worktree/docs/DECISIONS.md`](packages/pi-worktree/docs/DECISIONS.md)

## Extensions in `~/.pi/agent`

Installed npm packages from `~/.pi/agent/npm/package.json`:

| Extension | Version |
|---|---|
| `context-mode` | `^1.0.157` |
| `pi-markdown-preview` | `^0.10.0` |
| `pi-powerline-footer` | `^0.5.6` |

Skills in `~/.pi/agent/skills`:

| Skill | Location |
|---|---|
| `commit` | `~/.pi/agent/skills/commit` |
| `github` | `~/.pi/agent/skills/github` |
| `grill-me` | `~/.pi/agent/skills/grill-me` |
| `grill-with-docs` | `~/.pi/agent/skills/grill-with-docs` |
| `handoff` | `~/.pi/agent/skills/handoff` |
| `librarian` | `~/.pi/agent/skills/librarian` |
| `mermaid` | `~/.pi/agent/skills/mermaid` |
| `tdd` | `~/.pi/agent/skills/tdd` |
| `tmux` | `~/.pi/agent/skills/tmux` |

## Development

```bash
cd packages/pi-worktree
npm install
npm test
npm run typecheck
```
