import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export async function git(cwd: string, args: string[], options: { reject?: boolean } = {}): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: stdout.toString(), stderr: stderr.toString(), code: 0 };
  } catch (error: any) {
    if (options.reject === false) {
      return { stdout: error.stdout?.toString?.() ?? "", stderr: error.stderr?.toString?.() ?? error.message, code: error.code ?? 1 };
    }
    throw error;
  }
}

export async function findRepoRoot(cwd: string): Promise<string> {
  const { stdout } = await git(cwd, ["rev-parse", "--show-toplevel"]);
  return stdout.trim();
}

export async function currentBranch(cwd: string): Promise<string> {
  const { stdout } = await git(cwd, ["branch", "--show-current"]);
  return stdout.trim();
}

export async function refExists(cwd: string, ref: string): Promise<boolean> {
  const result = await git(cwd, ["show-ref", "--verify", "--quiet", ref], { reject: false });
  return result.code === 0;
}

export async function isValidBranchName(cwd: string, branch: string): Promise<boolean> {
  if (!branch || branch.startsWith("-") || branch.includes("..")) return false;
  const result = await git(cwd, ["check-ref-format", "--branch", branch], { reject: false });
  return result.code === 0;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "task";
}

export async function ensureWorktreeExcluded(repoRoot: string): Promise<boolean> {
  const excludePath = join(repoRoot, ".git", "info", "exclude");
  let content = "";
  try {
    content = await readFile(excludePath, "utf8");
  } catch {
    await mkdir(dirname(excludePath), { recursive: true });
  }
  if (/^\.worktree\/?$/m.test(content)) return false;
  const next = `${content}${content.endsWith("\n") || content.length === 0 ? "" : "\n"}.worktree/\n`;
  await writeFile(excludePath, next, "utf8");
  return true;
}

export async function detectBaseRef(repoRoot: string): Promise<string> {
  const originHead = await git(repoRoot, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], { reject: false });
  if (originHead.stdout.trim()) return originHead.stdout.trim();
  if (await refExists(repoRoot, "refs/remotes/origin/main")) return "origin/main";
  if (await refExists(repoRoot, "refs/heads/main")) return "main";
  const branch = await currentBranch(repoRoot);
  return branch || "HEAD";
}

export async function createWorktree(repoRoot: string, worktreeRoot: string, branch: string, baseRef?: string): Promise<string> {
  await mkdir(dirname(worktreeRoot), { recursive: true });
  const args = ["worktree", "add", "-b", branch, worktreeRoot, baseRef ?? (await detectBaseRef(repoRoot))];
  const { stdout, stderr } = await git(repoRoot, args);
  return `${stdout}${stderr}`.trim();
}

export async function removeWorktree(repoRoot: string, worktreeRoot: string, force = false): Promise<string> {
  const args = ["worktree", "remove"];
  if (force) args.push("--force");
  args.push(worktreeRoot);
  const { stdout, stderr } = await git(repoRoot, args);
  return `${stdout}${stderr}`.trim();
}

export function truncate(text: string, max = 50000): string {
  if (Buffer.byteLength(text, "utf8") <= max) return text;
  return `${text.slice(0, max)}\n\n[pi-worktree: output truncated to ${max} bytes]`;
}
