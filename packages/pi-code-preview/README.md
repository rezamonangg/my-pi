# pi-code-preview

Pi TUI extension that shows the last assistant response as a compact markdown preview above the editor.

## What it does

- Hides raw markdown code fences in the preview widget
- Renders fenced code blocks with Pi's native `highlightCode()` theme colors
- Styles headings, lists, blockquotes, horizontal rules, links, inline code, and bold text
- Avoids `glow`/external ANSI rendering so tmux and widget rendering stay reliable

## Known limits

- Original assistant message remains in the transcript; Pi core does not let an extension hide already-streamed markdown fences there.
- Preview is line-limited to keep the editor usable.
- Tables are shown as wrapped text, not full table layout.
