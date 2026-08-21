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
Type "IZAKAYA_DEMO=1 node bin/izakaya.js /tmp/izakaya-demo"
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
# the first child takes focus, and every launch key follows that exact path
Type "G"
Sleep 500ms
Up
Sleep 800ms
Right
Sleep 2.2s
Down
Sleep 1.2s
Up
Sleep 1.2s
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

# open the repo's source folder, return to the parent, then step behind the
# bar and walk its open tab — tree navigation and file navigation stay distinct
Right
Sleep 1.2s
Left
Sleep 500ms
Right
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

# a claude session at the bar (IZAKAYA_DEMO suppresses the real launch)
Type "c"
Sleep 1.8s

# またね — the farewell scene plays, then auto-exits
Type "q"
Sleep 3.5s
