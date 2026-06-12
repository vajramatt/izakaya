#!/usr/bin/env node
// 居酒屋 izakaya — a cozy little bar where your repos are the menu.
// Zero-dependency TokyoNight TUI for everything living in ~/code.

import { promisify } from "node:util";
import { execFile as execFileCb, spawn } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";

const execFile = promisify(execFileCb);

// ─────────────────────────────────────────────────────────────────────────────
// Theme — TokyoNight (Night) panes + the Starship segment colors from
// ~/code/tokyo-night.toml so the header matches the prompt.
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

const ROOT = path.resolve(process.argv[2] || path.join(os.homedir(), "code"));

// IZAKAYA_DEMO=1 keeps the o/t/e/c flashes but skips the real launches —
// used by docs/demo.tape so recording the GIF doesn't spawn windows.
const DEMO = !!process.env.IZAKAYA_DEMO;

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
    const [branch, status, log, count, remote, ab, recent, activity, authors, branches, tags, stash] = await Promise.all([
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
  leaving: false,
  saying: null,
};

const visible = () =>
  state.filter
    ? state.repos.filter((r) => r.name.toLowerCase().includes(state.filter.toLowerCase()))
    : state.repos;

function clampSel() {
  state.sel = Math.max(0, Math.min(visible().length - 1, state.sel));
}

const SPLASH_MIN_MS = 1600;
const splashStart = Date.now();

// The neon flows while the curtain is up: tick the gradient phase ~20fps.
const splashTimer = setInterval(() => {
  if (state.splash) {
    state.phase += 0.016;
    render();
  }
}, 50);

function endSplash() {
  if (!state.splash) return;
  state.splash = false;
  clearInterval(splashTimer);
  flash("いらっしゃいませ — welcome in");
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
  state.repos = [];
  state.sel = 0;
  state.scroll = 0;
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
  // Scan with mild concurrency, render as plates arrive.
  const queue = [...dirs];
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const d = queue.shift();
      const repo = await scanRepo(d);
      state.repos.push(repo);
      state.scanned++;
      applySort();
      render();
    }
  });
  await Promise.all(workers);
  state.scanning = false;
  applySort();
  maybeEndSplash();
  render();
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

  // mirrored right side, like a starship right-prompt: time → moon → ▓▒░
  const time = new Date().toTimeString().slice(0, 5);
  const right =
    fg(T.seg2) + G.sepL +
    bg(T.seg2) + fg(T.segDim) + ` ${G.clock} ${time} ` +
    fg(T.seg0) + G.sepL +
    bg(T.seg0) + fg("#090c0c") + ` ${G.moon} ` +
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
  if (state.filtering || state.filter) {
    s +=
      fg(T.blue) + BOLD + G.search + " /" + RESET + bg(T.bg) +
      fg(T.fg) + state.filter +
      (state.filtering ? fg(T.cyan) + "▌" : "") +
      "   " + fg(T.fgDim) + `${visible().length} match` +
      (state.filtering ? "  ·  enter keep · esc clear" : "  ·  esc clear");
    return padW(truncW(s, W), W) + RESET;
  }
  const keys = [
    ["j/k", "browse"],
    ["/", "filter"],
    ["o", "open"],
    ["t", "term"],
    ["e", "edit"],
    ["c", "claude"],
    ["s", `sort:${state.sort}`],
    ["r", "rescan"],
    ["q", "leave"],
  ];
  for (const [k, label] of keys)
    s +=
      bg(T.seg3) + fg(T.seg1) + BOLD + ` ${k} ` + RESET +
      bg(T.bg) + fg(T.fgDim) + ` ${label}  `;
  return padW(truncW(s, W), W) + RESET;
}

function listRow(repo, selected, W) {
  const base = selected ? bg(T.bgHi) : bg(T.bgPanel);
  const accent = selected ? fg(T.blue) + "▌" : fg(T.bgPanel) + " ";
  const icon = repo.langs[0]
    ? fg(repo.langs[0].color) + repo.langs[0].icon
    : fg(T.fgFaint) + G.folder;
  const nameC = selected ? fg(T.fg) + BOLD : fg(T.fg);
  const dirtyMark = !repo.isGit
    ? fg(T.fgFaint) + "·"
    : repo.dirty > 0
      ? fg(T.yellow) + G.dot
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

function detailLines(repo, W, H) {
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

  return L.slice(0, H);
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

function render() {
  const W = out.columns || 80;
  const H = out.rows || 24;

  if (state.leaving) {
    out.write("\x1b[H" + farewellFrame(W, H).join("\r\n"));
    return;
  }

  if (state.splash) {
    out.write("\x1b[H" + splashFrame(W, H).join("\r\n"));
    return;
  }
  const listW = Math.max(26, Math.min(38, Math.floor(W * 0.34)));
  const bodyH = H - 3; // header, blank, footer

  // keep selection visible
  if (state.sel < state.scroll) state.scroll = state.sel;
  if (state.sel >= state.scroll + bodyH) state.scroll = state.sel - bodyH + 1;

  const lines = [];
  lines.push(headerLine(W));
  lines.push(bg(T.bg) + " ".repeat(W) + RESET);

  const vis = visible();
  const sel = vis[state.sel];
  const detail = sel
    ? detailLines(sel, W - listW - 1, bodyH)
    : state.scanning
      ? ["", `  ${fg(T.fgDim)}${ITAL}warming the sake…`]
      : state.filter
        ? ["", `  ${fg(T.fgDim)}nothing on the menu matches “${state.filter}”`]
        : ["", `  ${fg(T.fgDim)}empty bar — no repos found in ${ROOT}`];

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
  render();
}

function onKey(buf) {
  const k = buf.toString();
  if (state.leaving) return reallyLeave();
  if (k === "\x03") return reallyLeave();
  if (state.splash) {
    // any other key skips the splash
    return endSplash();
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
    if (!DEMO) spawn("open", [sel.dir], { detached: true, stdio: "ignore" }).unref();
    flash(`${G.folder} opened ${sel.name}`);
  }
  if (k === "t") {
    if (!DEMO) void openGhosttyWindow(sel.dir);
    flash(`${G.term} pulled up a stool at ${sel.name}`);
  }
  if (k === "e") {
    if (!DEMO) void openGhosttyWindow(sel.dir, "/bin/zsh -lc 'exec ${EDITOR:-vim} .'");
    flash(`${G.edit} editing ${sel.name}`);
  }
  if (k === "c") {
    if (!DEMO) void openGhosttyWindow(sel.dir, "/bin/zsh -lc 'exec claude'");
    flash(`${G.claude} claude is at the bar — ${sel.name}`);
  }
}

let flashTimer;
function flash(msg) {
  state.status = msg;
  render();
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { state.status = ""; render(); }, 2000);
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

if (!process.stdout.isTTY) {
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

scanAll();
