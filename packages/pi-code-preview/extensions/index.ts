import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { highlightCode } from "@earendil-works/pi-coding-agent";

const WIDGET_KEY = "pi-code-preview";
const DEFAULT_WIDTH = 88;
const MIN_WIDTH = 40;
const MAX_WIDTH = 120;
const MAX_LINES = 80;

type Theme = ExtensionContext["ui"]["theme"];

type AssistantLikeMessage = {
	role?: string;
	content?: Array<{ type?: string; text?: string }>;
};

export default function piCodePreview(pi: ExtensionAPI): void {
	let lastPreview = "";

	pi.on("agent_end", (event, ctx) => {
		if (!ctx.hasUI) return;

		const text = getLastAssistantText(event);
		if (text.trim().length < 10) return;

		lastPreview = text;
		ctx.ui.setWidget(
			WIDGET_KEY,
			(_tui, theme) => ({
				render(width = DEFAULT_WIDTH) {
					return renderMarkdownPreview(lastPreview, clampWidth(width), theme);
				},
				invalidate() {},
			}),
			{ placement: "aboveEditor" },
		);
	});

	pi.on("turn_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setWidget(WIDGET_KEY, undefined);
	});
}

function getLastAssistantText(event: { messages?: unknown[] }): string {
	const messages = Array.isArray(event.messages) ? event.messages : [];
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i] as AssistantLikeMessage;
		if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
		return message.content
			.filter((part) => part?.type === "text" && typeof part.text === "string")
			.map((part) => part.text)
			.join("\n");
	}
	return "";
}

function renderMarkdownPreview(markdown: string, width: number, theme: Theme): string[] {
	const output: string[] = [];
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	let inCodeBlock = false;
	let codeLang: string | undefined;
	let codeLines: string[] = [];
	let blank = false;

	const pushBlank = () => {
		if (!blank && output.length > 1) {
			output.push("");
			blank = true;
		}
	};

	const pushLines = (rendered: string[]) => {
		for (const line of rendered) output.push(line);
		blank = rendered.length === 0;
	};

	const flushCodeBlock = () => {
		pushLines(renderCodeBlock(codeLines, codeLang, width, theme));
		codeLines = [];
		codeLang = undefined;
	};

	for (const line of lines) {
		const fence = line.match(/^\s*```+\s*([^`]*)\s*$/);
		if (fence) {
			if (inCodeBlock) {
				flushCodeBlock();
				inCodeBlock = false;
			} else {
				inCodeBlock = true;
				codeLang = normalizeLanguage(fence[1]);
				codeLines = [];
			}
			blank = false;
			continue;
		}

		if (inCodeBlock) {
			codeLines.push(line);
			continue;
		}

		const rendered = renderMarkdownLine(line, width, theme);
		if (rendered.length === 0) pushBlank();
		else pushLines(rendered);
	}

	if (inCodeBlock) flushCodeBlock();

	return truncateLines(output, theme);
}

function renderMarkdownLine(line: string, width: number, theme: Theme): string[] {
	if (line.trim().length === 0) return [];

	const heading = line.match(/^(#{1,6})\s+(.+)$/);
	if (heading) {
		const level = heading[1].length;
		const marker = level <= 2 ? "█ " : "▸ ";
		return wrapPlain(heading[2], width - marker.length).map((part) => theme.fg("mdHeading", theme.bold(marker + styleInline(part, theme))));
	}

	if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
		return [theme.fg("mdHr", "─".repeat(Math.min(width, MAX_WIDTH)))];
	}

	const quote = line.match(/^\s*>\s?(.*)$/);
	if (quote) {
		return prefixedWrappedLines(quote[1], "▌ ", width, theme, (part) => theme.fg("mdQuote", styleInline(part, theme)));
	}

	const unordered = line.match(/^(\s*)[-*+]\s+(.+)$/);
	if (unordered) {
		const indent = " ".repeat(Math.min(Math.floor(unordered[1].length / 2) * 2, 6));
		return prefixedWrappedLines(unordered[2], `${indent}${theme.fg("mdListBullet", "•")} `, width, theme, (part) => styleInline(part, theme));
	}

	const ordered = line.match(/^(\s*)(\d+[.)])\s+(.+)$/);
	if (ordered) {
		const indent = " ".repeat(Math.min(Math.floor(ordered[1].length / 2) * 2, 6));
		return prefixedWrappedLines(ordered[3], `${indent}${theme.fg("mdListBullet", ordered[2])} `, width, theme, (part) => styleInline(part, theme));
	}

	return wrapPlain(line.trimEnd(), width).map((part) => styleInline(part, theme));
}

function renderCodeBlock(lines: string[], lang: string | undefined, width: number, theme: Theme): string[] {
	const label = lang ? lang.trim() : undefined;
	const innerWidth = Math.max(1, width - 4); // "│ " + " │"
	const highlighted = highlightCode(lines.join("\n"), lang);

	// Top border: ╭─ label ───────╮
	const output: string[] = [];
	if (label) {
		const topPrefix = `╭─ ${label} `;
		const top = topPrefix + "─".repeat(Math.max(1, width - stripAnsi(topPrefix).length - 1)) + "╮";
		output.push(theme.fg("mdCodeBlockBorder", top));
	} else {
		output.push(theme.fg("mdCodeBlockBorder", "╭" + "─".repeat(Math.max(1, width - 2)) + "╮"));
	}

	// Content: │ code padded │
	for (const line of highlighted) {
		const visibleLen = stripAnsi(line).length;
		const pad = Math.max(0, innerWidth - visibleLen);
		output.push(
			theme.fg("mdCodeBlockBorder", "│ ") +
			line +
			" ".repeat(pad) +
			theme.fg("mdCodeBlockBorder", " │"),
		);
	}

	// Bottom border: ╰──────────────╯
	output.push(theme.fg("mdCodeBlockBorder", "╰" + "─".repeat(Math.max(1, width - 2)) + "╯"));
	return output;
}

function prefixedWrappedLines(
	text: string,
	prefix: string,
	width: number,
	theme: Theme,
	style: (part: string) => string,
): string[] {
	const prefixWidth = stripAnsi(prefix).length;
	const wrapped = wrapPlain(text, Math.max(10, width - prefixWidth));
	return wrapped.map((part, index) => `${index === 0 ? prefix : " ".repeat(prefixWidth)}${style(part)}`);
}

function styleInline(text: string, theme: Theme): string {
	return text
		.replace(/`([^`]+)`/g, (_match, code: string) => theme.fg("mdCode", code))
		.replace(/\*\*([^*]+)\*\*/g, (_match, bold: string) => theme.bold(bold))
		.replace(/__([^_]+)__/g, (_match, bold: string) => theme.bold(bold))
		.replace(/\[([^\]]+)]\(([^)]+)\)/g, (_match, label: string, url: string) => `${theme.fg("mdLink", label)} ${theme.fg("mdLinkUrl", url)}`);
}

function wrapPlain(text: string, width: number): string[] {
	const max = Math.max(10, width);
	const words = text.trimEnd().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [""];

	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		if (current.length === 0) {
			current = word;
		} else if (current.length + 1 + word.length <= max) {
			current += ` ${word}`;
		} else {
			lines.push(current);
			current = word;
		}
	}
	if (current.length > 0) lines.push(current);
	return lines;
}

function titleLine(label: string, width: number, corner: "╭" | "╰"): string {
	if (label.length === 0) return `${corner}${"─".repeat(Math.max(1, width - 1))}`;
	const prefix = `${corner}─ ${label} `;
	return prefix + "─".repeat(Math.max(1, width - stripAnsi(prefix).length));
}

function normalizeLanguage(value: string | undefined): string | undefined {
	const lang = value?.trim().split(/\s+/)[0]?.toLowerCase();
	if (!lang) return undefined;
	const aliases: Record<string, string> = {
		cjs: "javascript",
		js: "javascript",
		jsx: "javascript",
		mjs: "javascript",
		py: "python",
		rb: "ruby",
		rs: "rust",
		sh: "bash",
		ts: "typescript",
		tsx: "typescript",
		yml: "yaml",
	};
	return aliases[lang] ?? lang;
}

function clampWidth(width: number): number {
	if (!Number.isFinite(width)) return DEFAULT_WIDTH;
	return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(width)));
}

function truncateLines(lines: string[], theme: Theme): string[] {
	if (lines.length <= MAX_LINES) return lines;
	const omitted = lines.length - MAX_LINES + 1;
	return [...lines.slice(0, MAX_LINES - 1), theme.fg("muted", `… ${omitted} more preview lines hidden`)];
}

function stripAnsi(text: string): string {
	return text.replace(/\u001b\[[0-9;]*m/g, "");
}
