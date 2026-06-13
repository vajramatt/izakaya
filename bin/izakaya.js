#!/usr/bin/env node
// 居酒屋 izakaya — a cozy little bar where your repos are the menu.
// Zero-dependency TokyoNight TUI for the repos in your code directory.

import { promisify } from "node:util";
import { execFile as execFileCb, spawn } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";

const execFile = promisify(execFileCb);

// ─────────────────────────────────────────────────────────────────────────────
// Theme — TokyoNight (Night) panes + the segment colors from the Starship
// TokyoNight preset so the header reads like the prompt it sits above.
// ─────────────────────────────────────────────────────────────────────────────

const T = {
  bg: "#1a1b26",
  bgPanel: "#16161e",
  bgHi: "#292e42",
  fg: "#c0caf5",
  fgDim: "#565f89",
  fgFaint: "#3b4261",
  blue: "#7aa2f7",
  cyan: "#7dcfff",
  teal: "#73daca",
  green: "#9ece6a",
  yellow: "#e0af68",
  orange: "#ff9e64",
  red: "#f7768e",
  magenta: "#bb9af7",
  // starship prompt segments
  seg0: "#a3aed2",
  seg1: "#769ff0",
  seg2: "#394260",
  seg3: "#212736",
  seg4: "#1d2230",
  segFg: "#e3e5e5",
  segDim: "#a0a9cb",
};

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
  clean: "",
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
  search: "",
  tag: "",
  users: "",
  pulse: "",
  warn: "",
  ok: "",
  lantern: "🏮",
  sake: "",
  copy: "",
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

// TokyoNight gradient stops: blue → cyan → purple → teal → green → pink.
const STOPS = [
  [122, 162, 247], [125, 207, 255], [187, 154, 247], [115, 218, 202], [158, 206, 106], [247, 118, 142],
];

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

// Deal sayings from a persistent shuffled deck instead of rolling dice —
// independent random draws repeat fast (birthday problem), so you'd hear
// "gold coins to a cat" three nights in a row. The cursor lives in ~/.cache.
const SAYING_DECK = path.join(os.homedir(), ".cache", "izakaya", "sayings.json");

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
  ts: { name: "TypeScript", color: T.blue, icon: "" },
  tsx: { name: "TypeScript", color: T.blue, icon: "" },
  mts: { name: "TypeScript", color: T.blue, icon: "" },
  cts: { name: "TypeScript", color: T.blue, icon: "" },
  js: { name: "JavaScript", color: T.yellow, icon: "" },
  jsx: { name: "JavaScript", color: T.yellow, icon: "" },
  mjs: { name: "JavaScript", color: T.yellow, icon: "" },
  cjs: { name: "JavaScript", color: T.yellow, icon: "" },
  astro: { name: "Astro", color: T.orange, icon: "" },
  svelte: { name: "Svelte", color: T.orange, icon: "" },
  vue: { name: "Vue", color: T.green, icon: "" },
  rs: { name: "Rust", color: T.orange, icon: "" },
  go: { name: "Go", color: T.cyan, icon: "" },
  py: { name: "Python", color: T.green, icon: "" },
  rb: { name: "Ruby", color: T.red, icon: "" },
  php: { name: "PHP", color: T.magenta, icon: "" },
  swift: { name: "Swift", color: T.orange, icon: "" },
  css: { name: "CSS", color: T.magenta, icon: "" },
  scss: { name: "SCSS", color: T.magenta, icon: "" },
  html: { name: "HTML", color: T.red, icon: "" },
  md: { name: "Markdown", color: T.fgDim, icon: "" },
  mdx: { name: "MDX", color: T.fgDim, icon: "" },
  json: { name: "JSON", color: T.teal, icon: "" },
  jsonc: { name: "JSON", color: T.teal, icon: "" },
  toml: { name: "TOML", color: T.teal, icon: "" },
  yaml: { name: "YAML", color: T.teal, icon: "" },
  yml: { name: "YAML", color: T.teal, icon: "" },
  sql: { name: "SQL", color: T.cyan, icon: "" },
  sh: { name: "Shell", color: T.green, icon: "" },
  zsh: { name: "Shell", color: T.green, icon: "" },
  bash: { name: "Shell", color: T.green, icon: "" },
};

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".astro", ".wrangler", ".next",
  ".svelte-kit", "vendor", "target", "coverage", ".cache", ".turbo", "out",
  ".vercel", ".output", ".DS_Store",
]);

// Stack detection — "today's specials"
const STACK_CHIPS = [
  { dep: "hono", label: " hono", color: T.orange },
  { dep: "react", label: " react", color: T.cyan },
  { dep: "astro", label: " astro", color: T.orange },
  { dep: "vite", label: " vite", color: T.magenta },
  { dep: "drizzle-orm", label: " drizzle", color: T.green },
  { dep: "tailwindcss", label: "󱏿 tailwind", color: T.cyan },
  { dep: "svelte", label: " svelte", color: T.orange },
  { dep: "next", label: " next", color: T.fg },
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

const expandHome = (p) =>
  p === "~" ? os.homedir() : p.replace(/^~\//, os.homedir() + "/");

const ARG_ROOT = process.argv[2] || process.env.IZAKAYA_ROOT || null;
let ROOT = path.resolve(
  expandHome(ARG_ROOT || loadConfig().root || path.join(os.homedir(), "code"))
);
// Nothing pointed the way and nothing is saved — ask before opening.
const FIRST_VISIT = !ARG_ROOT && !loadConfig().root;

// IZAKAYA_DEMO=1 keeps the o/t/e/c flashes but skips the real launches —
// used by docs/demo.tape so recording the GIF doesn't spawn windows.
const DEMO = !!process.env.IZAKAYA_DEMO;

// Warm start: last visit's menu, keyed by root so the demo bar and the real
// one never mix. The bar opens instantly on yesterday's plates while the
// kitchen re-checks every one of them. The seat file is the cd target for
// the iz() shell wrapper (see README) — written on ↵, eaten by the wrapper.
const MENU_CACHE = path.join(os.homedir(), ".cache", "izakaya", "menu.json");
const SEAT_FILE = path.join(os.homedir(), ".cache", "izakaya", "seat");

function loadMenu() {
  if (DEMO) return null;
  try {
    const repos = JSON.parse(fsSync.readFileSync(MENU_CACHE, "utf8"))[ROOT];
    if (Array.isArray(repos) && repos.length) return repos;
  } catch {}
  return null;
}

function saveMenu() {
  if (DEMO) return;
  try {
    let all = {};
    try { all = JSON.parse(fsSync.readFileSync(MENU_CACHE, "utf8")); } catch {}
    all[ROOT] = state.repos;
    fsSync.mkdirSync(path.dirname(MENU_CACHE), { recursive: true });
    fsSync.writeFileSync(MENU_CACHE, JSON.stringify(all));
  } catch {}
}

async function git(cwd, ...args) {
  try {
    const { stdout } = await execFile("git", args, { cwd, timeout: 5000 });
    return stdout.trim();
  } catch {
    return null;
  }
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
      try { size = (await fs.stat(p)).size; } catch {}
      acc.bytes += size;
      const lang = LANGS[ext];
      if (lang) acc.langs[lang.name] = (acc.langs[lang.name] || 0) + size;
    }
  }
}

async function scanRepo(dirent) {
  const dir = path.join(ROOT, dirent.name);
  const repo = {
    name: dirent.name,
    dir,
    isGit: false,
    branch: null,
    dirty: 0,
    ahead: 0,
    behind: 0,
    commits: 0,
    lastMsg: null,
    lastAuthor: null,
    lastUnix: 0,
    remote: null,
    files: 0,
    bytes: 0,
    langs: [],
    chips: [],
    version: null,
    ai: null,
    hasClaudeMd: false,
    readmeTitle: null,
    recent: [],
    weeks: new Array(12).fill(0),
    chefs: [],
    branches: 0,
    tags: 0,
    stash: 0,
  };

  try {
    await fs.access(path.join(dir, ".git"));
    repo.isGit = true;
  } catch {}

  if (repo.isGit) {
    const [branch, status, log, count, remote, ab, recent, activity, authors, branches, tags, stash, aiLog] = await Promise.all([
      git(dir, "rev-parse", "--abbrev-ref", "HEAD"),
      git(dir, "status", "--porcelain"),
      git(dir, "log", "-1", "--format=%s%x00%an%x00%ct"),
      git(dir, "rev-list", "--count", "HEAD"),
      git(dir, "remote", "get-url", "origin"),
      git(dir, "rev-list", "--left-right", "--count", "@{u}...HEAD"),
      git(dir, "log", "-4", "--format=%ct%x00%s"),
      git(dir, "log", "--since=84.days", "--format=%ct", "-n", "500"),
      git(dir, "log", "--format=%an", "-n", "300"),
      git(dir, "branch", "--format=%(refname:short)"),
      git(dir, "tag"),
      git(dir, "stash", "list"),
      // commit bodies, hash-keyed, to sniff AI co-author trailers
      git(dir, "log", "--format=%H%x1f%b%x1e", "-n", "500"),
    ]);
    repo.branch = branch || "—";
    repo.dirty = status ? status.split("\n").filter(Boolean).length : 0;
    if (log) {
      const [msg, author, ct] = log.split("\0");
      repo.lastMsg = msg;
      repo.lastAuthor = author;
      repo.lastUnix = parseInt(ct, 10) || 0;
    }
    repo.commits = parseInt(count || "0", 10) || 0;
    if (remote) {
      repo.remote = remote
        // never surface an embedded user:token@ credential (e.g. an https PAT)
        .replace(/\/\/[^/@]+@/, "//")
        .replace(/^git@([^:]+):/, "$1/")
        .replace(/^https?:\/\//, "")
        .replace(/\.git$/, "");
    }
    if (ab) {
      const [behind, ahead] = ab.split(/\s+/).map((n) => parseInt(n, 10) || 0);
      repo.behind = behind;
      repo.ahead = ahead;
    }
    if (recent)
      repo.recent = recent.split("\n").filter(Boolean).map((l) => {
        const [ct, msg] = l.split("\0");
        return { ct: parseInt(ct, 10) || 0, msg: msg || "" };
      });
    if (activity) {
      const now = Date.now() / 1000;
      for (const l of activity.split("\n")) {
        const ct = parseInt(l, 10);
        if (!ct) continue;
        const idx = 11 - Math.floor((now - ct) / (7 * 86400));
        if (idx >= 0 && idx <= 11) repo.weeks[idx]++;
      }
    }
    if (authors) {
      const m = new Map();
      for (const a of authors.split("\n")) if (a) m.set(a, (m.get(a) || 0) + 1);
      repo.chefs = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3);
    }
    repo.branches = branches ? branches.split("\n").filter(Boolean).length : 0;
    repo.tags = tags ? tags.split("\n").filter(Boolean).length : 0;
    repo.stash = stash ? stash.split("\n").filter(Boolean).length : 0;

    // Who else was behind the bar — Claude Code stamps the model on every
    // pour it helps with: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
    // Tally how many of the recent pours carry that mark, and which models.
    if (aiLog) {
      const counts = new Map();
      let total = 0, assisted = 0;
      for (const rec of aiLog.split("\x1e")) {
        const cut = rec.indexOf("\x1f");
        if (cut < 0) continue; // trailing split artifact / non-commit chaff
        total++;
        const body = rec.slice(cut + 1);
        const seen = new Set(); // one commit can name a model more than once
        for (const line of body.split("\n")) {
          if (!/co-?authored-by:/i.test(line)) continue;
          if (!/claude|anthropic/i.test(line)) continue;
          const m = line.match(/Claude(?:\s+(Opus|Sonnet|Haiku|Fable)\s+([\d.]+))?/i);
          seen.add(
            m && m[1]
              ? `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`
              : "Claude"
          );
        }
        if (seen.size) {
          assisted++;
          for (const label of seen) counts.set(label, (counts.get(label) || 0) + 1);
        }
      }
      if (assisted > 0)
        repo.ai = {
          models: [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([label, count]) => ({ label, count })),
          assisted,
          total,
        };
    }
  }

  const acc = { files: 0, bytes: 0, langs: {} };
  await walkStats(dir, acc);
  repo.files = acc.files;
  repo.bytes = acc.bytes;
  const total = Object.values(acc.langs).reduce((a, b) => a + b, 0) || 1;
  repo.langs = Object.entries(acc.langs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, bytes]) => ({
      name,
      pct: (bytes / total) * 100,
      color: Object.values(LANGS).find((l) => l.name === name)?.color || T.fgDim,
      icon: Object.values(LANGS).find((l) => l.name === name)?.icon || "",
    }));

  try {
    const pkg = JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const chip of STACK_CHIPS) if (deps[chip.dep]) repo.chips.push(chip);
    if (pkg.version) repo.version = pkg.version;
  } catch {}
  for (const wf of ["wrangler.jsonc", "wrangler.json", "wrangler.toml"]) {
    try {
      await fs.access(path.join(dir, wf));
      repo.chips.unshift({ label: " worker", color: T.orange });
      break;
    } catch {}
  }

  try {
    await fs.access(path.join(dir, "CLAUDE.md"));
    repo.hasClaudeMd = true;
  } catch {}

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
        line?.replace(/^#+\s*/, "").replace(/[*_`>]/g, "").trim().slice(0, 120) || null;
      break;
    } catch {}
  }

  return repo;
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

const state = {
  repos: [],
  sel: 0,
  scroll: 0,
  scanning: true,
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
  detailScroll: 0,
  asking: false, // the "where does the work live?" scene
  askCancel: false, // esc returns to the bar (runtime `w`) vs first visit
  rootInput: "",
  askErr: "",
  ambient: "", // the bar quietly lives when you've been idle a while
  colophon: false,
  leaving: false,
  saying: null,
};

const visible = () => {
  let rs = state.repos;
  if (state.dirtyOnly) rs = rs.filter((r) => r.dirty > 0);
  if (state.filter)
    rs = rs.filter((r) => r.name.toLowerCase().includes(state.filter.toLowerCase()));
  return rs;
};

function clampSel() {
  state.sel = Math.max(0, Math.min(visible().length - 1, state.sel));
}

const SPLASH_MIN_MS = 1600;
let splashStart = Date.now();

// The neon flows while the curtain is up: tick the gradient phase ~20fps.
const splashTimer = setInterval(() => {
  if (state.splash) {
    state.phase += 0.016;
    render();
  }
}, 50);

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
  flash(greeting());
}

// Drop the curtain once the first scan is done and the logo has had its moment.
function maybeEndSplash() {
  const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - splashStart));
  setTimeout(endSplash, wait);
}

const SORTS = {
  recent: (a, b) => b.lastUnix - a.lastUnix,
  name: (a, b) => a.name.localeCompare(b.name),
  size: (a, b) => b.bytes - a.bytes,
};

function applySort() {
  const cur = visible()[state.sel]?.name;
  state.repos.sort(SORTS[state.sort]);
  if (cur) {
    const i = visible().findIndex((r) => r.name === cur);
    if (i >= 0) state.sel = i;
  }
  clampSel();
}

async function scanAll() {
  state.scanning = true;
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
    die(`cannot read ${ROOT}: ${e.message}`);
  }
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith("."));
  state.toScan = dirs.length;
  state.scanned = 0;
  if (warm) {
    // plates that left the menu since last visit come off the board now
    const onMenu = new Set(dirs.map((d) => d.name));
    state.repos = state.repos.filter((r) => onMenu.has(r.name));
    applySort();
  }
  // Scan with mild concurrency, render as plates arrive.
  const queue = [...dirs];
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const d = queue.shift();
      const repo = await scanRepo(d);
      const i = state.repos.findIndex((r) => r.name === repo.name);
      if (i >= 0) state.repos[i] = repo;
      else state.repos.push(repo);
      state.scanned++;
      applySort();
      render();
    }
  });
  await Promise.all(workers);
  state.scanning = false;
  applySort();
  saveMenu();
  maybeEndSplash();
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
  if (!DEMO) saveConfig({ root: raw });
  state.repos = loadMenu() || [];
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
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

const out = process.stdout;

function seg(text, fgC, bgC, nextBg) {
  // one powerline segment + separator into the next background
  return (
    bg(bgC) + fg(fgC) + ` ${text} ` +
    (nextBg ? bg(nextBg) + fg(bgC) + G.sep : RESET + fg(bgC) + G.sep + RESET)
  );
}

function headerLine(W) {
  const home = ROOT.replace(os.homedir(), "~");
  const dirtyCount = state.repos.filter((r) => r.dirty > 0).length;
  let s = bg(T.bg) + fg(T.seg0) + "░▒▓";
  s += bg(T.seg0) + fg("#090c0c") + ` ${G.lantern} ` ;
  s += bg(T.seg1) + fg(T.seg0) + G.sep;
  s += bg(T.seg1) + fg(T.segFg) + BOLD + ` 居酒屋 izakaya ` + RESET;
  s += bg(T.seg2) + fg(T.seg1) + G.sep;
  s += bg(T.seg2) + fg(T.seg1) + ` ${G.folder} ${home} `;
  s += bg(T.seg3) + fg(T.seg2) + G.sep;
  const count = state.scanning
    ? `${G.sake} pouring… ${state.scanned}/${state.toScan}`
    : `${state.repos.length} plates`;
  s += bg(T.seg3) + fg(T.seg1) + ` ${count} `;
  s += bg(T.seg4) + fg(T.seg3) + G.sep;
  s += bg(T.seg4) + fg(dirtyCount ? T.yellow : T.segDim) +
    ` ${dirtyCount ? `${G.dot} ${dirtyCount} dirty` : `${G.ok} all clean`} `;
  s += RESET + bg(T.bg) + fg(T.seg4) + G.sep;

  // mirrored right side, like a starship right-prompt: time → sky → ▓▒░
  const time = new Date().toTimeString().slice(0, 5);
  const hour = new Date().getHours();
  const sky = hour >= 6 && hour < 18 ? G.sun : G.moon;
  const right =
    fg(T.seg2) + G.sepL +
    bg(T.seg2) + fg(T.segDim) + ` ${G.clock} ${time} ` +
    fg(T.seg0) + G.sepL +
    bg(T.seg0) + fg("#090c0c") + ` ${sky} ` +
    RESET + bg(T.bg) + fg(T.seg0) + "▓▒░";

  const gap = W - visW(s) - visW(right);
  if (gap < 1) return padW(bg(T.bg) + s, W) + RESET;
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
  const keys = [
    ["j/k", "browse"],
    ["/", "filter"],
    ["↵", "sit"],
    ["o", "open"],
    ["t", "term"],
    ["e", "edit"],
    ["c", "claude"],
    ["s", `sort:${state.sort}`],
    ["?", "more"],
    ["~", "colophon"],
    ["q", "leave"],
  ];
  for (const [k, label] of keys)
    s +=
      bg(T.seg3) + fg(T.seg1) + BOLD + ` ${k} ` + RESET +
      bg(T.bg) + fg(T.fgDim) + ` ${label}  `;
  return padW(truncW(s, W), W) + RESET;
}

const STALE_S = 180 * 86400; // half a year untouched and the plate gathers dust

function listRow(repo, selected, W) {
  const base = selected ? bg(T.bgHi) : bg(T.bgPanel);
  const accent = selected ? fg(T.blue) + "▌" : fg(T.bgPanel) + " ";
  const icon = repo.langs[0]
    ? fg(repo.langs[0].color) + repo.langs[0].icon
    : fg(T.fgFaint) + G.folder;
  const stale =
    repo.isGit && repo.lastUnix > 0 && Date.now() / 1000 - repo.lastUnix > STALE_S;
  const nameC = selected ? fg(T.fg) + BOLD : stale ? fg(T.fgDim) : fg(T.fg);
  const dirtyMark = !repo.isGit
    ? fg(T.fgFaint) + "·"
    : repo.dirty > 0
      ? fg(T.yellow) + G.dot
      : stale
        ? fg(T.fgFaint) + G.moon
        : fg(T.green) + G.ok;
  // unpushed work is the most actionable fact on the menu — surface it
  const aheadMark = repo.isGit && repo.ahead > 0 ? fg(T.cyan) + G.ahead : "";
  const age = fg(T.fgDim) + relTime(repo.lastUnix);
  const right = `${dirtyMark}${aheadMark} ${age}`;
  const rightW = visW(right);
  let left = `${accent}${base} ${icon} ${nameC}${base}${repo.name}${RESET}${base}`;
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
    s += fg(l.color) + "█".repeat(w);
    used += w;
    if (used >= width) break;
  }
  return s;
}

function detailLines(repo, W) {
  const L = [];
  const pad = (s = "") => L.push(s);
  const rule = (label) =>
    `  ${fg(T.fgFaint)}─ ${fg(T.fgDim)}${label} ${fg(T.fgFaint)}${"─".repeat(Math.max(0, W - visW(label) - 7))}`;

  pad();
  // title ribbon, same shape as the prompt: ░▒▓  icon │ name │ path
  const icon = repo.langs[0]?.icon || G.folder;
  pad(
    "  " + fg(T.seg0) + "░▒▓" +
    bg(T.seg0) + fg("#090c0c") + ` ${icon} ` +
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
        repo.lastAuthor ? fg(T.fgFaint) + ` by ${repo.lastAuthor}` : ""
      }  ${fg(T.fgDim)}· ${repo.commits} commit${repo.commits === 1 ? "" : "s"}`
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
        : `  ${fg(T.fgDim)}${G.remote} ${fg(T.fgFaint)}no remote — house brew only`
    );

    pad();
    pad(rule("the kitchen"));
    const SPARK = "▁▂▃▄▅▆▇█";
    const peak = Math.max(...repo.weeks, 1);
    let spark = "";
    for (let i = 0; i < repo.weeks.length; i++)
      spark += repo.weeks[i] === 0
        ? fg(T.fgFaint) + "▁"
        : gradColor((i / repo.weeks.length) * 0.9) +
          SPARK[Math.min(7, Math.max(1, Math.ceil((repo.weeks[i] / peak) * 7)))];
    pad(
      `  ${fg(T.fgDim)}${G.pulse} pours   ${spark}${RESET}${bg(T.bg)}  ${fg(T.fgFaint)}12 weeks` +
        (repo.weeks.every((w) => w === 0) ? " — the kitchen sleeps" : "")
    );
    if (repo.chefs.length)
      pad(
        `  ${fg(T.fgDim)}${G.users} chefs   ` +
          repo.chefs
            .map(([n, c]) => `${fg(T.fg)}${n} ${fg(T.fgFaint)}${c}`)
            .join(`${fg(T.fgDim)}  ·  `)
      );
    pad(
      `  ${fg(T.fgDim)}${G.branch} shelf   ${fg(T.fg)}${repo.branches}${fg(T.fgDim)} ` +
        `branch${repo.branches === 1 ? "" : "es"}  ·  ${G.tag} ${fg(T.fg)}${repo.tags}${fg(T.fgDim)} ` +
        `tag${repo.tags === 1 ? "" : "s"}  ·  ${fg(T.fg)}${repo.stash}${fg(T.fgDim)} stashed`
    );
  } else {
    pad(`  ${fg(T.orange)}${G.warn} not a git repo ${fg(T.fgFaint)}— off-menu item`);
  }

  pad();
  pad(rule("the pantry"));
  const barW = Math.min(W - 6, 44);
  pad(`  ${langBar(repo, barW)}`);
  const legend = repo.langs
    .filter((l) => l.pct >= 1)
    .map((l) => `${fg(l.color)}${G.dot}${fg(T.fgDim)} ${l.name} ${Math.round(l.pct)}%`)
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
          .map((c) => bg(T.bgHi) + fg(c.color) + ` ${c.label} ` + RESET)
          .join(" ")
    );
  }

  if (repo.ai) {
    const a = repo.ai;
    const pct = a.total ? Math.round((a.assisted / a.total) * 100) : 0;
    pad();
    pad(rule("the hand behind the bar"));
    pad(
      `  ${fg(T.magenta)}${G.claude} ${fg(T.fg)}Claude${fg(T.fgDim)} had a hand in ` +
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

  pad();
  pad(
    repo.hasClaudeMd
      ? `  ${fg(T.green)}${G.ok} CLAUDE.md ${fg(T.fgFaint)}— house rules posted`
      : `  ${fg(T.red)}${G.warn} no CLAUDE.md ${fg(T.fgFaint)}— this kitchen has no rules`
  );

  if (repo.readmeTitle) {
    pad();
    pad(`  ${fg(T.fgDim)}${ITAL}“${truncW(repo.readmeTitle, W - 10)}${fg(T.fgDim)}${ITAL}”`);
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

// The back page of the menu — every key, including the ones the footer
// doesn't have room for.
function helpFrame(W, H) {
  const center = (s) =>
    bg(T.bg) + " ".repeat(Math.max(0, Math.floor((W - visW(s)) / 2))) + s;
  const blank = bg(T.bg) + " ".repeat(W) + RESET;

  const rows = [
    ["j / k", "browse the menu (arrows work too)"],
    ["g / G", "first / last plate"],
    ["J / K", "scroll the plate's details"],
    ["/", "filter — enter keeps it, esc clears it"],
    ["d", "dirty plates only — show unfinished work"],
    ["enter", "sit down — the iz() wrapper cd's you there"],
    ["o", "open in the file manager"],
    ["t", "terminal window at the repo"],
    ["e", "$EDITOR at the repo"],
    ["c", "claude code at the repo"],
    ["b", "open the remote in the browser"],
    ["y", "copy the repo path"],
    ["w", "move the bar — scan a different directory"],
    ["s", "sort: recent · name · size"],
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

function render() {
  const W = out.columns || 80;
  const H = out.rows || 24;

  if (state.leaving) {
    out.write("\x1b[H" + farewellFrame(W, H).join("\r\n"));
    return;
  }

  if (state.asking) {
    out.write("\x1b[H" + askFrame(W, H).join("\r\n"));
    return;
  }

  if (state.splash) {
    out.write("\x1b[H" + splashFrame(W, H).join("\r\n"));
    return;
  }

  if (state.help) {
    out.write("\x1b[H" + helpFrame(W, H).join("\r\n"));
    return;
  }

  if (state.colophon) {
    out.write("\x1b[H" + colophonFrame(W, H).join("\r\n"));
    return;
  }
  const listW = Math.max(26, Math.min(38, Math.floor(W * 0.34)));
  const bodyH = H - 4; // header, rule, rule, footer

  // keep selection visible
  if (state.sel < state.scroll) state.scroll = state.sel;
  if (state.sel >= state.scroll + bodyH) state.scroll = state.sel - bodyH + 1;

  const lines = [];
  lines.push(headerLine(W));
  lines.push(hr(W));

  const vis = visible();
  const sel = vis[state.sel];
  const detailAll = sel
    ? detailLines(sel, W - listW - 1)
    : state.scanning
      ? ["", `  ${fg(T.fgDim)}${ITAL}warming the sake…`]
      : state.filter
        ? ["", `  ${fg(T.fgDim)}nothing on the menu matches “${state.filter}”`]
        : ["", `  ${fg(T.fgDim)}empty bar — no repos found in ${ROOT}`];
  // J/K scroll a plate whose details run past a short terminal
  state.detailScroll = Math.max(
    0, Math.min(state.detailScroll, detailAll.length - bodyH)
  );
  const detail = detailAll.slice(state.detailScroll);

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
    const divider = bg(T.bg) + fg(T.fgFaint) + "│" + RESET;
    lines.push(left + divider + right);
  }

  lines.push(hr(W));
  lines.push(footerLine(W));
  out.write("\x1b[H" + lines.join("\r\n"));
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
  state.sel = Math.max(0, Math.min(visible().length - 1, state.sel + d));
  state.detailScroll = 0;
  render();
}

function onKey(buf) {
  const k = buf.toString();
  lastInput = Date.now();
  state.ambient = "";
  if (state.leaving) return reallyLeave();
  if (k === "\x03") return reallyLeave();

  // pasted (or pipe-coalesced) input lands as one chunk — replay it per
  // char so a path dropped into the ask scene or the filter isn't lost.
  // escape sequences (arrows etc.) start with \x1b and pass through whole.
  if (buf.length > 1 && k[0] !== "\x1b") {
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
      state.rootInput = state.rootInput.slice(0, -1);
      return render();
    }
    if (buf.length === 1 && k >= " " && k <= "~") {
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

  if (state.colophon) {
    state.colophon = false;
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
      state.filter = state.filter.slice(0, -1);
      clampSel();
      return render();
    }
    if (k === "\x1b[B") return move(1);
    if (k === "\x1b[A") return move(-1);
    if (buf.length === 1 && k >= " " && k <= "~") {
      state.filter += k;
      state.sel = 0;
      return render();
    }
    return;
  }

  if (k === "q") return leave();
  if (k === "\x1b" && buf.length === 1) {
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
    return render();
  }
  if (k === "j" || k === "\x1b[B") return move(1);
  if (k === "k" || k === "\x1b[A") return move(-1);
  if (k === "g") return move(-Infinity);
  if (k === "G") return move(Infinity);
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
  if (k === "d") {
    state.dirtyOnly = !state.dirtyOnly;
    state.sel = 0;
    state.scroll = 0;
    state.detailScroll = 0;
    clampSel();
    return flash(
      state.dirtyOnly ? `${G.dot} dirty plates only` : `${G.ok} the full menu`
    );
  }
  if (k === "w") {
    state.asking = true;
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
  if (k === "r" && !state.scanning) {
    state.status = "";
    return void scanAll();
  }

  const sel = visible()[state.sel];
  if (!sel) return;
  if (k === "o") {
    if (DEMO || openPath(sel.dir)) flash(`${G.folder} opened ${sel.name}`);
    else flash(`${G.folder} no opener — install xdg-utils (xdg-open)`);
  }
  if (k === "t") openAtRepo(sel, null, `${G.term} pulled up a stool at ${sel.name}`);
  if (k === "e") openAtRepo(sel, "exec ${EDITOR:-vim} .", `${G.edit} editing ${sel.name}`);
  if (k === "c") openAtRepo(sel, "exec claude", `${G.claude} claude is at the bar — ${sel.name}`);
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
    if (DEMO || copyText(sel.dir))
      flash(`${G.copy} path on a coaster — ${sel.dir.replace(os.homedir(), "~")}`);
    else flash(`${G.copy} no clipboard tool — install wl-clipboard, xclip, or xsel`);
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

let flashTimer;
function flash(msg) {
  state.status = msg;
  render();
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { state.status = ""; render(); }, 2000);
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

setInterval(() => {
  if (
    state.splash || state.leaving || state.asking ||
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

// b — open the remote in the browser. Returns false if there's no opener.
function openUrl(url) {
  if (isMac) { spawnDetached("open", [url]); return true; }
  // TODO(linux): verify xdg-open opens the URL in the default browser.
  if (hasBin("xdg-open")) { spawnDetached("xdg-open", [url]); return true; }
  return false;
}

// y — copy to the system clipboard. Returns false if no clipboard tool exists,
// so the caller can hint instead of swallowing the keypress.
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
    else return false;
  }
  try {
    const child = spawn(bin, args, { stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", () => {});
    child.stdin.end(text);
  } catch { return false; }
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

// t/e/c — open a terminal at `dir`, optionally running shell command `inner`.
// Mac is unchanged (Ghostty → Terminal.app), and always "succeeds" because of
// its fallback; Linux returns false when no terminal could be found.
function openTerminal(dir, inner) {
  if (isMac) {
    void openGhosttyWindow(dir, inner ? `/bin/zsh -lc '${inner}'` : undefined);
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
    state.repos = cached;
    applySort();
    maybeEndSplash(); // yesterday's menu is already out — don't hold the curtain
  }
  scanAll();
}
