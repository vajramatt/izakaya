#!/usr/bin/env node
// 居酒屋 izakaya — a cozy little bar where your repos are the menu.
// Zero-dependency TokyoNight TUI for the repos in your code directory.

import { promisify } from "node:util";
import { execFile as execFileCb, execFileSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCb);

// ─────────────────────────────────────────────────────────────────────────────
// Version — single source of truth. package.json mirrors this string for the
// npm/source side; keep the two in step. The bar a curl-install drops onto your
// PATH is a lone file with no .git beside it, so the commit is best-effort:
// a live git lookup when run from a checkout (npm link / source tree), and
// nothing when installed — in which case the line is just the bare version.
// ─────────────────────────────────────────────────────────────────────────────

const VERSION = "0.9.0";

function commit() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const sha = execFileSync("git", ["-C", here, "rev-parse", "--short", "HEAD"], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    })
      .toString()
      .trim();
    if (!sha) return null;
    try {
      // against HEAD, so staged-but-uncommitted work still reads as dirty
      execFileSync("git", ["-C", here, "diff", "--quiet", "HEAD"], { stdio: "ignore" });
    } catch {
      return `${sha}-dirty`;
    }
    return sha;
  } catch {
    return null;
  }
}

// Computed once and cached — the header asks for this every frame, but git is
// only ever spawned the first time.
let _versionStr;
function versionString() {
  if (_versionStr === undefined) {
    const c = commit();
    _versionStr = c ? `${VERSION} (${c})` : VERSION;
  }
  return _versionStr;
}

// The bar only opens when this file is what was run — the binary on PATH, an
// npm-link shim, or `node bin/izakaya.js`. Imported instead (the tasting
// flight in test/ does this), it just sets the table: no timers, no TTY
// takeover, no exits. realpath so the npm-link symlink still counts as us.
const IS_MAIN = (() => {
  try {
    return (
      !!process.argv[1] &&
      fsSync.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
    );
  } catch {
    return false;
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// Themes — the lanterns. T is law: every color the bar paints is read from
// the active theme at render time. A theme is pure data — the same key set
// plus gradient stops — so a new one is a ~30-line, data-only patch. Each
// carries its own seg0–4 header ramp (TokyoNight's comes from the Starship
// preset so the header reads like the prompt it sits above) and its own
// stops so the splash waves in the theme's light, not TokyoNight's.
// TokyoNight (Night) is the house light and the reference.
// ─────────────────────────────────────────────────────────────────────────────

const THEMES = {
  tokyonight: {
    colors: {
      bg: "#1a1b26", bgPanel: "#16161e", bgHi: "#292e42",
      fg: "#c0caf5", fgDim: "#565f89", fgFaint: "#3b4261",
      blue: "#7aa2f7", cyan: "#7dcfff", teal: "#73daca", green: "#9ece6a",
      yellow: "#e0af68", orange: "#ff9e64", red: "#f7768e", magenta: "#bb9af7",
      seg0: "#a3aed2", seg1: "#769ff0", seg2: "#394260", seg3: "#212736",
      seg4: "#1d2230", segFg: "#e3e5e5", segDim: "#a0a9cb", segInk: "#090c0c",
    },
    stops: [
      [122, 162, 247], [125, 207, 255], [187, 154, 247],
      [115, 218, 202], [158, 206, 106], [247, 118, 142],
    ],
  },
  // cocopon/iceberg.vim — bluish, well-frozen
  iceberg: {
    colors: {
      bg: "#161821", bgPanel: "#131521", bgHi: "#272c42",
      fg: "#c6c8d1", fgDim: "#6b7089", fgFaint: "#444b71",
      blue: "#84a0c6", cyan: "#89b8c2", teal: "#95c4ce", green: "#b4be82",
      yellow: "#e9b189", orange: "#e2a478", red: "#e27878", magenta: "#a093c7",
      seg0: "#b4b9ca", seg1: "#84a0c6", seg2: "#2e3244", seg3: "#22263a",
      seg4: "#1b1e2e", segFg: "#d2d4de", segDim: "#9a9ebc", segInk: "#0f1117",
    },
    stops: [
      [132, 160, 198], [137, 184, 194], [160, 147, 199],
      [149, 196, 206], [180, 190, 130], [226, 120, 120],
    ],
  },
  // nordtheme — polar nights, frost, aurora
  nord: {
    colors: {
      bg: "#2e3440", bgPanel: "#272c36", bgHi: "#3b4252",
      fg: "#d8dee9", fgDim: "#616e88", fgFaint: "#4c566a",
      blue: "#81a1c1", cyan: "#88c0d0", teal: "#8fbcbb", green: "#a3be8c",
      yellow: "#ebcb8b", orange: "#d08770", red: "#bf616a", magenta: "#b48ead",
      seg0: "#b8c5dd", seg1: "#81a1c1", seg2: "#434c5e", seg3: "#3b4252",
      seg4: "#333a47", segFg: "#eceff4", segDim: "#aab4c8", segInk: "#1f232b",
    },
    stops: [
      [136, 192, 208], [129, 161, 193], [180, 142, 173],
      [143, 188, 187], [163, 190, 140], [208, 135, 112],
    ],
  },
  // catppuccin, mocha flavor — soothing pastels
  "catppuccin-mocha": {
    colors: {
      bg: "#1e1e2e", bgPanel: "#181825", bgHi: "#313244",
      fg: "#cdd6f4", fgDim: "#6c7086", fgFaint: "#45475a",
      blue: "#89b4fa", cyan: "#89dceb", teal: "#94e2d5", green: "#a6e3a1",
      yellow: "#f9e2af", orange: "#fab387", red: "#f38ba8", magenta: "#cba6f7",
      seg0: "#b4befe", seg1: "#89b4fa", seg2: "#45475a", seg3: "#313244",
      seg4: "#292c3d", segFg: "#cdd6f4", segDim: "#a6adc8", segInk: "#11111b",
    },
    stops: [
      [137, 180, 250], [137, 220, 235], [203, 166, 247],
      [148, 226, 213], [166, 227, 161], [243, 139, 168],
    ],
  },
};

// The active light. T's identity never changes — every renderer reads
// through it — only its values swap when the lanterns do.
let themeName = "tokyonight";
const T = { ...THEMES.tokyonight.colors };

function applyTheme(name) {
  if (!THEMES[name]) name = "tokyonight";
  themeName = name;
  Object.assign(T, THEMES[name].colors);
  STOPS.splice(0, STOPS.length, ...THEMES[name].stops);
}

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const fg = (h) => `\x1b[38;2;${hex2rgb(h).join(";")}m`;
const bg = (h) => `\x1b[48;2;${hex2rgb(h).join(";")}m`;
const BOLD = "\x1b[1m";
const ITAL = "\x1b[3m";
const RESET = "\x1b[0m";

// Nerd-font glyphs (matches the Starship config)
const G = {
  branch: "",
  sep: "",
  sepL: "",
  sepThin: "",
  moon: "󰖔",
  sun: "",
  pkg: "",
  dot: "●",
  ahead: "⇡",
  behind: "⇣",
  commit: "",
  clock: "",
  remote: "",
  folder: "",
  file: "",
  term: "",
  edit: "",
  claude: "✳",
  agent: "◆",
  search: "",
  tag: "",
  users: "",
  pulse: "",
  warn: "",
  ok: "",
  lantern: "🏮",
  sake: "",
  copy: "",
  pr: "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Splash — figlet 'ANSI Shadow' logo with the athena-brain gradient recipe:
// per-char TokyoNight gradient, row-phased so it waves down the rows.
// Pre-rendered (zero deps); docs/banner.mjs uses the same art for the SVG.
// ─────────────────────────────────────────────────────────────────────────────

const ART = `
██╗███████╗ █████╗ ██╗  ██╗ █████╗ ██╗   ██╗ █████╗
██║╚══███╔╝██╔══██╗██║ ██╔╝██╔══██╗╚██╗ ██╔╝██╔══██╗
██║  ███╔╝ ███████║█████╔╝ ███████║ ╚████╔╝ ███████║
██║ ███╔╝  ██╔══██║██╔═██╗ ██╔══██║  ╚██╔╝  ██╔══██║
██║███████╗██║  ██║██║  ██╗██║  ██║   ██║   ██║  ██║
╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝
`.replace(/^\n|\n$/g, "").split("\n");

// Gradient stops, blue → cyan → purple → teal → green → pink in the house
// light; applyTheme swaps the contents in place when the lanterns change.
const STOPS = [...THEMES.tokyonight.stops];

const lerp = (a, b, t) => Math.round(a + (b - a) * t);
function gradColor(p) {
  const x = ((p % 1) + 1) % 1;
  const seg = x * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(seg));
  const t = seg - i;
  const [a, b] = [STOPS[i], STOPS[i + 1]];
  return `\x1b[38;2;${lerp(a[0], b[0], t)};${lerp(a[1], b[1], t)};${lerp(a[2], b[2], t)}m`;
}

function gradientLine(line, phase, spread = 0.9) {
  const n = Math.max(line.length, 1);
  let s = "";
  for (let i = 0; i < line.length; i++)
    s += line[i] === " " ? " " : gradColor((i / n) * spread + phase) + line[i];
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Kotowaza — traditional sayings, one poured on the way out. [jp, romaji, en]
// ─────────────────────────────────────────────────────────────────────────────

const SAYINGS = [
  ["七転び八起き", "nana korobi ya oki", "fall seven times, get up eight"],
  ["猿も木から落ちる", "saru mo ki kara ochiru", "even monkeys fall from trees"],
  ["石の上にも三年", "ishi no ue ni mo sannen", "three years sitting on a stone — patience prevails"],
  ["案ずるより産むが易し", "anzuru yori umu ga yasushi", "doing is easier than worrying about it"],
  ["井の中の蛙大海を知らず", "i no naka no kawazu taikai o shirazu", "a frog in a well knows nothing of the ocean"],
  ["花より団子", "hana yori dango", "dumplings over flowers — substance over style"],
  ["急がば回れ", "isogaba maware", "when in a hurry, take the long way around"],
  ["塵も積もれば山となる", "chiri mo tsumoreba yama to naru", "even dust, piled up, becomes a mountain"],
  ["出る杭は打たれる", "deru kui wa utareru", "the stake that sticks out gets hammered down"],
  ["蛙の子は蛙", "kaeru no ko wa kaeru", "the child of a frog is a frog"],
  ["二兎を追う者は一兎をも得ず", "nito o ou mono wa itto o mo ezu", "chase two hares and catch neither"],
  ["三人寄れば文殊の知恵", "sannin yoreba monju no chie", "three people together have the wisdom of Monju"],
  ["能ある鷹は爪を隠す", "nō aru taka wa tsume o kakusu", "the skilled hawk hides its talons"],
  ["十人十色", "jūnin toiro", "ten people, ten colors"],
  ["継続は力なり", "keizoku wa chikara nari", "persistence is power"],
  ["雨降って地固まる", "ame futte ji katamaru", "after the rain, the ground hardens"],
  ["口は災いの元", "kuchi wa wazawai no moto", "the mouth is the source of misfortune"],
  ["知らぬが仏", "shiranu ga hotoke", "not knowing is Buddha — ignorance is bliss"],
  ["猫に小判", "neko ni koban", "gold coins to a cat"],
  ["餅は餅屋", "mochi wa mochiya", "for mochi, go to the mochi maker"],
  ["灯台下暗し", "tōdai moto kurashi", "it is darkest at the base of the lighthouse"],
  ["百聞は一見に如かず", "hyakubun wa ikken ni shikazu", "hearing a hundred times is not worth one look"],
  ["良薬は口に苦し", "ryōyaku wa kuchi ni nigashi", "good medicine tastes bitter"],
  ["千里の道も一歩から", "senri no michi mo ippo kara", "a thousand-mile road begins with a single step"],
  ["笑う門には福来る", "warau kado ni wa fuku kitaru", "fortune comes to a laughing gate"],
  ["覆水盆に返らず", "fukusui bon ni kaerazu", "spilled water does not return to the tray"],
  ["木を見て森を見ず", "ki o mite mori o mizu", "seeing the trees, missing the forest"],
  ["一期一会", "ichigo ichie", "one time, one meeting — treasure every encounter"],
  ["弘法にも筆の誤り", "kōbō ni mo fude no ayamari", "even the master's brush slips"],
  ["終わり良ければ全て良し", "owari yokereba subete yoshi", "if the ending is good, everything is good"],
];

// All housekeeping lives under one cache dir — the sayings deck, the
// warm-start menu, and the seat file the iz() wrapper reads. XDG-aware:
// $XDG_CACHE_HOME when set, ~/.cache otherwise (unchanged on the mac
// reference build, where the env var is rarely set).
const CACHE_DIR = path.join(
  process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
  "izakaya"
);

// Deal sayings from a persistent shuffled deck instead of rolling dice —
// independent random draws repeat fast (birthday problem), so you'd hear
// "gold coins to a cat" three nights in a row. The cursor lives in the cache.
const SAYING_DECK = path.join(CACHE_DIR, "sayings.json");

function pickSaying() {
  let deck = null;
  try {
    deck = JSON.parse(fsSync.readFileSync(SAYING_DECK, "utf8"));
  } catch {}
  const stale =
    !deck || !Array.isArray(deck.order) ||
    deck.order.length !== SAYINGS.length || !(deck.next >= 0);
  if (stale || deck.next >= SAYINGS.length) {
    const last = deck?.order?.[SAYINGS.length - 1];
    const order = [...SAYINGS.keys()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    // don't let a fresh shuffle open with the saying that just closed the last
    if (order[0] === last) [order[0], order[1]] = [order[1], order[0]];
    deck = { order, next: 0 };
  }
  const idx = deck.order[deck.next++];
  try {
    fsSync.mkdirSync(path.dirname(SAYING_DECK), { recursive: true });
    fsSync.writeFileSync(SAYING_DECK, JSON.stringify(deck));
  } catch {}
  return SAYINGS[idx];
}

// ─────────────────────────────────────────────────────────────────────────────
// Languages — extension map with TokyoNight-friendly colors + nerd icons
// ─────────────────────────────────────────────────────────────────────────────

const LANGS = {
  ts: { name: "TypeScript", color: "blue", icon: "" },
  tsx: { name: "TypeScript", color: "blue", icon: "" },
  mts: { name: "TypeScript", color: "blue", icon: "" },
  cts: { name: "TypeScript", color: "blue", icon: "" },
  js: { name: "JavaScript", color: "yellow", icon: "" },
  jsx: { name: "JavaScript", color: "yellow", icon: "" },
  mjs: { name: "JavaScript", color: "yellow", icon: "" },
  cjs: { name: "JavaScript", color: "yellow", icon: "" },
  astro: { name: "Astro", color: "orange", icon: "" },
  svelte: { name: "Svelte", color: "orange", icon: "" },
  vue: { name: "Vue", color: "green", icon: "" },
  rs: { name: "Rust", color: "orange", icon: "" },
  go: { name: "Go", color: "cyan", icon: "" },
  py: { name: "Python", color: "green", icon: "" },
  rb: { name: "Ruby", color: "red", icon: "" },
  php: { name: "PHP", color: "magenta", icon: "" },
  swift: { name: "Swift", color: "orange", icon: "" },
  css: { name: "CSS", color: "magenta", icon: "" },
  scss: { name: "SCSS", color: "magenta", icon: "" },
  html: { name: "HTML", color: "red", icon: "" },
  md: { name: "Markdown", color: "fgDim", icon: "" },
  mdx: { name: "MDX", color: "fgDim", icon: "" },
  json: { name: "JSON", color: "teal", icon: "" },
  jsonc: { name: "JSON", color: "teal", icon: "" },
  toml: { name: "TOML", color: "teal", icon: "" },
  yaml: { name: "YAML", color: "teal", icon: "" },
  yml: { name: "YAML", color: "teal", icon: "" },
  sql: { name: "SQL", color: "cyan", icon: "" },
  sh: { name: "Shell", color: "green", icon: "" },
  zsh: { name: "Shell", color: "green", icon: "" },
  bash: { name: "Shell", color: "green", icon: "" },
};

// Colors above are T-key names, not hexes, so plates repaint when the
// lanterns change — and the cached menu stores language *names* only.
// Resolve name → { color, icon } at render time.
function langMeta(name) {
  const l = Object.values(LANGS).find((x) => x.name === name);
  return { color: l ? T[l.color] : T.fgDim, icon: l?.icon || "" };
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".astro", ".wrangler", ".next",
  ".svelte-kit", "vendor", "target", "coverage", ".cache", ".turbo", "out",
  ".vercel", ".output", ".DS_Store",
]);

// Stack detection — "today's specials"
const STACK_CHIPS = [
  { dep: "hono", label: " hono", color: "orange" },
  { dep: "react", label: " react", color: "cyan" },
  { dep: "astro", label: " astro", color: "orange" },
  { dep: "vite", label: " vite", color: "magenta" },
  { dep: "drizzle-orm", label: " drizzle", color: "green" },
  { dep: "tailwindcss", label: "󱏿 tailwind", color: "cyan" },
  { dep: "svelte", label: " svelte", color: "orange" },
  { dep: "next", label: " next", color: "fg" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Width-aware string helpers (ANSI + CJK double-width)
// ─────────────────────────────────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function charW(cp) {
  // CJK + fullwidth ranges render double-width; emoji presentation too.
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff)
  )
    return 2;
  return 1;
}

function visW(s) {
  let w = 0;
  for (const ch of s.replace(ANSI_RE, "")) w += charW(ch.codePointAt(0));
  return w;
}

// Truncate to visible width, preserving ANSI codes.
function truncW(s, max) {
  if (visW(s) <= max) return s;
  let out = "", w = 0, i = 0;
  while (i < s.length) {
    const m = /^\x1b\[[0-9;]*m/.exec(s.slice(i));
    if (m) { out += m[0]; i += m[0].length; continue; }
    const ch = String.fromCodePoint(s.codePointAt(i));
    const cw = charW(ch.codePointAt(0));
    if (w + cw > max - 1) break;
    out += ch; w += cw; i += ch.length;
  }
  return out + fg(T.fgDim) + "…";
}

const padW = (s, width) => s + " ".repeat(Math.max(0, width - visW(s)));

function relTime(unix) {
  if (!unix) return "—";
  const s = Math.floor(Date.now() / 1000) - unix;
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB"];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n >= 10 ? 0 : 1)} ${u[i]}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scanning
// ─────────────────────────────────────────────────────────────────────────────

// The bar can stand anywhere: argument > $IZAKAYA_ROOT > the saved answer >
// asking on the first visit. `w` moves it any time; the answer lives in
// ~/.config/izakaya/config.json.
const CONFIG_FILE = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
  "izakaya",
  "config.json"
);

function loadConfig() {
  try {
    return JSON.parse(fsSync.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveConfig(patch) {
  try {
    const cfg = { ...loadConfig(), ...patch };
    fsSync.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fsSync.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
  } catch {}
}

// Agents are adapters, not a house allegiance. Built-ins know how to find
// their own local sessions; user-defined adapters only launch commands from
// izakaya's global config (never from a repo being browsed).
const BUILTIN_AGENTS = [
  { id: "claude", label: "Claude Code", command: "claude", resume: "claude --continue", icon: "claude" },
  { id: "codex", label: "Codex", command: "codex", resume: "codex resume --last", icon: "agent" },
];

function agentDefinitions(config = loadConfig()) {
  const agents = [...BUILTIN_AGENTS];
  const seen = new Set(agents.map((a) => a.id));
  if (!Array.isArray(config.agents)) return agents;
  for (const raw of config.agents) {
    if (!raw || typeof raw !== "object") continue;
    const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 40) : "";
    const command = typeof raw.command === "string" ? raw.command.trim() : "";
    const id = (typeof raw.id === "string" ? raw.id : label)
      .toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
    if (!id || !label || !command || seen.has(id)) continue;
    const resume = typeof raw.resume === "string" && raw.resume.trim()
      ? raw.resume.trim()
      : null;
    agents.push({ id, label, command, resume, icon: "agent", custom: true });
    seen.add(id);
  }
  return agents;
}

// The bar's own roster, read once — render asks for it every frame, and a
// config read per frame is a disk hit per frame. A rescan (r) re-reads it,
// so a newly added agent is a keypress away.
let agentRoster = null;
const agentsOnFile = () => (agentRoster ??= agentDefinitions());

function codexSessionMeta(text) {
  const cwdMatch = text.match(/"cwd"\s*:\s*("(?:\\.|[^"\\])*")/);
  if (!cwdMatch) return null;
  try {
    return { cwd: JSON.parse(cwdMatch[1]) };
  } catch {
    return null;
  }
}

let codexSessionsPromise;
const codexCwdByFile = new Map(); // session file → its cwd, read once ever
async function codexSessionIndex() {
  if (codexSessionsPromise) return codexSessionsPromise;
  codexSessionsPromise = (async () => {
    const found = new Map();
    const walk = async (dir) => {
      let entries;
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) { await walk(file); continue; }
        if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
        let handle;
        try {
          const st = await fs.stat(file);
          let cwd = codexCwdByFile.get(file);
          if (cwd === undefined) {
            handle = await fs.open(file, "r");
            const buf = Buffer.alloc(32768);
            const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
            cwd = codexSessionMeta(buf.toString("utf8", 0, bytesRead))?.cwd || null;
            // a file too young to have written its meta yet gets asked again
            if (cwd || bytesRead >= buf.length) codexCwdByFile.set(file, cwd);
          }
          if (!cwd) continue;
          const key = path.resolve(cwd);
          found.set(key, Math.max(found.get(key) || 0, Math.floor(st.mtimeMs / 1000)));
        } catch {} finally {
          try { await handle?.close(); } catch {}
        }
      }
    };
    await walk(path.join(os.homedir(), ".codex", "sessions"));
    return found;
  })();
  return codexSessionsPromise;
}

const expandHome = (p) =>
  p === "~" ? os.homedir() : p.replace(/^~\//, os.homedir() + "/");

// Flags before the bar opens. A leading flag is never a root path. Imported
// (IS_MAIN false) the argv belongs to someone else — the test runner's flags
// must not print a version and exit.
const ARGV = IS_MAIN ? process.argv.slice(2) : [];
if (ARGV.includes("--version") || ARGV.includes("-v")) {
  process.stdout.write(`izakaya ${versionString()}\n`);
  process.exit(0);
}
if (ARGV.includes("--help") || ARGV.includes("-h")) {
  process.stdout.write(
    `居酒屋 izakaya — your repos as the menu at a small Tokyo bar.\n\n` +
      `usage: izakaya [root] [query]\n\n` +
      `  [root]        directory of repos to scan — anything that looks like a\n` +
      `                path: ~/…, /…, ./… (default: $IZAKAYA_ROOT, saved\n` +
      `                config, then ~/code — asked on first visit)\n` +
      `  [query]       a bare word fuzzy-filters the menu; when exactly one\n` +
      `                plate matches, you're seated without the bar opening\n` +
      `                (the iz() wrapper cd's you straight there)\n` +
      `  --report      the takeout window: scan every plate and print the\n` +
      `                menu as JSON — no TTY needed, made for scripts and agents\n` +
      `  --closing-time  work that exists only on this machine — dirty files,\n` +
      `                stashes, unpushed pours, repos with no remote. Plain\n` +
      `                text (add --json for data); exits 1 when plates are at\n` +
      `                risk, 0 when the stove is clean\n` +
      `  --standup     your own pours across every plate since the last\n` +
      `                workday (Monday looks back to Friday) — plain text,\n` +
      `                or --json. You are git's user.name or user.email\n` +
      `                ($IZAKAYA_AUTHOR, a git --author pattern, overrides)\n` +
      `  -v, --version print the version and leave\n` +
      `  -h, --help    show this and leave\n\n` +
      `Once you're in, press ? for the keys. またね.\n`
  );
  process.exit(0);
}

// The takeout window — --report and --closing-time serve the scanner without
// opening the bar. Parsed here with the other flags; poured at the bottom of
// the file, once ROOT has resolved.
const TAKEOUT = ARGV.includes("--report")
  ? "report"
  : ARGV.includes("--closing-time")
    ? "closing-time"
    : ARGV.includes("--standup")
      ? "standup"
      : null;
const TAKEOUT_JSON = ARGV.includes("--json");

// A path-looking word (~/…, /…, ./…, or anything with a slash) is the root;
// a bare word rides in as a fuzzy query — `iz ramen`.
const ARG_WORDS = ARGV.filter((a) => !a.startsWith("-"));
const looksLikePath = (a) => /^[~/.]/.test(a) || a.includes("/");
const ARG_ROOT =
  ARG_WORDS.find(looksLikePath) || process.env.IZAKAYA_ROOT || null;
const ARG_QUERY = ARG_WORDS.find((a) => !looksLikePath(a)) || null;
let ROOT = path.resolve(
  expandHome(ARG_ROOT || loadConfig().root || path.join(os.homedir(), "code"))
);
// Nothing pointed the way and nothing is saved — ask before opening.
const FIRST_VISIT = !ARG_ROOT && !loadConfig().root;

// Hang tonight's lanterns before anything paints: env > config > the house
// light. (T cycles them live once the bar is open.)
applyTheme(process.env.IZAKAYA_THEME || loadConfig().theme || "tokyonight");

// IZAKAYA_DEMO=1 keeps launch flashes but skips the real launches —
// used by docs/demo.tape so recording the GIF doesn't spawn windows.
const DEMO = !!process.env.IZAKAYA_DEMO;

// Warm start: last visit's menu, keyed by root so the demo bar and the real
// one never mix. The bar opens instantly on yesterday's plates while the
// kitchen re-checks every one of them. The seat file is the cd target for
// the iz() shell wrapper (see README) — written on ↵, eaten by the wrapper.
const MENU_CACHE = path.join(CACHE_DIR, "menu.json");
const SEAT_FILE = path.join(CACHE_DIR, "seat");

// The cached menu carries a schema stamp. A plate shape from an older build —
// missing `recent`, say — would crash the first paint before the rescan could
// heal it, so a mismatched cache is simply thrown out and rebuilt. Bump this
// whenever a field is added to (or changed on) the repo object. (9: plates
// are scrubbed of control characters at scan time — older caches weren't.)
const MENU_V = 9;

function loadMenu() {
  if (DEMO) return null;
  try {
    const all = JSON.parse(fsSync.readFileSync(MENU_CACHE, "utf8"));
    if (all.v !== MENU_V) return null;
    const repos = all.menus?.[ROOT];
    if (Array.isArray(repos) && repos.length) return repos;
  } catch {}
  return null;
}

function saveMenu() {
  if (DEMO) return;
  try {
    let all = {};
    try { all = JSON.parse(fsSync.readFileSync(MENU_CACHE, "utf8")); } catch {}
    if (all.v !== MENU_V) all = { v: MENU_V, menus: {} };
    // session-only garnish (the teal "since your last visit" marks, gh's
    // answers) stays out of the cache — next visit asks fresh. So do side
    // rooms: nothing re-pours a cached child, so they're poured on demand.
    all.menus[ROOT] = state.repos.map(({ fresh, gh, children, expanded, ...r }) => ({
      ...r, children: null, expanded: false,
    }));
    fsSync.mkdirSync(path.dirname(MENU_CACHE), { recursive: true });
    fsSync.writeFileSync(MENU_CACHE, JSON.stringify(all));
  } catch {}
}

async function git(cwd, ...args) {
  try {
    const { stdout } = await execFile("git", args, { cwd, timeout: 5000 });
    // trailing only — `status --porcelain` carries a leading status column
    // (e.g. " M file" for an unstaged change) that a full trim() would eat
    return stdout.replace(/\s+$/, "");
  } catch {
    return null;
  }
}

// Anything a scanned repo wrote — a commit subject, an author, a README
// line, a folder name — is someone else's text. Raw, it could carry escape
// sequences that talk to the terminal directly (retitle the window, write
// the clipboard via OSC 52). Tabs become a space; every other C0/C1 control
// comes off before the text is ever put on a plate.
const scrubText = (s) =>
  typeof s === "string" ? s.replaceAll("\t", " ").replace(/[\x00-\x1f\x7f-\x9f]/g, "") : s;

// origin's url, made fit for the menu: any embedded user:token@ credential
// (an https PAT, say) is stripped first, then the scheme and .git chrome.
function scrubRemote(url) {
  return url
    .replace(/\/\/[^/@]+@/, "//")
    .replace(/^git@([^:]+):/, "$1/")
    .replace(/^(?:git\+)?ssh:\/\//, "")
    .replace(/^https?:\/\//, "")
    .replace(/\.git$/, "");
}

async function walkStats(dir, acc, depth = 0) {
  if (depth > 7 || acc.files > 6000) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.isDirectory()) continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walkStats(p, acc, depth + 1);
    } else if (e.isFile()) {
      acc.files++;
      const ext = path.extname(e.name).slice(1).toLowerCase();
      let size = 0;
      try {
        const st = await fs.stat(p);
        size = st.size;
        if (st.mtimeMs > acc.newest) acc.newest = st.mtimeMs;
      } catch {}
      acc.bytes += size;
      const lang = LANGS[ext];
      if (lang) acc.langs[lang.name] = (acc.langs[lang.name] || 0) + size;
    }
  }
}

// Scanning pours twice. The first pour (scanRepo) is everything the menu
// row and the top of a plate need — five cheap git asks plus the pantry
// walk — so the whole menu is out fast. The second pour (enrichRepo) is the
// history: the 300–500-commit log walks behind the sparkline, the chefs,
// and the AI tally. It simmers after the menu is up. These are the fields
// the second pour owns; a warm-started plate keeps its cached values until
// they're replaced, and `cooked` marks a plate whose history is current.
const ENRICH_KEYS = [
  "commits", "recent", "weeks", "chefs", "branches", "tags", "stash",
  "unpushed", "ai", "worktrees", "cooked",
];

// `git worktree list --porcelain` → the side kitchens: every linked worktree
// (the main one is the plate itself, so it's left off) with its branch, or
// "detached". Agents that work in parallel usually work in these.
function parseWorktrees(text) {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((block) => {
      const wt = { path: null, branch: null };
      for (const line of block.split("\n")) {
        if (line.startsWith("worktree ")) wt.path = line.slice(9);
        else if (line.startsWith("branch ")) wt.branch = line.slice(7).replace(/^refs\/heads\//, "");
        else if (line === "detached") wt.branch = "detached";
      }
      return wt;
    })
    .filter((wt) => wt.path)
    .slice(1)
    .map((wt) => ({ path: scrubText(wt.path), branch: scrubText(wt.branch || "detached") }));
}

async function scanRepo(dirent, base = ROOT, depth = 0) {
  const dir = path.join(base, dirent.name);
  const repo = {
    name: scrubText(dirent.name), // display only — `dir` keeps the real bytes
    dir,
    depth,
    children: null, // immediate subfolders, poured lazily when expanded
    expanded: false,
    isGit: false,
    branch: null,
    defaultBranch: null, // origin's HEAD, when the clone knows it
    dirty: 0,
    changes: [],
    ahead: 0,
    behind: 0,
    commits: 0,
    lastMsg: null,
    lastAuthor: null,
    lastUnix: 0,
    touchedUnix: 0, // newest uncommitted edit (git) or newest file (not git)
    remote: null,
    files: 0,
    bytes: 0,
    langs: [],
    chips: [],
    version: null,
    ai: null,
    agents: [], // local agent sessions associated with this exact path
    hasClaudeMd: false,
    hasAgentsMd: false,
    readmeTitle: null,
    recent: [],
    weeks: new Array(12).fill(0),
    chefs: [],
    branches: 0,
    tags: 0,
    stash: 0,
    worktrees: [], // linked worktrees — {path, branch}
    unpushed: 0, // commits on any local branch that no remote has
    cooked: false, // true once enrichRepo's history has landed
  };

  try {
    await fs.access(path.join(dir, ".git"));
    repo.isGit = true;
  } catch {}

  if (repo.isGit) {
    const [branch, status, log, remote, ab, originHead] = await Promise.all([
      git(dir, "rev-parse", "--abbrev-ref", "HEAD"),
      git(dir, "status", "--porcelain"),
      git(dir, "log", "-1", "--format=%s%x00%an%x00%ct"),
      git(dir, "remote", "get-url", "origin"),
      git(dir, "rev-list", "--left-right", "--count", "@{u}...HEAD"),
      git(dir, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"),
    ]);
    repo.branch = branch || "—";
    if (originHead) repo.defaultBranch = originHead.replace(/^origin\//, "");
    repo.dirty = status ? status.split("\n").filter(Boolean).length : 0;
    // keep the porcelain itself — the open tab lists what's still unsettled.
    // XY: index status, worktree status, then a space, then the path. Capped
    // so a runaway working tree can't bloat the cached menu.
    if (status)
      repo.changes = status
        .split("\n")
        .filter(Boolean)
        .slice(0, 200)
        .map((l) => ({ xy: l.slice(0, 2), path: l.slice(3) }));
    // when you last had your hands on it — the newest uncommitted edit. A
    // plate you're mid-way through shouldn't sink below last week's commit.
    for (const ch of repo.changes) {
      try {
        const st = await fs.stat(path.join(dir, changePath(ch)));
        repo.touchedUnix = Math.max(repo.touchedUnix, Math.floor(st.mtimeMs / 1000));
      } catch {} // deleted files have no mtime to give
    }
    if (log) {
      const [msg, author, ct] = log.split("\0");
      repo.lastMsg = scrubText(msg);
      repo.lastAuthor = scrubText(author);
      repo.lastUnix = parseInt(ct, 10) || 0;
    }
    if (remote) repo.remote = scrubText(scrubRemote(remote));
    if (ab) {
      const [behind, ahead] = ab.split(/\s+/).map((n) => parseInt(n, 10) || 0);
      repo.behind = behind;
      repo.ahead = ahead;
    }
  }

  const acc = { files: 0, bytes: 0, langs: {}, newest: 0 };
  await walkStats(dir, acc);
  repo.files = acc.files;
  repo.bytes = acc.bytes;
  // a folder with no history still has a last-touched time: its newest file
  if (!repo.isGit) repo.touchedUnix = Math.floor(acc.newest / 1000);
  const total = Object.values(acc.langs).reduce((a, b) => a + b, 0) || 1;
  // names + percentages only — color and icon resolve at render (langMeta),
  // so a cached plate never carries a stale theme's paint
  repo.langs = Object.entries(acc.langs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, bytes]) => ({ name, pct: (bytes / total) * 100 }));

  try {
    const pkg = JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const chip of STACK_CHIPS) if (deps[chip.dep]) repo.chips.push(chip);
    if (typeof pkg.version === "string") repo.version = scrubText(pkg.version).slice(0, 32);
  } catch {}
  for (const wf of ["wrangler.jsonc", "wrangler.json", "wrangler.toml"]) {
    try {
      await fs.access(path.join(dir, wf));
      repo.chips.unshift({ label: " worker", color: "orange" });
      break;
    } catch {}
  }

  try {
    await fs.access(path.join(dir, "CLAUDE.md"));
    repo.hasClaudeMd = true;
  } catch {}
  try {
    await fs.access(path.join(dir, "AGENTS.md"));
    repo.hasAgentsMd = true;
  } catch {}

  repo.agents = await agentSessions(dir);

  for (const rm of ["README.md", "readme.md", "README"]) {
    try {
      const head = (await fs.readFile(path.join(dir, rm), "utf8")).split("\n");
      // first line of actual prose — skip headings, HTML, badges, images,
      // blockquotes, tables, rules, and frontmatter fences
      const line =
        head.find((l) => {
          const t = l.trim();
          return t && !/^[#<!\[>|`:=~-]/.test(t);
        }) || head.find((l) => l.trim());
      repo.readmeTitle =
        scrubText(line)?.replace(/^#+\s*/, "").replace(/[*_`>]/g, "").trim().slice(0, 120) || null;
      break;
    } catch {}
  }

  return repo;
}

// Who's at the bar right now — a Claude Code session dir for this repo
// means Claude has sat here before. The path encoding mirrors Claude
// Code's own: every character that isn't a letter or digit becomes a dash
// (the older / and . only form is checked too — identical for plain
// names). The newest session file's mtime is when it last spoke. Codex
// keeps one index for every cwd; see codexSessionIndex.
async function agentSessions(dir) {
  const agents = [];
  let latest = 0;
  const projects = path.join(os.homedir(), ".claude", "projects");
  for (const enc of new Set([dir.replace(/[^a-zA-Z0-9]/g, "-"), dir.replace(/[/.]/g, "-")])) {
    const proj = path.join(projects, enc);
    try {
      for (const f of await fs.readdir(proj)) {
        if (!f.endsWith(".jsonl")) continue;
        try {
          const st = await fs.stat(path.join(proj, f));
          if (st.mtimeMs > latest) latest = st.mtimeMs;
        } catch {}
      }
    } catch {}
  }
  if (latest) agents.push({ id: "claude", lastUnix: Math.floor(latest / 1000) });
  try {
    const lastUnix = (await codexSessionIndex()).get(path.resolve(dir));
    if (lastUnix) agents.push({ id: "codex", lastUnix });
  } catch {}
  return agents;
}

// An agent whose session file moved in the last couple of minutes is still
// talking — it's cooking at this plate right now.
const LIVE_S = 120;
const agentLive = (repo, now = Date.now() / 1000) =>
  !!repo.agents?.some((a) => now - a.lastUnix < LIVE_S);

// The nested menu mirrors the filesystem: every ordinary immediate subfolder
// is a destination. Generated/vendor folders stay off the menu via SKIP_DIRS,
// and dot-directories remain hidden just as they are at the top-level bar.
async function folderChildren(repo) {
  let entries;
  try {
    entries = await fs.readdir(repo.dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter(
    (e) => e.isDirectory() && !e.name.startsWith(".") && !SKIP_DIRS.has(e.name)
  );
}

// Pour a plate's side rooms — both pours for every immediate subfolder, four
// at a time like the main kitchen, so a folder of a hundred packages can't
// fork a thousand gits at once. A side room that was open stays open, and
// its own rooms are re-poured too. Returns the children sorted like the menu.
async function pourChildren(repo) {
  const dirs = await folderChildren(repo);
  const before = new Map((repo.children || []).map((c) => [c.dir, c]));
  const children = new Array(dirs.length);
  const queue = dirs.map((d, i) => [d, i]);
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const [d, i] = queue.shift();
        const child = await scanRepo(d, repo.dir, (repo.depth || 0) + 1);
        Object.assign(child, await enrichRepo(child));
        const was = before.get(child.dir);
        if (was?.expanded && was.children) {
          child.children = was.children;
          child.children = await pourChildren(child);
          child.expanded = true;
        }
        children[i] = child;
      }
    })
  );
  // served in the menu's order — a re-pour that lands unsorted would slide
  // the cursor onto a neighbor before applySort could find it again
  return children.sort(SORTS[state.sort]);
}

// Who else was behind the bar. Coding agents sign the pours they help with
// in a Co-authored-by trailer — Claude Code names its model
// (`Claude Opus 4.7 <noreply@anthropic.com>`), the others their house. Only
// the signature counts: an agent that leaves no trailer leaves no mark here.
// Order matters — the first hand whose pattern fits the line claims it.
const AI_HANDS = [
  { agent: "Claude", re: /claude|anthropic/i },
  { agent: "Codex", re: /codex|openai/i },
  { agent: "Copilot", re: /copilot/i },
  { agent: "Cursor", re: /cursor/i },
  { agent: "Aider", re: /aider/i },
  { agent: "Gemini", re: /gemini/i },
];

// Commit bodies (hash \x1f body \x1e, as enrichRepo asks git for them) → the
// tally: how many of these pours an agent signed, and which hands/models.
// null when no agent signed any of them.
function aiTally(log) {
  if (!log) return null;
  const counts = new Map(); // label → { agent, count }
  let total = 0, assisted = 0;
  for (const rec of log.split("\x1e")) {
    const cut = rec.indexOf("\x1f");
    if (cut < 0) continue; // trailing split artifact / non-commit chaff
    total++;
    const seen = new Map(); // one commit can name a hand more than once
    for (const line of rec.slice(cut + 1).split("\n")) {
      if (!/co-?authored-by:/i.test(line)) continue;
      const hand = AI_HANDS.find((h) => h.re.test(line));
      if (!hand) continue;
      let label = hand.agent;
      if (hand.agent === "Claude") {
        const m = line.match(/Claude\s+(Opus|Sonnet|Haiku|Fable)\s+([\d.]+)/i);
        if (m) label = `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`;
      }
      seen.set(label, hand.agent);
    }
    if (!seen.size) continue;
    assisted++;
    for (const [label, agent] of seen) {
      const c = counts.get(label) || { agent, count: 0 };
      c.count++;
      counts.set(label, c);
    }
  }
  if (!assisted) return null;
  return {
    models: [...counts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([label, { agent, count }]) => ({ label, agent, count })),
    assisted,
    total,
  };
}

// The second pour — the plate's history. Nine more git asks that no menu
// row waits on: commit count, the recent pours, twelve weeks of activity,
// the chefs, the shelf, and who else was behind the bar. Returns just the
// fields it owns (ENRICH_KEYS), merged onto the live plate by the caller.
async function enrichRepo(repo) {
  if (!repo.isGit) return { cooked: true };
  const dir = repo.dir;
  const [count, recent, activity, authors, branches, tags, stash, unpushed, aiLog, wts] =
    await Promise.all([
      git(dir, "rev-list", "--count", "HEAD"),
      git(dir, "log", "-4", "--format=%ct%x00%s"),
      git(dir, "log", "--since=84.days", "--format=%ct", "-n", "500"),
      git(dir, "log", "--format=%an", "-n", "300"),
      git(dir, "branch", "--format=%(refname:short)"),
      git(dir, "tag"),
      git(dir, "stash", "list"),
      // every commit on any local branch that no remote knows — not just the
      // current branch's ahead count. This is what the closing-time check reads.
      git(dir, "rev-list", "--count", "--branches", "--not", "--remotes"),
      // commit bodies, hash-keyed, to sniff agent co-author trailers
      git(dir, "log", "--format=%H%x1f%b%x1e", "-n", "500"),
      git(dir, "worktree", "list", "--porcelain"),
    ]);

  const more = {
    commits: parseInt(count || "0", 10) || 0,
    recent: [],
    weeks: new Array(12).fill(0),
    chefs: [],
    branches: branches ? branches.split("\n").filter(Boolean).length : 0,
    tags: tags ? tags.split("\n").filter(Boolean).length : 0,
    stash: stash ? stash.split("\n").filter(Boolean).length : 0,
    unpushed: parseInt(unpushed || "0", 10) || 0,
    ai: null,
    cooked: true,
  };

  if (recent)
    more.recent = recent.split("\n").filter(Boolean).map((l) => {
      const [ct, msg] = l.split("\0");
      return { ct: parseInt(ct, 10) || 0, msg: scrubText(msg || "") };
    });
  if (activity) {
    const now = Date.now() / 1000;
    for (const l of activity.split("\n")) {
      const ct = parseInt(l, 10);
      if (!ct) continue;
      const idx = 11 - Math.floor((now - ct) / (7 * 86400));
      if (idx >= 0 && idx <= 11) more.weeks[idx]++;
    }
  }
  if (authors) {
    const m = new Map();
    for (const raw of authors.split("\n")) {
      const a = scrubText(raw);
      if (a) m.set(a, (m.get(a) || 0) + 1);
    }
    more.chefs = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3);
  }

  more.ai = aiTally(aiLog);
  more.worktrees = parseWorktrees(wts);

  return more;
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

const state = {
  repos: [],
  sel: 0,
  scroll: 0,
  scanning: true,
  enriching: false, // the menu is out; the history is still simmering
  scanned: 0,
  toScan: 0,
  sort: "recent", // recent | name | size
  status: "",
  splash: true,
  phase: 0,
  filter: "",
  filtering: false,
  dirtyOnly: false,
  help: false,
  focus: "menu", // "menu" browses the board | "board" steps behind the bar
  boardSel: 0, // which file on the open tab the cursor is standing on
  peek: null, // the pour, line by line — a file's diff drawn over the board
  detailScroll: 0,
  asking: false, // the "where does the work live?" scene
  askCancel: false, // esc returns to the bar (runtime `w`) vs first visit
  rootInput: "",
  askErr: "",
  ambient: "", // the bar quietly lives when you've been idle a while
  stove: null, // closing time — {scroll} while the sweep is on screen
  agentPicker: null, // {repoDir, sel} — choose an agent for the exact plate
  colophon: false,
  leaving: false,
  saying: null,
};

// Fuzzy match, launcher-style: every query char must appear in order, and
// the score prefers matches at the start, after a -_. boundary, and runs of
// adjacent hits — so `izk` finds izakaya and `rr` finds ramen-router.
// Returns -1 when the name doesn't match at all.
function fuzzyScore(query, name) {
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  let qi = 0, score = 0, prev = -2;
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] !== q[qi]) continue;
    score += i === 0 || "-_. ".includes(n[i - 1]) ? 3 : 1;
    if (i === prev + 1) score += 2;
    prev = i;
    qi++;
  }
  // a light length penalty so the tighter name wins a tie
  return qi === q.length ? score - n.length * 0.01 : -1;
}

function treeRepos(repos = state.repos) {
  const flat = [];
  for (const repo of repos) {
    flat.push(repo);
    if (repo.expanded && repo.children?.length) flat.push(...treeRepos(repo.children));
  }
  return flat;
}

const visible = () => {
  let rs = treeRepos();
  if (state.dirtyOnly) rs = rs.filter((r) => r.dirty > 0);
  if (state.filter)
    rs = rs
      .map((r) => [fuzzyScore(state.filter, r.name), r])
      .filter(([s]) => s >= 0)
      .sort((a, b) => b[0] - a[0])
      .map(([, r]) => r);
  return rs;
};

function clampSel() {
  state.sel = Math.max(0, Math.min(visible().length - 1, state.sel));
}

const SPLASH_MIN_MS = 1600;
let splashStart = Date.now();

// The neon flows while the curtain is up: tick the gradient phase ~20fps.
// (No timer when imported — a test run must be free to end — and none at
// the takeout window, where a splash frame would land in someone's pipe.)
const splashTimer = IS_MAIN && !TAKEOUT
  ? setInterval(() => {
      if (state.splash) {
        state.phase += 0.016;
        render();
      }
    }, 50)
  : null;

// The bar knows what hour it is.
function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "おはよう — morning at the bar";
  if (h < 17) return "いらっしゃいませ — welcome in";
  if (h < 23) return "こんばんは — evening at the bar";
  return "もう遅いね — last call, friend";
}

function endSplash() {
  if (!state.splash) return;
  state.splash = false;
  clearInterval(splashTimer);
  startSweep();
  // the delta flash may already be up — the greeting is fluff, it can yield
  if (!state.status) flash(greeting());
}

// Drop the curtain once the first scan is done and the logo has had its moment.
function maybeEndSplash() {
  const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - splashStart));
  setTimeout(endSplash, wait);
}

const SORTS = {
  recent: (a, b) => lastSeen(b) - lastSeen(a),
  name: (a, b) => a.name.localeCompare(b.name),
  size: (a, b) => b.bytes - a.bytes,
};

function applySort() {
  const cur = visible()[state.sel]?.dir;
  const sortTree = (repos) => {
    repos.sort(SORTS[state.sort]);
    for (const repo of repos) if (repo.children) sortTree(repo.children);
  };
  sortTree(state.repos);
  if (cur) {
    const i = visible().findIndex((r) => r.dir === cur);
    if (i >= 0) state.sel = i;
  }
  clampSel();
}

// The ritual: yesterday's cached menu, held from boot, against tonight's
// fresh scan — what changed while you were gone. Reported once, on the first
// full pour of the session; plates that took new pours carry a teal + until
// the next rescan reads them again.
let lastVisitMenu = null;
let visitNoted = false;

function noteVisitDelta() {
  if (visitNoted) return;
  visitNoted = true;
  if (!lastVisitMenu) return;
  const before = new Map(lastVisitMenu.map((r) => [r.name, r]));
  let pours = 0, plates = 0, newDirty = 0;
  const arrivals = [];
  for (const r of state.repos) {
    const b = before.get(r.name);
    if (!b) { arrivals.push(r.name); continue; }
    const d = r.commits - b.commits;
    if (d > 0) { r.fresh = d; pours += d; plates++; }
    if (r.dirty > 0 && !b.dirty) newDirty++;
  }
  const gone = lastVisitMenu.filter((b) => !state.repos.some((r) => r.name === b.name)).length;
  const bits = [];
  if (plates)
    bits.push(`${pours} new pour${pours === 1 ? "" : "s"} across ${plates} plate${plates === 1 ? "" : "s"}`);
  if (arrivals.length)
    bits.push(
      `${arrivals.slice(0, 2).join(", ")}${arrivals.length > 2 ? ` +${arrivals.length - 2}` : ""} joined the menu`
    );
  if (newDirty) bits.push(`${newDirty} newly unsettled`);
  if (gone) bits.push(`${gone} left the menu`);
  if (bits.length)
    flash(`${G.sake} since your last visit — ${bits.join("  ·  ")}`, 6000);
}

// Each scan carries a generation stamp; `w` mid-pour starts a new one, and
// workers from the old bar notice and set their trays down. Without it a
// moved ROOT mixes two streets' plates into one menu (scanRepo reads the
// global ROOT), and the mixed menu gets cached under the new address.
let scanGen = 0;

async function scanAll() {
  const gen = ++scanGen;
  codexSessionsPromise = undefined; // a rescan should notice newly opened sessions
  agentRoster = null; // …and a freshly edited agent roster
  state.scanning = true;
  state.enriching = false;
  // Warm starts keep the cached menu on screen and refresh plates in place;
  // cold starts (and the very first run) build it from nothing.
  const warm = state.repos.length > 0;
  if (!warm) {
    state.sel = 0;
    state.scroll = 0;
  }
  render();
  let entries;
  try {
    entries = await fs.readdir(ROOT, { withFileTypes: true });
  } catch (e) {
    if (gen !== scanGen) return; // the bar already moved on — die quietly
    die(`cannot read ${ROOT}: ${e.message}`);
  }
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith("."));
  state.toScan = dirs.length;
  state.scanned = 0;
  if (warm) {
    // plates that left the menu since last visit come off the board now
    const onMenu = new Set(dirs.map((d) => path.join(ROOT, d.name)));
    state.repos = state.repos.filter((r) => onMenu.has(r.dir));
    applySort();
  }
  // First pour: the cheap pass, 4-wide, rendered as plates arrive. A plate
  // already on the board keeps its slow-cooked history (and gh's answer)
  // until the second pour replaces it — a warm start must not blank the
  // kitchen it just showed.
  const queue = [...dirs];
  const pourStart = Date.now();
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      if (gen !== scanGen) return; // stale pour — drop the tray
      const d = queue.shift();
      const repo = await scanRepo(d);
      if (gen !== scanGen) return;
      const i = state.repos.findIndex((r) => r.dir === repo.dir);
      if (i >= 0) {
        for (const key of ENRICH_KEYS) repo[key] = state.repos[i][key];
        if (state.repos[i].gh !== undefined) repo.gh = state.repos[i].gh;
        repo.children = state.repos[i].children;
        repo.expanded = state.repos[i].expanded;
        state.repos[i] = repo;
      } else state.repos.push(repo);
      state.scanned++;
      applySort();
      // a cold pour re-sorts under you; until you've touched a key, the
      // cursor stays on the top of the menu rather than riding the first
      // plate that happened to arrive down the list
      if (!warm && lastInput < pourStart) state.sel = 0;
      // a rescan can shorten the open tab under the cursor — keep it on a file
      if (state.focus === "board")
        state.boardSel = Math.min(state.boardSel, Math.max(0, boardItems() - 1));
      render();
    }
  });
  await Promise.all(workers);
  if (gen !== scanGen) return;
  // the menu is fully out — drop the curtain and let the history simmer
  state.scanning = false;
  state.enriching = true;
  applySort();
  maybeEndSplash();
  render();

  // Second pour: the history queries, same width. Results land by name so a
  // rescan mid-simmer (a fresh gen) can't season a plate that already left.
  const pot = state.repos.slice();
  const cooks = Array.from({ length: 4 }, async () => {
    while (pot.length) {
      if (gen !== scanGen) return;
      const r = pot.shift();
      const more = await enrichRepo(r);
      if (gen !== scanGen) return;
      const live = state.repos.find((x) => x.dir === r.dir);
      if (live) Object.assign(live, more);
      render();
    }
  });
  await Promise.all(cooks);
  if (gen !== scanGen) return;
  // Side rooms: open ones are re-poured so a rescan never serves yesterday's
  // nested plates; closed ones are forgotten and poured fresh on the next →.
  for (const r of state.repos) {
    if (!r.children) continue;
    if (!r.expanded) { r.children = null; continue; }
    const kids = await pourChildren(r);
    if (gen !== scanGen) return;
    const live = findRepo(r.dir);
    if (live) live.children = kids;
  }
  state.enriching = false;
  applySort();
  noteVisitDelta();
  saveMenu();
  render();
}

// Move the bar to a new street: validate the path, remember the choice, and
// re-open on whatever menu was cached there. Returns an error string for the
// ask scene, or null on success.
function moveBar(input) {
  const raw = (input || "").trim();
  if (!raw) return "tell me where the work lives";
  const p = path.resolve(expandHome(raw));
  let st;
  try {
    st = fsSync.statSync(p);
  } catch {
    return `no such place — ${p}`;
  }
  if (!st.isDirectory()) return "that's a file, not a neighborhood";
  ROOT = p;
  // remember ~/… and absolute answers as given (portable, readable), but a
  // relative one only means something from tonight's cwd — save it resolved
  if (!DEMO) saveConfig({ root: raw.startsWith("~") || path.isAbsolute(raw) ? raw : p });
  const cached = loadMenu();
  // if the session's opening delta hasn't been told yet, tell it about the
  // street the bar actually ends up on
  if (!visitNoted) lastVisitMenu = cached;
  state.repos = cached || [];
  if (state.repos.length && state.splash) maybeEndSplash();
  state.sel = 0;
  state.scroll = 0;
  state.detailScroll = 0;
  state.filter = "";
  state.filtering = false;
  state.dirtyOnly = false;
  applySort();
  void scanAll();
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The takeout window — --report and --closing-time serve the scan without
// opening the bar: same two pours, no TTY, no alt screen, and side-effect
// free (not even the menu cache is written). Made for pipes, cron, and
// agents. Exit codes: --report always 0; --closing-time 0 when the stove is
// clean, 1 when plates are at risk; both 2 when the root can't be read.
// ─────────────────────────────────────────────────────────────────────────────

async function scanHeadless() {
  let entries;
  try {
    entries = await fs.readdir(ROOT, { withFileTypes: true });
  } catch (e) {
    console.error(`izakaya: cannot read ${ROOT}: ${e.message}`);
    process.exit(2);
  }
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith("."));
  const plates = [];
  const queue = [...dirs];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const d = queue.shift();
        const repo = await scanRepo(d);
        Object.assign(repo, await enrichRepo(repo));
        plates.push(repo);
      }
    })
  );
  plates.sort((a, b) => lastSeen(b) - lastSeen(a));
  return plates;
}

// What leaves only with this laptop — the pure facts behind the ! scene and
// the --closing-time takeout, so the two can never drift apart.
// kinds: unsettled (dirty files) · unpushed (pours no remote has) ·
// houseOnly (a repo that never left the house) · stashed
function closingFacts(repos) {
  const at = [];
  for (const r of repos) {
    if (!r.isGit) continue;
    const facts = [];
    if (r.dirty) facts.push({ kind: "unsettled", n: r.dirty });
    if (r.remote && r.unpushed) facts.push({ kind: "unpushed", n: r.unpushed });
    if (!r.remote && r.commits)
      facts.push({ kind: "houseOnly", n: r.unpushed || r.commits });
    if (r.stash) facts.push({ kind: "stashed", n: r.stash });
    if (facts.length) at.push({ repo: r, facts });
  }
  at.sort(
    ({ repo: a }, { repo: b }) =>
      b.dirty + b.unpushed + b.stash - (a.dirty + a.unpushed + a.stash)
  );
  return at;
}

// The standup window opens on the last workday: yesterday, except that a
// Monday (or a weekend) looks back to Friday. Midnight, local time.
function standupSince(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const back = { 0: 2, 1: 3, 6: 1 }[d.getDay()] ?? 1;
  d.setDate(d.getDate() - back);
  return d;
}

// --standup: what you poured since the last workday, plate by plate. Only
// `git log` is asked — no pantry walk, no second pour — so it's quick. A
// folder that isn't a repo is looked into one level, so studio folders of
// related projects still report.
async function printStandup(asJson) {
  let entries;
  try {
    entries = await fs.readdir(ROOT, { withFileTypes: true });
  } catch (e) {
    console.error(`izakaya: cannot read ${ROOT}: ${e.message}`);
    process.exit(2);
  }
  const isRepo = (dir) => fsSync.existsSync(path.join(dir, ".git"));
  const dirs = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const dir = path.join(ROOT, e.name);
    if (isRepo(dir)) { dirs.push(dir); continue; }
    try {
      for (const sub of await fs.readdir(dir, { withFileTypes: true }))
        if (sub.isDirectory() && !sub.name.startsWith(".") && !SKIP_DIRS.has(sub.name) &&
            isRepo(path.join(dir, sub.name)))
          dirs.push(path.join(dir, sub.name));
    } catch {}
  }
  // You are your name *or* your email — people commit under a noreply
  // address on one machine and a personal one on another. git ORs repeated
  // --author patterns. $IZAKAYA_AUTHOR (a git --author pattern) overrides.
  const override = (process.env.IZAKAYA_AUTHOR || "").trim();
  const authors = override
    ? [override]
    : [await git(ROOT, "config", "user.name"), await git(ROOT, "config", "user.email")].filter(Boolean);
  const author = authors.join(" | ");
  if (!authors.length) {
    console.error("izakaya: who are you? set IZAKAYA_AUTHOR or git config --global user.email");
    process.exit(2);
  }
  const since = standupSince();
  const plates = [];
  const queue = [...dirs];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const dir = queue.shift();
        // every local branch, so work parked on a feature branch still counts
        const log = await git(
          dir, "log", "--branches", "--no-merges", `--since=${since.toISOString()}`,
          ...authors.map((a) => `--author=${a}`), "--format=%ct%x00%s"
        );
        if (!log) continue;
        const pours = log.split("\n").filter(Boolean).map((l) => {
          const [ct, msg] = l.split("\0");
          return { ct: parseInt(ct, 10) || 0, msg: scrubText(msg || "") };
        });
        if (pours.length)
          plates.push({ name: scrubText(path.relative(ROOT, dir)), dir, pours });
      }
    })
  );
  plates.sort((a, b) => b.pours[0].ct - a.pours[0].ct);
  const total = plates.reduce((n, p) => n + p.pours.length, 0);
  if (asJson) {
    process.stdout.write(
      JSON.stringify(
        { izakaya: VERSION, root: ROOT, author, since: since.toISOString(), pours: total, plates },
        null,
        2
      ) + "\n"
    );
    process.exit(0);
  }
  const tty = !!process.stdout.isTTY;
  const strip = (s) => (tty ? s : s.replace(ANSI_RE, ""));
  const day = since.toLocaleDateString("en-US", { weekday: "long" });
  const lines = [];
  if (!total) {
    lines.push(`${fg(T.fgDim)}no pours since ${day} — a quiet night at the bar${RESET}`);
  } else {
    lines.push(
      BOLD + "standup" + RESET +
        ` — your pours since ${day} (${ROOT.replace(os.homedir(), "~")})`
    );
    for (const p of plates) {
      lines.push(
        `  ${fg(T.blue)}${BOLD}${p.name}${RESET}  ${fg(T.fgDim)}${p.pours.length} ` +
          `pour${p.pours.length === 1 ? "" : "s"}${RESET}`
      );
      for (const pour of p.pours.slice(0, 8))
        lines.push(`    ${fg(T.fgDim)}·${RESET} ${pour.msg}  ${fg(T.fgDim)}${relTime(pour.ct)}${RESET}`);
      if (p.pours.length > 8) lines.push(`    ${fg(T.fgDim)}+${p.pours.length - 8} more${RESET}`);
    }
    lines.push(
      `${total} pour${total === 1 ? "" : "s"} across ${plates.length} ` +
        `plate${plates.length === 1 ? "" : "s"}`
    );
  }
  process.stdout.write(strip(lines.join("\n")) + "\n");
  process.exit(0);
}

function printReport(plates) {
  process.stdout.write(
    JSON.stringify(
      {
        izakaya: VERSION,
        schema: MENU_V, // bumped whenever a plate field changes shape
        root: ROOT,
        generatedAt: new Date().toISOString(),
        plates,
      },
      null,
      2
    ) + "\n"
  );
  process.exit(0);
}

function printClosingTime(plates, asJson) {
  const at = closingFacts(plates);
  const gitCount = plates.filter((r) => r.isGit).length;
  if (asJson) {
    process.stdout.write(
      JSON.stringify(
        {
          izakaya: VERSION,
          root: ROOT,
          generatedAt: new Date().toISOString(),
          plates: gitCount,
          atRisk: at.map(({ repo, facts }) => ({
            name: repo.name,
            dir: repo.dir,
            facts,
          })),
          safe: gitCount - at.length,
        },
        null,
        2
      ) + "\n"
    );
    process.exit(at.length ? 1 : 0);
  }
  // human text — the lanterns light it on a TTY, a pipe gets it plain
  const tty = !!process.stdout.isTTY;
  const strip = (s) => (tty ? s : s.replace(ANSI_RE, ""));
  const word = (f) =>
    f.kind === "unsettled"
      ? fg(T.yellow) + `${f.n} unsettled` + RESET
      : f.kind === "unpushed"
        ? fg(T.cyan) + `⇡${f.n} unpushed` + RESET
        : f.kind === "houseOnly"
          ? fg(T.magenta) + `${f.n} pour${f.n === 1 ? "" : "s"} live only here` + RESET
          : fg(T.orange) + `${f.n} stashed` + RESET;
  const lines = [];
  if (!at.length) {
    lines.push(
      fg(T.green) + "the stove is clean" + RESET +
        ` — every pour pushed, nothing unsettled, nothing stashed. おやすみ`
    );
  } else {
    lines.push(
      BOLD + `closing time` + RESET +
        ` — what leaves only with this laptop (${ROOT.replace(os.homedir(), "~")})`
    );
    const nameW = Math.min(24, Math.max(...at.map(({ repo }) => visW(repo.name))));
    for (const { repo, facts } of at)
      lines.push(
        `  ${padW(repo.name.slice(0, nameW), nameW)}  ` +
          facts.map(word).join("  ·  ")
      );
    lines.push(
      `${at.length} plate${at.length === 1 ? "" : "s"} at risk  ·  ${gitCount - at.length} safe`
    );
  }
  process.stdout.write(strip(lines.join("\n")) + "\n");
  process.exit(at.length ? 1 : 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

const out = process.stdout;

function headerLine(W) {
  const home = ROOT.replace(os.homedir(), "~");
  const dirtyCount = state.repos.filter((r) => r.dirty > 0).length;
  let s = bg(T.bg) + fg(T.seg0) + "░▒▓";
  s += bg(T.seg0) + fg(T.segInk) + ` ${G.lantern} ` ;
  s += bg(T.seg1) + fg(T.seg0) + G.sep;
  s += bg(T.seg1) + fg(T.segFg) + BOLD + ` 居酒屋 izakaya ` + RESET +
    bg(T.seg1) + fg(T.segInk) + `v${VERSION} ` + RESET;
  s += bg(T.seg2) + fg(T.seg1) + G.sep;
  s += bg(T.seg2) + fg(T.seg1) + ` ${G.folder} ${home} `;
  s += bg(T.seg3) + fg(T.seg2) + G.sep;
  const count = state.scanning
    ? `${G.sake} pouring… ${state.scanned}/${state.toScan}`
    : state.enriching
      ? `${state.repos.length} plates · simmering`
      : `${state.repos.length} plates`;
  s += bg(T.seg3) + fg(T.seg1) + ` ${count} `;
  s += bg(T.seg4) + fg(T.seg3) + G.sep;
  s += bg(T.seg4) + fg(dirtyCount ? T.yellow : T.segDim) +
    ` ${dirtyCount ? `${G.dot} ${dirtyCount} dirty` : `${G.ok} all clean`} `;
  // agents mid-conversation anywhere on the menu
  const cooking = treeRepos().filter((r) => agentLive(r)).length;
  if (cooking) s += fg(T.magenta) + `${G.agent} ${cooking} cooking `;
  s += RESET + bg(T.bg) + fg(T.seg4) + G.sep;

  // mirrored right side, like a starship right-prompt: time → sky → ▓▒░
  const time = new Date().toTimeString().slice(0, 5);
  const hour = new Date().getHours();
  const sky = hour >= 6 && hour < 18 ? G.sun : G.moon;
  const right =
    fg(T.seg2) + G.sepL +
    bg(T.seg2) + fg(T.segDim) + ` ${G.clock} ${time} ` +
    fg(T.seg0) + G.sepL +
    bg(T.seg0) + fg(T.segInk) + ` ${sky} ` +
    RESET + bg(T.bg) + fg(T.seg0) + "▓▒░";

  const gap = W - visW(s) - visW(right);
  // a narrow window gets the left side alone, truncated — never wrapped
  if (gap < 1) return padW(truncW(s, W), W) + RESET;
  return s + " ".repeat(gap) + right + RESET;
}

function footerLine(W) {
  let s = bg(T.bg) + " " + fg(T.green) + BOLD + "❯ " + RESET + bg(T.bg);
  if (state.status) {
    // a flash owns the whole line — appended after the key chips it just
    // gets truncated off the right edge at most terminal widths
    s += fg(T.teal) + ITAL + state.status;
    return padW(truncW(s, W), W) + RESET;
  }
  if (state.ambient) {
    const puff = ambientTick % 2 ? "▒" : "░";
    s += fg(T.fgFaint) + puff + " " + fg(T.fgDim) + ITAL + state.ambient;
    return padW(truncW(s, W), W) + RESET;
  }
  if (state.filtering || state.filter) {
    s +=
      fg(T.blue) + BOLD + G.search + " /" + RESET + bg(T.bg) +
      fg(T.fg) + state.filter +
      (state.filtering ? fg(T.cyan) + "▌" : "") +
      "   " + fg(T.fgDim) + `${visible().length} match` +
      (state.filtering ? "  ·  enter keep · esc clear" : "  ·  esc clear");
    return padW(truncW(s, W), W) + RESET;
  }
  if (state.dirtyOnly)
    s += bg(T.seg3) + fg(T.yellow) + ` ${G.dot} dirty only ` + RESET + bg(T.bg) + "  ";
  const keys = state.peek
    ? [
        ["j/k", "scroll"],
        ["g/G", "top / bottom"],
        ["esc/←", "back to the tab"],
        ["q", "leave"],
      ]
    : state.focus === "board"
    ? [
        ["↑/↓", "pick a file"],
        ["↵", "peek the pour"],
        ["tab/←", "back to menu"],
        ["e", "edit file"],
        ["y", "copy path"],
        ["?", "more"],
        ["q", "leave"],
      ]
    : [
        ["j/k", "browse"],
        ["→", "open folders"],
        ["tab", "open tab"],
        ["/", "filter"],
        ["↵", "sit"],
        ["o", "open"],
        ["t", "term"],
        ["e", "edit"],
        ["a", "agent"],
        ["s", `sort:${state.sort}`],
        ["!", "closing time"],
        ["?", "more"],
        ["~", "colophon"],
        ["q", "leave"],
      ];
  const chip = ([k, label]) =>
    bg(T.seg3) + fg(T.seg1) + BOLD + ` ${k} ` + RESET +
    bg(T.bg) + fg(T.fgDim) + ` ${label}  `;
  // a narrow room drops chips from the middle — `?` (the back page, where
  // every key lives) and `q` always keep their stools at the end
  const pinned = (k) => k === "?" || k === "q";
  const tail = keys.filter(([k]) => pinned(k)).map(chip).join("");
  let room = W - visW(s) - visW(tail);
  for (const kv of keys) {
    if (pinned(kv[0])) continue;
    const c = chip(kv);
    if (visW(c) > room) break;
    s += c;
    room -= visW(c);
  }
  return padW(truncW(s + tail, W), W) + RESET;
}

const STALE_S = 180 * 86400; // half a year untouched and the plate gathers dust

// When you last had your hands on a plate: its newest commit, or its newest
// uncommitted edit if that's later. Sorting and dust both read this.
const lastSeen = (r) => Math.max(r.lastUnix || 0, r.touchedUnix || 0);

// Off the main line — the plate's checked out on something other than its
// default branch (origin's HEAD when known; main/master/trunk otherwise).
// Detached HEAD counts. The branch you forgot you were on is the one that
// bites, so the menu row names it.
function offBranch(r) {
  if (!r.isGit || !r.branch || r.branch === "—") return null;
  if (r.branch === "HEAD") return "detached";
  const home = r.defaultBranch ? [r.defaultBranch] : ["main", "master", "trunk"];
  return home.includes(r.branch) ? null : r.branch;
}

function listRow(repo, selected, W) {
  const flat = !!state.filter;
  const base = selected ? bg(T.bgHi) : bg(T.bgPanel);
  // the accent stays blue while you browse the menu; behind the bar it dims,
  // and the divider lights up instead — so it's always clear which pane is live
  const accent = selected
    ? (state.focus === "menu" ? fg(T.blue) : fg(T.fgDim)) + "▌"
    : fg(T.bgPanel) + " ";
  const lm = repo.langs[0] && langMeta(repo.langs[0].name);
  const icon = lm ? fg(lm.color) + lm.icon : fg(T.fgFaint) + G.folder;
  const seen = lastSeen(repo);
  const stale = seen > 0 && Date.now() / 1000 - seen > STALE_S;
  const nameC = selected ? fg(T.fg) + BOLD : stale ? fg(T.fgDim) : fg(T.fg);
  const dirtyMark = !repo.isGit
    ? ""
    : repo.dirty > 0
      ? fg(T.yellow) + G.dot
      : stale
        ? fg(T.fgFaint) + G.moon
        : fg(T.green) + G.ok;
  // unpushed work is the most actionable fact on the menu — surface it.
  // Cyan: the branch you're on is ahead of its upstream, right now. Orange:
  // you're clean here, but some other local branch still has commits no
  // remote has — the same fact --closing-time warns about.
  const aheadMark = !repo.isGit
    ? ""
    : repo.ahead > 0
      ? fg(T.cyan) + G.ahead
      : repo.unpushed > 0
        ? fg(T.orange) + G.ahead
        : "";
  // new pours since your last visit — reads away on the next rescan
  const freshMark = repo.fresh ? fg(T.teal) + "+" : "";
  // an agent talking at this plate right now
  const liveMark = agentLive(repo) ? fg(T.magenta) + G.agent : "";
  // the age is when you last touched it — yellow when that touch is an
  // uncommitted edit newer than the last pour, so work-in-hand reads warm
  const warm = repo.isGit && repo.touchedUnix > repo.lastUnix;
  const age = seen ? (warm ? fg(T.yellow) : fg(T.fgDim)) + relTime(seen) : "";
  // Nested rows spend their width on the folder name and hierarchy. Their
  // full status is already on the dashboard as soon as the row is selected.
  const marks = `${liveMark}${freshMark}${dirtyMark}${aheadMark}`;
  const right = repo.depth && !flat
    ? `${liveMark}${dirtyMark}`
    : `${marks}${marks && age ? " " : ""}${age}`;
  const rightW = visW(right);
  // a filter ranks matches out of tree order, so rows go flat and a nested
  // plate wears its parent's path instead of an indent
  const indent = flat ? "" : "  ".repeat(repo.depth || 0);
  const limb = repo.depth && !flat ? `${fg(T.fgFaint)}└ ` : "";
  const parent = repo.depth && flat
    ? `${fg(T.fgDim)}  ${G.folder} ${path.relative(ROOT, path.dirname(repo.dir))}`
    : "";
  const off = offBranch(repo);
  const branchTag = off ? `${fg(T.fgDim)}  ${G.branch} ${off}` : "";
  const disclosure = repo.children === null
    ? `${fg(T.fgFaint)}› `
    : repo.children.length
      ? `${fg(T.blue)}${repo.expanded ? "⌄" : "›"} `
      : "  ";
  let left = `${accent}${base} ${indent}${limb}${disclosure}${icon} ${nameC}${base}${repo.name}${RESET}${base}${parent}${branchTag}`;
  left = truncW(left, W - rightW - 2) + base;
  const gap = W - visW(left) - rightW - 1;
  return base + left + " ".repeat(Math.max(1, gap)) + right + " " + RESET;
}

function langBar(repo, width) {
  if (!repo.langs.length) return fg(T.fgFaint) + "─".repeat(width);
  let s = "", used = 0;
  for (let i = 0; i < repo.langs.length; i++) {
    const l = repo.langs[i];
    let w = Math.round((l.pct / 100) * width);
    if (i === repo.langs.length - 1) w = width - used;
    w = Math.max(1, Math.min(w, width - used));
    s += fg(langMeta(l.name).color) + "█".repeat(w);
    used += w;
    if (used >= width) break;
  }
  return s;
}

const OPEN_TAB_SHOWN = 12; // files listed on the tab before "+N more"

// The open tab — a git status XY code becomes a glyph, a color, and a word.
// Position 0 is the index (staged), position 1 the worktree (unstaged); the
// worktree side wins the color when both are dirty.
const CHANGE_KINDS = {
  M: { color: "yellow", glyph: G.dot, label: "modified" },
  A: { color: "green", glyph: "+", label: "added" },
  D: { color: "red", glyph: "−", label: "deleted" },
  R: { color: "cyan", glyph: "→", label: "renamed" },
  C: { color: "cyan", glyph: "→", label: "copied" },
  T: { color: "magenta", glyph: G.dot, label: "typechange" },
  U: { color: "red", glyph: G.warn, label: "conflict" },
  "?": { color: "fgFaint", glyph: "?", label: "untracked" },
};
function changeMark(xy) {
  const x = xy[0], y = xy[1];
  const kind =
    CHANGE_KINDS[y !== " " ? y : x] ||
    { color: "fgDim", glyph: G.dot, label: "changed" };
  // colors live as T-key names so the lanterns can change; resolve here
  return { ...kind, color: T[kind.color], staged: x !== " " && x !== "?" };
}

// a rename reads "old -> new"; the new name is what's on the tab now
function changePath(ch) {
  const arrow = ch.path.indexOf(" -> ");
  return arrow >= 0 ? ch.path.slice(arrow + 4) : ch.path;
}

function detailLines(repo, W, focusIdx = -1) {
  const L = [];
  const changeRows = []; // line index in L of each open-tab file, for the cursor
  const pad = (s = "") => L.push(s);
  const rule = (label) =>
    `  ${fg(T.fgFaint)}─ ${fg(T.fgDim)}${label} ${fg(T.fgFaint)}${"─".repeat(Math.max(0, W - visW(label) - 7))}`;

  pad();
  // title ribbon, same shape as the prompt: ░▒▓  icon │ name │ path
  const icon = (repo.langs[0] && langMeta(repo.langs[0].name).icon) || G.folder;
  pad(
    "  " + fg(T.seg0) + "░▒▓" +
    bg(T.seg0) + fg(T.segInk) + ` ${icon} ` +
    bg(T.seg1) + fg(T.seg0) + G.sep +
    bg(T.seg1) + fg(T.segFg) + BOLD + ` ${repo.name} ` + RESET +
    bg(T.seg2) + fg(T.seg1) + G.sep +
    bg(T.seg2) + fg(T.segDim) + ` ${repo.dir.replace(os.homedir(), "~")} ` +
    RESET + fg(T.seg2) + G.sep + RESET
  );
  pad();

  if (repo.isGit) {
    // powerline git status line, like the prompt
    let s = "  " + bg(T.seg2) + fg(T.seg1) + ` ${G.branch} ${repo.branch} `;
    const st = repo.dirty
      ? fg(T.yellow) + ` ${G.dot} ${repo.dirty} uncommitted `
      : fg(T.green) + ` ${G.ok} clean `;
    s += bg(T.seg3) + fg(T.seg2) + G.sep + bg(T.seg3) + st;
    let tail = "";
    if (repo.ahead) tail += `${G.ahead}${repo.ahead} `;
    if (repo.behind) tail += `${G.behind}${repo.behind} `;
    let curBg = T.seg3;
    if (tail) {
      s += bg(T.seg4) + fg(curBg) + G.sep + bg(T.seg4) + fg(T.cyan) + ` ${tail.trim()} `;
      curBg = T.seg4;
    }
    if (repo.version) {
      s += curBg === T.seg4
        ? fg(T.fgFaint) + G.sepThin
        : bg(T.seg4) + fg(curBg) + G.sep;
      s += bg(T.seg4) + fg(T.green) + ` ${G.pkg} v${repo.version} `;
      curBg = T.seg4;
    }
    s += RESET + fg(curBg) + G.sep + RESET;
    pad(s);
    pad();
    pad(
      `  ${fg(T.fgDim)}${G.commit} last pour  ${fg(T.fg)}${repo.lastMsg ?? "—"}`
    );
    pad(
      `  ${fg(T.fgDim)}${G.clock} ${relTime(repo.lastUnix)}${
        repo.lastAuthor ? fg(T.fgDim) + ` by ${repo.lastAuthor}` : ""
      }` +
        // the count comes with the second pour — don't claim 0 before it lands
        (repo.cooked
          ? `  ${fg(T.fgDim)}· ${repo.commits} commit${repo.commits === 1 ? "" : "s"}`
          : "")
    );
    if (repo.touchedUnix > repo.lastUnix)
      pad(
        `  ${fg(T.yellow)}${G.edit} last touch ${relTime(repo.touchedUnix)}` +
          `${fg(T.fgDim)} — uncommitted, still on the stove`
      );
    for (let i = 1; i < repo.recent.length; i++) {
      const rc = repo.recent[i];
      const limb = i === repo.recent.length - 1 ? "└" : "├";
      pad(
        `  ${fg(T.fgFaint)}${limb} ${fg(T.fgDim)}${relTime(rc.ct).padEnd(8)}${fg(T.fgDim)}${rc.msg}`
      );
    }
    pad(
      repo.remote
        ? `  ${fg(T.fgDim)}${G.remote} ${fg(T.cyan)}${repo.remote}`
        : `  ${fg(T.fgDim)}${G.remote} no remote — house brew only`
    );
    // word from the street — gh's answer, when one came back
    if (repo.gh !== undefined) {
      if (repo.gh === null)
        pad(`  ${fg(T.fgDim)}${G.pr} ${ITAL}asking the street…`);
      else if (repo.gh.prs !== null) {
        const r = repo.gh.run;
        const ci = !r
          ? ""
          : r.status !== "completed"
            ? `  ·  ${fg(T.yellow)}${G.dot} checks running`
            : r.conclusion === "success"
              ? `  ·  ${fg(T.green)}${G.ok} checks passing`
              : `  ·  ${fg(T.red)}${G.warn} checks ${r.conclusion}`;
        pad(
          `  ${fg(T.fgDim)}${G.pr} ${fg(T.fg)}${repo.gh.prs}${fg(T.fgDim)} open ` +
            `PR${repo.gh.prs === 1 ? "" : "s"}${ci}`
        );
      }
    }

    if (repo.changes && repo.changes.length) {
      pad();
      pad(rule("the open tab"));
      const tally = new Map();
      for (const ch of repo.changes) {
        const { label } = changeMark(ch.xy);
        tally.set(label, (tally.get(label) || 0) + 1);
      }
      const summary = [...tally.entries()].map(([l, n]) => `${n} ${l}`).join("  ·  ");
      pad(
        `  ${fg(T.yellow)}${G.dot} ${fg(T.fg)}${repo.dirty}${fg(T.fgDim)} unsettled` +
          `  ${fg(T.fgFaint)}${truncW(summary, W - 18)}`
      );
      let ci = 0;
      for (const ch of repo.changes.slice(0, OPEN_TAB_SHOWN)) {
        const m = changeMark(ch.xy);
        const p = changePath(ch);
        const suffix = `${m.label}${m.staged ? " · staged" : ""}`;
        changeRows.push(L.length);
        if (ci === focusIdx) {
          // behind the bar, the file you're standing on glows orange, the
          // whole row filled like the menu's own selection
          pad(
            padW(
              bg(T.bgHi) + fg(T.orange) + "▌ " + fg(m.color) + m.glyph + " " +
                fg(T.orange) + BOLD + truncW(p, W - 18) + RESET + bg(T.bgHi) +
                fg(T.fgDim) + "  " + suffix,
              W
            )
          );
        } else {
          pad(
            `  ${fg(m.color)}${m.glyph} ${fg(T.fg)}${truncW(p, W - 18)}` +
              `${fg(T.fgFaint)}  ${suffix}`
          );
        }
        ci++;
      }
      if (repo.changes.length > OPEN_TAB_SHOWN)
        pad(`  ${fg(T.fgFaint)}+${repo.changes.length - OPEN_TAB_SHOWN} more on the tab`);
    }

    pad();
    pad(rule("the kitchen"));
    if (!repo.cooked) {
      // the second pour hasn't landed — say so instead of showing an empty
      // sparkline that reads as "the kitchen sleeps"
      pad(`  ${fg(T.fgDim)}${ITAL}the kitchen is warming — history on its way…`);
    } else {
      const SPARK = "▁▂▃▄▅▆▇█";
      const peak = Math.max(...repo.weeks, 1);
      let spark = "";
      for (let i = 0; i < repo.weeks.length; i++)
        spark += repo.weeks[i] === 0
          ? fg(T.fgFaint) + "▁"
          : gradColor((i / repo.weeks.length) * 0.9) +
            SPARK[Math.min(7, Math.max(1, Math.ceil((repo.weeks[i] / peak) * 7)))];
      pad(
        `  ${fg(T.fgDim)}${G.pulse} pours   ${spark}${RESET}${bg(T.bg)}  ${fg(T.fgDim)}12 weeks` +
          (repo.weeks.every((w) => w === 0) ? " — the kitchen sleeps" : "") +
          (repo.fresh
            ? `  ${fg(T.teal)}+${repo.fresh} since your last visit`
            : "")
      );
      if (repo.chefs.length)
        pad(
          `  ${fg(T.fgDim)}${G.users} chefs   ` +
            repo.chefs
              .map(([n, c]) => `${fg(T.fg)}${n} ${fg(T.fgDim)}${c}`)
              .join(`${fg(T.fgDim)}  ·  `)
        );
      pad(
        `  ${fg(T.fgDim)}${G.branch} shelf   ${fg(T.fg)}${repo.branches}${fg(T.fgDim)} ` +
          `branch${repo.branches === 1 ? "" : "es"}  ·  ${G.tag} ${fg(T.fg)}${repo.tags}${fg(T.fgDim)} ` +
          `tag${repo.tags === 1 ? "" : "s"}  ·  ${fg(T.fg)}${repo.stash}${fg(T.fgDim)} stashed` +
          (repo.unpushed
            ? `  ·  ${fg(T.cyan)}${G.ahead}${repo.unpushed}${fg(T.fgDim)} unpushed`
            : "")
      );
      // side kitchens — linked worktrees, where parallel work usually lives
      const wts = repo.worktrees || [];
      for (let i = 0; i < Math.min(wts.length, 4); i++) {
        const wt = wts[i];
        const label = i === 0 ? "side    " : "        ";
        pad(
          `  ${fg(T.fgDim)}${i === 0 ? G.folder : " "} ${label}${fg(T.magenta)}${wt.branch}` +
            `${fg(T.fgDim)}  ${wt.path.replace(os.homedir(), "~")}`
        );
      }
      if (wts.length > 4) pad(`  ${fg(T.fgDim)}           +${wts.length - 4} more side kitchens`);
    }
  } else {
    pad(`  ${fg(T.orange)}${G.warn} not a git repo ${fg(T.fgDim)}— off-menu item`);
    if (repo.touchedUnix)
      pad(`  ${fg(T.fgDim)}${G.clock} last touched ${relTime(repo.touchedUnix)}`);
  }

  pad();
  pad(rule("the pantry"));
  const barW = Math.min(W - 6, 44);
  pad(`  ${langBar(repo, barW)}`);
  const legend = repo.langs
    .filter((l) => l.pct >= 1)
    .map((l) => `${fg(langMeta(l.name).color)}${G.dot}${fg(T.fgDim)} ${l.name} ${Math.round(l.pct)}%`)
    .join("  ");
  pad(`  ${legend || fg(T.fgFaint) + "nothing on this plate yet"}`);
  pad();
  pad(
    `  ${fg(T.fgDim)}${G.file} ${repo.files} files  ·  ${fmtBytes(repo.bytes)}`
  );

  if (repo.chips.length) {
    pad();
    pad(
      "  " +
        repo.chips
          .map((c) => bg(T.bgHi) + fg(T[c.color] || c.color) + ` ${c.label} ` + RESET)
          .join(" ")
    );
  }

  if (repo.ai) {
    pad();
    pad(rule("the hand behind the bar"));
    const a = repo.ai;
    const pct = a.total ? Math.round((a.assisted / a.total) * 100) : 0;
    // one house signing → name it; several → they share the credit
    const hands = [...new Set(a.models.map((m) => m.agent || "Claude"))];
    const who = hands.length === 1 ? hands[0] : "agents";
    const glyph = hands.length === 1 && hands[0] === "Claude" ? G.claude : G.agent;
    pad(
      `  ${fg(T.magenta)}${glyph} ${fg(T.fg)}${who}${fg(T.fgDim)} had a hand in ` +
        `${fg(T.fg)}${pct}%${fg(T.fgDim)} of the last ${a.total} ` +
        `${a.total === 1 ? "pour" : "pours"}  ${fg(T.fgFaint)}(${a.assisted} ` +
        `commit${a.assisted === 1 ? "" : "s"})`
    );
    const shown = a.models.slice(0, 4);
    const extra = a.models.length - shown.length;
    let tags = shown
      .map(
        (m) =>
          bg(T.bgHi) + fg(T.magenta) + ` ${m.label} ` +
          (m.count > 1 ? fg(T.fgFaint) + `${m.count} ` : "") + RESET
      )
      .join(" ");
    if (extra > 0) tags += " " + fg(T.fgFaint) + `+${extra} more`;
    pad();
    pad("  " + tags);
  }

  if (repo.agents?.length) {
    const defs = new Map(agentsOnFile().map((a) => [a.id, a]));
    pad();
    pad(rule("agents at the bar"));
    for (const session of repo.agents) {
      const agent = defs.get(session.id) || { label: session.id, icon: "agent" };
      const live = Date.now() / 1000 - session.lastUnix < LIVE_S;
      pad(
        `  ${fg(T.magenta)}${G[agent.icon] || G.agent} ${fg(T.fg)}${agent.label}` +
          (live
            ? `  ${fg(T.magenta)}${G.dot} cooking now`
            : `${fg(T.fgDim)} last spoke ${relTime(session.lastUnix)}`)
      );
    }
    pad(`  ${fg(T.fgFaint)}press ${fg(T.magenta)}a${fg(T.fgFaint)} to start or resume an agent here`);
  }

  pad();
  if (repo.hasAgentsMd)
    pad(`  ${fg(T.green)}${G.ok} AGENTS.md ${fg(T.fgFaint)}— shared house rules posted`);
  if (repo.hasClaudeMd)
    pad(`  ${fg(T.green)}${G.ok} CLAUDE.md ${fg(T.fgFaint)}— Claude's house rules posted`);
  if (!repo.hasAgentsMd && !repo.hasClaudeMd)
    pad(`  ${fg(T.red)}${G.warn} no agent instructions ${fg(T.fgFaint)}— this kitchen has no posted rules`);

  if (repo.readmeTitle) {
    pad();
    pad(`  ${fg(T.fgDim)}${ITAL}“${truncW(repo.readmeTitle, W - 10)}${fg(T.fgDim)}${ITAL}”`);
  }

  return { lines: L, changeRows };
}

// The pour, line by line — a file's diff drawn over the board. Same ribbon
// shape as a plate, then the hunks in the house colors: added green, gone
// red, hunk heads cyan, git's own chatter faint. Read-only, like everything.
function peekPane(peek, W) {
  const L = [];
  L.push("");
  L.push(
    "  " + fg(T.seg0) + "░▒▓" +
    bg(T.seg0) + fg(T.segInk) + ` ${G.file} ` +
    bg(T.seg1) + fg(T.seg0) + G.sep +
    bg(T.seg1) + fg(T.segFg) + BOLD + ` ${truncW(peek.file, W - 24)} ` + RESET +
    bg(T.seg2) + fg(T.seg1) + G.sep +
    bg(T.seg2) + fg(T.segDim) + ` the pour ` +
    RESET + fg(T.seg2) + G.sep + RESET
  );
  L.push("");
  if (peek.lines === null) {
    L.push(`  ${fg(T.fgDim)}${ITAL}reading the ledger…`);
    return L;
  }
  if (!peek.lines.length) {
    L.push(`  ${fg(T.fgDim)}nothing in the glass — git has no diff for this file`);
    return L;
  }
  for (const raw of peek.lines) {
    // tabs would slip past the width math; control chars would talk to the
    // terminal directly — neither gets served
    const line = raw.replaceAll("\t", "    ").replace(/[\x00-\x1f\x7f]/g, "");
    let c = fg(T.fg);
    if (line.startsWith("+++") || line.startsWith("---")) c = fg(T.fgDim);
    else if (line.startsWith("@@")) c = fg(T.cyan);
    else if (line.startsWith("+")) c = fg(T.green);
    else if (line.startsWith("-")) c = fg(T.red);
    else if (/^(diff |index |old mode|new mode|similarity |rename |new file|deleted file|Binary )/.test(line))
      c = fg(T.fgFaint);
    L.push("  " + c + line);
  }
  return L;
}

function splashFrame(W, H) {
  const center = (s) =>
    bg(T.bg) + " ".repeat(Math.max(0, Math.floor((W - visW(s)) / 2))) + s;
  const blank = bg(T.bg) + " ".repeat(W) + RESET;

  const body = [];
  if (W >= ART[0].length + 2 && H >= ART.length + 8) {
    for (let row = 0; row < ART.length; row++)
      body.push(center(gradientLine(ART[row], row * 0.07 + state.phase)) + RESET);
    body.push(blank);
    body.push(center(fg(T.fgDim) + "🏮 居酒屋 — a cozy little bar where your repos are the menu") + RESET);
  } else {
    body.push(center(BOLD + fg(T.magenta) + "🏮 居酒屋 izakaya") + RESET);
  }
  body.push(blank);
  // where the bar stands tonight
  body.push(
    center(fg(T.seg1) + `${G.folder} ${ROOT.replace(os.homedir(), "~")}`) + RESET
  );
  body.push(blank);

  // the pour: a gradient bar that fills as plates come out of the kitchen
  const barW = Math.min(34, Math.max(10, W - 10));
  const fillW = state.scanning
    ? state.toScan
      ? Math.round((state.scanned / state.toScan) * barW)
      : 0
    : barW;
  body.push(
    center(
      gradientLine("█".repeat(fillW), state.phase * 1.5, 0.6) +
        RESET + bg(T.bg) + fg(T.fgFaint) + "░".repeat(barW - fillW)
    ) + RESET
  );
  const progress = state.scanning
    ? `${G.sake} pouring… ${state.scanned}/${state.toScan || "?"}`
    : `${G.sake} ${state.repos.length} plates ready`;
  body.push(center(fg(T.teal) + ITAL + progress) + RESET);

  const top = Math.max(0, Math.floor((H - body.length) / 2));
  const lines = [];
  for (let i = 0; i < H; i++) {
    const b = body[i - top];
    lines.push(b ? padW(b + bg(T.bg), W) + RESET : blank);
  }
  return lines;
}

function farewellFrame(W, H) {
  const center = (s) =>
    bg(T.bg) + " ".repeat(Math.max(0, Math.floor((W - visW(s)) / 2))) + s;
  const blank = bg(T.bg) + " ".repeat(W) + RESET;

  const body = [];
  if (W >= ART[0].length + 2 && H >= ART.length + 9) {
    for (let row = 0; row < ART.length; row++)
      body.push(center(gradientLine(ART[row], row * 0.07 + state.phase)) + RESET);
    body.push(blank);
  }
  const [jp, romaji, en] = state.saying;
  body.push(center(BOLD + fg(T.fg) + `「${jp}」`) + RESET);
  body.push(center(ITAL + fg(T.fgDim) + `${romaji} — ${en}`) + RESET);
  body.push(blank);
  body.push(
    center(
      fg(T.magenta) + "またね" + bg(T.bg) + fg(T.fgDim) +
        ` — thanks for stopping by. ${state.repos.length} plates served.`
    ) + RESET
  );
  body.push(blank);
  body.push(center(fg(T.fgFaint) + "( any key )") + RESET);

  const top = Math.max(0, Math.floor((H - body.length) / 2));
  const lines = [];
  for (let i = 0; i < H; i++) {
    const b = body[i - top];
    lines.push(b ? padW(b + bg(T.bg), W) + RESET : blank);
  }
  return lines;
}

// Full-width rule, like the lines Claude Code draws around its update box —
// a thin orange thread that frames the room and gives the menu air. When the
// curtain drops, one gradient sweep runs the length of the rules — neon
// catching the brass — then they settle to orange and stay put.
const SWEEP_MS = 1200;
let sweepStart = 0;

function startSweep() {
  sweepStart = Date.now();
  const tm = setInterval(() => {
    if (Date.now() - sweepStart >= SWEEP_MS) {
      clearInterval(tm);
      sweepStart = 0;
    }
    render();
  }, 50);
}

function hr(W) {
  if (!sweepStart) return bg(T.bg) + fg(T.orange) + "─".repeat(W) + RESET;
  const head = Math.floor(((Date.now() - sweepStart) / SWEEP_MS) * (W + 16));
  let s = bg(T.bg);
  for (let i = 0; i < W; i++) {
    const d = head - i;
    if (d < 0) s += fg(T.fgFaint) + "─";
    else if (d < 16) s += gradColor(d / 32) + "─";
    else s += fg(T.orange) + "─";
  }
  return s + RESET;
}

// "Where does the work live?" — first visit, and whenever `w` moves the bar.
function askFrame(W, H) {
  const center = (s) =>
    bg(T.bg) + " ".repeat(Math.max(0, Math.floor((W - visW(s)) / 2))) + s;
  const blank = bg(T.bg) + " ".repeat(W) + RESET;

  const body = [];
  if (W >= ART[0].length + 2 && H >= ART.length + 10) {
    for (let row = 0; row < ART.length; row++)
      body.push(center(gradientLine(ART[row], row * 0.07 + state.phase)) + RESET);
    body.push(blank);
  }
  body.push(center(BOLD + fg(T.fg) + "どこで働く？ — where does the work live?") + RESET);
  body.push(blank);
  body.push(
    center(
      fg(T.green) + BOLD + "❯ " + RESET + bg(T.bg) +
        fg(T.fg) + state.rootInput + fg(T.cyan) + "▌"
    ) + RESET
  );
  body.push(blank);
  body.push(
    center(
      fg(T.fgFaint) +
        (state.askCancel
          ? `enter moves the bar · esc stays at ${ROOT.replace(os.homedir(), "~")}`
          : "a directory full of repos — enter to open the bar")
    ) + RESET
  );
  if (state.askErr) {
    body.push(blank);
    body.push(center(fg(T.red) + `${G.warn} ${state.askErr}`) + RESET);
  }

  const top = Math.max(0, Math.floor((H - body.length) / 2));
  const lines = [];
  for (let i = 0; i < H; i++) {
    const b = body[i - top];
    lines.push(b ? padW(b + bg(T.bg), W) + RESET : blank);
  }
  return lines;
}

// Who's pulling up a stool — the agent picker for the exact plate under the
// cursor: start fresh, or resume where a session already sat.
function agentFrame(W, H) {
  const center = (s) =>
    bg(T.bg) + " ".repeat(Math.max(0, Math.floor((W - visW(s)) / 2))) + s;
  const blank = bg(T.bg) + " ".repeat(W) + RESET;
  const repo = state.agentPicker && findRepo(state.agentPicker.repoDir);
  const agents = agentsOnFile();
  const sessions = new Map((repo?.agents || []).map((s) => [s.id, s]));
  if (state.agentPicker)
    state.agentPicker.sel = Math.max(0, Math.min(agents.length - 1, state.agentPicker.sel));
  const nameW = Math.max(12, ...agents.map((a) => visW(a.label)));
  const body = [
    center(fg(T.seg1) + BOLD + `${G.agent} who is pulling up a stool?`) + RESET,
    blank,
    center(truncW(
      fg(T.fgDim) + `at ${fg(T.fg)}${repo?.dir?.replace(os.homedir(), "~") || "this plate"}`,
      W - 8
    )) + RESET,
    blank,
  ];
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const session = sessions.get(agent.id);
    const selected = i === state.agentPicker?.sel;
    const installed = agent.custom || hasBin(agent.command.split(/\s+/)[0]);
    const status = !installed
      ? `${fg(T.red)}not installed`
      : session
        ? `${fg(T.teal)}resume · ${relTime(session.lastUnix)}`
        : `${fg(T.fgDim)}start fresh`;
    body.push(center(
      (selected ? bg(T.bgHi) + fg(T.orange) + BOLD + " › " : bg(T.bg) + fg(T.fgDim) + "   ") +
      `${G[agent.icon] || G.agent} ${padW(agent.label, nameW)}  ${status} ` + RESET
    ));
  }
  body.push(blank);
  body.push(center(fg(T.fgDim) + "↑/↓ choose  ·  enter smart open  ·  n new  ·  r resume  ·  esc close") + RESET);
  const top = Math.max(0, Math.floor((H - body.length) / 2));
  return Array.from({ length: H }, (_, i) => {
    const line = body[i - top];
    return line ? padW(line + bg(T.bg), W) + RESET : blank;
  });
}

// The back page of the menu — every key, including the ones the footer
// doesn't have room for.
function helpFrame(W, H) {
  const center = (s) =>
    bg(T.bg) + " ".repeat(Math.max(0, Math.floor((W - visW(s)) / 2))) + s;
  const blank = bg(T.bg) + " ".repeat(W) + RESET;

  const rows = [
    ["j / k", "browse the menu (arrows work too)"],
    ["→ / ←", "open subfolders / back out"],
    ["tab", "step behind the bar into the selected repo's open tab"],
    ["↑ / ↓", "behind the bar: walk the open tab, file by file"],
    ["enter", "behind the bar: peek the pour — the file's diff"],
    ["g / G", "first / last plate"],
    ["J / K", "scroll the plate's details"],
    ["/", "fuzzy filter — enter keeps it, esc clears it"],
    ["d", "dirty plates only — show unfinished work"],
    ["!", "closing time — work that exists only on this machine"],
    ["enter", "sit down — the iz() wrapper cd's you there"],
    ["o", "open in the file manager — or reveal the file"],
    ["t", "terminal window at the repo"],
    ["u", "the usual — your own session script, launched at the repo"],
    ["e", "$EDITOR at the repo — or at the file under the cursor"],
    ["a", "choose an agent — start fresh or resume at this exact repo"],
    ["c", "claude code at the repo"],
    ["C", "resume Claude there (compatibility shortcut)"],
    ["b", "open the remote in the browser"],
    ["y", "copy the repo path — or the file's"],
    ["w", "move the bar — scan a different directory"],
    ["s", "sort: recent · name · size"],
    ["T", "change the lanterns — tokyonight · iceberg · nord · catppuccin"],
    ["r", "rescan the kitchen"],
    ["~", "colophon — who keeps this bar"],
    ["q / esc", "またね"],
  ];
  const keyW = 8;
  const descW = Math.max(...rows.map(([, d]) => visW(d)));
  const body = [];
  body.push(center(fg(T.seg1) + BOLD + `${G.lantern} the back page of the menu`) + RESET);
  body.push(blank);
  for (const [k, desc] of rows)
    body.push(
      center(
        fg(T.orange) + BOLD + padW(k, keyW) + RESET + bg(T.bg) +
          fg(T.fgDim) + " " + padW(desc, descW)
      ) + RESET
    );
  body.push(blank);
  body.push(center(fg(T.fgFaint) + "( any key )") + RESET);

  const top = Math.max(0, Math.floor((H - body.length) / 2));
  const lines = [];
  for (let i = 0; i < H; i++) {
    const b = body[i - top];
    lines.push(b ? padW(b + bg(T.bg), W) + RESET : blank);
  }
  return lines;
}

// Closing time — one sweep of every plate for work that exists only on this
// machine: unsettled files, stashes, pours no remote has, whole repos that
// never left the house. The answer to "what dies with this laptop?" —
// read-only, like everything.
function stoveFrame(W, H) {
  const center = (s) =>
    bg(T.bg) + " ".repeat(Math.max(0, Math.floor((W - visW(s)) / 2))) + s;
  const blank = bg(T.bg) + " ".repeat(W) + RESET;

  // the facts come from closingFacts — shared with --closing-time, so the
  // scene and the takeout window always tell the same story
  const KIND = {
    unsettled: (n) => fg(T.yellow) + `${G.dot} ${n} unsettled`,
    unpushed: (n) => fg(T.cyan) + `${G.ahead}${n} unpushed`,
    houseOnly: (n) =>
      fg(T.magenta) + `${G.sake} ${n} pour${n === 1 ? "" : "s"} live only here`,
    stashed: (n) => fg(T.orange) + `${n} stashed`,
  };
  const at = closingFacts(state.repos).map(({ repo, facts }) => [
    repo,
    facts.map((f) => KIND[f.kind](f.n)),
  ]);

  const body = [];
  body.push(
    center(fg(T.seg1) + BOLD + `${G.lantern} closing time — what leaves only with this laptop`) + RESET
  );
  body.push(blank);
  if (!at.length) {
    body.push(center(fg(T.green) + `${G.ok} the stove is clean`) + RESET);
    body.push(
      center(fg(T.fgDim) + "every pour is pushed, nothing unsettled, nothing stashed — おやすみ") + RESET
    );
  } else {
    const nameW = Math.min(24, Math.max(...at.map(([r]) => visW(r.name))));
    const rows = at.map(
      ([r, facts]) =>
        fg(T.fg) + padW(truncW(r.name, nameW) + RESET + bg(T.bg), nameW) +
        "  " + facts.join(fg(T.fgDim) + "  ·  ")
    );
    const rowW = Math.min(W - 4, Math.max(...rows.map(visW)));
    for (const s of rows) body.push(center(padW(truncW(s, rowW), rowW)) + RESET);
    body.push(blank);
    const clean = state.repos.filter((r) => r.isGit).length - at.length;
    body.push(
      center(
        fg(T.fgDim) +
          `${at.length} plate${at.length === 1 ? "" : "s"} carrying work only this machine holds` +
          (clean > 0 ? `  ·  ${fg(T.green)}${clean} safe` : "")
      ) + RESET
    );
  }
  body.push(blank);
  body.push(
    center(
      fg(T.fgFaint) +
        (body.length + 1 > H ? "( j/k scroll · any other key closes )" : "( any key )")
    ) + RESET
  );

  // taller than the room: slice from the scroll instead of centering
  if (body.length > H) {
    state.stove.scroll = Math.max(0, Math.min(state.stove.scroll, body.length - H));
    return body
      .slice(state.stove.scroll, state.stove.scroll + H)
      .map((b) => padW(b + bg(T.bg), W) + RESET);
  }
  state.stove.scroll = 0;
  const top = Math.max(0, Math.floor((H - body.length) / 2));
  const lines = [];
  for (let i = 0; i < H; i++) {
    const b = body[i - top];
    lines.push(b ? padW(b + bg(T.bg), W) + RESET : blank);
  }
  return lines;
}

// Colophon — who keeps this bar, and why. Same spirit as stillpoint's:
// a quiet page, a small story, a signature.
function colophonFrame(W, H) {
  const center = (s) =>
    bg(T.bg) + " ".repeat(Math.max(0, Math.floor((W - visW(s)) / 2))) + s;
  const blank = bg(T.bg) + " ".repeat(W) + RESET;

  const body = [];
  body.push(center(fg(T.seg1) + BOLD + `${G.lantern} colophon — who keeps this bar`) + RESET);
  body.push(blank);
  body.push(center(fg(T.fg) + "izakaya started as a question: what if the projects") + RESET);
  body.push(center(fg(T.fg) + "folder felt less like a filing cabinet and more like a place?") + RESET);
  body.push(blank);
  body.push(center(fg(T.fgDim) + "one file, zero dependencies, raw ANSI — a small TokyoNight") + RESET);
  body.push(center(fg(T.fgDim) + "bar where the repos are the menu and the commits are pours.") + RESET);
  body.push(blank);
  body.push(center(fg(T.fgDim) + ITAL + "a sibling of stillpoint: sitting quietly, then building quiet things.") + RESET);
  body.push(blank);
  body.push(center(fg(T.cyan) + `${G.remote} github.com/vajramatt/izakaya`) + RESET);
  body.push(center(fg(T.fgFaint) + `v${versionString()}`) + RESET);
  body.push(blank);
  body.push(center(fg(T.cyan) + "stillpoint.guru" + RESET + bg(T.bg) + fg(T.fgFaint) + "  ·  " + fg(T.cyan) + "crossinginto.ai" + RESET + bg(T.bg) + fg(T.fgFaint) + "  ·  " + fg(T.cyan) + "hologramthoughts.com") + RESET);
  body.push(blank);
  body.push(center(fg(T.fgDim) + "🙏 matt williamson") + RESET);
  body.push(blank);
  body.push(center(fg(T.fgFaint) + "( any key )") + RESET);

  const top = Math.max(0, Math.floor((H - body.length) / 2));
  const lines = [];
  for (let i = 0; i < H; i++) {
    const b = body[i - top];
    lines.push(b ? padW(b + bg(T.bg), W) + RESET : blank);
  }
  return lines;
}

// One frame, one atomic paint. Synchronized output (DEC mode 2026) asks the
// terminal to hold the screen until the whole frame has landed, so a big
// repaint never shows half an old plate under a new ribbon. Terminals that
// don't know the mode ignore it.
function paint(lines) {
  out.write("\x1b[?2026h\x1b[H" + lines.join("\r\n") + "\x1b[?2026l");
}

function render() {
  const W = out.columns || 80;
  const H = out.rows || 24;

  if (state.leaving) {
    paint(farewellFrame(W, H));
    return;
  }

  if (state.asking) {
    paint(askFrame(W, H));
    return;
  }

  if (state.splash) {
    paint(splashFrame(W, H));
    return;
  }

  if (state.help) {
    paint(helpFrame(W, H));
    return;
  }

  if (state.agentPicker) {
    paint(agentFrame(W, H));
    return;
  }

  if (state.colophon) {
    paint(colophonFrame(W, H));
    return;
  }

  if (state.stove) {
    paint(stoveFrame(W, H));
    return;
  }
  const listW = Math.max(26, Math.min(38, Math.floor(W * 0.34)));
  const bodyH = H - 4; // header, rule, rule, footer

  // keep selection visible, and don't leave empty stools at the bottom
  // when the menu shrinks or the window grows under a scrolled list
  const vis = visible();
  state.scroll = Math.max(0, Math.min(state.scroll, vis.length - bodyH));
  if (state.sel < state.scroll) state.scroll = state.sel;
  if (state.sel >= state.scroll + bodyH) state.scroll = state.sel - bodyH + 1;

  const lines = [];
  lines.push(headerLine(W));
  lines.push(hr(W));

  const sel = vis[state.sel];
  const focusIdx =
    state.focus === "board" && sel?.changes?.length ? state.boardSel : -1;
  const board = sel
    ? detailLines(sel, W - listW - 1, focusIdx)
    : {
        lines: state.scanning
          ? ["", `  ${fg(T.fgDim)}${ITAL}warming the sake…`]
          : state.filter
            ? ["", `  ${fg(T.fgDim)}nothing on the menu matches “${state.filter}”`]
            : ["", `  ${fg(T.fgDim)}empty bar — no repos found in ${ROOT}`],
        changeRows: [],
      };
  const peeking = !!(state.peek && sel);
  const detailAll = peeking
    ? peekPane(state.peek, W - listW - 1)
    : board.lines;
  // behind the bar, scroll the board so the focused file stays in view
  if (!peeking && focusIdx >= 0 && board.changeRows[focusIdx] != null) {
    const row = board.changeRows[focusIdx];
    if (row < state.detailScroll) state.detailScroll = row;
    if (row >= state.detailScroll + bodyH) state.detailScroll = row - bodyH + 1;
  }
  // J/K scroll a plate whose details run past a short terminal; the peek
  // keeps its own scroll so setting the glass down lands back on the board
  if (peeking)
    state.peek.scroll = Math.max(
      0, Math.min(state.peek.scroll, detailAll.length - bodyH)
    );
  else
    state.detailScroll = Math.max(
      0, Math.min(state.detailScroll, detailAll.length - bodyH)
    );
  const detail = detailAll.slice(peeking ? state.peek.scroll : state.detailScroll);

  for (let i = 0; i < bodyH; i++) {
    const idx = state.scroll + i;
    const left =
      idx < vis.length
        ? listRow(vis[idx], idx === state.sel, listW)
        : bg(T.bgPanel) + " ".repeat(listW) + RESET;
    const rawRight = detail[i] ?? "";
    const rightW = W - listW - 1;
    const truncated = truncW(rawRight, rightW);
    const right =
      bg(T.bg) + truncated + RESET + bg(T.bg) +
      " ".repeat(Math.max(0, rightW - visW(truncated))) + RESET;
    const divider =
      bg(T.bg) +
      (state.focus === "board" ? fg(T.blue) + BOLD : fg(T.fgFaint)) +
      "│" + RESET;
    lines.push(left + divider + right);
  }

  lines.push(hr(W));
  lines.push(footerLine(W));
  paint(lines);
}

// ─────────────────────────────────────────────────────────────────────────────
// Input & lifecycle
// ─────────────────────────────────────────────────────────────────────────────

function die(msg) {
  cleanup();
  console.error(msg);
  process.exit(1);
}

let cleaned = false;
function cleanup() {
  // runs from leave() AND the process exit handler — emitting ?1049l twice
  // makes the terminal re-restore the saved cursor and the shell prompt then
  // overwrites the farewell, so only ever do this once
  if (cleaned) return;
  cleaned = true;
  out.write("\x1b[?1049l\x1b[?25h");
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
}

// Leaving is a scene, not an exit: the shell's transient prompt can't eat a
// farewell that's still on the alt screen. Hold it, then slip out quietly.
function leave() {
  if (state.leaving) return reallyLeave();
  state.leaving = true;
  state.splash = false;
  clearInterval(splashTimer);
  state.saying = pickSaying();
  setInterval(() => {
    state.phase += 0.016;
    render();
  }, 50);
  setTimeout(reallyLeave, 2800);
  render();
}

function reallyLeave() {
  cleanup();
  console.log(
    `${G.lantern} ${fg(T.magenta)}またね${RESET} — ${state.repos.length} plates served.`
  );
  process.exit(0);
}

function move(d) {
  if (!visible().length) return;
  state.focus = "menu"; // a new plate is a fresh read — come back out front
  state.sel = Math.max(0, Math.min(visible().length - 1, state.sel + d));
  state.detailScroll = 0;
  render();
}

function findRepo(dir, repos = state.repos) {
  for (const repo of repos) {
    if (repo.dir === dir) return repo;
    const child = repo.children && findRepo(dir, repo.children);
    if (child) return child;
  }
  return null;
}

const pouringRooms = new Set(); // dirs whose side rooms are pouring right now

async function expandRepo(repo) {
  // A filter is a way to find the doorway, not a wall around its children.
  // Clear it before opening the tree, then keep the same absolute path selected.
  if (state.filter) {
    state.filter = "";
    state.filtering = false;
    const i = visible().findIndex((r) => r.dir === repo.dir);
    if (i >= 0) state.sel = i;
  }
  if (repo.children === null) {
    // a second → while the rooms are still pouring would pour them twice
    if (pouringRooms.has(repo.dir)) return;
    pouringRooms.add(repo.dir);
    flash(`${G.sake} checking ${repo.name}'s side rooms…`);
    let children;
    try {
      children = await pourChildren(repo);
    } finally {
      pouringRooms.delete(repo.dir);
    }
    // A root rescan may have replaced the plate while its side rooms poured.
    // Land on the live object so the result is not lost.
    repo = findRepo(repo.dir) || repo;
    repo.children = children;
    applySort();
  }
  if (!repo.children.length) {
    state.focus = "board";
    state.boardSel = 0;
    state.detailScroll = 0;
    void fetchGh(repo);
    return render();
  }
  repo.expanded = true;
  // Right means “go in”: land on the first child immediately so its dashboard
  // replaces the parent's, while the indented siblings remain visible below.
  const first = visible().findIndex((r) => r === repo.children[0]);
  if (first >= 0) state.sel = first;
  state.detailScroll = 0;
  render();
}

function backOutTree() {
  const repo = visible()[state.sel];
  if (!repo) return false;
  if (repo.expanded) {
    repo.expanded = false;
    clampSel();
    render();
    return true;
  }
  if (repo.depth > 0) {
    const parentDir = path.dirname(repo.dir);
    const parent = findRepo(parentDir);
    const i = visible().findIndex((r) => r === parent);
    if (i >= 0) state.sel = i;
    state.detailScroll = 0;
    render();
    return true;
  }
  return false;
}

// Behind the bar, up/down read down the board; the upper bound is clamped
// against the pane height in render().
function scrollBoard(d) {
  state.detailScroll = Math.max(0, state.detailScroll + d);
  render();
}

// How many files the cursor can land on behind the bar (capped like the list).
function boardItems() {
  const repo = visible()[state.sel];
  return Math.min(OPEN_TAB_SHOWN, repo?.changes?.length || 0);
}

// Walk the cursor up/down the open tab. With nothing on the tab there's no
// file to pick, so up/down just read the rest of the board instead.
function moveBoard(d) {
  const n = boardItems();
  if (n <= 0) return scrollBoard(d);
  state.boardSel = Math.max(0, Math.min(n - 1, state.boardSel + d));
  render();
}

// The street outside — with GitHub's own gh CLI on the PATH, examining a
// plate (→) quietly asks after its open PRs and latest checks. Lazy (only
// the plate you examine), cached for the session, and silent when gh is
// missing, unauthenticated, or the remote isn't GitHub. Questions only —
// gh never mutates anything here.
const GH = hasBin("gh");

async function fetchGh(repo) {
  if (DEMO || !GH || repo.gh !== undefined) return;
  if (!repo.remote || !repo.remote.startsWith("github.com/")) return;
  // answers land by name — a rescan can swap the plate object out from under
  // this ask, and writing to the stale one would lose the street's reply
  const live = () => findRepo(repo.dir) || repo;
  live().gh = null; // the ask is out
  render();
  let gh;
  try {
    const opts = { cwd: repo.dir, timeout: 8000 };
    const [prs, runs] = await Promise.all([
      execFile("gh", ["pr", "list", "--json", "number", "--limit", "50"], opts),
      execFile("gh", ["run", "list", "--limit", "1", "--json", "status,conclusion"], opts),
    ]);
    gh = {
      prs: JSON.parse(prs.stdout || "[]").length,
      run: JSON.parse(runs.stdout || "[]")[0] || null,
    };
  } catch {
    gh = { prs: null, run: null }; // the street didn't answer — stay quiet
  }
  live().gh = gh;
  render();
}

// ↵ behind the bar: peek the pour — the focused file's diff. HEAD first so
// staged and unstaged land in one glass, then bare / --cached for repos with
// no HEAD yet, then the raw file when it's untracked and git has nothing to
// say. Strictly read-only.
async function openPeek(repo, ch) {
  const p = changePath(ch);
  state.peek = { file: p, lines: null, scroll: 0 };
  render();
  // an untracked folder is one ?? line on the tab — pour what's inside it
  if (p.endsWith("/")) {
    const files = await git(repo.dir, "ls-files", "--others", "--exclude-standard", "--", p);
    if (state.peek?.file !== p) return;
    const list = files ? files.split("\n").filter(Boolean) : [];
    state.peek.lines = list.length
      ? [`new folder — ${list.length} untracked file${list.length === 1 ? "" : "s"}`, "",
         ...list.slice(0, 2000).map((f) => "+ " + scrubText(f))]
      : [];
    return render();
  }
  let text = await git(repo.dir, "diff", "HEAD", "--", p);
  if (!text) text = await git(repo.dir, "diff", "--", p);
  if (!text) text = await git(repo.dir, "diff", "--cached", "--", p);
  if (!text) {
    try {
      const raw = await fs.readFile(path.join(repo.dir, p), "utf8");
      text = raw.split("\n").slice(0, 1000).map((l) => "+" + l).join("\n");
    } catch {}
  }
  if (state.peek?.file !== p) return; // the glass was set down mid-pour
  state.peek.lines = text ? text.split("\n").slice(0, 2000) : [];
  render();
}

// A chunk is a paste only when it carries more than one *character*.
// buf.length counts bytes, so a single multi-byte keypress — é from a dead
// key, a kana from the IME, 🏮 — looks long; replaying it into itself would
// recurse forever. [...k] counts code points and tells the two apart.
const isPaste = (buf, k) =>
  buf.length > 1 && k[0] !== "\x1b" && [...k].length > 1;

// Anything typeable belongs in the filter and the ask scene — one code
// point, space and up, minus DEL and the C1 controls. Escape sequences
// start below 0x20 and never pass.
function printable(k) {
  if ([...k].length !== 1) return false;
  const cp = k.codePointAt(0);
  return cp >= 0x20 && cp !== 0x7f && (cp < 0x80 || cp > 0x9f);
}

// Backspace by code point — a UTF-16 slice(0, -1) would cut an emoji in half
// and leave a lone surrogate behind.
const chopChar = (s) => [...s].slice(0, -1).join("");

function onKey(buf) {
  const k = buf.toString();
  lastInput = Date.now();
  state.ambient = "";
  if (state.leaving) return reallyLeave();
  if (k === "\x03") return reallyLeave();

  // pasted (or pipe-coalesced) input lands as one chunk — replay it per
  // char so a path dropped into the ask scene or the filter isn't lost.
  // escape sequences (arrows etc.) start with \x1b and pass through whole.
  if (isPaste(buf, k)) {
    for (const ch of k) onKey(Buffer.from(ch));
    return;
  }

  if (state.asking) {
    if (k === "\r" || k === "\n") {
      const err = moveBar(state.rootInput);
      if (err) {
        state.askErr = err;
        return render();
      }
      state.asking = false;
      state.askErr = "";
      splashStart = Date.now(); // the logo gets its moment over the fresh pour
      return render();
    }
    if (k === "\x1b" && buf.length === 1) {
      if (!state.askCancel) return; // first visit — the bar needs an address
      state.asking = false;
      state.askErr = "";
      return render();
    }
    if (k === "\x7f" || k === "\b") {
      state.rootInput = chopChar(state.rootInput);
      return render();
    }
    if (printable(k)) {
      state.rootInput += k;
      return render();
    }
    return;
  }

  if (state.splash) {
    // any other key skips the splash
    return endSplash();
  }

  if (state.help) {
    state.help = false;
    return render();
  }

  if (state.agentPicker) {
    const agents = agentsOnFile();
    if (k === "\x1b" || k === "q") {
      state.agentPicker = null;
      return render();
    }
    if (k === "j" || k === "\x1b[B") {
      state.agentPicker.sel = Math.min(agents.length - 1, state.agentPicker.sel + 1);
      return render();
    }
    if (k === "k" || k === "\x1b[A") {
      state.agentPicker.sel = Math.max(0, state.agentPicker.sel - 1);
      return render();
    }
    if (k === "\r" || k === "\n" || k === "n" || k === "r") {
      const repo = findRepo(state.agentPicker.repoDir);
      const agent = agents[state.agentPicker.sel];
      const hasSession = !!repo?.agents?.some((s) => s.id === agent?.id);
      const resume = k === "r" || ((k === "\r" || k === "\n") && hasSession);
      state.agentPicker = null;
      if (repo && agent) return launchAgent(repo, agent, resume);
      return render();
    }
    return;
  }

  if (state.colophon) {
    state.colophon = false;
    return render();
  }

  if (state.stove) {
    if (k === "j" || k === "\x1b[B") {
      state.stove.scroll++; // clamped against the room in stoveFrame
      return render();
    }
    if (k === "k" || k === "\x1b[A") {
      state.stove.scroll = Math.max(0, state.stove.scroll - 1);
      return render();
    }
    state.stove = null;
    return render();
  }

  if (state.peek) {
    if (k === "q") return leave();
    if (k === "j" || k === "\x1b[B" || k === "J") {
      state.peek.scroll++; // clamped against the pane in render
      return render();
    }
    if (k === "k" || k === "\x1b[A" || k === "K") {
      state.peek.scroll = Math.max(0, state.peek.scroll - 1);
      return render();
    }
    if (k === "g") { state.peek.scroll = 0; return render(); }
    if (k === "G") { state.peek.scroll = Infinity; return render(); } // clamped in render
    // anything else — esc, ←, ↵ — sets the glass down
    state.peek = null;
    return render();
  }

  if (state.filtering) {
    if (k === "\x1b" && buf.length === 1) {
      state.filtering = false;
      state.filter = "";
      clampSel();
      return render();
    }
    if (k === "\r" || k === "\n") {
      state.filtering = false;
      return render();
    }
    if (k === "\x7f" || k === "\b") {
      state.filter = chopChar(state.filter);
      clampSel();
      return render();
    }
    if (k === "\x1b[B") return move(1);
    if (k === "\x1b[A") return move(-1);
    if (printable(k)) {
      state.filter += k;
      state.sel = 0;
      return render();
    }
    return;
  }

  if (k === "q") return leave();
  if (k === "\x1b" && buf.length === 1) {
    if (state.focus === "board") {
      state.focus = "menu";
      return render();
    }
    if (state.filter) {
      state.filter = "";
      clampSel();
      return render();
    }
    if (state.dirtyOnly) {
      state.dirtyOnly = false;
      clampSel();
      return render();
    }
    return leave();
  }
  if (k === "/") {
    state.filtering = true;
    state.filter = "";
    state.sel = 0;
    state.focus = "menu";
    return render();
  }
  if (k === "\t") {
    const repo = visible()[state.sel];
    if (state.focus === "board") {
      state.focus = "menu";
    } else if (repo) {
      state.focus = "board";
      state.boardSel = 0;
      state.detailScroll = 0;
      void fetchGh(repo);
    }
    return render();
  }
  if (k === "\x1b[C" || k === "l") {
    // → opens a plate's subfolders first; once open, step behind the bar
    if (state.focus === "menu" && visible()[state.sel]) {
      const repo = visible()[state.sel];
      if (repo.expanded) {
        state.focus = "board";
        state.boardSel = 0;
        state.detailScroll = 0;
        void fetchGh(repo); // examining a plate asks the street
        render();
      } else void expandRepo(repo);
    }
    return;
  }
  if (k === "\x1b[D" || k === "h") {
    // ← back out front to the menu
    if (state.focus === "board") {
      state.focus = "menu";
      return render();
    }
    if (backOutTree()) return;
    return;
  }
  if (k === "j" || k === "\x1b[B")
    return state.focus === "board" ? moveBoard(1) : move(1);
  if (k === "k" || k === "\x1b[A")
    return state.focus === "board" ? moveBoard(-1) : move(-1);
  if (k === "g") {
    if (state.focus === "board") { state.boardSel = 0; return render(); }
    return move(-Infinity);
  }
  if (k === "G") {
    if (state.focus === "board") return moveBoard(Infinity);
    return move(Infinity);
  }
  if (k === "J") {
    state.detailScroll++; // clamped against the pane in render
    return render();
  }
  if (k === "K") {
    state.detailScroll = Math.max(0, state.detailScroll - 1);
    return render();
  }
  if (k === "?") {
    state.help = true;
    return render();
  }
  if (k === "~") {
    state.colophon = true;
    return render();
  }
  if (k === "!") {
    state.stove = { scroll: 0 };
    return render();
  }
  if (k === "d") {
    state.dirtyOnly = !state.dirtyOnly;
    state.sel = 0;
    state.scroll = 0;
    state.detailScroll = 0;
    state.focus = "menu";
    clampSel();
    return flash(
      state.dirtyOnly ? `${G.dot} dirty plates only` : `${G.ok} the full menu`
    );
  }
  if (k === "w") {
    state.asking = true;
    state.focus = "menu";
    state.askCancel = true;
    state.askErr = "";
    state.rootInput = ROOT.replace(os.homedir(), "~");
    return render();
  }
  if (k === "s") {
    state.sort = state.sort === "recent" ? "name" : state.sort === "name" ? "size" : "recent";
    applySort();
    return render();
  }
  if (k === "T") {
    // change the lanterns — cycle the theme live and remember the choice
    const names = Object.keys(THEMES);
    const next = names[(names.indexOf(themeName) + 1) % names.length];
    applyTheme(next);
    if (!DEMO) saveConfig({ theme: next });
    return flash(`${G.lantern} the lanterns change — ${next}`);
  }
  if (k === "r" && !state.scanning) {
    state.status = "";
    return void scanAll();
  }

  const sel = visible()[state.sel];
  if (!sel) return;
  if (k === "a") {
    state.agentPicker = { repoDir: sel.dir, sel: 0 };
    return render();
  }
  // behind the bar with a file under the cursor, the keys narrow their aim:
  // ↵ peeks the pour, e edits that file, y copies its path, o reveals it.
  // Out front they keep working on the whole plate, exactly as before.
  const focused =
    state.focus === "board" && boardItems() > 0
      ? sel.changes[state.boardSel] || null
      : null;
  if (focused && (k === "\r" || k === "\n" || k === " "))
    return void openPeek(sel, focused);
  if (k === "o") {
    if (focused) {
      const p = changePath(focused);
      if (DEMO || revealPath(path.join(sel.dir, p))) flash(`${G.folder} revealed ${p}`);
      else flash(`${G.folder} no opener — install xdg-utils (xdg-open)`);
      return;
    }
    if (DEMO || openPath(sel.dir)) flash(`${G.folder} opened ${sel.name}`);
    else flash(`${G.folder} no opener — install xdg-utils (xdg-open)`);
  }
  if (k === "t") openAtRepo(sel, null, `${G.term} pulled up a stool at ${sel.name}`);
  if (k === "u") {
    // the usual — the user's own session script, fired at the repo. Comes
    // only from their config or env, never from anything found inside a
    // scanned repo: browsing a cloned repo must never execute its code.
    const usual = (process.env.IZAKAYA_USUAL || loadConfig().usual || "").trim();
    if (!usual)
      return flash(
        `${G.term} no usual on file — set IZAKAYA_USUAL or "usual" in config (README)`
      );
    openAtRepo(
      sel,
      `exec ${usual} ${shq(sel.dir)}`,
      `${G.term} the usual, coming right up — ${sel.name}`
    );
  }
  if (k === "e") {
    if (focused) {
      const p = changePath(focused);
      return openAtRepo(sel, "exec ${EDITOR:-vim} " + shq(p), `${G.edit} editing ${p}`);
    }
    openAtRepo(sel, "exec ${EDITOR:-vim} .", `${G.edit} editing ${sel.name}`);
  }
  if (k === "c") launchAgent(sel, BUILTIN_AGENTS[0], false);
  if (k === "C") {
    // compatibility shortcut: the neutral picker is `a`, but c/C stay muscle memory
    if (!sel.agents?.some((a) => a.id === "claude"))
      return flash(`${G.claude} no claude session at this plate — c starts one`);
    launchAgent(sel, BUILTIN_AGENTS[0], true);
  }
  if (k === "\r" || k === "\n") {
    // sit down: leave the seat for the iz() wrapper to cd into (see README)
    if (!DEMO)
      try {
        fsSync.mkdirSync(path.dirname(SEAT_FILE), { recursive: true });
        fsSync.writeFileSync(SEAT_FILE, sel.dir);
      } catch {}
    return leave();
  }
  if (k === "b") {
    if (!sel.remote) return flash(`${G.remote} no remote — house brew only`);
    if (DEMO || openUrl(`https://${sel.remote}`)) flash(`${G.remote} browsing ${sel.remote}`);
    else flash(`${G.remote} no opener — install xdg-utils (xdg-open)`);
  }
  if (k === "y") {
    const target = focused ? path.join(sel.dir, changePath(focused)) : sel.dir;
    // copyText always lands somewhere — a native tool, or the terminal
    // itself via OSC 52 — so the coaster is a promise, not a hope
    if (!DEMO) copyText(target);
    flash(`${G.copy} path on a coaster — ${target.replace(os.homedir(), "~")}`);
  }
}

// t/e/c share the same shape: open a terminal at the repo, optionally running
// `inner`. On Linux with no terminal found, say so and — since the keypress
// shouldn't vanish — fall back to opening the folder.
function openAtRepo(sel, inner, okMsg) {
  if (DEMO || openTerminal(sel.dir, inner)) return flash(okMsg);
  if (hasBin("xdg-open")) spawnDetached("xdg-open", [sel.dir]);
  flash(`${G.term} no terminal — set $IZAKAYA_TERMINAL or terminal in config (README); opened folder`);
}

function launchAgent(repo, agent, resume = false) {
  const binary = agent.command.split(/\s+/)[0];
  if (!agent.custom && !hasBin(binary))
    return flash(`${G.agent} ${agent.label} is not installed`);
  if (resume && !agent.custom && !repo.agents?.some((s) => s.id === agent.id))
    return flash(`${G.agent} no ${agent.label} session at this plate — n starts one`);
  if (resume && !agent.resume)
    return flash(`${G.agent} ${agent.label} has no resume command on file`);
  const command = resume ? agent.resume : agent.command;
  openAtRepo(
    repo,
    `exec ${command}`,
    `${G[agent.icon] || G.agent} ${agent.label} ${resume ? "picks up the thread" : "pulls up a stool"} — ${repo.name}`
  );
}

let flashTimer;
function flash(msg, ms = 2000) {
  state.status = msg;
  render();
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { state.status = ""; render(); }, ms);
}

// ── Ambience ─────────────────────────────────────────────────────────────
// Leave the bar alone for half a minute and it quietly lives: a soft line
// in the footer, steam drifting, the line changing now and then. Any key
// snaps it back to business.
const AMBIENCE = [
  "the master wipes a glass",
  "steam curls off the kettle",
  "the lantern sways a little",
  "chopsticks click at the far table",
  "the radio hums an old song",
  "someone laughs in the kitchen",
  "the noren flutters in the doorway",
];
const IDLE_MS = 30_000;
let lastInput = Date.now();
let ambientTick = 0;

if (IS_MAIN && !TAKEOUT)
  setInterval(() => {
    if (
      state.splash || state.leaving || state.asking || state.stove ||
      state.help || state.colophon || state.filtering || state.status
    )
      return;
    if (Date.now() - lastInput < IDLE_MS) {
      if (state.ambient) {
        state.ambient = "";
        render();
      }
      return;
    }
    ambientTick++;
    if (!state.ambient || ambientTick % 14 === 0)
      state.ambient = AMBIENCE[Math.floor(Math.random() * AMBIENCE.length)];
    render();
  }, 1000);

// ── The agent pulse ──────────────────────────────────────────────────────
// Agents work while you browse. Every 20 seconds the bar re-reads who's been
// talking (session-file mtimes only — nothing opened that wasn't already)
// so the magenta marks and the header's "cooking" count stay true.
let pulsing = false;
if (IS_MAIN && !TAKEOUT)
  setInterval(async () => {
    if (state.scanning || state.leaving || pulsing) return;
    pulsing = true;
    try {
      codexSessionsPromise = undefined;
      for (const r of treeRepos()) r.agents = await agentSessions(r.dir);
    } finally {
      pulsing = false;
    }
    render();
  }, 20_000);

// ─────────────────────────────────────────────────────────────────────────────
// Platform — the launch keys (o t e c b y) are the only things that touch the
// OS, so the OS lives here and nowhere else. Detect once; each primitive does
// the right thing on mac and Linux, and degrades to a hint where a tool's
// missing rather than crashing or no-op'ing silently. Mac is the reference
// build — its path is byte-for-byte what it always was.
// ─────────────────────────────────────────────────────────────────────────────

const isMac = process.platform === "darwin";
const isLinux = process.platform === "linux";

// `which`, zero-dep: walk $PATH looking for an executable. A name with a slash
// is treated as a literal path.
function hasBin(name) {
  if (!name) return false;
  if (name.includes("/")) {
    try { fsSync.accessSync(name, fsSync.constants.X_OK); return true; } catch { return false; }
  }
  for (const d of (process.env.PATH || "").split(path.delimiter)) {
    if (!d) continue;
    try { fsSync.accessSync(path.join(d, name), fsSync.constants.X_OK); return true; } catch {}
  }
  return false;
}

// Shell-quote one argument — POSIX single-quote escaping, so a filename with
// spaces or quotes survives the trip through `$SHELL -lc`.
const shq = (s) => `'${s.replaceAll("'", `'\\''`)}'`;

// One detached launch. The error handler matters on Linux: spawning a missing
// binary fires an async 'error' event that would otherwise crash the bar.
function spawnDetached(bin, args, cwd) {
  const opts = { detached: true, stdio: "ignore" };
  if (cwd) opts.cwd = cwd;
  const child = spawn(bin, args, opts);
  child.on("error", () => {});
  child.unref();
}

// o — reveal the repo in the file manager. Returns false if there's no opener.
function openPath(dir) {
  if (isMac) { spawnDetached("open", [dir]); return true; }
  // TODO(linux): verify xdg-open lands the repo in the user's file manager.
  if (hasBin("xdg-open")) { spawnDetached("xdg-open", [dir]); return true; }
  return false;
}

// o behind the bar — reveal a single file rather than open it. mac's
// `open -R` selects it in Finder; Linux gets the containing folder, which is
// the closest xdg-open can promise.
function revealPath(file) {
  if (isMac) { spawnDetached("open", ["-R", file]); return true; }
  if (hasBin("xdg-open")) { spawnDetached("xdg-open", [path.dirname(file)]); return true; }
  return false;
}

// b — open the remote in the browser. Returns false if there's no opener.
function openUrl(url) {
  if (isMac) { spawnDetached("open", [url]); return true; }
  // TODO(linux): verify xdg-open opens the URL in the default browser.
  if (hasBin("xdg-open")) { spawnDetached("xdg-open", [url]); return true; }
  return false;
}

// OSC 52 — the escape-sequence clipboard. The terminal itself is asked to
// hold the text: zero processes, works over a bare SSH session, and tmux
// (with its default set-clipboard) passes it through. Every terminal this
// bar is built for answers it (Ghostty, kitty, WezTerm, alacritty, foot,
// Windows Terminal); one that doesn't simply ignores the sequence.
function oscCopy(text) {
  out.write(`\x1b]52;c;${Buffer.from(text, "utf8").toString("base64")}\x07`);
  return true;
}

// y — copy to the system clipboard. mac keeps pbcopy (the reference build,
// unchanged); Linux prefers a native tool. With nothing installed, the
// terminal itself is asked via OSC 52 — the key degrades to a quieter kind
// of magic instead of a hint.
function copyText(text) {
  let bin, args;
  if (isMac) {
    bin = "pbcopy"; args = [];
  } else {
    // TODO(linux): verify each of these actually populates the clipboard —
    // wl-copy under Wayland, xclip/xsel under X11.
    if (process.env.WAYLAND_DISPLAY && hasBin("wl-copy")) { bin = "wl-copy"; args = []; }
    else if (hasBin("xclip")) { bin = "xclip"; args = ["-selection", "clipboard"]; }
    else if (hasBin("xsel")) { bin = "xsel"; args = ["--clipboard", "--input"]; }
    else return oscCopy(text);
  }
  try {
    const child = spawn(bin, args, { stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", () => {});
    child.stdin.end(text);
  } catch { return oscCopy(text); }
  return true;
}

// Linux terminal emulators we know how to drive. Each turns (dir, prog[]) into
// the emulator's argv tail — kitty/foot take the program positionally, wezterm
// wants it after `--`, alacritty after `-e` (which must come last). Flags
// verified against current docs (2026-06); they drift, so re-check on upgrade.
const LINUX_TERMS = {
  kitty:     (dir, prog) => ["--directory", dir, ...prog],
  wezterm:   (dir, prog) => ["start", "--cwd", dir, ...(prog.length ? ["--", ...prog] : [])],
  alacritty: (dir, prog) => ["--working-directory", dir, ...(prog.length ? ["-e", ...prog] : [])],
  foot:      (dir, prog) => [`--working-directory=${dir}`, ...prog],
};
const LINUX_TERM_ORDER = ["kitty", "wezterm", "alacritty", "foot"];

// Spawn `tokens` (a "kitty" / "/usr/bin/wezterm --flag" style string) as a
// terminal at `dir` running `prog`. If the binary's basename is one we know,
// use its flag profile; otherwise inherit the working directory via cwd and
// just append the program — best effort for an emulator we can't speak to.
function spawnTermTokens(tokens, dir, prog) {
  const bin = tokens[0];
  const extra = tokens.slice(1);
  const profile = LINUX_TERMS[path.basename(bin)];
  if (profile) spawnDetached(bin, [...extra, ...profile(dir, prog)]);
  else spawnDetached(bin, [...extra, ...prog], dir);
}

// t/e/c on Linux: pick the first terminal we can find and open it at `dir`,
// optionally running `inner` (a shell command line). Returns false if nothing
// is available so the caller can point the user at the config.
function spawnLinuxTerminal(dir, inner) {
  // $SHELL -lc so the command sees the user's login environment ($EDITOR etc.),
  // falling back to /bin/sh. A bare terminal (t) gets no program — the emulator
  // opens the user's default shell.
  const prog = inner ? [process.env.SHELL || "/bin/sh", "-lc", inner] : [];

  // 1. explicit override — trust it even if hasBin can't see it (the user
  //    knows their setup); a bad name just fails quietly via spawnDetached.
  const override = (process.env.IZAKAYA_TERMINAL || loadConfig().terminal || "").trim();
  if (override) { spawnTermTokens(override.split(/\s+/), dir, prog); return true; }

  // 2–5. known emulators, in priority order
  for (const name of LINUX_TERM_ORDER)
    if (hasBin(name)) { spawnDetached(name, LINUX_TERMS[name](dir, prog)); return true; }

  // 6. $TERMINAL, best effort
  const envTerm = (process.env.TERMINAL || "").trim();
  if (envTerm) { spawnTermTokens(envTerm.split(/\s+/), dir, prog); return true; }

  return false;
}

// Inside tmux, a "new window" means a tmux window — the user lives in the
// multiplexer; popping an OS window over it would miss the point entirely.
// Applies on every platform, ahead of the per-OS paths.
function openTmuxWindow(dir, inner) {
  const args = ["new-window", "-c", dir];
  if (inner) args.push(process.env.SHELL || "/bin/sh", "-lc", inner);
  spawnDetached("tmux", args);
}

// t/e/c — open a terminal at `dir`, optionally running shell command `inner`.
// Mac is unchanged (Ghostty → Terminal.app), and always "succeeds" because of
// its fallback; Linux returns false when no terminal could be found.
function openTerminal(dir, inner) {
  if (process.env.TMUX && hasBin("tmux")) {
    openTmuxWindow(dir, inner);
    return true;
  }
  if (isMac) {
    // shq, not bare quotes — `inner` can now carry a quoted filename
    void openGhosttyWindow(dir, inner ? `/bin/zsh -lc ${shq(inner)}` : undefined);
    return true;
  }
  return spawnLinuxTerminal(dir, inner);
}

async function openGhosttyWindow(dir, cmd) {
  // A running Ghostty ignores `open --args`, so use its AppleScript interface
  // (Ghostty ≥1.3). Raw event codes from Ghostty.sdef — the terminology form
  // doesn't compile under osascript. GScD = initial working directory,
  // GScC = command to run instead of the shell.
  const script = [
    'tell application "Ghostty"',
    "  set cfg to «event GhstNSCf»",
    `  set «class GScD» of cfg to ${JSON.stringify(dir)}`,
    ...(cmd ? [`  set «class GScC» of cfg to ${JSON.stringify(cmd)}`] : []),
    "  «event GhstNWin» given «class GNwS»:cfg",
    "  activate",
    "end tell",
  ].join("\n");
  try {
    await fs.access("/Applications/Ghostty.app");
    await execFile("osascript", ["-e", script], { timeout: 5000 });
  } catch {
    spawn("open", ["-a", "Terminal", dir], { detached: true, stdio: "ignore" }).unref();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Opening the bar — everything below runs only when this file was invoked
// directly. Imported (the tasting flight), the file ends here: helpers
// defined, no terminal touched, nothing keeping the process alive.
// ─────────────────────────────────────────────────────────────────────────────

if (IS_MAIN) {

// The takeout window goes first — scan, print, leave. No TTY, no alt
// screen, no seat, no cache written. (Top-level await: the module IS the
// program here.)
if (TAKEOUT) {
  // `--report | head` closes the pipe early — that's fine, leave quietly
  process.stdout.on("error", (e) => {
    if (e.code === "EPIPE") process.exit(0);
    throw e;
  });
  if (TAKEOUT === "standup") await printStandup(TAKEOUT_JSON);
  const plates = await scanHeadless();
  if (TAKEOUT === "report") printReport(plates);
  else printClosingTime(plates, TAKEOUT_JSON);
}

// `iz ramen` — the query rides in ahead of the bar. If last visit's menu
// knows exactly one plate that answers (or one exact name), skip the TUI
// entirely: write the seat and let the iz() wrapper cd you there. Anything
// else opens the bar pre-filtered, ready to narrow.
if (ARG_QUERY && !DEMO) {
  const menu = loadMenu();
  if (menu) {
    const hits = menu
      .map((r) => [fuzzyScore(ARG_QUERY, r.name), r])
      .filter(([s]) => s >= 0)
      .sort((a, b) => b[0] - a[0]);
    const exact = hits.filter(([, r]) => r.name.toLowerCase() === ARG_QUERY.toLowerCase());
    const pick = exact.length === 1 ? exact[0][1] : hits.length === 1 ? hits[0][1] : null;
    if (pick && fsSync.existsSync(pick.dir)) {
      try {
        fsSync.mkdirSync(path.dirname(SEAT_FILE), { recursive: true });
        fsSync.writeFileSync(SEAT_FILE, pick.dir);
      } catch {}
      process.stdout.write(
        `${G.lantern} ${fg(T.magenta)}seated${RESET} — ${pick.dir.replace(os.homedir(), "~")}\n`
      );
      process.exit(0);
    }
  }
  state.filter = ARG_QUERY;
}

if (!process.stdout.isTTY || !process.stdin.isTTY) {
  console.error("izakaya needs a TTY — come sit at the bar.");
  process.exit(1);
}

out.write("\x1b[?1049h\x1b[?25l\x1b[2J");
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("data", onKey);
out.on("resize", render);
setInterval(render, 30_000); // keep the header clock honest
process.on("SIGINT", reallyLeave);
process.on("SIGTERM", reallyLeave);
process.on("exit", cleanup);

// a seat left over from a crashed visit would teleport the iz() wrapper
try { fsSync.unlinkSync(SEAT_FILE); } catch {}

if (FIRST_VISIT && !DEMO) {
  state.asking = true;
  state.askCancel = false;
  state.rootInput = "~/code";
  render();
} else {
  const cached = loadMenu();
  if (cached) {
    lastVisitMenu = cached; // held for the "since your last visit" pour
    state.repos = cached;
    applySort();
    maybeEndSplash(); // yesterday's menu is already out — don't hold the curtain
  }
  scanAll();
}

} // IS_MAIN — the bar is open (or the file was only read, and we're done)

// ─────────────────────────────────────────────────────────────────────────────
// The tasting flight — pure helpers, exported for test/ to taste. Nothing
// here has side effects; the bar itself only opens behind IS_MAIN above.
// ─────────────────────────────────────────────────────────────────────────────

export {
  charW, visW, truncW, padW,
  fuzzyScore, relTime, fmtBytes,
  changeMark, changePath, scrubRemote,
  expandHome, shq, isPaste, printable, chopChar, scrubText,
  applyTheme, gradColor, langMeta, closingFacts,
  agentDefinitions, codexSessionMeta, aiTally, parseWorktrees,
  offBranch, lastSeen, standupSince,
  THEMES, T, LANGS, G,
};
