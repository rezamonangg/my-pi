# pi-code-preview

Pi TUI extension that shows the last assistant response as a compact markdown/code preview above the editor.

## Install

From this repository:

```bash
pi install ./packages/pi-code-preview
```

For worktree testing, install the package directory, not the repository root:

```bash
pi install ~/Projects/Code/Personal/monang/my-pi/.worktree/feat/pi-code-preview-extension/packages/pi-code-preview
```

Then reload Pi:

```text
/reload
```

## What it does

- Shows a preview widget above the editor after each assistant turn
- Hides raw markdown code fences in the preview widget
- Renders fenced code blocks with Pi's native `highlightCode()` theme colors
- Styles headings, lists, blockquotes, horizontal rules, links, inline code, and bold text
- Avoids `glow` and external ANSI rendering so tmux/widget rendering stays reliable
- Clears the preview at the start of the next turn

## Usage

No command required. Once installed and reloaded, send a prompt that returns markdown or a fenced code block. The transcript stays unchanged, and the preview widget renders a cleaner version above the editor.

Example response content:

````markdown
## Example

```ts
function greet(name: string): string {
  return `Hello, ${name}`;
}
```
````

## Known limits

- Original assistant message remains in the transcript; Pi core does not let an extension hide already-streamed markdown fences there.
- Preview is line-limited to keep the editor usable.
- Tables are shown as wrapped text, not full table layout.
