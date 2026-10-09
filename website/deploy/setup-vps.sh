#!/usr/bin/env bash
# Setup eroticx.fr on an Ubuntu VPS (IONOS).
# Run as root (or with sudo): bash setup-vps.sh
set -euo pipefail

DOMAIN="eroticx.fr"
APP_DIR="/var/www/eroticx"
REPO_URL="${REPO_URL:-https://github.com/sly0i/Maria.git}"
BRANCH="${BRANCH:-cursor/member-auth-video-cdfa}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Lance ce script en root: sudo bash setup-vps.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl git nginx certbot python3-certbot-nginx

# Node 22 LTS
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

npm install -g pm2

mkdir -p /var/www
if [[ ! -d "$APP_DIR/.git" ]]; then
  rm -rf "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
fi

cd "$APP_DIR/website"
npm install --omit=dev

if [[ ! -f .env ]]; then
  ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
  SESSION_SECRET="$(openssl rand -hex 32)"
  cat > .env <<EOF
PORT=8765
NODE_ENV=production
ADMIN_PASSWORD=${ADMIN_PASSWORD}
SESSION_SECRET=${SESSION_SECRET}
COOKIE_SECURE=1
TRUST_PROXY=1
EOF
  chmod 600 .env
  echo
  echo "===== MOT DE PASSE ADMIN (à garder) ====="
  echo "$ADMIN_PASSWORD"
  echo "========================================="
  echo
else
  echo ".env déjà présent — non modifié."
fi

mkdir -p data uploads/videos uploads/logo uploads/ads
chown -R www-data:www-data "$APP_DIR/website/data" "$APP_DIR/website/uploads" || true

pm2 delete eroticx >/dev/null 2>&1 || true
pm2 start server.js --name eroticx --cwd "$APP_DIR/website"
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null || true

install -m 644 "$APP_DIR/website/deploy/nginx-eroticx.fr.conf" /etc/nginx/sites-available/eroticx.fr
ln -sfn /etc/nginx/sites-available/eroticx.fr /etc/nginx/sites-enabled/eroticx.fr
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo
echo "Nginx OK. Quand le DNS pointe déjà vers ce VPS, active HTTPS :"
echo "  certbot --nginx -d eroticx.fr -d www.eroticx.fr --redirect -m contact@eroticx.fr --agree-tos -n"
echo
echo "Site (HTTP pour l’instant) : http://eroticx.fr/"
echo "Admin : http://eroticx.fr/admin"
echo "MDP admin : cat $APP_DIR/website/.env | grep ADMIN_PASSWORD"
