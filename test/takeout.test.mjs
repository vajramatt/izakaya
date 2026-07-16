// The takeout window, tasted end-to-end: stage a tiny bar in a temp dir,
// order --report and --closing-time through a real child process (no pty
// needed — that's the point of the takeout window), and check the plates,
// the facts, and the exit codes. closingFacts gets a pure sip too.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { closingFacts } from "../bin/izakaya.js";

const execFile = promisify(execFileCb);
const BIN = fileURLToPath(new URL("../bin/izakaya.js", import.meta.url));

// hermetic git — no reading the host's config, no signing surprises
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_CONFIG_SYSTEM: os.devNull,
};
const git = (cwd, ...args) =>
  execFile(
    "git",
    ["-c", "user.email=t@example.com", "-c", "user.name=t",
     "-c", "commit.gpgsign=false", ...args],
    { cwd, env: GIT_ENV }
  );

// izakaya itself; exit codes come back instead of throwing
async function order(...args) {
  try {
    const { stdout } = await execFile(process.execPath, [BIN, ...args]);
    return { code: 0, stdout };
  } catch (e) {
    if (typeof e.code !== "number") throw e; // a real failure, not an exit code
    return { code: e.code, stdout: e.stdout ?? "" };
  }
}

let bar, cleanBar;

before(async () => {
  bar = await fs.mkdtemp(path.join(os.tmpdir(), "izakaya-takeout-"));
  cleanBar = await fs.mkdtemp(path.join(os.tmpdir(), "izakaya-clean-"));

  // miso-repo: one commit, one untracked file, no remote
  // → unsettled + houseOnly, at risk
  const miso = path.join(bar, "miso-repo");
  await fs.mkdir(path.join(miso, "src"), { recursive: true });
  await git(miso, "init", "-q");
  await fs.writeFile(path.join(miso, "src", "index.js"), 'console.log("miso")\n');
  await git(miso, "add", "-A");
  await git(miso, "commit", "-qm", "feat: first bowl");
  await fs.writeFile(path.join(miso, "src", "wip.js"), "// wip\n");

  // tofu-notes: not a repo — served off-menu, never at risk
  await fs.mkdir(path.join(bar, "tofu-notes"));
  await fs.writeFile(path.join(bar, "tofu-notes", "README.md"), "soft plans\n");

  // the clean bar holds only a non-git dir — the stove has nothing on it
  await fs.mkdir(path.join(cleanBar, "empty-plate"));
});

after(async () => {
  await fs.rm(bar, { recursive: true, force: true });
  await fs.rm(cleanBar, { recursive: true, force: true });
});

// ── closingFacts, neat ───────────────────────────────────────────────────────

test("closingFacts: kinds, ordering, and who never shows up", () => {
  const repos = [
    { isGit: false, dirty: 9 }, // off-menu — ignored no matter how dirty
    { isGit: true, name: "quiet", dirty: 0, unpushed: 0, stash: 0, remote: "x", commits: 5 },
    { isGit: true, name: "loud", dirty: 3, unpushed: 2, stash: 1, remote: "x", commits: 9 },
    { isGit: true, name: "hermit", dirty: 0, unpushed: 0, stash: 0, remote: null, commits: 4 },
  ];
  const at = closingFacts(repos);
  assert.deepEqual(at.map(({ repo }) => repo.name), ["loud", "hermit"]);
  assert.deepEqual(
    at[0].facts,
    [{ kind: "unsettled", n: 3 }, { kind: "unpushed", n: 2 }, { kind: "stashed", n: 1 }]
  );
  // a repo with no remote counts every pour as house-only
  assert.deepEqual(at[1].facts, [{ kind: "houseOnly", n: 4 }]);
});

// ── --report ─────────────────────────────────────────────────────────────────

test("--report: the whole menu as JSON, exit 0", async () => {
  const { code, stdout } = await order("--report", bar);
  assert.equal(code, 0);
  const report = JSON.parse(stdout);
  assert.equal(report.root, bar);
  assert.ok(report.izakaya.length > 0);
  assert.ok(Number.isInteger(report.schema));
  assert.equal(report.plates.length, 2);

  const miso = report.plates.find((p) => p.name === "miso-repo");
  assert.equal(miso.isGit, true);
  assert.equal(miso.dirty, 1);
  assert.equal(miso.commits, 1);
  assert.equal(miso.cooked, true); // both pours land before the takeout prints
  assert.equal(miso.changes[0].xy, "??");
  assert.equal(miso.lastMsg, "feat: first bowl");

  const tofu = report.plates.find((p) => p.name === "tofu-notes");
  assert.equal(tofu.isGit, false);
  assert.ok(tofu.files >= 1);
});

// ── --closing-time ───────────────────────────────────────────────────────────

test("--closing-time --json: at-risk plates, exit 1", async () => {
  const { code, stdout } = await order("--closing-time", "--json", bar);
  assert.equal(code, 1);
  const sweep = JSON.parse(stdout);
  assert.equal(sweep.atRisk.length, 1);
  assert.equal(sweep.atRisk[0].name, "miso-repo");
  assert.deepEqual(
    sweep.atRisk[0].facts.map((f) => f.kind).sort(),
    ["houseOnly", "unsettled"]
  );
  assert.equal(sweep.safe, 0);
});

test("--closing-time text: plain when piped, still exit 1", async () => {
  const { code, stdout } = await order("--closing-time", bar);
  assert.equal(code, 1);
  assert.match(stdout, /closing time/);
  assert.match(stdout, /miso-repo/);
  assert.match(stdout, /1 unsettled/);
  assert.doesNotMatch(stdout, /\x1b\[/); // a pipe gets no ANSI paint
});

test("--closing-time: a clean stove exits 0", async () => {
  const { code, stdout } = await order("--closing-time", cleanBar);
  assert.equal(code, 0);
  assert.match(stdout, /the stove is clean/);
});

test("takeout: an unreadable root exits 2", async () => {
  const { code } = await order("--report", path.join(bar, "no-such-street"));
  assert.equal(code, 2);
});
