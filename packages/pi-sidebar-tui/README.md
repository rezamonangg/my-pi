# pi-sidebar-tui

Right tmux sidebar for Pi showing git file changes.

## What it adds

One command:

```text
/sidebar
```

Run it once to open a right tmux pane. Run it again to close the pane. Opening a sidebar also removes stale `pi-sidebar-tui` panes from older Pi sessions, so the pane cannot keep showing another repository's changes.

The sidebar shows:

- current Pi cwd's git checkout only
- git branch
- individual uncommitted/new files from `git status --short --untracked-files=all`
- alternate-screen pane with `history-limit 0` so it behaves like a fixed dock instead of scrollback

No floating Pi overlay opens by default. `pi-worktree` footer stays visible.

## Install

From this checkout:

```bash
pi install /Users/mrscraper56/Projects/Code/Personal/monang/my-pi/packages/pi-sidebar-tui
```

Restart Pi or run `/reload` after install.

## Usage

Pi must run inside tmux.

```text
/sidebar
```

Toggle behavior:

- sidebar closed → opens right split pane
- sidebar open → kills that pane

Close manually: focus sidebar pane and press `q` or `Esc`.

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
    "extensions": ["./extensions/pi-sidebar-tui/index.ts"],
    "themes": ["./themes"]
  }
}
```
