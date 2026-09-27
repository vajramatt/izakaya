# izakaya

![izakaya — figlet ANSI Shadow in a TokyoNight gradient](docs/banner.svg)

![izakaya browsing a demo bar: gradient splash, fuzzy filter, the diff peek, closing time](docs/demo.gif)

| the menu | nested projects | agent picker | closing time |
| --- | --- | --- | --- |
| ![the menu — repos as plates, one selected with its full detail](docs/screens/menu.png) | ![nested projects — child projects beneath their parent](docs/screens/nested.png) | ![agent picker — Claude Code, Codex, Qwen Code, and Kimi CLI at the selected path](docs/screens/agents.png) | ![closing time — every plate carrying work only this machine holds](docs/screens/closing-time.png) |

A zero-dependency TokyoNight TUI that scans every project in your code
directory and serves them up as small plates: git status, last pour (commit),
languages, stack chips, size — and whether the kitchen has posted agent house
rules (`AGENTS.md` or `CLAUDE.md`).

It's built to answer the three questions a work morning starts with:

- **What changed while I was gone?** The bar remembers your last visit and
  says so — new pours, plates that joined the menu, work that went unsettled.
- **What needs me?** Dirty plates and unpushed pours are marked on the menu,
  the plate you're mid-way through floats to the top, a row names the branch
  when it isn't the main line, and a magenta mark shows where an agent is
  working right now. `!` is closing time — one screen of everything that
  exists only on this machine, down to the stash you forgot and the branch
  that never got pushed.
- **Take me there.** `iz ramen` from the shell seats you in the repo before
  the bar even opens; inside, `↵` on a changed file pours its diff, and one
  key opens the terminal, editor, or whichever coding agent you work with.

And for the morning meeting, `izakaya --standup` lists everything you
committed across every repo since the last workday.

The header is styled after the Starship TokyoNight prompt, so it looks like
the rest of the terminal it lives in. One file, no packages, no build step,
and read-only by design — it never writes to the repos it serves.

**Pull up a stool → [izakaya.guru](https://izakaya.guru)**

## Install

The whole app is one zero-dependency file, so installing is really just putting
it on your `PATH`. The installer does that — and offers to add the `iz()` shell
wrapper:

```sh
curl -fsSL https://raw.githubusercontent.com/vajramatt/izakaya/main/scripts/install.sh | sh
```

It drops `izakaya` into `$XDG_BIN_HOME` (or `~/.local/bin`), warns if that's
not on your `PATH`, and checks for **Node ≥ 22** — required, since the file
runs on your system Node rather than shipping as a compiled binary. Prefer to
read before you run? [`scripts/install.sh`](scripts/install.sh) is short and
only ever writes to a bin dir and (with your yes) your shell rc.

Or skip the installer and drop the single file yourself:

```sh
curl -fsSL https://raw.githubusercontent.com/vajramatt/izakaya/main/bin/izakaya.js \
  -o ~/.local/bin/izakaya && chmod +x ~/.local/bin/izakaya
```

Both work on **macOS and Linux**. (Windows is on the [roadmap](ROADMAP.md).)

## Run

```sh
node bin/izakaya.js          # your saved code directory (asks on first visit)
node bin/izakaya.js ~/work   # or any other directory, one-off
```

Or put it on your PATH:

```sh
npm link   # → izakaya
```

Two flags pour and leave without opening the bar:

```sh
izakaya --version   # the vintage, e.g. izakaya 0.3.0 (883c968)
izakaya --help      # the one-screen menu of usage
```

The version rides in the `居酒屋 izakaya` header chip and the colophon (`~`)
too. Run from a checkout and it carries the short commit (`-dirty` when the
tree is); the single curl-installed file, with no `.git` beside it, shows the
bare version.

On the first visit the bar asks where your work lives and remembers the
answer. Press `w` any time to move the bar to a different directory. The
root resolves in this order:

1. CLI argument
2. `$IZAKAYA_ROOT`
3. the saved answer in `~/.config/izakaya/config.json`
4. the first-visit prompt (default `~/code`)

Repeat visits open instantly on the last menu (cached per root in
`~/.cache/izakaya/menu.json`) while every plate is re-checked in place.
Scanning pours twice: a quick pass gets the whole menu up fast, then the
deep history — the activity sparkline, the chefs, the AI tally — simmers
in behind it.

### Nested projects

Repos often live together inside a parent folder, so the left-hand menu is also
a navigable directory tree. There is no separate selection mode: the row with
the blue highlight is the current repo or folder, and the dashboard on the
right always describes that exact path.

Highlight a parent and press `→`. Izakaya lazily scans its immediate subfolders,
places them as indented rows directly underneath the parent, and moves the
highlight onto the first child. Its dashboard appears immediately—language
mix, files, size, README description, Git state when it is its own repo, and
the rest of the usual plate details.

```text
⌄ lantern-labs
  └ › lantern-api      ← highlighted; this dashboard is on the right
  └ › lantern-web
```

The tree marks a closed or not-yet-checked folder with `›` and an expanded
parent with `⌄`. Use `↑` / `↓` (or `j` / `k`) to move among the parent, its
children, and the rest of the menu. Changing rows changes the dashboard; it
does not change directories or launch anything by itself.

Navigation works recursively:

1. `→` on a folder discovers and opens its children.
2. `→` on one of those children opens the next level.
3. If a folder has no visible children, `→` steps behind the bar into its
   changed-file view instead. Press `Tab` anywhere in the tree to open that
   view directly, without navigating its folders first.
4. `←` from a child returns the highlight to its parent.
5. `←` on an expanded parent collapses its descendants.
6. `Tab` or `←` from the changed-file view returns to the tree.

If you found the parent with `/`, opening it clears the filter but keeps that
same parent selected. Its children can then appear even when their names do not
match the original query.

Every action uses the highlighted row's exact path. `t` opens a terminal there;
`e` opens the editor there; `a` opens the agent picker there; `o` opens it in the
file manager; and `y` copies its path. `↵` leaves the seat file for the `iz()`
shell wrapper so your current shell can `cd` there. The other repo-aware keys,
including `u`, `c`/`C`, and `b`, target the highlighted child in the same way.

The scan is lazy, so nested trees do not slow the initial menu. Dot-directories
and generated or vendor folders such as `.git`, `node_modules`, `dist`,
`build`, `target`, and `vendor` stay hidden. Ordinary source folders remain
available: the tree mirrors useful filesystem navigation rather than guessing
which directories count as projects.

## Keys

| key | what |
| --- | --- |
| `j` / `k` / arrows | browse the menu |
| `→` / `←` | expand subfolders / back out |
| `Tab` | open the selected repo or folder's changed-file tab; press again to return |
| `↑` / `↓` | behind the bar: move file-by-file down the open tab |
| `↵` (behind the bar) | peek the pour — the file's diff, read-only; esc sets it down |
| `g` / `G` | first / last plate |
| `J` / `K` | scroll the selected plate's details |
| `/` | fuzzy filter the menu — `izk` finds izakaya (enter keeps, esc clears) |
| `d` | dirty plates only — just the repos with unfinished work |
| `!` | closing time — every plate carrying work only this machine holds: dirty files, stashes, commits on any branch no remote has, repos that never left the house |
| `s` | cycle sort: recent → name → size |
| `T` | change the lanterns — cycle the theme: tokyonight → iceberg → nord → catppuccin-mocha (remembered) |
| `↵` | sit down — leave, and the `iz()` wrapper cd's you into the repo |
| `o` | open the repo in the file manager — behind the bar, reveal the file |
| `t` | new terminal window at the selected repo or subfolder |
| `u` | the usual — your own session script, launched at the repo ([see below](#the-usual--bring-your-own-session)) |
| `e` | open the repo in `$EDITOR` (vim by default) in a new terminal window — behind the bar, open the file |
| `a` | choose an agent for this exact path; `↵` smart-opens, `n` starts fresh, `r` resumes |
| `c` | start Claude Code directly (compatibility shortcut) |
| `C` | resume Claude directly (compatibility shortcut) |
| `b` | open the repo's remote in the browser |
| `y` | copy the repo's path — behind the bar, the file's |
| `w` | move the bar — scan a different directory |
| `r` | rescan |
| `?` | the back page of the menu — all keys |
| `~` | colophon — who keeps this bar |
| `q` / esc | leave the bar — esc first clears any filter, then またね |

The menu marks plates that need attention: `●` uncommitted changes, `⇡`
commits you haven't pushed (cyan on this branch, orange on another), a
magenta `◆` where an agent session is talking right now, and a small moon on
plates untouched for half a year. A plate checked out on anything but its
default branch names that branch beside its name.

"Recent" means when you last had your hands on it: a plate's age is its
newest commit — or, when you've edited since, its newest uncommitted change,
shown in yellow. The repo you're mid-way through sits at the top even if its
last commit was last week. Folders without git use their newest file.

While a filter is on, matches are ranked rather than nested, so a subfolder
shows its parent's path beside its name instead of an indent.

The bar also remembers your last visit. When the first scan finishes it
tells you what changed while you were gone — new pours, plates that joined
or left the menu, work that went unsettled — and marks freshly-poured
plates with a teal `+` until you rescan.

The header counts agents cooking anywhere on the menu. Every 20 seconds the
bar re-reads session timestamps (nothing else) so those marks stay current
while you browse.

And if GitHub's [`gh`](https://cli.github.com) CLI is installed, examining
a plate (`→`) quietly asks the street about it: open PRs and the latest
checks appear under the remote. Lazy — only the plate you examine — and
silent when `gh` is missing, signed out, or the remote isn't GitHub.

### Agents — bring whoever you work with

Press `a` on any highlighted repo or nested folder. The picker opens for that
exact path, with **Claude Code** and **Codex** built in. Use `↑` / `↓` to choose:

- `↵` is the smart choice: resume when izakaya sees a session at this path,
  otherwise start fresh
- `n` always starts a fresh session
- `r` explicitly resumes; `esc` closes the picker

Izakaya reads only local session metadata to show who last spoke. Claude Code
sessions are matched from `~/.claude/projects`; Codex sessions are matched by
the `cwd` in `~/.codex/sessions`. It never reads conversation content. Starting
or resuming happens in a new terminal (or tmux window) with the selected path as
the working directory. The built-in commands are `claude`,
`claude --continue`, `codex`, and `codex resume --last`.

The picker is deliberately open-ended. Add Qwen Code, Kimi CLI, Aider, or your
own wrapper under `agents` in the global config:

```json
{
  "agents": [
    {
      "id": "qwen",
      "label": "Qwen Code",
      "command": "qwen",
      "resume": "qwen --continue"
    },
    {
      "id": "kimi",
      "label": "Kimi CLI",
      "command": "kimi"
    }
  ]
}
```

Use the actual start/resume syntax for the CLI installed on your machine. A
custom `resume` command is optional; because arbitrary CLIs do not share a
session format, `r` invokes it explicitly while smart `↵` starts fresh. These
commands are loaded only from `~/.config/izakaya/config.json`, never from a
repo, so selecting unfamiliar code cannot smuggle in a launcher. `c` and `C`
remain direct Claude shortcuts for existing muscle memory.

### The launch keys, across platforms

Browsing the menu works anywhere Node does. The launch keys (`o` `t` `e` `a`
`b` `y`) reach out to the OS, so how far they go depends on where you sit:

- **`o` open · `b` browser · `y` copy** — full parity on **macOS and Linux**.
  macOS uses `open` and `pbcopy`; Linux uses `xdg-open`, and for the clipboard
  `wl-copy` (Wayland), `xclip`, or `xsel` — whichever you have installed. With
  none of them around, `y` asks the terminal itself via **OSC 52** — zero
  processes, and it works over a bare SSH session too.
- **`t` terminal · `e` editor · `a` agents** — spawn a new terminal window.
  - **inside tmux** (any platform), a new window means a **tmux window** at
    the repo — the bar meets you where you live, not over it.
  - **macOS** drives Ghostty over AppleScript, falling back to Terminal.app.
  - **Linux** has no standard terminal, so izakaya looks for one in order:
    **kitty → wezterm → alacritty → foot**. To use anything else (or to force
    a choice), set it yourself:

    ```sh
    export IZAKAYA_TERMINAL="kitty"      # env var, or…
    ```
    ```json
    // ~/.config/izakaya/config.json
    { "terminal": "kitty" }
    ```

    A known emulator's name gets the right flags automatically; anything else
    is launched at the repo's directory on a best-effort basis. If no terminal
    is found and none is configured, `t`/`e`/`c` say so and open the folder
    instead.

If a tool a key needs isn't installed, the key tells you what's missing rather
than failing in silence.

## What's on a plate

Select a repo and the right panel fills in:

- a powerline status ribbon — branch, clean/dirty, ahead/behind, version —
  shaped like the Starship prompt it sits under
- **the open tab** — the uncommitted changes, file by file and colored by
  status (modified, added, deleted, renamed, untracked), staged marked. Press
  `Tab` to step behind the bar and walk the tab with `↑`/`↓`; the file you're on
  glows orange, and `↵` peeks the pour — its diff, right there, read-only
- **the last pour** and the few before it: recent commits with ages — plus
  **the last touch** when uncommitted edits are newer than any commit
- **the kitchen** — a 12-week sparkline of commit activity, the chefs who
  cook here, the shelf (branches, tags, stashes), and the **side kitchens**:
  linked git worktrees and their branches, where parallel work (often an
  agent's) usually lives
- **the pantry** — a language bar with percentages, file count, and size on
  disk
- **the hand behind the bar** — factual commit attribution: how much recent
  work carries a coding agent's `Co-authored-by` trailer (Claude, Codex,
  Copilot, Cursor, Aider, Gemini), and which models are named — Claude's
  (`Claude Opus 4.7`) and Codex's when it signs as `Codex (gpt-6-astra)`,
  shown as `GPT-6 Astra`. Only signed commits count; an agent that leaves no
  trailer leaves no mark. Codex doesn't sign by default — a `SessionStart`
  hook can hand it the trailer (its hook input carries `model`)
- **agents at the bar** — local Claude Code and Codex sessions associated with
  this exact path, and when each last spoke (`a` starts or resumes one)
- **word from the street** — with `gh` installed, the plate you examine
  shows its open PRs and latest checks
- stack chips (frameworks and tooling it spotted), the remote, whether
  `AGENTS.md` or `CLAUDE.md` is posted, and the README's opening line in quotes

Repos without git are still served, marked as off-menu items.

## The launcher — `iz()`

izakaya can hand your shell the repo you picked. Press `↵` on a plate and
the bar writes its path to the seat file (`~/.cache/izakaya/seat`, or under
`$XDG_CACHE_HOME` if you set one) on the way out; a tiny wrapper turns that
into a `cd`:

```zsh
# ~/.zshrc
iz() {
  izakaya "$@"
  local seat="${XDG_CACHE_HOME:-$HOME/.cache}/izakaya/seat"
  if [[ -f "$seat" ]]; then
    cd -- "$(<"$seat")" && command rm -f -- "$seat"
  fi
}
```

Browse, press `↵`, and you're standing in the repo.

Faster still: give `iz` the name. `iz ramen` fuzzy-matches against last
visit's menu, and when exactly one plate answers you're seated without the
bar even opening — two keystrokes and a word to be anywhere. If several
match, the bar opens pre-filtered so you can pick.

For **fish**, the same idea in fish syntax (`~/.config/fish/config.fish`):

```fish
function iz
    izakaya $argv
    set -l seat (set -q XDG_CACHE_HOME; and echo $XDG_CACHE_HOME; or echo $HOME/.cache)/izakaya/seat
    if test -f "$seat"
        cd (cat "$seat"); and command rm -f -- "$seat"
    end
end
```

## The usual — bring your own session

If your day starts with your own session script — tmux panes, agents, vim,
gitui, logs, all arranged just so — tell the bar your order once:

```sh
export IZAKAYA_USUAL="dev-session"        # env var, or…
```
```json
// ~/.config/izakaya/config.json
{ "usual": "~/bin/dev-session" }
```

Then `u` on any plate fires it at that repo: launched through the same
platform layer as `t`/`e`/`a` (a **tmux window** when you're inside tmux, a
terminal window otherwise), via `$SHELL -lc` so your login environment is
there, with the working directory at the repo and the repo's absolute path
as `$1`. Extra flags ride along fine: `"usual": "dev-session --layout full"`.

The command comes **only** from your env or config — izakaya never runs
anything it finds inside a scanned repo, so browsing a freshly-cloned
stranger's project stays exactly as safe as reading it. And if you'd rather
enter through the shell, the `iz()` wrapper composes too: add your script
after the `cd` and every `↵` becomes a session.

## Themes — the lanterns

TokyoNight (Night) is the house light, but the bar hangs four:
**tokyonight · iceberg · nord · catppuccin-mocha**. Press `T` to change the
lanterns live — the whole room repaints in one frame — and the choice is
remembered. Or set it ahead of time:

```sh
export IZAKAYA_THEME="nord"          # env var, or…
```
```json
// ~/.config/izakaya/config.json
{ "theme": "catppuccin-mocha" }
```

Every color the bar paints flows through the active theme — panes, plates,
diffs, the header ramp, even the splash gradient — and a theme is pure data
(the same two dozen keys plus gradient stops), so adding one is a ~30-line,
data-only pull request. Hexes come from each palette's canonical definitions.

## Atmosphere

Leave the bar alone for half a minute and it quietly lives — the master
wipes a glass, steam curls off the kettle, the lantern sways a little. Any
key snaps it back to business. And on the way out, `q` pours a parting
kotowaza — dealt from a persistent shuffled deck, so you hear every saying
once before any repeats.

## The takeout window — for scripts, cron, and agents

The bar is for people; the scanner is happy to serve anything that can read
JSON. Three flags skip the TUI entirely — no TTY, no alt screen, and nothing
written, not even the menu cache:

```sh
izakaya --report [root]          # the whole menu as one JSON document
izakaya --closing-time [root]    # what dies with this laptop — plain text
izakaya --closing-time --json    # the same sweep, structured
izakaya --standup [root]         # your commits since the last workday
izakaya --standup --json         # the same, structured
```

`--report` prints every plate the bar would serve — git status, the open
tab, ahead/behind, unpushed pours, stashes, languages, stack chips, known
agent sessions and factual AI co-author attribution. The `schema` field mirrors the
menu-cache version and bumps whenever a plate changes shape, so anything
built on it can notice instead of break. An agent gets the answer to
"which repos need attention, and where did an agent leave off?" in one call.

`--closing-time` is the `!` scene to go: every plate carrying work only
this machine holds. The exit code does the talking — `1` when something's
at risk, `0` when the stove is clean, `2` when the root can't be read — so
a cron line or an agent heartbeat can nag without parsing a thing:

```sh
izakaya --closing-time || say "the stove is still on"
```

`--standup` is the morning meeting: every commit you made on any local
branch since the last workday (yesterday; Monday and weekends look back to
Friday), grouped by repo, newest first. It only asks `git log`, so it's
quick, and it looks one level into folders that aren't repos, so projects
grouped in a folder still report. "You" is your git `user.name` *or*
`user.email`, which catches commits made under a noreply address on another
machine. Set `IZAKAYA_AUTHOR` (any `git log --author` pattern) to override.

Text output is colored on a TTY and plain in a pipe. Root resolution
matches the bar: argument > `$IZAKAYA_ROOT` > saved config > `~/code`.

## Read-only, by design

izakaya never writes to the repos it scans. The only files it touches are
its own:

- `~/.config/izakaya/config.json` — where your work lives, your `theme`,
  optional agent launchers, your optional `usual` session script, and (on Linux) an optional
  `terminal` override (`$XDG_CONFIG_HOME` respected)
- `~/.cache/izakaya/menu.json` — the warm-start menu, keyed by root
- `~/.cache/izakaya/sayings.json` — the kotowaza deck's cursor
- `~/.cache/izakaya/seat` — the `↵` cd target the `iz()` wrapper consumes

(the cache trio lives under `$XDG_CACHE_HOME/izakaya` when that's set)

Everything else — Finder, terminal windows, the editor, coding agents, the
browser, the clipboard — is a launch, not a mutation.

It's also safe to browse a stranger's clone. Commit messages, author names,
README lines, and folder names are someone else's text, and raw they could
carry terminal escape sequences (retitle your window, write your clipboard).
Every control character is stripped before anything reaches the screen or
`--report`.

## The demo GIF

The recording above is staged — `scripts/demo.sh` builds a fake bar of repos
at `/tmp/izakaya-demo` (varied languages, ages, dirty states, unpushed work),
and `docs/demo.tape` replays the session with [vhs](https://github.com/charmbracelet/vhs).
The stills in the table up top are `Screenshot` frames from the same tape:

```sh
./scripts/demo.sh && vhs docs/demo.tape
```

Hacking on the bar? `node --test` runs the tasting flight in `test/` — pure
helpers only, still zero dependencies (`node:test` ships with node) — and CI
runs it on macOS and Linux plus a pty smoke render of the real thing.

## Requirements

- Node ≥ 22
- A nerd font (you're running Starship, you have one)
- A terminal with truecolor (Ghostty, kitty, iTerm2, …)
- **Browsing** works on any platform Node runs on. The **launch keys** go
  furthest on macOS and Linux: `o`/`b`/`y` work on both; terminal spawning
  (`t`/`e`/`a`) works with Ghostty/Terminal.app on macOS, and with kitty,
  wezterm, alacritty, or foot on Linux — or any terminal you point
  `IZAKAYA_TERMINAL` / the `terminal` config field at. See
  [the launch keys, across platforms](#the-launch-keys-across-platforms).

No dependencies. No build step. One file.

## License

[MIT](LICENSE) — use it, fork it, sell it, just keep the copyright notice.
© Matt Williamson
