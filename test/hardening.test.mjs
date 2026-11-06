// 居酒屋 — the bouncer's tasting. A scanned repo brings its own .git/config,
// file names, and branch names; none of them may run code, launch an app, or
// talk to the terminal. These sip the pure helpers that stand at the door.
//
//   node --test test/

import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

import {
  hardenedGitArgs, gitPins, DIFF_SAFE, editorArg, shq,
  macBundleLike,
} from "../bin/izakaya.js";

// ── git: a plate's config never gets to name a program ──────────────────────

test("hardenedGitArgs: fixed pins lead, the ask follows", () => {
  const a = hardenedGitArgs(["status", "--porcelain"]);
  assert.equal(a[0], "--no-optional-locks");
  assert.deepEqual(a.slice(-2), ["status", "--porcelain"]);
  const pairs = a.filter((_, i) => a[i - 1] === "-c");
  assert.ok(pairs.includes("core.fsmonitor=false"));
  assert.ok(pairs.includes(`core.hooksPath=${os.devNull}`));
  // per-plate pins sit between the fixed ones and the subcommand
  const b = hardenedGitArgs(["diff"], ["-c", "filter.x.clean="]);
  assert.deepEqual(b.slice(-3), ["-c", "filter.x.clean=", "diff"]);
  assert.deepEqual(DIFF_SAFE, ["--no-ext-diff", "--no-textconv"]);
});

test("gitPins: local filter drivers are blanked, the user's own survive", () => {
  const raw = [
    "global", "filter.lfs.process\ngit-lfs filter-process",
    "local", "filter.lfs.process\n/tmp/evil",
    "local", "filter.evil.clean\n/tmp/evil clean",
    "worktree", "core.fsmonitor\n/tmp/evil",
    "unknown", "credential.helper\nosxkeychain",
    "local", "credential.helper\n!evil",
    "global", "filter.lfs.required\ntrue",
  ].join("\0") + "\0";
  const { pins, trusted } = gitPins(raw);
  // a planted key is reset first, then re-pinned to the user's values in order
  assert.deepEqual(pins, [
    "-c", "filter.lfs.process=", "-c", "filter.lfs.process=git-lfs filter-process",
    "-c", "filter.evil.clean=",
    "-c", "core.fsmonitor=",
    "-c", "credential.helper=", "-c", "credential.helper=osxkeychain",
  ]);
  // keys only the user set are left alone
  assert.ok(!pins.includes("filter.lfs.required="));
  assert.deepEqual(trusted.get("credential.helper"), ["osxkeychain"]);
});

test("gitPins: the user's ssh command comes from their scopes, never the plate's", () => {
  const raw = "global\0core.sshcommand\nssh -i ~/.ssh/work\0local\0core.sshcommand\nsh -c pwn\0";
  assert.equal(gitPins(raw).trusted.get("core.sshcommand").at(-1), "ssh -i ~/.ssh/work");
  const only = gitPins("local\0core.sshcommand\nsh -c pwn\0");
  assert.equal(only.trusted.get("core.sshcommand"), undefined);
});

test("gitPins: nothing planted, nothing pinned; an unpinnable key fails closed", () => {
  assert.deepEqual(gitPins("").pins, []);
  assert.deepEqual(gitPins(null).pins, []);
  // `-c` splits at the first `=` — a subsection carrying one can't be pinned
  assert.equal(gitPins("local\0credential.https://x?a=b.helper\n!evil\0"), null);
});

// ── e: a file name is never an editor option ────────────────────────────────

test("editorArg: repo-relative paths go out as ./path, once", () => {
  assert.equal(editorArg("+!sh -c pwn"), "./+!sh -c pwn");
  assert.equal(editorArg("-c"), "./-c");
  assert.equal(editorArg("src/app.js"), "./src/app.js");
  assert.equal(editorArg("./already.js"), "./already.js");
  assert.equal(editorArg("/abs/file"), "/abs/file");
  assert.equal(shq(editorArg("+!sh")), "'./+!sh'");
});

// ── o: a bundle-shaped plate is revealed, never launched ────────────────────

test("macBundleLike: .app and friends, or anything carrying Info.plist", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "izakaya-bundle-"));
  try {
    for (const name of ["Calc.app", "Shout.APP", "Pane.prefPane", "Flow.workflow"]) {
      fs.mkdirSync(path.join(tmp, name));
      assert.equal(macBundleLike(path.join(tmp, name)), true, name);
    }
    const sneaky = path.join(tmp, "plain-name");
    fs.mkdirSync(path.join(sneaky, "Contents"), { recursive: true });
    fs.writeFileSync(path.join(sneaky, "Contents", "Info.plist"), "<plist/>");
    assert.equal(macBundleLike(sneaky), true);
    const repo = path.join(tmp, "infocard.ai");
    fs.mkdirSync(repo);
    assert.equal(macBundleLike(repo), false);
    assert.equal(macBundleLike(path.join(tmp, "missing")), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
