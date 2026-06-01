import { basename, relative } from "node:path";
import type { WorktreeState } from "./state.js";

const RESET = "\x1b[0m";
const DIM = "\x1b[38;5;244m";
const CYAN = "\x1b[38;2;0;175;175m";
const GREEN = "\x1b[38;2;95;175;95m";
const YELLOW = "\x1b[38;2;254;188;56m";
const RED = "\x1b[38;2;215;95;95m";

function paint(color: string, text: string): string {
  return `${color}${text}${RESET}`;
}

function compactPath(state: WorktreeState): string {
  if (!state.worktreeRoot) return "";
  const rel = relative(state.repoRoot, state.worktreeRoot);
  return rel && !rel.startsWith("..") ? rel : state.worktreeRoot;
}

export function worktreeFooterText(state: WorktreeState): string | undefined {
  if (state.mode === "inactive") return undefined;
  if (state.mode === "pending") return `${paint(YELLOW, "⧉")} ${paint(YELLOW, "pending")}`;

  const branch = state.branch ?? "unknown";
  const path = compactPath(state);
  const repo = basename(state.repoRoot);
  const location = path || repo;
  const worktreePart = `${paint(CYAN, "⧉")} ${paint(CYAN, location)}`;
  const branchPart = `${paint(GREEN, "⎇")} ${paint(GREEN, branch)}`;
  const separator = paint(DIM, " | ");

  if (state.mode === "conflict") return `${paint(RED, "⚠")} ${worktreePart}${separator}${branchPart}`;
  return `${worktreePart}${separator}${branchPart}`;
}

export function setWorktreeFooter(ctx: any, state: WorktreeState): void {
  const text = worktreeFooterText(state);
  ctx.ui?.setStatus?.("pi-worktree", text);
}
