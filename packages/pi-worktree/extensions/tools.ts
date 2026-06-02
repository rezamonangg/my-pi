import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createWorktree, currentBranch, detectBaseRef, ensureWorktreeExcluded, findWorktreeByBranch, git, isValidBranchName, removeWorktree, slugify, truncate } from "./git.js";
import { routePath } from "./paths.js";
import { formatState, inactive, saveDiskState, stateToolDetails, type WorktreeState } from "./state.js";

export interface ToolEnv {
  getState(): WorktreeState;
  setState(next: WorktreeState, ctx?: any): Promise<void>;
}

function text(text: string, details: any = {}) {
  return { content: [{ type: "text" as const, text }], details };
}

function inferBranch(prompt?: string, branch?: string): string {
  if (branch) return branch;
  const source = prompt ?? "task";
  const lower = source.toLowerCase();
  const prefix = /\b(bug|fix|broken|error|issue)\b/.test(lower)
    ? "fix"
    : /\b(doc|docs|readme)\b/.test(lower)
      ? "docs"
      : /\b(refactor)\b/.test(lower)
        ? "refactor"
        : /\b(test|spec)\b/.test(lower)
          ? "test"
          : "feat";
  return `${prefix}/${slugify(source)}`;
}

export function registerWorktreeTools(pi: ExtensionAPI, env: ToolEnv) {
  pi.registerTool({
    name: "worktree_start",
    label: "worktree_start",
    description: "Create and activate an isolated git worktree for the current task. File and bash tools route there after activation.",
    promptSnippet: "Create/activate isolated git worktree before implementing a feature, fix, or risky change.",
    promptGuidelines: [
      "Use worktree_start when user asks to use a worktree, isolate a task, or avoid touching the main checkout.",
      "After worktree_start succeeds, normal file paths are automatically routed into the active worktree.",
    ],
    parameters: Type.Object({
      prompt: Type.Optional(Type.String({ description: "User task text used to infer branch name if branch is omitted." })),
      branch: Type.Optional(Type.String({ description: "Branch to create, e.g. feat/chat-ui or fix/login-bug." })),
      baseRef: Type.Optional(Type.String({ description: "Base ref for the new worktree. Defaults to origin/HEAD, origin/main, main, or HEAD." })),
      trustMise: Type.Optional(Type.Boolean({ description: "Trust mise config in worktree if present and safe to do so." })),
    }),
    async execute(_id, params: any, _signal, _onUpdate, ctx) {
      const current = env.getState();
      if (current.mode === "active" || current.mode === "conflict") return text(`Already active. ${formatState(current)}`, stateToolDetails(current));
      const repoRoot = current.repoRoot;
      const branch = inferBranch(params.prompt, params.branch);
      if (!(await isValidBranchName(repoRoot, branch))) return text(`Invalid branch name: ${branch}`, stateToolDetails(current));
      const baseRef = params.baseRef ?? (await detectBaseRef(repoRoot));
      const worktreeRoot = join(repoRoot, ".worktree", ...branch.split(/[\\/]+/g));

      // Check if a worktree already exists for this branch (any path).
      const existingWt = await findWorktreeByBranch(repoRoot, branch);
      if (existingWt) {
        const next: WorktreeState = { mode: "active", repoRoot, worktreeRoot: existingWt.path, branch, baseRef, originalCwd: ctx.cwd, createdAt: new Date().toISOString() };
        await env.setState(next, ctx);
        return text(`Activated existing worktree ${existingWt.path} on ${branch}.`, stateToolDetails(next));
      }

      if (existsSync(worktreeRoot)) return text(`Path ${worktreeRoot} already exists but is not a registered git worktree. Remove it manually and retry.`, stateToolDetails(current));
      const excluded = await ensureWorktreeExcluded(repoRoot);
      let output = await createWorktree(repoRoot, worktreeRoot, branch, baseRef);
      let actualWorktreeRoot = worktreeRoot;
      // createWorktree may detect a worktree already registered for this branch.
      const alreadyExistsMatch = output.match(/^Worktree already exists for branch .* at (.+)$/m);
      if (alreadyExistsMatch) {
        actualWorktreeRoot = alreadyExistsMatch[1]!;
      }
      const miseNotes: string[] = [];
      for (const name of ["mise.toml", ".mise.toml"]) {
        const cfg = join(actualWorktreeRoot, name);
        if (existsSync(cfg)) {
          if (params.trustMise) {
            const result = await git(actualWorktreeRoot, ["-c", "advice.detachedHead=false", "status", "--short"], { reject: false });
            void result;
            const trust = await import("node:child_process").then(({ execFileSync }) => {
              try { execFileSync("mise", ["trust", cfg], { cwd: actualWorktreeRoot, encoding: "utf8" }); return "trusted"; }
              catch (e: any) { return `trust skipped/failed: ${e.message}`; }
            });
            miseNotes.push(`${name}: ${trust}`);
          } else {
            miseNotes.push(`${name}: present; pass trustMise:true if user approves mise trust`);
          }
        }
      }
      const next: WorktreeState = { mode: "active", repoRoot, worktreeRoot: actualWorktreeRoot, branch, baseRef, originalCwd: ctx.cwd, createdAt: new Date().toISOString() };
      await env.setState(next, ctx);
      return text([
        `Activated ${actualWorktreeRoot} on ${branch} from ${baseRef}.`,
        excluded ? "Added .worktree/ to .git/info/exclude." : ".worktree/ already excluded locally.",
        output,
        ...miseNotes,
      ].filter(Boolean).join("\n"), stateToolDetails(next));
    },
  });

  pi.registerTool({
    name: "worktree_status",
    label: "worktree_status",
    description: "Show active pi-worktree routing state and git status.",
    parameters: Type.Object({}),
    async execute() {
      const state = env.getState();
      let body = formatState(state);
      if (state.worktreeRoot) {
        const s = await git(state.worktreeRoot, ["status", "--short", "--branch"], { reject: false });
        body += `\n${s.stdout}${s.stderr}`;
      }
      return text(body, stateToolDetails(state));
    },
  });

  pi.registerTool({
    name: "worktree_diff",
    label: "worktree_diff",
    description: "Show diff stat and diff for active worktree, safely truncated.",
    parameters: Type.Object({}),
    async execute() {
      const state = env.getState();
      if (!state.worktreeRoot) return text("No active worktree.", stateToolDetails(state));
      const stat = await git(state.worktreeRoot, ["diff", "--stat"], { reject: false });
      const diff = await git(state.worktreeRoot, ["diff"], { reject: false });
      return text(truncate(`${stat.stdout}${stat.stderr}\n${diff.stdout}${diff.stderr}`), stateToolDetails(state));
    },
  });

  pi.registerTool({
    name: "worktree_commit",
    label: "worktree_commit",
    description: "Commit changes inside active worktree only. Requires explicit UI confirmation.",
    parameters: Type.Object({ message: Type.String(), all: Type.Optional(Type.Boolean()) }),
    async execute(_id, params: any, _signal, _onUpdate, ctx) {
      const state = env.getState();
      if (!state.worktreeRoot) return text("No active worktree.", stateToolDetails(state));
      const status = await git(state.worktreeRoot, ["status", "--short"], { reject: false });
      const stat = await git(state.worktreeRoot, ["diff", "--stat"], { reject: false });
      const preview = `Commit in ${state.worktreeRoot} on ${state.branch}\n\n${status.stdout}\n${stat.stdout}\nMessage: ${params.message}`;
      const ok = ctx.ui ? await ctx.ui.confirm("pi-worktree commit", preview) : false;
      if (!ok) return text(`Commit cancelled.\n\n${preview}`, stateToolDetails(state));
      if (params.all) await git(state.worktreeRoot, ["add", "-A"]);
      const commit = await git(state.worktreeRoot, ["commit", "-m", params.message]);
      const hash = await git(state.worktreeRoot, ["rev-parse", "--short", "HEAD"]);
      return text(`${commit.stdout}${commit.stderr}\nCommitted ${hash.stdout.trim()} on ${state.branch}`, stateToolDetails(state));
    },
  });

  pi.registerTool({
    name: "worktree_sync",
    label: "worktree_sync",
    description: "Fetch and rebase active worktree onto latest main/upstream without touching main checkout.",
    parameters: Type.Object({ target: Type.Optional(Type.String()) }),
    async execute(_id, params: any, _signal, _onUpdate, ctx) {
      const state = env.getState();
      if (!state.worktreeRoot) return text("No active worktree.", stateToolDetails(state));
      const fetch = await git(state.repoRoot, ["fetch", "--all", "--prune"], { reject: false });
      const target = params.target ?? await detectBaseRef(state.repoRoot);
      const rebase = await git(state.worktreeRoot, ["rebase", target], { reject: false });
      if (/conflict|CONFLICT|could not apply/i.test(`${rebase.stdout}${rebase.stderr}`)) {
        const next = { ...state, mode: "conflict" as const, conflict: `rebase ${target}` };
        await env.setState(next, ctx);
        return text(`Sync conflicts. Routing remains active in conflicted worktree.\n${fetch.stdout}${fetch.stderr}\n${rebase.stdout}${rebase.stderr}`, stateToolDetails(next));
      }
      return text(`Synced with ${target}.\n${fetch.stdout}${fetch.stderr}\n${rebase.stdout}${rebase.stderr}`, stateToolDetails(state));
    },
  });

  pi.registerTool({
    name: "worktree_resolve_file",
    label: "worktree_resolve_file",
    description: "Resolve an input path to the active worktree path without reading or writing it.",
    parameters: Type.Object({ path: Type.String() }),
    async execute(_id, params: any) {
      const state = env.getState();
      const routed = await routePath(state, params.path);
      return text(`${params.path} -> ${routed.routedPath}\n${routed.reason}`, { ...stateToolDetails(state), routed });
    },
  });

  pi.registerTool({
    name: "worktree_stop",
    label: "worktree_stop",
    description: "Deactivate routing and optionally remove clean active worktree. Dirty worktrees require force:true.",
    parameters: Type.Object({ remove: Type.Optional(Type.Boolean()), force: Type.Optional(Type.Boolean()) }),
    async execute(_id, params: any, _signal, _onUpdate, ctx) {
      const state = env.getState();
      if (!state.worktreeRoot) {
        const branch = await currentBranch(state.repoRoot).catch(() => "unknown");
        const next = inactive(state.repoRoot, branch || "detached");
        await env.setState(next, ctx);
        return text("pi-worktree inactive.", stateToolDetails(next));
      }
      let body = "Routing deactivated.";
      if (params.remove) {
        const status = await git(state.worktreeRoot, ["status", "--porcelain"], { reject: false });
        if (status.stdout.trim() && !params.force) return text(`Refusing to remove dirty worktree. Pass force:true only after rescue/review.\n${status.stdout}`, stateToolDetails(state));
        body += `\n${await removeWorktree(state.repoRoot, state.worktreeRoot, !!params.force)}`;
      }
      const branch = await currentBranch(state.repoRoot).catch(() => "unknown");
      const next = inactive(state.repoRoot, branch || "detached");
      await env.setState(next, ctx);
      return text(body, stateToolDetails(next));
    },
  });

  pi.registerTool({
    name: "worktree_rescue_leftovers",
    label: "worktree_rescue_leftovers",
    description: "List leftover .worktree directories and optionally remove empty/forced ones.",
    parameters: Type.Object({ removeEmpty: Type.Optional(Type.Boolean()) }),
    async execute(_id, params: any) {
      const state = env.getState();
      const base = join(state.repoRoot, ".worktree");
      if (!existsSync(base)) return text("No .worktree directory.", stateToolDetails(state));
      const entries = await readdir(base, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => join(base, e.name));
      const notes: string[] = [];
      for (const dir of dirs) {
        const status = await git(dir, ["status", "--porcelain"], { reject: false });
        if (!status.stdout.trim() && params.removeEmpty && dir !== state.worktreeRoot) {
          await rm(dir, { recursive: true, force: true });
          notes.push(`removed clean leftover ${dir}`);
        } else {
          notes.push(`${dir}${status.stdout.trim() ? " dirty" : " clean"}`);
        }
      }
      return text(notes.join("\n"), stateToolDetails(state));
    },
  });
}
