# Roadmap — opening branches

izakaya was built at a macOS counter (Ghostty + Starship, AppleScript out the
back). The renderer doesn't care, though — raw ANSI, truecolor, and Node's
terminal handling travel fine. This is the map for opening a Linux branch and
a Windows branch. Help is welcome; the house rules in `CLAUDE.md` still apply
(zero dependencies, one file, the theme is law).

**Where we are:** the Linux launch keys have landed on `main` — `o`/`b`/`y`
at full parity, and `t`/`e`/`c` driving kitty/wezterm/alacritty/foot (or a
configured terminal). The platform layer that made room for them is in place,
so Windows is now "fill in the table" rather than a fork. Real-hardware QA on
Linux is still outstanding (see below). Windows hasn't started.

## What already travels

The portable core needs no work:

- **The TUI itself.** Alternate screen, raw mode, the `resize` event, and the
  ANSI/CJK width math (`visW`/`truncW`/`padW`) are terminal-dependent, not
  OS-dependent. Windows Terminal and every modern Linux terminal speak the
  same sequences.
- **Scanning.** `execFile("git", …)` works anywhere git is on PATH; `fs` and
  `path` handle separators.
- **Config.** `XDG_CONFIG_HOME` is already respected for the saved root.
- **Nerd fonts.** A setup assumption on every OS, not a macOS one.

## The platform surface

All of it lives in the launch keys and the clipboard — nothing in the
renderer or scanner. It now dispatches per-OS through the `Platform` section
(`isMac`/`isLinux`, `openPath`/`openUrl`/`copyText`/`openTerminal`):

| key | what | macOS | Linux |
|-----|------|-------|-------|
| `o` | open in file manager | `open` | `xdg-open` |
| `t` `e` `c` | new terminal window at the repo | Ghostty via `osascript`, Terminal.app fallback, `/bin/zsh -lc` | kitty/wezterm/alacritty/foot (or `$IZAKAYA_TERMINAL` / `terminal` config), `$SHELL -lc` |
| `b` | remote in browser | `open` | `xdg-open` |
| `y` | copy path | `pbcopy` | `wl-copy` / `xclip` / `xsel` |
| `↵` | the `iz()` wrapper | zsh function in the README | same — verify on Linux |

## Shared groundwork

- [x] A `Platform` section in `bin/izakaya.js` — sited with the launch
      helpers in the input/lifecycle section (next to `openGhosttyWindow`,
      its callers) rather than up by the glyphs, since that's where the only
      OS-touching code lives. The key handlers call the primitives; the
      primitives hold the per-OS commands. No `process.platform` checks
      anywhere else.
- [x] `/bin/zsh -lc` → `$SHELL -lc` on Linux (mac stays `/bin/zsh` as the
      reference build).
- [x] Amend the "read-only by design" rule in `CLAUDE.md` — done, and a new
      rule documents the platform layer.
- [x] **OSC 52 for `y`** — landed as the safety net rather than the whole
      act: mac keeps `pbcopy` (reference build unchanged) and Linux still
      prefers a native tool, but when nothing is installed the terminal
      itself is asked via OSC 52 — so `y` now always lands, including over
      bare SSH. Going OSC-52-first everywhere is still open; it waits on
      confidence that the terminals people actually pair with izakaya all
      accept clipboard writes (VTE-family terminals historically don't).
- [x] Respect `XDG_CACHE_HOME` for the cache dir (Linux nicety; macOS
      behavior unchanged). The `iz()` wrapper in the README and installer
      resolves the same `${XDG_CACHE_HOME:-$HOME/.cache}` path.

## The Linux branch — landed, pending hardware QA

What shipped (note: this took the emulator-detection route rather than the
originally-sketched Ghostty-on-Linux path — there's no standard Linux
terminal, so a short detection list beats betting on one binary):

- [x] `o` and `b` → `xdg-open`.
- [x] `y` → `wl-copy` (when `$WAYLAND_DISPLAY` is set), else `xclip`, else
      `xsel`; a clear hint when none is installed.
- [x] `t`/`e`/`c` → first of: `$IZAKAYA_TERMINAL` / `config.terminal` override
      → kitty → wezterm → alacritty → foot → `$TERMINAL`. Unknown terminals
      launch best-effort via inherited `cwd`. No terminal found → a hint plus
      a last-resort `xdg-open` on the folder.

Still to do:

- [ ] **Real-hardware QA** — verify each launch key on a desktop Linux box
      (the checklist that shipped with the change). Containers cover
      rendering/keys/scanning/resize/seat; the launch keys need a real
      session — a UTM Linux VM or a physical box.
- [ ] Confirm `$SHELL -lc` actually expands `$EDITOR` from the user's profile.
- [ ] `iz()` works as-is in bash/zsh — verify, don't assume.
- [ ] Decide whether to add **ghostty** to the detection list — it runs on
      Linux now and is the reference setup; deliberately left off the first
      pass to honor "don't support every emulator."
- [ ] Replace the `// TODO(linux):` markers at `openPath`/`openUrl`/`copyText`
      with confirmation once they've been run for real.

## The Windows branch (bounded — a few days)

The renderer is fine; the work is launchers and the wrapper:

- [ ] `o` → `explorer.exe <dir>`; `b` → `cmd /c start <url>`.
- [ ] `t`/`e`/`c` → `wt -d <dir> [cmd]` (Windows Terminal's CLI — genuinely
      nicer than the AppleScript dance).
- [ ] A PowerShell twin of `iz()` — a `function iz` that reads the seat file
      and `Set-Location`s. Seat paths are absolute, so no translation needed.
- [ ] Don't lean on `SIGTERM` (mostly fiction on Windows); raw mode already
      delivers Ctrl+C as a byte through `onKey`.
- [ ] Be honest in the README: Windows Terminal only, not legacy conhost.
      Optionally check `WT_SESSION` and warn.
- [ ] Expect `git` spawns to be slower; the 4-wide concurrency will feel it
      but survive it.
- [ ] QA: UTM with the free Windows 11 ARM eval, Windows Terminal + a nerd
      font installed, every footer key pressed.

## Keeping it honest

- [x] CI landed (`.github/workflows/ci.yml`): a ubuntu + macos matrix runs
      `node --test` over the tasting flight in `test/` (pure helpers — width
      math, fuzzy, scrubbers, input chunks), and a ubuntu job stages a tiny
      bar and drives the binary through a pty (`script`) for a smoke render.
      The zero-dependency rule applies to the app, not CI.
- [ ] Add the windows row to the matrix once the Windows branch lands.

## Sequencing

Linux went first — it forced the platform layer into existence, exactly as
hoped. Windows is now "fill in the table rows and write a PowerShell
function" instead of a fork in the code: `openPath`/`openUrl`/`copyText`/
`openTerminal` already exist; Windows just needs its branch in each.
