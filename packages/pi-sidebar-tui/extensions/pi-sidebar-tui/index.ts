import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const STATUS_KEY = "sidebar";
const PANE_TITLE = "pi-sidebar-tui";
const STATE_FILE = join(tmpdir(), `pi-sidebar-${process.pid}.json`);
const SIDEBAR_SCRIPT = fileURLToPath(new URL("../../scripts/sidebar.mjs", import.meta.url));

type UsageTotals = {
	input: number;
	output: number;
	cost: number;
	cacheRead: number;
};

export default function (pi: ExtensionAPI) {
	let turnCount = 0;
	let sidebarPaneId: string | undefined;

	const closeSidebar = () => {
		if (!sidebarPaneId) return false;
		try {
			execFileSync("tmux", ["kill-pane", "-t", sidebarPaneId], { stdio: "ignore" });
		} catch {
			// Pane may already be gone.
		}
		sidebarPaneId = undefined;
		return true;
	};

	pi.on("session_start", async (_event, ctx) => {
		writeState(ctx, turnCount);
		ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", "sidebar off"));
	});

	pi.on("session_shutdown", async () => {
		closeSidebar();
	});

	pi.on("turn_start", async (_event, ctx) => {
		turnCount++;
		writeState(ctx, turnCount);
	});

	pi.on("turn_end", async (_event, ctx) => {
		writeState(ctx, turnCount);
	});

	pi.on("model_select", async (_event, ctx) => {
		writeState(ctx, turnCount);
	});

	pi.registerCommand("sidebar", {
		description: "Toggle right tmux sidebar showing git file changes",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			writeState(ctx, turnCount);

			if (sidebarPaneId && paneExists(sidebarPaneId)) {
				closeSidebar();
				ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", "sidebar off"));
				ctx.ui.notify("Sidebar closed", "info");
				return;
			}
			sidebarPaneId = undefined;

			// If a previous Pi process left a sidebar pane alive, remove it before opening
			// a new one. This prevents stale sidebars from another repository/session.
			killSidebarPanes();

			if (!process.env.TMUX) {
				ctx.ui.notify("Sidebar needs tmux. Start pi inside tmux, then run /sidebar.", "warning");
				return;
			}

			try {
				const command = `node ${shellQuote(SIDEBAR_SCRIPT)} ${shellQuote(STATE_FILE)}`;
				sidebarPaneId = execFileSync("tmux", ["split-window", "-h", "-p", "30", "-P", "-F", "#{pane_id}", command], {
					encoding: "utf8",
					stdio: ["ignore", "pipe", "ignore"],
				}).trim();
				try {
					execFileSync("tmux", ["select-pane", "-t", sidebarPaneId, "-T", PANE_TITLE], { stdio: "ignore" });
					execFileSync("tmux", ["set-option", "-p", "-t", sidebarPaneId, "history-limit", "0"], { stdio: "ignore" });
				} catch {
					// Best effort: alternate screen already avoids normal scrollback.
				}
				ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("success", "sidebar on"));
				ctx.ui.notify("Sidebar opened", "info");
			} catch (error) {
				ctx.ui.notify(`Sidebar failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});
}

function writeState(ctx: ExtensionContext, turns: number): void {
	const usage = ctx.getContextUsage();
	const totals = collectUsage(ctx);
	const entries = ctx.sessionManager.getBranch();
	const target = selectStatusTarget(ctx.cwd);
	const state = {
		cwd: target.label,
		branch: target.branch,
		changes: target.changes,
		model: ctx.model?.id ?? "none",
		messages: entries.filter((entry) => entry.type === "message").length,
		turns,
		context: usage ? `${formatNumber(usage.tokens)} / ${formatPercent(usage.percent)}` : "n/a",
		input: formatNumber(totals.input),
		output: formatNumber(totals.output),
		cache: formatNumber(totals.cacheRead),
		cost: totals.cost > 0 ? `$${totals.cost.toFixed(4)}` : "$0",
		updatedAt: Date.now(),
	};
	try {
		writeFileSync(STATE_FILE, JSON.stringify(state), "utf8");
	} catch {
		// Best-effort sidecar state for tmux sidebar.
	}
}

function paneExists(paneId: string): boolean {
	try {
		const panes = execFileSync("tmux", ["list-panes", "-a", "-F", "#{pane_id}"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
		return panes.split("\n").includes(paneId);
	} catch {
		return false;
	}
}

function killSidebarPanes(): void {
	for (const paneId of sidebarPaneIds()) {
		try {
			execFileSync("tmux", ["kill-pane", "-t", paneId], { stdio: "ignore" });
		} catch {
			// Pane may disappear while iterating.
		}
	}
}

function sidebarPaneIds(): string[] {
	try {
		const output = execFileSync("tmux", ["list-panes", "-a", "-F", "#{pane_id}\t#{pane_title}\t#{pane_current_command}\t#{pane_start_command}"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		return output
			.split("\n")
			.map((line) => line.split("\t"))
			.filter(([paneId, title, command, startCommand]) =>
				Boolean(paneId) && (title === PANE_TITLE || command === "sidebar.mjs" || (startCommand?.includes("/scripts/sidebar.mjs") ?? false)),
			)
			.map(([paneId]) => paneId!);
	} catch {
		return [];
	}
}

type StatusTarget = {
	path: string;
	label: string;
	branch: string;
	changes: Array<{ status: string; path: string }>;
};

function selectStatusTarget(cwd: string): StatusTarget {
	const root = gitRoot(cwd) ?? cwd;
	return {
		path: root,
		label: basename(root),
		branch: currentBranch(root),
		changes: currentChanges(root),
	};
}

function gitRoot(cwd: string): string | undefined {
	try {
		return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return undefined;
	}
}

function currentBranch(cwd: string): string {
	try {
		return execFileSync("git", ["branch", "--show-current"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || "detached";
	} catch {
		return "no-git";
	}
}

function currentChanges(cwd: string): Array<{ status: string; path: string }> {
	try {
		const output = execFileSync("git", ["status", "--short", "--untracked-files=all"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
		return output
			.split("\n")
			.map((line) => line.trimEnd())
			.filter(Boolean)
			.map((line) => ({ status: line.slice(0, 2), path: line.slice(3) || line.slice(2).trim() }));
	} catch {
		return [];
	}
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function collectUsage(ctx: ExtensionContext): UsageTotals {
	const totals: UsageTotals = { input: 0, output: 0, cost: 0, cacheRead: 0 };
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "message") continue;
		const message = entry.message as {
			role?: string;
			usage?: {
				input?: number;
				output?: number;
				cacheRead?: number;
				cost?: { total?: number };
			};
		};
		if (message.role !== "assistant" || !message.usage) continue;
		totals.input += message.usage.input ?? 0;
		totals.output += message.usage.output ?? 0;
		totals.cacheRead += message.usage.cacheRead ?? 0;
		totals.cost += message.usage.cost?.total ?? 0;
	}
	return totals;
}

function formatNumber(value: number | null | undefined): string {
	if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
	if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
	if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
	return String(Math.round(value));
}

function formatPercent(value: number | null | undefined): string {
	if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
	return `${Math.round(value)}%`;
}

function basename(value: string): string {
	const cleaned = value.replace(/[/\\]+$/, "");
	const parts = cleaned.split(/[/\\]/);
	return parts[parts.length - 1] || cleaned || ".";
}
