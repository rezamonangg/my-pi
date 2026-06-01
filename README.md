# my-pi

Curated Pi packages, extensions, and skills I use locally.

This repository is a personal collection. Some packages are authored here; others are public Pi extensions I keep notes for, test with, or use together with my local workflow.

## Local packages created here

### `packages/pi-worktree`

`pi-worktree` is a Pi package I created to make agent implementation safer.

It creates an isolated Git worktree for a task, then routes Pi file tools and bash execution into that worktree instead of the main checkout.

Highlights:

- natural-language activation, e.g. `use worktree for this feature`
- `worktree_start`, `worktree_status`, `worktree_diff`, `worktree_sync`, `worktree_commit`, `worktree_stop`
- path routing from main checkout paths into the active worktree
- escape/sibling-worktree/symlink safety checks
- bash cwd routing with `PI_WORKTREE_ROOT`, `PI_WORKTREE_BRANCH`, and `PI_WORKTREE_REPO_ROOT`
- colored footer status showing active worktree path and branch
- `worktree-router` skill for model behavior guidance

Install locally:

```bash
pi install /Users/mrscraper56/Projects/Code/Personal/monang/my-pi/packages/pi-worktree
```

See package docs:

- [`packages/pi-worktree/README.md`](packages/pi-worktree/README.md)
- [`packages/pi-worktree/docs/IMPLEMENTATION_PLAN.md`](packages/pi-worktree/docs/IMPLEMENTATION_PLAN.md)
- [`packages/pi-worktree/docs/DECISIONS.md`](packages/pi-worktree/docs/DECISIONS.md)

## Public extensions I use with this setup

### `pi-powerline-footer`

Public Pi footer extension used for a richer status/footer UI.

`pi-worktree` publishes a colored extension status item designed to display cleanly in `pi-powerline-footer`:

```text
⧉ .worktree/refactor/selector-code-style | ⎇ refactor/selector-code-style
```

Install from npm:

```bash
pi install npm:pi-powerline-footer
```

## Development

Run checks for a package directly:

```bash
cd packages/pi-worktree
npm install
npm test
npm run typecheck
```

## Notes

- This repo is optimized for my local Pi workflow first.
- Package APIs may change while I iterate.
- GitHub-installable packages are preferred before npm publishing.
