import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { worktreeFooterText, worktreePowerlineFooterText } from "./footer.js";
import type { WorktreeState } from "./state.js";

function stripAnsi(text: string | undefined): string {
  return (text ?? "").replace(/\x1b\[[0-9;]*m/g, "");
}

test("active footer omits duplicate branch when path already contains branch", () => {
  const repoRoot = "/repo";
  const state: WorktreeState = {
    mode: "active",
    repoRoot,
    worktreeRoot: join(repoRoot, ".worktree", "docs", "scraper-service-context"),
    branch: "docs/scraper-service-context",
    originalCwd: repoRoot,
  };

  assert.equal(stripAnsi(worktreeFooterText(state)), "⧉ .worktree/docs/scraper-service-context");
});

test("active footer keeps branch when path does not contain branch", () => {
  const repoRoot = "/repo";
  const state: WorktreeState = {
    mode: "active",
    repoRoot,
    worktreeRoot: join(repoRoot, ".worktree", "custom-location"),
    branch: "feat/demo",
    originalCwd: repoRoot,
  };

  assert.equal(stripAnsi(worktreeFooterText(state)), "⧉ .worktree/custom-location | ⎇ feat/demo");
});

test("powerline footer includes model thinking dir worktree branch context cache", () => {
  const repoRoot = "/repo/my-pi";
  const state: WorktreeState = {
    mode: "inactive",
    repoRoot,
    branch: "main",
    originalCwd: repoRoot,
  };
  const ctx = {
    cwd: repoRoot,
    model: { name: "GPT-5.5", contextWindow: 272000 },
    getContextUsage: () => ({ percent: 29.5, contextWindow: 272000, tokens: 80240 }),
    settingsManager: { getCompactionSettings: () => ({ enabled: true }) },
    sessionManager: {
      getEntries: () => [{ type: "message", message: { role: "assistant", usage: { cacheRead: 3000000 } } }],
    },
    modelRegistry: { isUsingOAuth: () => true },
  };

  assert.equal(
    stripAnsi(worktreePowerlineFooterText(ctx, state, { thinkingLevel: "high", gitBranch: "main" })),
    "GPT-5.5 | think:high | dir my-pi | ⧉ main-worktree | ⎇ main | ◫ 29.5%/272k AC | cache in: 3.0M | (sub)",
  );
});
