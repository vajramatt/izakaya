#!/bin/sh
# 居酒屋 izakaya — installer. Drops the single-file TUI onto your PATH and,
# with your blessing, teaches your shell the iz() cd-wrapper.
#
#   curl -fsSL https://raw.githubusercontent.com/vajramatt/izakaya/main/scripts/install.sh | sh
#
# House rules apply: zero dependencies (this is plain POSIX sh), and it only
# ever writes to a bin directory and — if you say yes — your shell rc. It never
# touches anything else. Read before you pour; it's short.
#
# Knobs (all optional):
#   IZAKAYA_BIN_DIR   where to install        (default: $XDG_BIN_HOME or ~/.local/bin)
#   IZAKAYA_REF       git ref to fetch from   (default: main)

set -u

REPO="vajramatt/izakaya"
REF="${IZAKAYA_REF:-main}"
RAW_BASE="https://raw.githubusercontent.com/$REPO/$REF"

# ── a little neon, only when someone's watching ─────────────────────────────
if [ -t 1 ]; then
  B="$(printf '\033[1m')";   DIM="$(printf '\033[2m')"; R="$(printf '\033[0m')"
  MAG="$(printf '\033[38;5;141m')"; GRN="$(printf '\033[38;5;150m')"
  YEL="$(printf '\033[38;5;179m')"; RED="$(printf '\033[38;5;210m')"
else
  B=''; DIM=''; R=''; MAG=''; GRN=''; YEL=''; RED=''
fi

say()  { printf '%s\n' "$*"; }
warn() { printf '%s\n' "${YEL}!${R} $*" >&2; }
die()  { printf '%s\n' "${RED}✗${R} $*" >&2; exit 1; }
short() { printf '%s' "$1" | sed "s#^$HOME#~#"; }

say ""
say "${MAG}🏮 居酒屋 izakaya${R} ${DIM}— pulling up a stool${R}"
say ""

# ── 1. a fetcher (curl or wget) ─────────────────────────────────────────────
if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -qO- "$1"; }
else
  die "need curl or wget to fetch izakaya."
fi

# ── 2. where it goes ────────────────────────────────────────────────────────
BIN_DIR="${IZAKAYA_BIN_DIR:-${XDG_BIN_HOME:-$HOME/.local/bin}}"
mkdir -p "$BIN_DIR" || die "could not create $BIN_DIR"
DEST="$BIN_DIR/izakaya"

# ── 3. pour the file ────────────────────────────────────────────────────────
say "${DIM}fetching${R} $RAW_BASE/bin/izakaya.js"
tmp="$(mktemp)" || die "could not make a temp file"
trap 'rm -f "$tmp"' EXIT INT TERM
fetch "$RAW_BASE/bin/izakaya.js" > "$tmp" || die "download failed — check your connection or the ref '$REF'."
# sanity: did we get the script, or a 404 page dressed as one?
head -n 1 "$tmp" | grep -q '^#!/usr/bin/env node' \
  || die "that didn't look like izakaya (bad ref '$REF'?)."
chmod +x "$tmp"
mv "$tmp" "$DEST" || die "could not write $DEST"
trap - EXIT INT TERM
say "${GRN}✓${R} installed ${B}$(short "$DEST")${R}"

# ── 4. node check — warn, don't block (they may install it next) ────────────
if command -v node >/dev/null 2>&1; then
  ver="$(node -v 2>/dev/null | sed 's/^v//')"
  major="${ver%%.*}"
  if [ -n "$major" ] && [ "$major" -ge 22 ] 2>/dev/null; then
    say "${GRN}✓${R} node ${DIM}v$ver${R}"
  else
    warn "node v$ver is here, but izakaya needs ${B}node ≥ 22${R} — upgrade before pouring."
  fi
else
  warn "node isn't on your PATH. izakaya needs ${B}node ≥ 22${R} to run (it's a script, not a binary)."
fi

# ── 5. is the bin dir on PATH? ──────────────────────────────────────────────
case ":$PATH:" in
  *":$BIN_DIR:"*) : ;;
  *) warn "$(short "$BIN_DIR") isn't on your \$PATH. Add it, e.g.:
      ${DIM}export PATH=\"$(short "$BIN_DIR"):\$PATH\"${R}" ;;
esac

# ── 6. the iz() wrapper ─────────────────────────────────────────────────────
# Press ↵ on a plate and izakaya leaves the repo's path in a seat file; this
# function turns that into a cd. Same body as the README. Added only with
# consent, only once, and only when there's a tty to ask through.
WRAPPER='
# izakaya — sit down on the repo you picked (↵ in the bar)
iz() {
  izakaya "$@"
  local seat="$HOME/.cache/izakaya/seat"
  if [ -f "$seat" ]; then
    cd -- "$(cat "$seat")" && command rm -f -- "$seat"
  fi
}'

add_wrapper() {
  rc="$1"
  if [ -f "$rc" ] && grep -q '^iz()' "$rc" 2>/dev/null; then
    say "${DIM}iz() already lives in $(short "$rc") — leaving it be${R}"
    return
  fi
  printf '%s\n' "$WRAPPER" >> "$rc" || { warn "could not write $rc"; return; }
  say "${GRN}✓${R} taught ${B}iz()${R} to $(short "$rc")"
  say "  ${DIM}open a new shell (or 'source $(short "$rc")') and run ${B}iz${R}${DIM} to pour${R}"
}

RC=""
case "$(basename "${SHELL:-}")" in
  zsh)  RC="${ZDOTDIR:-$HOME}/.zshrc" ;;
  bash) RC="$HOME/.bashrc" ;;
  fish) RC="fish" ;;
esac

say ""
if [ "$RC" = "fish" ]; then
  warn "fish detected — the iz() wrapper is bash/zsh syntax. The README has a fish note."
elif [ -z "$RC" ]; then
  say "${DIM}unknown shell — copy the iz() wrapper from the README when you're ready${R}"
elif ( exec </dev/tty ) 2>/dev/null; then
  # there's a real terminal to ask through (not just a /dev/tty node)
  printf '%s' "Add the ${B}iz()${R} cd-wrapper to ${B}$(short "$RC")${R}? [y/N] "
  read ans </dev/tty 2>/dev/null || ans=""
  case "$ans" in
    y|Y|yes|YES) add_wrapper "$RC" ;;
    *) say "${DIM}skipped — it's in the README whenever you want it${R}" ;;
  esac
else
  # piped with no terminal to ask through — never edit a dotfile silently
  say "${DIM}run this installer interactively to add the iz() wrapper, or copy it from the README${R}"
fi

say ""
say "${MAG}🏮${R} ${B}いらっしゃいませ${R} — run ${B}izakaya${R} to open the bar."
say ""
