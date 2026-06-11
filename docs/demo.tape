# vhs tape for the README gif — records izakaya against the staged demo bar.
#
#   ./scripts/demo.sh && vhs docs/demo.tape
#
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
Type "node bin/izakaya.js /tmp/izakaya-demo"
Show

Enter
# splash: flowing gradient + the pour
Sleep 3.5s

# browse a few plates
Type@350ms "jjj"
Sleep 1.8s
Type@350ms "jj"
Sleep 2s

# filter for the noodles
Type "/"
Sleep 600ms
Type@250ms "ramen"
Sleep 1.2s
Enter
Sleep 2s
Escape
Sleep 1s

# sort by size, then back to top
Type "s"
Sleep 1.5s
Type "s"
Sleep 1s
Type "g"
Sleep 1.5s

# またね — the farewell scene plays, then auto-exits
Type "q"
Sleep 3.5s
