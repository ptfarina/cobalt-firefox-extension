#!/usr/bin/env bash
# Installs the native host of the local Cobalt instance for Firefox (Linux).
# - copies cobalt_host.py to ~/cobalt-local/
# - registers ~/.mozilla/native-messaging-hosts/com.cobalt.local.json
# - creates the docker container 'cobalt-local' (if the daemon is running)
# Usage: ./install-host.sh
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST_DIR="$HOME/cobalt-local"
HOST_FILE="$DEST_DIR/cobalt_host.py"
MANIFEST_DIR="$HOME/.mozilla/native-messaging-hosts"
MANIFEST_FILE="$MANIFEST_DIR/com.cobalt.local.json"
APP_ID="cobalt-media-downloader@example.local"  # must match the gecko.id in manifest.json

mkdir -p "$DEST_DIR" "$MANIFEST_DIR"
cp "$SRC_DIR/cobalt_host.py" "$HOST_FILE"
chmod +x "$HOST_FILE"

cat > "$MANIFEST_FILE" <<EOF
{
  "name": "com.cobalt.local",
  "description": "Manages the local Cobalt instance (starts with Firefox, stops on close)",
  "path": "$HOST_FILE",
  "type": "stdio",
  "allowed_extensions": ["$APP_ID"]
}
EOF
chmod 644 "$MANIFEST_FILE"
echo "native host installed: $HOST_FILE"
echo "manifesto: $MANIFEST_FILE"

if docker info >/dev/null 2>&1; then
  if ! docker inspect cobalt-local >/dev/null 2>&1; then
    echo "baixando imagem ghcr.io/imputnet/cobalt:11 (pode demorar na 1ª vez)…"
    docker pull ghcr.io/imputnet/cobalt:11
    docker create --name cobalt-local --init --read-only \
      -p 127.0.0.1:9000:9000 \
      -e API_URL=http://localhost:9000/ \
      --restart no \
      ghcr.io/imputnet/cobalt:11
    echo "container 'cobalt-local' created (does not start on boot; only via Firefox)."
  else
    echo "container 'cobalt-local' already exists."
  fi
else
  echo "WARNING: docker daemon unavailable. Start it with:"
  echo "  sudo systemctl start docker   (e 'sudo systemctl enable docker' p/ boot)"
  echo "then run this script again to create the container."
fi

echo "quick protocol test:"
printf '\x10\x00\x00\x00{"cmd":"status"}' | python3 "$HOST_FILE" | head -c 400; echo
