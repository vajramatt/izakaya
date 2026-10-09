// The market run, tasted twice: the pure verdicts (marketGate, marketMove)
// that decide what a plate may do, and the real thing end-to-end — a bare
// upstream, clones that drift from it in every way the rules care about, and
// `izakaya --pull` through a child process. The only command in the house
// that moves a repo, so it gets the strictest sip.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { marketGate, marketMove, helpColumns } from "../bin/izakaya.js";

const execFile = promisify(execFileCb);
const BIN = fileURLToPath(new URL("../bin/izakaya.js", import.meta.url));

// ── the verdicts ─────────────────────────────────────────────────────────────

const ready = { isGit: true, branch: "main", upstream: "origin/main", remote: "origin", busy: null, live: false };

test("marketGate: a plain tracking branch may go to market", () => {
  assert.equal(marketGate(ready), null);
});

test("marketGate: every reason to stay home has its own kind", () => {
  assert.equal(marketGate({ ...ready, isGit: false }).kind, "not-git");
  assert.equal(marketGate({ ...ready, branch: "HEAD" }).kind, "detached");
  assert.equal(marketGate({ ...ready, upstream: null }).kind, "no-upstream");
  assert.equal(marketGate({ ...ready, remote: "." }).kind, "local-upstream");
  assert.equal(marketGate({ ...ready, remote: "--upload-pack=evil" }).kind, "odd-remote");
  assert.equal(marketGate({ ...ready, busy: "rebase" }).kind, "busy");
  assert.match(marketGate({ ...ready, busy: "rebase" }).reason, /mid-rebase/);
  assert.equal(marketGate({ ...ready, live: true }).kind, "cooking");
});

test("marketGate: checks run in a fixed order — the first reason wins", () => {
  // detached AND cooking → detached, every time
  assert.equal(marketGate({ ...ready, branch: "HEAD", live: true }).kind, "detached");
  assert.equal(marketGate({ ...ready, busy: "merge", live: true }).kind, "busy");
});

test("marketMove: nothing behind is fresh, even with pours of your own", () => {
  assert.deepEqual(marketMove({ ahead: 0, behind: 0, dirty: 0 }), { act: "fresh" });
  assert.deepEqual(marketMove({ ahead: 3, behind: 0, dirty: 2 }), { act: "fresh" });
});

test("marketMove: behind and clean fast-forwards", () => {
  assert.deepEqual(marketMove({ ahead: 0, behind: 4, dirty: 0 }), { act: "ff" });
});

test("marketMove: diverged beats dirty, and both are set aside", () => {
  const d = marketMove({ ahead: 1, behind: 2, dirty: 5 });
  assert.equal(d.act, "skip");
  assert.equal(d.kind, "diverged");
  const u = marketMove({ ahead: 0, behind: 2, dirty: 1 });
  assert.equal(u.kind, "dirty");
  assert.match(u.reason, /1 unsettled file\b/);
});

// ── the back page's layout ───────────────────────────────────────────────────

test("helpColumns: one column when narrow, two balanced when wide", () => {
  const sections = [
    { title: "a", rows: [["x", "1"], ["y", "2"]] },
    { title: "b", rows: [["x", "1"]] },
    { title: "c", rows: [["x", "1"], ["y", "2"], ["z", "3"]] },
    { title: "d", rows: [["x", "1"]] },
  ];
  assert.equal(helpColumns(sections, 1).length, 1);
  const two = helpColumns(sections, 2);
  assert.equal(two.length, 2);
  // order is preserved and nothing is lost
  assert.deepEqual(two.flat().map((s) => s.title), ["a", "b", "c", "d"]);
  const h = (col) => col.reduce((n, s) => n + s.rows.length + 2, 0);
  assert.ok(Math.abs(h(two[0]) - h(two[1])) <= 4);
});

// ── the real market ──────────────────────────────────────────────────────────

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_CONFIG_SYSTEM: os.devNull,
};
const git = (cwd, ...args) =>
  execFile(
    "git",
    ["-c", "user.email=t@example.com", "-c", "user.name=t",
     "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args],
    { cwd, env: GIT_ENV }
  );
const head = async (cwd) => (await git(cwd, "rev-parse", "HEAD")).stdout.trim();

async function pull(root, ...flags) {
  try {
    const { stdout } = await execFile(process.execPath, [BIN, root, "--pull", ...flags], {
      env: { ...GIT_ENV, XDG_CACHE_HOME: path.join(root, ".cache-x"), HOME: root },
    });
    return { code: 0, stdout };
  } catch (e) {
    if (typeof e.code !== "number") throw e;
    return { code: e.code, stdout: e.stdout ?? "" };
  }
}

let tmp, bar, upstream;

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "izakaya-market-"));
  upstream = path.join(tmp, "upstream.git");
  bar = path.join(tmp, "bar");
  await fs.mkdir(bar);
  await git(tmp, "init", "-q", "--bare", upstream);

  // seed the upstream with one pour
  const seed = path.join(tmp, "seed");
  await git(tmp, "clone", "-q", upstream, seed);
  await fs.writeFile(path.join(seed, "a.txt"), "one\n");
  await git(seed, "add", "-A");
  await git(seed, "commit", "-qm", "one");
  await git(seed, "push", "-q", "origin", "HEAD:main");

  // four clones, each drifting a different way
  for (const name of ["behind", "dirty", "diverged", "fresh"])
    await git(bar, "clone", "-q", upstream, name);

  // a plate with no upstream, and a folder that isn't a repo at all
  await git(bar, "init", "-q", "houseonly");
  await fs.mkdir(path.join(bar, "notes"));

  // diverged gets a pour of its own; dirty gets an unsettled tracked edit
  await fs.writeFile(path.join(bar, "diverged", "mine.txt"), "mine\n");
  await git(path.join(bar, "diverged"), "add", "-A");
  await git(path.join(bar, "diverged"), "commit", "-qm", "mine");
  await fs.writeFile(path.join(bar, "dirty", "a.txt"), "edited\n");

  // then the upstream moves on by two pours
  for (const n of ["two", "three"]) {
    await fs.writeFile(path.join(seed, "a.txt"), `${n}\n`);
    await git(seed, "commit", "-qam", n);
  }
  await git(seed, "push", "-q", "origin", "HEAD:main");
  // fresh catches up by hand, so the market has nothing to bring it
  await git(path.join(bar, "fresh"), "pull", "-q", "--ff-only");
});

after(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

test("--pull --json: fast-forwards only the clean plate that's behind", async () => {
  const dirtyHead = await head(path.join(bar, "dirty"));
  const divergedHead = await head(path.join(bar, "diverged"));
  const { code, stdout } = await pull(bar, "--json");
  assert.equal(code, 0);
  const r = JSON.parse(stdout);
  const by = Object.fromEntries(r.plates.map((p) => [p.name, p]));

  assert.equal(by.behind.outcome, "restocked");
  assert.equal(by.behind.pours, 2);
  assert.equal(await head(path.join(bar, "behind")), await head(upstream));

  assert.equal(by.fresh.outcome, "fresh");

  assert.equal(by.dirty.outcome, "skipped");
  assert.equal(by.dirty.kind, "dirty");
  assert.equal(await head(path.join(bar, "dirty")), dirtyHead); // never moved
  assert.equal(
    await fs.readFile(path.join(bar, "dirty", "a.txt"), "utf8"),
    "edited\n" // the unsettled edit is exactly where it was left
  );

  assert.equal(by.diverged.kind, "diverged");
  assert.equal(await head(path.join(bar, "diverged")), divergedHead);

  assert.equal(by.houseonly.kind, "no-upstream");
  assert.equal(by.notes, undefined); // not a repo — never sent to market

  // plates come back sorted by name, so the same bar reads the same way
  const names = r.plates.map((p) => p.name);
  assert.deepEqual(names, [...names].sort());
});

test("--pull: a second run finds everything already settled", async () => {
  const { code, stdout } = await pull(bar);
  assert.equal(code, 0);
  assert.match(stdout, /market run/);
  assert.match(stdout, /^0 restocked/m);
});

test("--pull: an unreachable remote exits 1 and says so", async () => {
  const lost = path.join(bar, "lost");
  await git(bar, "clone", "-q", upstream, lost);
  await git(lost, "remote", "set-url", "origin", path.join(tmp, "nowhere.git"));
  const { code, stdout } = await pull(bar, "--json");
  assert.equal(code, 1);
  const p = JSON.parse(stdout).plates.find((x) => x.name === "lost");
  assert.equal(p.kind, "unreachable");
  await fs.rm(lost, { recursive: true, force: true });
});
