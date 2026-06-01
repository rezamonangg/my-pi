import { createBashTool, isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { currentBranch, tryFindRepoRoot } from "./git.js";
import { setWorktreeFooter } from "./footer.js";
import { routeCommand } from "./paths.js";
import { routeToolCall } from "./routing.js";
import { inactive, restoreFromToolDetails, saveDiskState, type WorktreeState } from "./state.js";
import { registerWorktreeTools } from "./tools.js";

const ACTIVATION_RE = /\b(use (a )?worktree|use worktree|don't touch main checkout|do not touch main checkout|isolate this task|isolated worktree)\b/i;

export default function piWorktree(pi: ExtensionAPI) {
  let state: WorktreeState | undefined;

  function refreshFooter(ctx?: any) {
    if (ctx && state) setWorktreeFooter(ctx, state, { getThinkingLevel: () => pi.getThinkingLevel() });
  }

  async function setState(next: WorktreeState, ctx?: any) {
    state = next;
    await saveDiskState(next);
    refreshFooter(ctx);
  }

  function getState(): WorktreeState {
    if (!state) throw new Error("pi-worktree not initialized yet");
    return state;
  }

  pi.on("session_start", async (_event, ctx) => {
    const repoRoot = await tryFindRepoRoot(ctx.cwd);
    if (!repoRoot) {
      state = undefined;
      ctx.ui?.setStatus?.("pi-worktree", undefined);
      ctx.ui?.setFooter?.(undefined);
      return;
    }
    const branch = await currentBranch(repoRoot).catch(() => "unknown");
    const fromSession = restoreFromToolDetails(ctx.sessionManager.getBranch(), repoRoot);
    state = fromSession ?? inactive(repoRoot, branch || "detached");
    refreshFooter(ctx);
    if (state.mode === "active" || state.mode === "conflict") {
      ctx.ui?.notify?.(`pi-worktree restored: ${state.worktreeRoot} on ${state.branch}`, "info");
    }
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return;
    const wantsWorktree = ACTIVATION_RE.test(event.text);
    if (!state) {
      const repoRoot = await tryFindRepoRoot(ctx.cwd);
      if (!repoRoot) {
        if (wantsWorktree) {
          return {
            action: "transform" as const,
            text: `${event.text}\n\npi-worktree unavailable: current directory is not inside a git repository. Open a git repo before calling worktree_start.`,
          };
        }
        return;
      }
      const branch = await currentBranch(repoRoot).catch(() => "unknown");
      state = inactive(repoRoot, branch || "detached");
    }
    const current = state;
    if (!wantsWorktree) return;
    if (current.mode === "active" || current.mode === "conflict") return;
    const pending: WorktreeState = {
      mode: "pending",
      repoRoot: current.repoRoot,
      originalCwd: ctx.cwd,
      pendingQuestion:
        "Worktree requested. Before implementation, call worktree_start with explicit branch or prompt-derived branch. If mise config is present, ask user before trustMise:true.",
    };
    await setState(pending, ctx);
    return {
      action: "transform" as const,
      text: `${event.text}\n\npi-worktree activation detected. First call worktree_start. Do not read, edit, write, or run bash until worktree_start succeeds. Use an explicit branch if user provided one; otherwise infer a conventional branch from the task or ask if unclear.`,
    };
  });

  pi.on("model_select", async (_event, ctx) => refreshFooter(ctx));
  pi.on("thinking_level_select", async (_event, ctx) => refreshFooter(ctx));
  pi.on("agent_end", async (_event, ctx) => refreshFooter(ctx));

  pi.on("tool_call", async (event) => {
    if (!state) return;
    try {
      await routeToolCall(event.toolName, event.input, state);
    } catch (error: any) {
      return { block: true, reason: error.message };
    }

    if (isToolCallEventType("bash", event) && (state.mode === "active" || state.mode === "conflict")) {
      try {
        event.input.command = routeCommand(event.input.command, state);
      } catch (error: any) {
        return { block: true, reason: error.message };
      }
    }
  });

  registerWorktreeTools(pi, { getState, setState });

  const bash = createBashTool(process.cwd(), {
    spawnHook: ({ command, cwd, env }: any) => {
      const current = state;
      if (!current || (current.mode !== "active" && current.mode !== "conflict") || !current.worktreeRoot) return { command, cwd, env };
      const routed = routeCommand(command, current);
      return {
        command: routed,
        cwd: current.worktreeRoot,
        env: {
          ...env,
          PI_WORKTREE_ROOT: current.worktreeRoot,
          PI_WORKTREE_BRANCH: current.branch ?? "",
          PI_WORKTREE_REPO_ROOT: current.repoRoot,
        },
      };
    },
  });

  pi.registerTool({
    ...bash,
    name: "bash",
    label: "bash (pi-worktree routed)",
    promptGuidelines: [
      "When pi-worktree is active, bash runs with cwd set to PI_WORKTREE_ROOT and must not mutate the main checkout.",
      "Use worktree_diff, worktree_sync, worktree_commit, and worktree_stop for worktree lifecycle operations.",
    ],
  });
}
