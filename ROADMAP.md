# Roadmap — opening branches

izakaya was built at a macOS counter (Ghostty + Starship, AppleScript out the
back). The renderer doesn't care, though — raw ANSI, truecolor, and Node's
terminal handling travel fine. This is the map for opening a Linux branch and
a Windows branch. Help is welcome; the house rules in `CLAUDE.md` still apply
(zero dependencies, one file, the theme is law).

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

## The macOS-only surface

All of it lives in the launch keys and the clipboard — nothing in the
renderer or scanner:

| key | what | macOS form today |
|-----|------|------------------|
| `o` | open in file manager | `spawn("open", [dir])` |
| `t` `e` `c` | new terminal window at the repo | `openGhosttyWindow()` — Ghostty via `osascript`, Terminal.app fallback, `/bin/zsh -lc` |
| `b` | remote in browser | `spawn("open", [url])` |
| `y` | copy path | `pbcopy` |
| `↵` | the `iz()` wrapper | zsh function in the README |

## Shared groundwork (do this first)

- [ ] A small `platform` section in `bin/izakaya.js` — between glyphs and the
      scanner, keeping the section order — holding a launch table keyed by
      `process.platform`. The key handlers call the table; the table holds
      the per-OS commands.
- [ ] **OSC 52 for `y`.** Ask the terminal itself to set the clipboard via
      escape sequence: zero processes spawned, works over SSH, supported by
      Ghostty / Windows Terminal / most others. Replaces `pbcopy`, `xclip`,
      and `clip.exe` in one move — the on-theme answer.
- [ ] Respect `XDG_CACHE_HOME` for `~/.cache/izakaya` (Linux nicety; macOS
      behavior unchanged).
- [ ] `/bin/zsh -lc` → `$SHELL -lc`.
- [ ] Amend the "read-only by design" rule in `CLAUDE.md`, which currently
      names the AppleScript interface specifically.

## The Linux branch (small — an afternoon)

Everything maps cleanly:

- [ ] `o` and `b` → `xdg-open`.
- [ ] `t`/`e`/`c` → Ghostty exists on Linux and spawning `ghostty
      --working-directory=… [-e cmd]` opens a window with no AppleScript at
      all. Fall back to `$TERMINAL`, then `x-terminal-emulator` /
      `gnome-terminal`.
- [ ] `iz()` works as-is in bash/zsh — verify, don't assume.
- [ ] QA: `docker run -it` (or OrbStack) covers rendering, keys, scanning,
      resize, and the seat file from a Mac. The launch keys need a desktop —
      a UTM Linux VM covers that.

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

- [ ] A GitHub Actions matrix (ubuntu / windows) that stages a fake bar the
      way `scripts/demo.sh` does and drives the binary through a pty for a
      smoke render. The zero-dependency rule applies to the app, not CI.

## Sequencing

Linux first. It's the small lift, it forces the platform table into
existence, and Windows then becomes "fill in three table rows and write a
PowerShell function" instead of a fork in the code.
