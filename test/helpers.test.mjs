// 居酒屋 — the tasting flight. Every pure helper gets a sip: the width math
// that keeps the panes square, the fuzzy matcher, the scrubbers, and the
// input-chunk logic that once recursed itself off a cliff. Zero dependencies
// here too — node:test ships with node. The real-terminal checklist in
// CLAUDE.md still covers everything these can't: rendering, keys, resize.
//
//   node --test test/
//
// Importing bin/izakaya.js is safe by contract: the bar only opens behind
// IS_MAIN, so this import defines helpers and starts nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";

import {
  charW, visW, truncW, padW,
  fuzzyScore, relTime, fmtBytes,
  changeMark, changePath, scrubRemote,
  expandHome, shq, isPaste, printable, chopChar,
  applyTheme, langMeta,
  agentDefinitions, codexSessionMeta,
  THEMES, T, LANGS,
} from "../bin/izakaya.js";

// ── width math — ANSI-blind, CJK-sighted ────────────────────────────────────

test("charW: ascii is single, CJK and emoji are double", () => {
  assert.equal(charW("a".codePointAt(0)), 1);
  assert.equal(charW("居".codePointAt(0)), 2);
  assert.equal(charW("ば".codePointAt(0)), 2);
  assert.equal(charW("🏮".codePointAt(0)), 2);
  assert.equal(charW("｜".codePointAt(0)), 2); // fullwidth form
});

test("visW: strips ANSI, counts CJK double", () => {
  assert.equal(visW("izakaya"), 7);
  assert.equal(visW("居酒屋"), 6);
  assert.equal(visW("\x1b[38;2;1;2;3m居\x1b[0m bar"), 6);
  assert.equal(visW(""), 0);
});

test("truncW: within budget returns as-is, over budget ends in ellipsis", () => {
  assert.equal(truncW("short", 10), "short");
  const cut = truncW("a-very-long-plate-name", 8);
  assert.ok(cut.endsWith("…"));
  assert.ok(visW(cut) <= 8);
});

test("truncW: preserves ANSI codes and never splits a double-width char", () => {
  const s = "\x1b[31m居酒屋バー\x1b[0m";
  const cut = truncW(s, 5);
  assert.ok(cut.includes("\x1b[31m")); // color survives
  assert.ok(visW(cut) <= 5); // a 2-wide char never straddles the edge
});

test("padW: pads to visible width, ANSI not counted", () => {
  assert.equal(visW(padW("居", 6)), 6);
  assert.equal(visW(padW("\x1b[31mab\x1b[0m", 5)), 5);
  assert.equal(padW("toolong", 3), "toolong"); // never truncates
});

// ── the fuzzy matcher ────────────────────────────────────────────────────────

test("fuzzyScore: chars must appear in order", () => {
  assert.ok(fuzzyScore("izk", "izakaya") > 0);
  assert.equal(fuzzyScore("xyz", "izakaya"), -1);
  assert.equal(fuzzyScore("akazi", "izakaya"), -1); // right chars, wrong order
});

test("fuzzyScore: boundaries beat buried matches", () => {
  // `rr` should love ramen-router (two boundary hits)…
  const boundary = fuzzyScore("rr", "ramen-router");
  // …more than a name where the r's are buried mid-word
  const buried = fuzzyScore("rr", "earworm");
  assert.ok(boundary > buried);
});

test("fuzzyScore: tighter name wins a tie", () => {
  assert.ok(fuzzyScore("iz", "iz") > fuzzyScore("iz", "izakaya"));
});

// ── time and size ────────────────────────────────────────────────────────────

test("relTime: the ladder from just-now to years", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal(relTime(0), "—");
  assert.equal(relTime(now - 5), "just now");
  assert.equal(relTime(now - 120), "2m ago");
  assert.equal(relTime(now - 2 * 3600), "2h ago");
  assert.equal(relTime(now - 3 * 86400), "3d ago");
  assert.equal(relTime(now - 60 * 86400), "2mo ago");
  assert.equal(relTime(now - 400 * 86400), "1y ago");
});

test("fmtBytes: units and precision", () => {
  assert.equal(fmtBytes(512), "512 B");
  assert.equal(fmtBytes(2048), "2.0 KB");
  assert.equal(fmtBytes(10 * 1024), "10 KB");
  assert.equal(fmtBytes(5 * 1024 * 1024), "5.0 MB");
  assert.equal(fmtBytes(3 * 1024 * 1024 * 1024), "3.0 GB");
});

// ── git chrome scrubbing ─────────────────────────────────────────────────────

test("scrubRemote: strips scheme, .git, and — above all — credentials", () => {
  assert.equal(
    scrubRemote("https://github.com/vajramatt/izakaya.git"),
    "github.com/vajramatt/izakaya"
  );
  assert.equal(
    scrubRemote("git@github.com:vajramatt/izakaya.git"),
    "github.com/vajramatt/izakaya"
  );
  assert.equal(
    scrubRemote("ssh://git@github.com/vajramatt/izakaya"),
    "github.com/vajramatt/izakaya"
  );
  // an embedded PAT must never reach the screen or the cache
  const scrubbed = scrubRemote("https://user:ghp_secret123@github.com/o/r.git");
  assert.ok(!scrubbed.includes("ghp_secret123"));
  assert.equal(scrubbed, "github.com/o/r");
});

test("changeMark: worktree wins the color, staged is flagged", () => {
  assert.equal(changeMark("M ").label, "modified");
  assert.equal(changeMark("M ").staged, true);
  assert.equal(changeMark(" M").staged, false);
  assert.equal(changeMark("??").label, "untracked");
  assert.equal(changeMark("UU").label, "conflict");
  assert.equal(changeMark("Z ").label, "changed"); // unknown code, soft default
  assert.match(changeMark("M ").color, /^#/); // resolved to a hex, not a T-key
});

test("changePath: a rename reads as its new name", () => {
  assert.equal(changePath({ path: "old.js -> new.js" }), "new.js");
  assert.equal(changePath({ path: "plain.js" }), "plain.js");
});

// ── shell & path helpers ─────────────────────────────────────────────────────

test("expandHome: tilde forms only", () => {
  assert.equal(expandHome("~"), os.homedir());
  assert.equal(expandHome("~/code"), os.homedir() + "/code");
  assert.equal(expandHome("/abs/path"), "/abs/path");
  assert.equal(expandHome("not~/this"), "not~/this");
});

test("shq: quotes survive spaces and embedded quotes", () => {
  assert.equal(shq("plain"), "'plain'");
  assert.equal(shq("with space"), "'with space'");
  assert.equal(shq("it's"), `'it'\\''s'`);
});

// ── input chunks — the crash that started this file ─────────────────────────

test("isPaste: a lone multi-byte keypress is NOT a paste", () => {
  // each of these once recursed onKey into a stack overflow
  for (const ch of ["é", "日", "🏮", "ば"])
    assert.equal(isPaste(Buffer.from(ch), ch), false, `${ch} must not replay`);
});

test("isPaste: real pastes and escape sequences sort correctly", () => {
  assert.equal(isPaste(Buffer.from("abc"), "abc"), true);
  assert.equal(isPaste(Buffer.from("日本語"), "日本語"), true);
  assert.equal(isPaste(Buffer.from("~/code"), "~/code"), true);
  assert.equal(isPaste(Buffer.from("\x1b[B"), "\x1b[B"), false); // arrow key
  assert.equal(isPaste(Buffer.from("a"), "a"), false); // single key
});

test("printable: one visible code point, any script", () => {
  for (const ch of ["a", " ", "~", "é", "日", "居", "🏮"])
    assert.equal(printable(ch), true, `${ch} should be typeable`);
  for (const bad of ["\x1b", "\x7f", "\x03", "\n", "\x1b[B", "ab", "\x9b"])
    assert.equal(printable(bad), false, `${JSON.stringify(bad)} should not`);
});

test("chopChar: backspace removes whole characters, not surrogate halves", () => {
  assert.equal(chopChar("abc"), "ab");
  assert.equal(chopChar("ab🏮"), "ab"); // an emoji is one backspace, not half
  assert.equal(chopChar("日本語"), "日本");
  assert.equal(chopChar(""), "");
});

// ── the lanterns ─────────────────────────────────────────────────────────────

test("applyTheme: T swaps in place; an unknown name falls back to the house light", () => {
  const houseBg = THEMES.tokyonight.colors.bg;
  applyTheme("nord");
  assert.equal(T.bg, THEMES.nord.colors.bg);
  applyTheme("not-a-theme");
  assert.equal(T.bg, houseBg);
  // every lantern carries the full key set — a missing key would paint black
  const keys = Object.keys(THEMES.tokyonight.colors).sort();
  for (const [name, th] of Object.entries(THEMES))
    assert.deepEqual(Object.keys(th.colors).sort(), keys, `${name} key set`);
});

test("langMeta: resolves names to the live theme, unknowns stay dim", () => {
  applyTheme("tokyonight");
  assert.equal(langMeta("TypeScript").color, T[LANGS.ts.color]);
  assert.equal(langMeta("Klingon").color, T.fgDim);
  assert.equal(langMeta("Klingon").icon, ""); // callers draw their own fallback
});

// ── agent adapters ──────────────────────────────────────────────────────────

test("agentDefinitions: built-ins stay stable and custom launchers are sanitized", () => {
  const agents = agentDefinitions({
    agents: [
      { id: "qwen", label: "Qwen Code", command: "qwen", resume: "qwen --continue" },
      { id: "claude", label: "Impostor", command: "nope" },
      { label: "Kimi CLI", command: "kimi" },
      { label: "Broken" },
    ],
  });
  assert.deepEqual(agents.slice(0, 2).map((a) => a.id), ["claude", "codex"]);
  assert.deepEqual(agents.slice(2).map((a) => a.id), ["qwen", "kimi-cli"]);
  assert.equal(agents.find((a) => a.id === "qwen").resume, "qwen --continue");
});

test("codexSessionMeta: reads cwd from session metadata without needing the whole JSONL", () => {
  assert.deepEqual(
    codexSessionMeta('{"type":"session_meta","payload":{"cwd":"/code/ramen\\u0020bar","more":"…"'),
    { cwd: "/code/ramen bar" }
  );
  assert.equal(codexSessionMeta('{"type":"response_item"}'), null);
});
