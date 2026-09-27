#!/bin/bash
# Builds a fake ~/code full of staged repos so the README GIF shows
# pretty demo content instead of anyone's real projects.
#
#   ./scripts/demo.sh [dir]     # default: /tmp/izakaya-demo
set -euo pipefail

DEMO="${1:-/tmp/izakaya-demo}"
# worktrees live beside the bar, not on it — like a real side kitchen
WT="${DEMO}-worktrees"
rm -rf "$DEMO" "$WT"
mkdir -p "$DEMO"
DEMO_CONFIG="/tmp/izakaya-demo-config"
rm -rf "$DEMO_CONFIG"
mkdir -p "$DEMO_CONFIG/izakaya"
cat > "$DEMO_CONFIG/izakaya/config.json" <<'EOF'
{
  "agents": [
    { "id": "qwen", "label": "Qwen Code", "command": "qwen" },
    { "id": "kimi", "label": "Kimi CLI", "command": "kimi" }
  ]
}
EOF

# git commit with a fake author and a backdated timestamp
ci() { # ci <dir> <author> <hours-ago> <message>
  local dir="$1" author="$2" hours="$3" msg="$4"
  local when
  when=$(date -v "-${hours}H" '+%Y-%m-%dT%H:%M:%S')
  git -C "$dir" add -A
  GIT_AUTHOR_NAME="$author" GIT_AUTHOR_EMAIL="demo@example.com" \
  GIT_COMMITTER_NAME="$author" GIT_COMMITTER_EMAIL="demo@example.com" \
  GIT_AUTHOR_DATE="$when" GIT_COMMITTER_DATE="$when" \
  git -C "$dir" -c commit.gpgsign=false commit -q --allow-empty -m "$msg"
}

mk() { # mk <name>  → git init + cd-able path in $R
  R="$DEMO/$1"
  mkdir -p "$R"
  git -C "$R" init -q -b main
}

pad_commits() { # pad_commits <dir> <author> <count> <hours-ago>
  for i in $(seq 1 "$3"); do
    ci "$1" "$2" $(($4 + i)) "chore: stir the pot #$i"
  done
}

lorem() { head -c "$2" /dev/urandom | base64 | fold -w 76 > "$1"; }

# ── ramen-router — TS worker, hono, clean, fresh ─────────────────────────────
mk ramen-router
cat > "$R/package.json" <<'EOF'
{ "name": "ramen-router", "version": "2.3.1",
  "dependencies": { "hono": "^4.6.0" },
  "devDependencies": { "vite": "^6.0.0", "drizzle-orm": "^0.36.0" } }
EOF
echo '{ "name": "ramen-router" }' > "$R/wrangler.jsonc"
echo '# ramen-router' > "$R/README.md"
echo 'Slurp-fast HTTP routing for edge workers.' >> "$R/README.md"
echo '# house rules' > "$R/CLAUDE.md"
mkdir -p "$R/src"
lorem "$R/src/index.ts" 9000
lorem "$R/src/broth.ts" 6000
lorem "$R/src/noodles.ts" 4000
pad_commits "$R" "Yuki Tanaka" 22 5
# agents sign the pours they help with — the plate's "hand behind the bar"
ci "$R" "Yuki Tanaka" 5 "feat: broth temperature probes

Co-Authored-By: Codex <noreply@openai.com>"
ci "$R" "Yuki Tanaka" 4 "fix: noodle timeout under load

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
ci "$R" "Yuki Tanaka" 3 "feat: tonkotsu middleware for sticky sessions

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git -C "$R" remote add origin git@github.com:yukitanaka/ramen-router.git

# ── yuzu-ui — TS+CSS, react+tailwind, dirty, no CLAUDE.md ────────────────────
mk yuzu-ui
cat > "$R/package.json" <<'EOF'
{ "name": "yuzu-ui", "version": "0.9.0",
  "dependencies": { "react": "^19.0.0" },
  "devDependencies": { "tailwindcss": "^4.0.0", "vite": "^6.0.0" } }
EOF
echo '# yuzu-ui' > "$R/README.md"
echo 'Citrus-bright React components with zero bitterness.' >> "$R/README.md"
mkdir -p "$R/src"
lorem "$R/src/Button.tsx" 7000
lorem "$R/src/Modal.tsx" 5000
lorem "$R/src/zest.css" 8000
# a legible file, so the peek scene (↵ on the open tab) shows a real diff
# instead of lorem noise — the camera lands here first (alphabetical)
cat > "$R/src/lantern.css" <<'EOF'
.lantern {
  color: #ff9e64;
  text-shadow: 0 0 12px rgba(255, 158, 100, 0.45);
  animation: sway 4s ease-in-out infinite;
}

@keyframes sway {
  from { transform: rotate(-2deg); }
  to   { transform: rotate(2deg); }
}
EOF
pad_commits "$R" "Kenji Sato" 11 30
ci "$R" "Kenji Sato" 26 "fix: modal focus trap escapes on shoji slide"
git -C "$R" remote add origin git@github.com:kenjisato/yuzu-ui.git
# mid-feature: off main, edits still warm — it floats to the top of the menu
git -C "$R" checkout -q -b feat/toast
lorem "$R/src/Toast.tsx" 2000   # uncommitted
echo "/* wip */" >> "$R/src/zest.css"
# the uncommitted pour the peek opens on — a warm color and a new rule
sed -i '' 's/#ff9e64/#e0af68/' "$R/src/lantern.css"
cat >> "$R/src/lantern.css" <<'EOF'

.lantern:hover {
  animation-play-state: paused;
}
EOF

# ── sashimi-db — Go, clean but ⇡2 unpushed ───────────────────────────────────
mk sashimi-db
echo '# sashimi-db' > "$R/README.md"
echo 'Raw, thinly sliced key-value storage. Served cold.' >> "$R/README.md"
echo '# house rules' > "$R/CLAUDE.md"
lorem "$R/main.go" 11000
lorem "$R/slice.go" 7000
lorem "$R/wasabi_test.go" 3000
pad_commits "$R" "Aiko Mori" 18 150
git -C "$R" remote add origin git@github.com:aikomori/sashimi-db.git
git -C "$R" update-ref refs/remotes/origin/main HEAD
ci "$R" "Aiko Mori" 140 "perf: sharper knife for range scans"
ci "$R" "Aiko Mori" 139 "feat: omakase mode — let the db pick the index"
git -C "$R" branch -q -u origin/main

# ── karaoke-bot — Python, dirty, no remote ───────────────────────────────────
mk karaoke-bot
echo '# karaoke-bot' > "$R/README.md"
echo 'Discord bot that scores your singing. Brutally honest.' >> "$R/README.md"
lorem "$R/bot.py" 9000
lorem "$R/scoring.py" 5000
lorem "$R/setlist.py" 2500
pad_commits "$R" "Hana Suzuki" 7 345
ci "$R" "Hana Suzuki" 340 "feat: pitch shame leaderboard"
lorem "$R/duet.py" 1500   # uncommitted

# ── mochi-cache — Rust, ⇣1 behind ────────────────────────────────────────────
mk mochi-cache
echo '# mochi-cache' > "$R/README.md"
echo 'Soft, chewy LRU cache that never goes stale.' >> "$R/README.md"
echo '# house rules' > "$R/CLAUDE.md"
echo '[package]' > "$R/Cargo.toml"
lorem "$R/src.rs" 1
mkdir -p "$R/src"
lorem "$R/src/lib.rs" 12000
lorem "$R/src/pound.rs" 6000
rm "$R/src.rs"
pad_commits "$R" "Riku Yamada" 14 700
ci "$R" "Riku Yamada" 690 "feat: red bean eviction policy"
git -C "$R" remote add origin git@github.com:rikuyamada/mochi-cache.git
git -C "$R" update-ref refs/remotes/origin/main HEAD
git -C "$R" reset -q --hard HEAD~1
git -C "$R" branch -q -u origin/main

# ── hologram-shrine — Astro site, clean ──────────────────────────────────────
mk hologram-shrine
cat > "$R/package.json" <<'EOF'
{ "name": "hologram-shrine", "version": "1.1.0",
  "dependencies": { "astro": "^5.0.0" } }
EOF
echo '# hologram-shrine' > "$R/README.md"
echo 'A static shrine for projected thoughts.' >> "$R/README.md"
echo '# house rules' > "$R/CLAUDE.md"
mkdir -p "$R/src/pages"
lorem "$R/src/pages/index.astro" 8000
lorem "$R/src/pages/torii.astro" 5000
lorem "$R/src/shrine.css" 3000
pad_commits "$R" "Mei Kobayashi" 31 8
ci "$R" "Mei Kobayashi" 6 "feat: torii gate parallax on scroll"
git -C "$R" remote add origin git@github.com:meikobayashi/hologram-shrine.git
# a side kitchen: a linked worktree where a parallel change is simmering
git -C "$R" worktree add -q -b feat/koi-pond "$WT/koi-pond"

# ── katana-cli — Shell, old & clean ──────────────────────────────────────────
mk katana-cli
echo '# katana-cli' > "$R/README.md"
echo 'One sharp command. Cuts anything.' >> "$R/README.md"
lorem "$R/katana.sh" 6000
lorem "$R/sharpen.sh" 2000
pad_commits "$R" "Sora Ito" 9 2210
ci "$R" "Sora Ito" 2200 "docs: how to hold it properly"
git -C "$R" remote add origin git@github.com:soraito/katana-cli.git

# ── tofu-notes — not a git repo, off-menu ────────────────────────────────────
mkdir -p "$DEMO/tofu-notes"
echo '# tofu notes' > "$DEMO/tofu-notes/README.md"
echo 'Soft plans, firm opinions.' >> "$DEMO/tofu-notes/README.md"
lorem "$DEMO/tofu-notes/ideas.md" 4000

# ── lantern-labs — a studio folder with related projects nested inside ───────
# Select lantern-labs and press →; the two child plates appear beneath it.
mk lantern-labs/lantern-web
cat > "$R/package.json" <<'EOF'
{ "name": "lantern-web", "version": "1.4.0",
  "dependencies": { "astro": "^5.0.0" } }
EOF
echo '# lantern-web' > "$R/README.md"
echo 'The public glow for Lantern Labs.' >> "$R/README.md"
mkdir -p "$R/src"
lorem "$R/src/index.ts" 5000
pad_commits "$R" "Mina Park" 5 18
ci "$R" "Mina Park" 12 "feat: light the new landing page"

mk lantern-labs/lantern-api
echo 'module lantern-api' > "$R/go.mod"
echo '# lantern-api' > "$R/README.md"
echo 'A small service that keeps the lanterns lit.' >> "$R/README.md"
lorem "$R/main.go" 6500
pad_commits "$R" "Mina Park" 4 28
ci "$R" "Mina Park" 20 "feat: report lantern health"

# Staging just wrote every file, so every file reads "just now" — and the
# menu sorts by last touch. Settle the whole bar back a month, then warm only
# yuzu-ui's uncommitted edits: it's the one plate somebody's mid-way through.
find "$DEMO" "$WT" -path '*/.git' -prune -o -exec touch -t "$(date -v -30d '+%Y%m%d%H%M')" {} +
git -C "$DEMO/yuzu-ui" status --porcelain | cut -c4- | while read -r f; do touch "$DEMO/yuzu-ui/$f"; done

echo "demo bar stocked at $DEMO"
