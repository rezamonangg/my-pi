import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpath } from "node:fs/promises";
import test from "node:test";
import { routePath } from "./paths.js";
import type { WorktreeState } from "./state.js";

async function fixture() {
  const repoRoot = await mkdtemp(join(tmpdir(), "pi-worktree-main-"));
  const worktreeRoot = join(repoRoot, ".worktree", "feat__demo");
  await mkdir(join(repoRoot, "src"), { recursive: true });
  await mkdir(join(worktreeRoot, "src"), { recursive: true });
  await writeFile(join(worktreeRoot, ".git"), "gitdir: ../../.git/worktrees/demo\n");
  const realRepoRoot = await realpath(repoRoot);
  const realWorktreeRoot = await realpath(worktreeRoot);
  const state: WorktreeState = { mode: "active", repoRoot: realRepoRoot, worktreeRoot: realWorktreeRoot, branch: "feat/demo", originalCwd: realRepoRoot };
  return { repoRoot: realRepoRoot, worktreeRoot: realWorktreeRoot, state };
}

test("routes relative path into worktree", async () => {
  const { worktreeRoot, state } = await fixture();
  const routed = await routePath(state, "src/a.ts");
  assert.equal(routed.routedPath, join(worktreeRoot, "src", "a.ts"));
});

test("remaps main absolute path into worktree", async () => {
  const { repoRoot, worktreeRoot, state } = await fixture();
  const routed = await routePath(state, join(repoRoot, "src", "a.ts"));
  assert.equal(routed.routedPath, join(worktreeRoot, "src", "a.ts"));
});

test("allows active worktree absolute path", async () => {
  const { worktreeRoot, state } = await fixture();
  const routed = await routePath(state, join(worktreeRoot, "src", "a.ts"));
  assert.equal(routed.routedPath, join(worktreeRoot, "src", "a.ts"));
});

test("blocks outside path", async () => {
  const { state } = await fixture();
  await assert.rejects(() => routePath(state, "/etc/passwd"), /outside active worktree/);
});

test("blocks sibling worktree", async () => {
  const { repoRoot, state } = await fixture();
  await assert.rejects(() => routePath(state, join(repoRoot, ".worktree", "other", "src", "main.ts")), /sibling worktree/);
});

test("blocks symlink escape", async () => {
  const { worktreeRoot, state } = await fixture();
  await symlink("/etc", join(worktreeRoot, "outside"));
  await assert.rejects(() => routePath(state, "outside/passwd"), /symlink\/path escape/);
});
