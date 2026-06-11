# izakaya — house rules

居酒屋: a zero-dependency Node TUI that scans the sibling repos in `~/code`
and presents them as the menu at a small Tokyo bar.

## Rules of engagement

- **Zero dependencies, forever.** The whole app is `bin/izakaya.js` — raw ANSI,
  no ink/blessed/react. If a feature needs a package, it doesn't belong here.
- **Node ≥22, ESM only.** Plain modern JavaScript, no build step, no TypeScript
  compilation. Run it with `node bin/izakaya.js` or `npm link` → `izakaya`.
- **The theme is law.** TokyoNight (Night) palette in the `T` object, plus the
  Starship segment colors lifted from `~/code/tokyo-night.toml` so the header
  matches Matt's prompt. Don't introduce colors outside `T`.
- **Nerd-font glyphs assumed.** Matt runs Ghostty + Starship with a nerd font;
  glyphs live in the `G` object. Keep them there, not inline.
- **Stay in the metaphor.** Repos are plates, commits are pours, leaving is
  またね. New copy should keep the bar voice without getting in the way of
  the data.
- **Read-only by design.** izakaya never mutates the repos it scans. The only
  side effects allowed are `o` (open in Finder) and `t` (spawn a terminal
  window at the repo — Ghostty first, Terminal.app fallback).

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
