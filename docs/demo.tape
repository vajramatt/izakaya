# vhs tape for the README gif — records izakaya against the staged demo bar.
#
#   ./scripts/demo.sh && vhs docs/demo.tape
#
# Also drops the README stills into docs/screens/ along the way.
# Needs a nerd font installed (JetBrainsMono Nerd Font).

Output docs/demo.gif

Set Shell "bash"
Set FontFamily "JetBrainsMono Nerd Font"
Set FontSize 15
Set Width 1100
Set Height 640
Set Padding 12
Set Theme { "background": "#1a1b26", "foreground": "#c0caf5" }

Hide
Type "XDG_CONFIG_HOME=/tmp/izakaya-demo-config IZAKAYA_DEMO=1 node bin/izakaya.js /tmp/izakaya-demo"
Show

Enter
# splash: flowing gradient + the pour
Sleep 3.5s

# browse a few plates, then back to the top for the fullest plate
Type@350ms "jjj"
Sleep 1.5s
Type@300ms "jj"
Sleep 1.5s
Type "g"
Sleep 1.2s
Screenshot docs/screens/menu.png
Sleep 800ms

# open a studio folder — its related projects unfold directly beneath it,
# the active filter clears at the doorway, the first child takes focus, and
# every launch key follows that exact path
Type "/"
Sleep 350ms
Type@180ms "ll"
Sleep 800ms
Enter
Sleep 400ms
Right
Sleep 2.2s
Down
Sleep 1.2s
Up
Sleep 1.2s
Screenshot docs/screens/nested.png
# agents follow the highlighted child, too: open the picker, move from
# Claude Code to Codex, then start it at this exact nested path
Type "a"
Sleep 1.6s
Down
Sleep 1.2s
Screenshot docs/screens/agents.png
Type "n"
Sleep 1.8s
Type "t"
Sleep 1.5s
Left
Sleep 500ms
Left
Sleep 500ms

# fuzzy filter — two letters find the citrus
Type "/"
Sleep 500ms
Type@250ms "yz"
Sleep 1.2s
Enter
Sleep 800ms

# tab goes straight behind the bar — folder navigation and the open tab have
# distinct controls even when a repo contains src, packages, or apps
Tab
Sleep 900ms
Down
Sleep 600ms
Up
Sleep 600ms

# peek the pour — the file's diff, read-only
Enter
Sleep 2.5s
Screenshot docs/screens/peek.png
Sleep 800ms
Type "j"
Sleep 400ms
Type "j"
Sleep 800ms
Escape
Sleep 700ms

# back out front, clear the filter
Left
Sleep 600ms
Escape
Sleep 800ms

# closing time — what leaves only with this laptop
Type "!"
Sleep 2.8s
Screenshot docs/screens/closing-time.png
Sleep 400ms
Escape
Sleep 800ms

# dirty plates only, then the full menu again
Type "d"
Sleep 1.5s
Type "d"
Sleep 800ms

# またね — the farewell scene plays, then auto-exits
Type "q"
Sleep 3.5s
