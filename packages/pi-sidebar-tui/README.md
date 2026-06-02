# pi-sidebar-tui

Right tmux sidebar for Pi showing git file changes.

## What it adds

One command:

```text
/sidebar
```

Run it once to open a right tmux pane. Run it again to close the pane. Opening a sidebar also removes stale `pi-sidebar-tui` panes from older Pi sessions, so the pane cannot keep showing another repository's changes.

The sidebar shows:

- current Pi cwd's git checkout, or the active `pi-worktree` checkout for that same repo
- git branch
- individual uncommitted/new files from `git status --short --untracked-files=all`
- live git polling, so external `git reset`, checkout, or editor changes refresh without another Pi turn
- alternate-screen pane with `history-limit 0` so it behaves like a fixed dock instead of scrollback

When `pi-worktree` activates a worktree from the main checkout, the sidebar follows the same repo's active `.worktree/...` state file so footer and sidebar stay aligned. It does not scan unrelated repos or sibling dirty worktrees.

No floating Pi overlay opens by default. `pi-worktree` footer stays visible.

## Install

From this checkout:

```bash
pi install /Users/mrscraper56/Projects/Code/Personal/monang/my-pi/packages/pi-sidebar-tui
```

Restart Pi or run `/reload` after install.

## Usage

Pi must run inside tmux. Without tmux, `/sidebar` shows a warning and does nothing because Pi extensions cannot create a real terminal split pane portably.

```text
/sidebar
```

Toggle behavior:

- sidebar closed → opens right split pane
- sidebar open → kills that pane

Close manually: focus sidebar pane and press `q` or `Esc`.

## Terminal support

`pi-sidebar-tui` uses tmux plus standard ANSI/VT alternate-screen escape codes. It should work in any terminal that supports tmux, including iTerm2, Ghostty, WezTerm, Kitty, Alacritty, macOS Terminal, and VS Code's integrated terminal.

A non-tmux fallback is intentionally not included: without tmux there is no portable way for a Pi package to create a real docked split pane.

## Recommended settings

Optional input padding:

```json
{
  "editorPaddingX": 3
}
```

File:

```text
~/.pi/agent/settings.json
```

`editorPaddingX` only affects Pi's input editor. Whole-screen padding should be terminal/tmux configuration.

## Development

```bash
cd packages/pi-sidebar-tui
npm install
npm run typecheck
```

## Package resources

```json
{
  "pi": {
    "extensions": ["./extensions/index.ts"],
    "themes": ["./themes"]
  }
}
```
