# izakaya

![izakaya — figlet ANSI Shadow in a TokyoNight gradient](docs/banner.svg)

![izakaya browsing a demo bar: animated gradient splash, then the TUI](docs/demo.gif)

A zero-dependency TokyoNight TUI that scans every project in your code
directory and serves them up as small plates: git status, last pour (commit),
languages, stack chips, size — and whether the kitchen has posted its house
rules (`CLAUDE.md`).

The header is styled after the Starship TokyoNight prompt, so it looks like
the rest of the terminal it lives in.

## Run

```sh
node bin/izakaya.js          # your saved code directory (asks on first visit)
node bin/izakaya.js ~/work   # or any other directory, one-off
```

Or put it on your PATH:

```sh
npm link   # → izakaya
```

On the first visit the bar asks where your work lives and remembers the
answer in `~/.config/izakaya/config.json`. Press `w` any time to move the
bar to a different directory. A CLI argument or `$IZAKAYA_ROOT` overrides
both. Repeat visits open instantly on the last menu (cached in
`~/.cache/izakaya/menu.json`) while every plate is re-checked in place.

## Keys

| key | what |
| --- | --- |
| `j` / `k` / arrows | browse the menu |
| `g` / `G` | first / last plate |
| `J` / `K` | scroll the selected plate's details |
| `/` | filter the menu (type to narrow, enter keeps, esc clears) |
| `d` | dirty plates only — just the repos with unfinished work |
| `s` | cycle sort: recent → name → size |
| `↵` | sit down — leave, and the `iz()` wrapper cd's you into the repo |
| `o` | open the repo in Finder |
| `t` | new terminal window at the repo (Ghostty, falls back to Terminal.app) |
| `e` | open the repo in `$EDITOR` (vim by default) in a new terminal window |
| `c` | start a Claude Code session at the repo in a new terminal window |
| `b` | open the repo's remote in the browser |
| `y` | copy the repo's path |
| `w` | move the bar — scan a different directory |
| `r` | rescan |
| `?` | the back page of the menu — all keys |
| `~` | colophon — who keeps this bar |
| `q` | leave the bar — a farewell scene with a parting kotowaza, then またね |

The menu also marks plates that need attention: `●` uncommitted changes,
`⇡` commits you haven't pushed, and a small moon on plates untouched for
half a year.

## The launcher — `iz()`

izakaya can hand your shell the repo you picked. Press `↵` on a plate and
the bar writes its path to `~/.cache/izakaya/seat` on the way out; a tiny
wrapper turns that into a `cd`:

```zsh
# ~/.zshrc
iz() {
  izakaya "$@"
  local seat="$HOME/.cache/izakaya/seat"
  if [[ -f "$seat" ]]; then
    cd -- "$(<"$seat")" && command rm -f -- "$seat"
  fi
}
```

Browse, press `↵`, and you're standing in the repo.

## The demo GIF

The recording above is staged — `scripts/demo.sh` builds a fake bar of repos
at `/tmp/izakaya-demo` (varied languages, ages, dirty states, unpushed work),
and `docs/demo.tape` replays the session with [vhs](https://github.com/charmbracelet/vhs):

```sh
./scripts/demo.sh && vhs docs/demo.tape
```

## Requirements

- Node ≥ 22
- A nerd font (you're running Starship, you have one)
- A terminal with truecolor (Ghostty, kitty, iTerm2, …)

No dependencies. No build step. One file.

## License

[MIT](LICENSE) — use it, fork it, sell it, just keep the copyright notice.
© Matt Williamson
