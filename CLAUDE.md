# izakaya — house rules

居酒屋: a zero-dependency Node TUI that scans the repos in your code
directory (asked on first visit, default `~/code`) and presents them as the
menu at a small Tokyo bar.

## Rules of engagement

- **Zero dependencies, forever.** The whole app is `bin/izakaya.js` — raw ANSI,
  no ink/blessed/react. If a feature needs a package, it doesn't belong here.
- **Node ≥22, ESM only.** Plain modern JavaScript, no build step, no TypeScript
  compilation. Run it with `node bin/izakaya.js` or `npm link` → `izakaya`.
- **The theme is law.** TokyoNight (Night) palette in the `T` object, plus the
  segment colors from the Starship TokyoNight preset so the header reads like
  the prompt it sits above. Don't introduce colors outside `T`.
- **Nerd-font glyphs assumed.** Built for a truecolor terminal with a nerd
  font (Ghostty + Starship is the reference setup); glyphs live in the `G`
  object. Keep them there, not inline.
- **Stay in the metaphor.** Repos are plates, commits are pours, leaving is
  またね. New copy should keep the bar voice without getting in the way of
  the data.
- **Read-only by design.** izakaya never mutates the repos it scans. The only
  side effects allowed are launches: `o` (file manager), `t` (terminal window
  at the repo), `e` (editor), `c` (Claude Code), `b` (remote in browser), `y`
  (clipboard) — plus its own housekeeping files: `~/.config/izakaya/config.json`
  (the saved root, and an optional Linux `terminal` override), and in
  `~/.cache/izakaya/` — `sayings.json` (kotowaza deck cursor), `menu.json`
  (warm-start menu, keyed by root), `seat` (the `↵` cd target the `iz()` shell
  wrapper consumes). Root resolution: CLI arg > `$IZAKAYA_ROOT` > saved config
  > ask on first visit.
- **The launch keys are the only platform-aware code, and they live in one
  place.** All OS dispatch is in the `Platform` section (`isMac`/`isLinux`,
  `openPath`/`openUrl`/`copyText`/`openTerminal`) — no `process.platform`
  checks scattered through the handlers. macOS is the reference build: `open`,
  `pbcopy`, Ghostty via AppleScript → Terminal.app fallback, unchanged. Linux
  is parity where it's cheap (`xdg-open`; `wl-copy`/`xclip`/`xsel`) and
  graceful degradation where it isn't (terminal detection: override >
  kitty > wezterm > alacritty > foot > `$TERMINAL`, then a hint). New launch
  behavior goes through those primitives, and missing tools hint, never crash.
- **The demo bar is fake on purpose.** `scripts/demo.sh` stages
  `/tmp/izakaya-demo` with invented repos so recordings (`docs/demo.tape`,
  rendered with vhs) never show anyone's real projects. Re-record with
  `./scripts/demo.sh && vhs docs/demo.tape`.

## Layout

- `bin/izakaya.js` — everything: theme → glyphs → width helpers → scanner →
  state → renderer → input. Keep that section order.
- Scanning runs 4-wide concurrency, renders progressively as repos finish.
- Width math is ANSI-aware and CJK-aware (`visW`/`truncW`/`padW`) — any new
  rendering must go through those helpers or alignment breaks.

## Testing

No test framework (zero deps). Verify by running it in a real terminal:
resize the window, press every key in the footer, check a dirty repo, a
non-git dir, and an empty-but-initialized repo render sanely.
