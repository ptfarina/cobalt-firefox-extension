#!/usr/bin/env bash
# Instala o host nativo da instância Cobalt local para o Firefox (Linux).
# - copia cobalt_host.py para ~/cobalt-local/
# - registra ~/.mozilla/native-messaging-hosts/com.cobalt.local.json
# - cria o container docker 'cobalt-local' (se o daemon estiver rodando)
# Uso: ./install-host.sh
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST_DIR="$HOME/cobalt-local"
HOST_FILE="$DEST_DIR/cobalt_host.py"
MANIFEST_DIR="$HOME/.mozilla/native-messaging-hosts"
MANIFEST_FILE="$MANIFEST_DIR/com.cobalt.local.json"
APP_ID="cobalt-media-downloader@example.local"  # deve ser igual ao gecko.id do manifest.json

mkdir -p "$DEST_DIR" "$MANIFEST_DIR"
cp "$SRC_DIR/cobalt_host.py" "$HOST_FILE"
chmod +x "$HOST_FILE"

cat > "$MANIFEST_FILE" <<EOF
{
  "name": "com.cobalt.local",
  "description": "Gerencia a instância Cobalt local (sobe com o Firefox, para ao fechar)",
  "path": "$HOST_FILE",
  "type": "stdio",
  "allowed_extensions": ["$APP_ID"]
}
EOF
chmod 644 "$MANIFEST_FILE"
echo "host instalado: $HOST_FILE"
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
    echo "container 'cobalt-local' criado (não inicia no boot; só via Firefox)."
  else
    echo "container 'cobalt-local' já existe."
  fi
else
  echo "AVISO: daemon docker indisponível. Inicie com:"
  echo "  sudo systemctl start docker   (e 'sudo systemctl enable docker' p/ boot)"
  echo "depois rode este script de novo para criar o container."
fi

echo "teste rápido do protocolo:"
printf '\x10\x00\x00\x00{"cmd":"status"}' | python3 "$HOST_FILE" | head -c 400; echo
