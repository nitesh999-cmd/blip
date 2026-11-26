#!/bin/bash
# Blip for macOS: downloads Blip into ~/blip, adds a private copy of Node.js if this Mac has no
# recent one (only Blip uses it), installs Blip's parts and starts it. Run it again to update.
#
#   curl -fsSL https://raw.githubusercontent.com/nitesh999-cmd/blip/main/install-mac.sh | bash
#
# Everything lives in ~/blip (and Blip's settings in ~/Library/Application Support/blip).
# Nothing needs a password or admin rights.

set -euo pipefail

REPO="nitesh999-cmd/blip"
BRANCH="main"
BLIP_DIR="${BLIP_DIR:-$HOME/blip}"
NODE_MAJOR=24
MARKER=".blip-install"
ELECTRON_BIN="node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\nSorry: %s\n' "$1" >&2; exit 1; }

# Electron needs Node 22.12 or newer to install.
node_ok() {
  local version major minor
  version="$("$1" -v 2>/dev/null)" || return 1
  version="${version#v}"
  major="${version%%.*}"
  minor="${version#*.}"; minor="${minor%%.*}"
  [[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ ]] || return 1
  (( major > 22 || (major == 22 && minor >= 12) ))
}

chip() {
  if [ "$(uname -m)" = "arm64" ] || [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
    echo arm64
  elif [ "$(uname -m)" = "x86_64" ]; then
    echo x64
  else
    fail "this Mac's chip ($(uname -m)) isn't supported."
  fi
}

download_blip() {
  local tmp="$1"
  say "Downloading Blip..."
  curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" -o "$tmp/blip.tar.gz"
  mkdir -p "$tmp/blip"
  tar -xzf "$tmp/blip.tar.gz" -C "$tmp/blip" --strip-components 1
  [ -f "$tmp/blip/package.json" ] || fail "the download looks incomplete. Please try again."

  if [ -e "$BLIP_DIR" ] && [ ! -f "$BLIP_DIR/$MARKER" ]; then
    fail "$BLIP_DIR already exists and isn't Blip. Move it away, or run with BLIP_DIR=/some/other/folder."
  fi
  # An update: stop the running Blip and keep the private Node.js.
  pkill -f "$BLIP_DIR/node_modules/electron/dist" 2>/dev/null || true
  if [ -d "$BLIP_DIR/.node" ]; then mv "$BLIP_DIR/.node" "$tmp/blip/.node"; fi
  if [ -f "$BLIP_DIR/$MARKER" ]; then rm -rf "$BLIP_DIR"; fi
  mv "$tmp/blip" "$BLIP_DIR"
  touch "$BLIP_DIR/$MARKER"
}

# Sets NODE_BIN to a folder holding a suitable node: this Mac's own, or a private copy in ~/blip/.node.
# (No command substitution here, so any failure stops the install: macOS still ships bash 3.2.)
NODE_BIN=""
find_node() {
  local tmp="$1" arch base file
  if [ -z "${BLIP_FORCE_PRIVATE_NODE:-}" ] && command -v node >/dev/null 2>&1 && node_ok "$(command -v node)"; then
    NODE_BIN="$(dirname "$(command -v node)")"; return
  fi
  if [ -x "$BLIP_DIR/.node/bin/node" ] && node_ok "$BLIP_DIR/.node/bin/node"; then
    NODE_BIN="$BLIP_DIR/.node/bin"; return
  fi
  arch="$(chip)"
  say "Adding a private copy of Node.js (only Blip uses it)..."
  base="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
  curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  file="$(grep -E " node-v[0-9.]+-darwin-$arch\.tar\.gz$" "$tmp/SHASUMS256.txt" | awk '{print $2}' | head -1)"
  [ -n "$file" ] || fail "couldn't find Node.js for this Mac."
  curl -fsSL "$base/$file" -o "$tmp/$file"
  (cd "$tmp" && grep " $file\$" SHASUMS256.txt | shasum -a 256 -c - >/dev/null) || fail "the Node.js download didn't check out. Please try again."
  rm -rf "$BLIP_DIR/.node"
  mkdir -p "$BLIP_DIR/.node"
  tar -xzf "$tmp/$file" -C "$BLIP_DIR/.node" --strip-components 1
  NODE_BIN="$BLIP_DIR/.node/bin"
}

write_starter() {
  cat > "$BLIP_DIR/start-blip.sh" <<STARTER
#!/bin/bash
# Starts Blip (stops a running one first). Claude Code is found in its usual places.
export PATH="\$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$BLIP_DIR/.node/bin:\$PATH"
pkill -f "$BLIP_DIR/node_modules/electron/dist" 2>/dev/null || true
cd "$BLIP_DIR"
nohup "$BLIP_DIR/$ELECTRON_BIN" "$BLIP_DIR" >/dev/null 2>&1 &
STARTER
  chmod +x "$BLIP_DIR/start-blip.sh"
}

TMP_DIR=""
cleanup() { if [ -n "$TMP_DIR" ]; then rm -rf "$TMP_DIR"; fi; }

main() {
  [ "$(uname -s)" = "Darwin" ] || fail "this installer is for a Mac."
  command -v curl >/dev/null && command -v tar >/dev/null || fail "curl and tar are needed (they come with macOS)."
  TMP_DIR="$(mktemp -d)"
  trap cleanup EXIT
  local tmp="$TMP_DIR"

  download_blip "$tmp"
  find_node "$tmp"
  node_ok "$NODE_BIN/node" || fail "Node.js didn't install properly. Please run the command again."
  export PATH="$NODE_BIN:$PATH"

  say "Installing Blip's parts (a minute or two)..."
  (cd "$BLIP_DIR" && npm ci --no-audit --no-fund --loglevel=error)
  # Newer npm versions can skip Electron's own download step; fetch the window engine directly if so.
  if [ ! -x "$BLIP_DIR/$ELECTRON_BIN" ]; then (cd "$BLIP_DIR" && node node_modules/electron/install.js); fi
  [ -x "$BLIP_DIR/$ELECTRON_BIN" ] || fail "Blip's window engine (Electron) didn't install. Please run the command again."
  write_starter

  if [ -z "${BLIP_NO_START:-}" ]; then
    "$BLIP_DIR/start-blip.sh"
    say "Blip is running. Look for the little plant at the bottom of your screen."
  else
    say "Blip is installed."
  fi
  printf '%s\n' \
    "  Tap the plant for a line; right-click it (two-finger click) for the menu." \
    "  The tiny dot near the top right is the news dot: it shines while it checks the news." \
    "" \
    "  To start Blip again later, paste this into Terminal:" \
    "    \"$BLIP_DIR/start-blip.sh\"" \
    "  To update, run the install command again."
  if ! command -v claude >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/claude" ]; then
    printf '%s\n' "" "  Tip: install Claude Code (claude.com/claude-code) and sign in to make Blip smarter."
  fi
}

main </dev/null
