import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { WorktreeState } from "./state.js";

const require = createRequire(import.meta.url);
let piPackageRoot: string | null | undefined;

export interface RouteResult {
  input: string;
  routedPath: string;
  repoRelative: string;
  reason: string;
}

function stripTag(path: string): string {
  return path.startsWith("@") ? path.slice(1) : path;
}

function inside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}

function findPackageRoot(entry: string): string | null {
  let cur = dirname(entry);
  while (cur && cur !== dirname(cur)) {
    if (existsSync(join(cur, "package.json"))) return cur;
    cur = dirname(cur);
  }
  return null;
}

function getPiPackageRoot(): string | null {
  if (piPackageRoot !== undefined) return piPackageRoot;
  try {
    piPackageRoot = findPackageRoot(require.resolve("@earendil-works/pi-coding-agent"));
  } catch {
    piPackageRoot = null;
  }
  return piPackageRoot;
}

export function isPiManagedPath(target: string): boolean {
  const resolved = resolve(target);
  const home = process.env.HOME || homedir();
  const roots = [home ? resolve(home, ".pi") : null, getPiPackageRoot()].filter((root): root is string => !!root);
  return roots.some((root) => inside(root, resolved));
}

async function nearestExisting(path: string): Promise<string> {
  let cur = path;
  while (cur && cur !== dirname(cur)) {
    try {
      await lstat(cur);
      return cur;
    } catch {
      cur = dirname(cur);
    }
  }
  return cur;
}

async function realForSafety(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    const parent = await nearestExisting(dirname(path));
    const realParent = await realpath(parent);
    return join(realParent, relative(parent, path));
  }
}

export function isSiblingWorktreePath(repoRoot: string, worktreeRoot: string, target: string): boolean {
  const worktreeBase = join(repoRoot, ".worktree");
  return inside(worktreeBase, target) && !inside(worktreeRoot, target);
}

export async function routePath(state: WorktreeState, inputPath: string): Promise<RouteResult> {
  if (state.mode !== "active" && state.mode !== "conflict") throw new Error(`pi-worktree is ${state.mode}, not active`);
  if (!state.worktreeRoot) throw new Error("pi-worktree active state has no worktreeRoot");

  const repoRoot = await realpath(state.repoRoot);
  const worktreeRoot = await realpath(state.worktreeRoot);
  const raw = stripTag(inputPath);
  const originalCwd = state.originalCwd ?? repoRoot;
  const virtualCwdRel = inside(repoRoot, resolve(repoRoot, originalCwd)) ? relative(repoRoot, resolve(repoRoot, originalCwd)) : "";
  const virtualCwd = join(worktreeRoot, virtualCwdRel);

  let repoRelative: string;
  let reason: string;

  if (isAbsolute(raw)) {
    const abs = await realForSafety(resolve(raw));
    if (inside(worktreeRoot, abs)) {
      repoRelative = relative(worktreeRoot, abs);
      reason = "already inside active worktree";
    } else if (inside(repoRoot, abs)) {
      if (isSiblingWorktreePath(repoRoot, worktreeRoot, abs)) throw new Error(`Blocked sibling worktree path: ${inputPath}`);
      repoRelative = relative(repoRoot, abs);
      reason = "main checkout absolute path remapped";
    } else if (isPiManagedPath(resolve(raw)) || isPiManagedPath(abs)) {
      return { input: inputPath, routedPath: abs, repoRelative: "", reason: "pi-managed absolute path allowed" };
    } else {
      throw new Error(`Blocked path outside active worktree: ${inputPath}`);
    }
  } else {
    const absViaVirtualCwd = resolve(virtualCwd, raw);
    repoRelative = relative(worktreeRoot, absViaVirtualCwd);
    reason = "relative path routed through active worktree cwd";
  }

  if (!repoRelative || repoRelative === ".") repoRelative = "";
  if (repoRelative.startsWith("..") || isAbsolute(repoRelative)) throw new Error(`Blocked path escape: ${inputPath}`);
  if (repoRelative.split(sep).includes(".git")) throw new Error(`Blocked nested .git path: ${inputPath}`);

  const routedPath = resolve(worktreeRoot, repoRelative);
  const safetyReal = await realForSafety(routedPath);
  if (!inside(worktreeRoot, safetyReal)) throw new Error(`Blocked symlink/path escape outside active worktree: ${inputPath}`);
  if (isSiblingWorktreePath(repoRoot, worktreeRoot, safetyReal)) throw new Error(`Blocked sibling worktree path: ${inputPath}`);

  return { input: inputPath, routedPath, repoRelative, reason };
}

export function routeCommand(command: string, state: WorktreeState): string {
  if (state.mode !== "active" && state.mode !== "conflict") return command;
  if (/\bgit\s+-C\s+(["']?)\.?\1\s+(checkout|switch|reset|clean|commit|merge|rebase|worktree\s+remove)\b/.test(command)) {
    throw new Error("Blocked risky git command with ambiguous -C target while pi-worktree is active. Use worktree_* tools.");
  }
  return command;
}
