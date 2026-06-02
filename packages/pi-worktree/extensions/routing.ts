import { routeCommand, routePath } from "./paths.js";
import type { WorktreeState } from "./state.js";

const FILE_TOOL_PATHS: Record<string, string[]> = {
  read: ["path"],
  write: ["path"],
  edit: ["path"],
  ls: ["path"],
  grep: ["path"],
  find: ["path"],
};

export function isRoutableTool(toolName: string): boolean {
  return toolName in FILE_TOOL_PATHS || toolName === "bash";
}

export async function routeToolCall(toolName: string, input: any, state: WorktreeState): Promise<void> {
  if (state.mode === "pending" && isRoutableTool(toolName)) {
    throw new Error(`pi-worktree setup pending. ${state.pendingQuestion ?? "Finish worktree_start or cancel before using file/bash tools."}`);
  }
  if (state.mode !== "active" && state.mode !== "conflict") return;

  for (const key of FILE_TOOL_PATHS[toolName] ?? []) {
    if (typeof input?.[key] === "string") {
      input[key] = (await routePath(state, input[key])).routedPath;
    }
  }

  if (toolName === "bash" && typeof input?.command === "string") {
    input.command = routeCommand(input.command, state);
  }
}
