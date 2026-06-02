#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const stateFile = process.argv[2];
const intervalMs = Math.max(250, Number(process.argv[3] ?? 1000));
const c = {
	reset: "\x1b[0m",
	dim: "\x1b[2m",
	bold: "\x1b[1m",
	cyan: "\x1b[38;2;125;211;252m",
	blue: "\x1b[38;2;138;173;244m",
	green: "\x1b[38;2;166;218;149m",
	yellow: "\x1b[38;2;238;212;159m",
	red: "\x1b[38;2;237;135;150m",
	mauve: "\x1b[38;2;198;160;246m",
	muted: "\x1b[38;2;111;119;135m",
	text: "\x1b[38;2;215;220;232m",
	border: "\x1b[38;2;52;59;77m",
};

if (!stateFile) {
	console.error("usage: sidebar.mjs <state-file> [interval-ms]");
	process.exit(1);
}

let stopped = false;
let cachedMtime = -1;
let cachedState = { cwd: "unknown", branch: "unknown", changes: [], updatedAt: Date.now() };
let lastRenderKey = "";
const wasRaw = process.stdin.isTTY ? process.stdin.isRaw : false;
const onInput = (data) => {
	const text = data.toString("utf8");
	if (text === "q" || text === "Q" || text === "\u001b" || text === "\u0003") stopped = true;
};
process.stdout.write("\x1b[?1049h\x1b[?25l");
if (process.stdin.isTTY) {
	process.stdin.setRawMode(true);
	process.stdin.resume();
	process.stdin.on("data", onInput);
}
process.on("SIGINT", () => {
	stopped = true;
});
process.on("SIGTERM", () => {
	stopped = true;
});

function readState() {
	try {
		const stat = fs.statSync(stateFile);
		if (stat.mtimeMs === cachedMtime) return cachedState;
		cachedMtime = stat.mtimeMs;
		cachedState = JSON.parse(fs.readFileSync(stateFile, "utf8"));
		return cachedState;
	} catch {
		return cachedState;
	}
}

function paint(color, text) {
	return `${color}${text}${c.reset}`;
}

function stripAnsi(s) {
	return String(s).replace(/\x1b\[[0-9;]*m/g, "");
}

function visibleWidth(s) {
	return stripAnsi(s).length;
}

function truncate(s, width) {
	const plain = stripAnsi(s);
	if (plain.length <= width) return s;
	return plain.slice(0, Math.max(0, width - 1)) + "…";
}

function padAnsi(s, width) {
	const clipped = truncate(s, width);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function row(content, inner) {
	return paint(c.border, "│") + padAnsi(content, inner) + paint(c.border, "│");
}

function meta(label, value, width) {
	return paint(c.muted, label.padEnd(8)) + " " + paint(c.text, String(value ?? "n/a"));
}

function readGitStatus(repoPath) {
	if (typeof repoPath !== "string" || repoPath.length === 0) return null;
	const targetPath = activePiWorktreeRoot(repoPath) ?? repoPath;
	try {
		const branch = execFileSync("git", ["branch", "--show-current"], { cwd: targetPath, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || "detached";
		const output = execFileSync("git", ["status", "--short", "--untracked-files=all"], {
			cwd: targetPath,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		const changes = output
			.split("\n")
			.map((line) => line.trimEnd())
			.filter(Boolean)
			.map((line) => ({ status: line.slice(0, 2), path: line.slice(3) || line.slice(2).trim() }));
		return { cwd: targetPath === repoPath ? undefined : path.relative(repoPath, targetPath) || path.basename(targetPath), branch, changes, checkedAt: Date.now() };
	} catch {
		return null;
	}
}

function activePiWorktreeRoot(repoPath) {
	try {
		const state = JSON.parse(fs.readFileSync(path.join(repoPath, ".git", "pi-worktree-state.json"), "utf8"));
		if ((state?.mode === "active" || state?.mode === "conflict") && typeof state?.worktreeRoot === "string") return state.worktreeRoot;
	} catch {
		// No pi-worktree state or inactive main checkout.
	}
	return undefined;
}

function statusColor(status) {
	if (status.includes("?")) return c.cyan;
	if (status.includes("D")) return c.red;
	if (status.includes("M")) return c.yellow;
	if (status.includes("A")) return c.green;
	if (status.includes("R")) return c.mauve;
	return c.blue;
}

function render(force = false) {
	const state = readState();
	const liveStatus = readGitStatus(state.repoPath);
	const cwd = liveStatus?.cwd ?? state.cwd;
	const branch = liveStatus?.branch ?? state.branch;
	const changes = liveStatus?.changes ?? (Array.isArray(state.changes) ? state.changes : []);
	const updatedAt = liveStatus?.checkedAt ?? state.updatedAt;
	const width = Math.max(24, process.stdout.columns || 34);
	const height = Math.max(8, process.stdout.rows || 24);
	const renderKey = `${width}x${height}:${cachedMtime}:${JSON.stringify({ state, branch, changes })}`;
	if (!force && renderKey === lastRenderKey) return;
	lastRenderKey = renderKey;
	const inner = Math.max(1, width - 2);
	const title = ` ${paint(c.cyan, paint(c.bold, "sidebar"))} `;
	const titleWidth = visibleWidth(title);
	const left = "─".repeat(Math.max(0, Math.floor((inner - titleWidth) / 2)));
	const right = "─".repeat(Math.max(0, inner - titleWidth - left.length));
	const rows = [paint(c.border, `╭${left}`) + title + paint(c.border, `${right}╮`)];

	rows.push(row(paint(c.cyan, paint(c.bold, "FILE CHANGES")), inner));
	rows.push(row(meta("cwd", cwd, inner), inner));
	rows.push(row(meta("branch", branch, inner), inner));
	rows.push(row(meta("count", changes.length, inner), inner));
	rows.push(row("", inner));

	if (changes.length === 0) {
		rows.push(row(paint(c.green, "✓ clean"), inner));
	} else {
		for (const change of changes) {
			const status = String(change.status ?? "??").padEnd(2);
			const file = String(change.path ?? "");
			rows.push(row(`${paint(statusColor(status), status)} ${paint(c.text, file)}`, inner));
		}
	}

	rows.push(row("", inner));
	rows.push(row(paint(c.muted, "?? new  M modified  D deleted"), inner));
	rows.push(row(meta("updated", new Date(updatedAt).toLocaleTimeString(), inner), inner));
	rows.push(row(paint(c.muted, "q / Esc closes pane"), inner));

	while (rows.length < height - 1) rows.push(row("", inner));
	rows.push(paint(c.border, `╰${"─".repeat(inner)}╯`));
	process.stdout.write("\x1b[H\x1b[2J" + rows.slice(0, height).join("\n"));
}

render(true);
while (!stopped) {
	render();
	await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

if (process.stdin.isTTY) {
	process.stdin.off("data", onInput);
	process.stdin.setRawMode(wasRaw);
}
process.stdout.write("\x1b[?25h\x1b[?1049l");
if (process.env.TMUX_PANE) {
	try {
		execFileSync("tmux", ["kill-pane", "-t", process.env.TMUX_PANE], { stdio: "ignore" });
	} catch {
		// If tmux cannot kill the pane, plain process exit still returns to the shell.
	}
}
