import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type WorktreeMode = "inactive" | "pending" | "active" | "conflict";

export interface WorktreeState {
  mode: WorktreeMode;
  repoRoot: string;
  worktreeRoot?: string;
  branch?: string;
  baseRef?: string;
  originalCwd?: string;
  pendingQuestion?: string;
  conflict?: string;
  createdAt?: string;
}

export function inactive(repoRoot: string): WorktreeState {
  return { mode: "inactive", repoRoot };
}

export function stateToolDetails(state: WorktreeState) {
  return { piWorktree: state };
}

function statePath(repoRoot: string): string {
  return join(repoRoot, ".git", "pi-worktree-state.json");
}

export async function loadDiskState(repoRoot: string): Promise<WorktreeState | undefined> {
  try {
    const parsed = JSON.parse(await readFile(statePath(repoRoot), "utf8"));
    if (parsed?.repoRoot === repoRoot && typeof parsed?.mode === "string") return parsed;
  } catch {}
  return undefined;
}

export async function saveDiskState(state: WorktreeState): Promise<void> {
  await mkdir(join(state.repoRoot, ".git"), { recursive: true });
  await writeFile(statePath(state.repoRoot), JSON.stringify(state, null, 2), "utf8");
}

export function restoreFromToolDetails(entries: any[], repoRoot: string): WorktreeState | undefined {
  for (const entry of [...entries].reverse()) {
    const details = entry?.message?.details ?? entry?.details;
    const candidate = details?.piWorktree;
    if (candidate?.repoRoot === repoRoot && typeof candidate.mode === "string") return candidate;
  }
  return undefined;
}

export function formatState(state: WorktreeState): string {
  if (state.mode === "active" || state.mode === "conflict") {
    return `pi-worktree ${state.mode}: ${state.worktreeRoot} on ${state.branch ?? "unknown"}`;
  }
  if (state.mode === "pending") return `pi-worktree pending: ${state.pendingQuestion ?? "setup required"}`;
  return "pi-worktree inactive";
}
