# The settings window on its modules page, scrolled to the group "Discover".
source "$repo/scripts/lib/prefs.sh"
prefs_open
prefs_page modules
prefs_scroll 400
SHOT_WINDOW=$PREFS_WINDOW
