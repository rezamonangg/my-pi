import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { worktreeFooterText } from "./footer.js";
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
