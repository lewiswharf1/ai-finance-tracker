#!/bin/bash
# Builds "Finance Tracker.app" — a double-clickable wrapper around run.command that
# you can keep in the Dock, Launchpad or Applications, with a proper icon.
#
# The bundle hard-codes the path to this project, so re-run this script if you
# ever move or rename the project folder.
set -e

cd "$(dirname "$0")"
ROOT="$PWD"
APP="$ROOT/Finance Tracker.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Finance Tracker</string>
  <key>CFBundleDisplayName</key><string>Finance Tracker</string>
  <key>CFBundleIdentifier</key><string>local.finance-tracker</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

# Hand the script to Terminal rather than running it here, so the server gets a
# window with live log output that you can stop with Ctrl-C.
#
# Running it directly instead (nohup, no window) is possible but has a catch worth
# knowing about: LaunchServices starts a script-based bundle under Rosetta on Apple
# Silicon, and the venv's arm64 wheels then fail to load with "incompatible
# architecture (have 'arm64', need 'x86_64')". LSRequiresNativeExecution in
# Info.plist does not help — it is ignored when the bundle executable is a script.
# Going through Terminal sidesteps it, since Terminal is already running natively.
#
# Keep the project out of ~/Documents, ~/Desktop and ~/Downloads either way: macOS
# refuses an unsigned bundle permission to execute anything in those, silently.
cat > "$APP/Contents/MacOS/launch" <<LAUNCHER
#!/bin/bash
open -a Terminal "$ROOT/run.command"
LAUNCHER
chmod +x "$APP/Contents/MacOS/launch"

# Render the icon at every size macOS asks for.
ICONSET="$(mktemp -d)/AppIcon.iconset"
mkdir -p "$ICONSET"
BASE="$(mktemp -d)/icon.png"
qlmanage -t -s 1024 -o "$(dirname "$BASE")" public/appicon.svg >/dev/null 2>&1
mv "$(dirname "$BASE")/appicon.svg.png" "$BASE"

for size in 16 32 128 256 512; do
  sips -z $size $size "$BASE" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z $((size * 2)) $((size * 2)) "$BASE" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

# Nudge Finder into noticing the new bundle.
touch "$APP"

echo "Built: $APP"
echo
echo "Drag it to your Dock, or into /Applications to get it in Launchpad and Spotlight."
