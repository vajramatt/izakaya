# izakaya — house rules

居酒屋: a zero-dependency Node TUI that scans the repos in your code
directory (asked on first visit, default `~/code`) and presents them as the
menu at a small Tokyo bar.

## Rules of engagement

- **Zero dependencies, forever.** The whole app is `bin/izakaya.js` — raw ANSI,
  no ink/blessed/react. If a feature needs a package, it doesn't belong here.
- **Node ≥22, ESM only.** Plain modern JavaScript, no build step, no TypeScript
  compilation. Run it with `node bin/izakaya.js` or `npm link` → `izakaya`.
- **`T` is law.** Every color the bar paints is read from the active theme's
  `T` at render time; themes live in `THEMES` as pure data (the same key set
  plus gradient stops) and `T` cycles them live. TokyoNight (Night) is the
  default and the reference — its segment colors come from the Starship
  TokyoNight preset so the header reads like the prompt it sits above. Don't
  introduce colors outside `T`, and never bake a resolved hex into a
  module-init table or the cached menu — store T-key names (or language
  names) and resolve at render, or the lanterns can't change.
- **Nerd-font glyphs assumed.** Built for a truecolor terminal with a nerd
  font (Ghostty + Starship is the reference setup); glyphs live in the `G`
  object. Keep them there, not inline.
- **Stay in the metaphor.** Repos are plates, commits are pours, leaving is
  またね. New copy should keep the bar voice without getting in the way of
  the data.
- **Read-only by design.** izakaya never mutates the repos it scans. The only
  side effects allowed are launches: `o` (file manager), `t` (terminal window
  at the repo), `e` (editor), `c` (Claude Code), `C` (resume the Claude
  session), `u` (the usual — the user's own session script, taken **only**
  from their env/config, never auto-discovered inside a scanned repo), `b`
  (remote in browser), `y` (clipboard) — plus its own
  housekeeping files. Examining a plate may also ask **read-only questions**
  of `gh` (open PRs, latest checks) when it's installed — queries only, never
  mutations. The housekeeping files: `~/.config/izakaya/config.json`
  (the saved root, and an optional Linux `terminal` override), and in the
  cache dir (`$XDG_CACHE_HOME` or `~/.cache`, then `izakaya/`) —
  `sayings.json` (kotowaza deck cursor), `menu.json` (warm-start menu, keyed
  by root), `seat` (the `↵` cd target the `iz()` shell wrapper consumes; the
  wrapper in the README and installer resolves the same XDG-or-`~/.cache`
  path). Root resolution: CLI arg > `$IZAKAYA_ROOT` > saved config
  > ask on first visit.
- **The launch keys are the only platform-aware code, and they live in one
  place.** All OS dispatch is in the `Platform` section (`isMac`/`isLinux`,
  `openPath`/`openUrl`/`copyText`/`openTerminal`/`revealPath`) — no
  `process.platform` checks scattered through the handlers. macOS is the
  reference build: `open`, `pbcopy`, Ghostty via AppleScript → Terminal.app
  fallback, unchanged. Linux is parity where it's cheap (`xdg-open`;
  `wl-copy`/`xclip`/`xsel`) and graceful degradation where it isn't (terminal
  detection: override > kitty > wezterm > alacritty > foot > `$TERMINAL`,
  then a hint). Inside tmux (`$TMUX` set), `openTerminal` opens a tmux window
  on every platform, ahead of the per-OS paths. New launch behavior goes
  through those primitives, and missing tools hint, never crash.
- **The demo bar is fake on purpose.** `scripts/demo.sh` stages
  `/tmp/izakaya-demo` with invented repos so recordings (`docs/demo.tape`,
  rendered with vhs) never show anyone's real projects. Re-record with
  `./scripts/demo.sh && vhs docs/demo.tape`.

## Layout

- `bin/izakaya.js` — everything: theme → glyphs → width helpers → scanner →
  state → renderer → input. Keep that section order.
- **Import-safe by contract.** The bar only opens behind `IS_MAIN`; importing
  `bin/izakaya.js` (the tests do) must start no timers, touch no TTY, and
  exit nothing. New module-scope side effects go inside the `IS_MAIN` gate,
  and new pure helpers are fair game for the export block at the bottom.
- Scanning pours twice: a cheap pass (4-wide) that gets every menu row up
  fast, then an enrich pass for the history walks (sparkline, chefs, AI
  tally). `ENRICH_KEYS` lists the second-pour fields; `cooked` marks a plate
  whose history is current. Renders progressively through both.
- **The takeout window** (`--report`, `--closing-time [--json]`) is the
  headless path: same two pours, no TTY, prints and exits. It must stay
  side-effect free — nothing written, not even the menu cache — and its
  closing-time facts come from `closingFacts`, shared with the `!` scene so
  the two can't drift. `--report`'s shape is a published schema (stamped
  with `MENU_V`): changing a plate field means bumping `MENU_V`.
- Width math is ANSI-aware and CJK-aware (`visW`/`truncW`/`padW`) — any new
  rendering must go through those helpers or alignment breaks.

## Testing

Still zero deps — `node:test` ships with node. `node --test` runs the
tasting flight in `test/` over the pure helpers (width math, fuzzy match,
scrubbers, input-chunk logic); CI (`.github/workflows/ci.yml`) runs it on
mac + Linux plus a pty smoke render. The real terminal is still the law for
everything rendered: resize the window, press every key in the footer, check
a dirty repo, a non-git dir, and an empty-but-initialized repo render sanely.
