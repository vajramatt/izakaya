# izakaya

![izakaya — figlet ANSI Shadow in a TokyoNight gradient](docs/banner.svg)

A zero-dependency TokyoNight TUI that scans every project in `~/code` and
serves them up as small plates: git status, last pour (commit), languages,
stack chips, size — and whether the kitchen has posted its house rules
(`CLAUDE.md`).

The header is styled after the Starship TokyoNight prompt, so it looks like
the rest of the terminal it lives in.

## Run

```sh
node bin/izakaya.js          # scans ~/code
node bin/izakaya.js ~/work   # or any other directory
```

Or put it on your PATH:

```sh
npm link   # → izakaya
```

## Keys

| key | what |
| --- | --- |
| `j` / `k` / arrows | browse the menu |
| `g` / `G` | first / last plate |
| `s` | cycle sort: recent → name → size |
| `o` | open the repo in Finder |
| `t` | new terminal window at the repo (Ghostty, falls back to Terminal.app) |
| `r` | rescan |
| `q` | leave the bar (またね) |

## Requirements

- Node ≥ 22
- A nerd font (you're running Starship, you have one)
- A terminal with truecolor (Ghostty, kitty, iTerm2, …)

No dependencies. No build step. One file.

## License

[MIT](LICENSE) — use it, fork it, sell it, just keep the copyright notice.
© Matt Williamson
