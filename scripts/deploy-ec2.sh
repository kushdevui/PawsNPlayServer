#!/usr/bin/env bash
# PawsNPlay API - one-command setup / update for an EC2 instance (Ubuntu or Amazon Linux).
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/kushdevui/PawsNPlayServer/main/scripts/deploy-ec2.sh)
#
# First run: installs Node 22, git, Nginx and PM2, clones the repo to ~/PawsNPlayServer, asks for
# MONGODB_URI once, writes .env with fresh JWT secrets, builds, starts with PM2 and puts Nginx on port 80.
# Later runs: pull the latest main, rebuild and restart. .env is never overwritten.
# Optional: MONGODB_URI=... bash <(curl ...) to skip the question.
set -euo pipefail

REPO_URL="https://github.com/kushdevui/PawsNPlayServer.git"
APP_DIR="$HOME/PawsNPlayServer"
APP_NAME="pawsnplay-api"

say() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "Run this as your normal user (ubuntu / ec2-user), not as root."
command -v sudo >/dev/null || die "sudo is required."

# ---------- 1. System packages ----------
if command -v apt-get >/dev/null; then
  PKG=apt
elif command -v dnf >/dev/null; then
  PKG=dnf
else
  die "Unsupported OS: need Ubuntu/Debian (apt) or Amazon Linux (dnf)."
fi

NODE_MAJOR=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)
if [ "$PKG" = apt ]; then
  say "Installing system packages (apt)"
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y curl git nginx build-essential openssl
  if [ "${NODE_MAJOR:-0}" != "22" ]; then
    say "Installing Node.js 22"
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
else
  say "Installing system packages (dnf)"
  sudo dnf install -y git nginx gcc-c++ make openssl tar
  command -v curl >/dev/null || sudo dnf install -y curl-minimal
  if [ "${NODE_MAJOR:-0}" != "22" ]; then
    say "Installing Node.js 22"
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
    sudo dnf install -y nodejs
  fi
fi
node -v | grep -q '^v22\.' || die "Node 22 was not installed correctly (got $(node -v 2>/dev/null || echo none))."

if ! command -v pm2 >/dev/null; then
  say "Installing PM2"
  sudo npm install -g pm2
fi

# ---------- 2. Code ----------
if [ -d "$APP_DIR/.git" ]; then
  say "Updating code in $APP_DIR"
  git -C "$APP_DIR" fetch origin main
  git -C "$APP_DIR" checkout -q main
  git -C "$APP_DIR" reset -q --hard origin/main
else
  say "Cloning $REPO_URL"
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# ---------- 3. Public address (for upload URLs and the summary) ----------
TOKEN=$(curl -s -m 2 -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)
PUBLIC_IP=$(curl -s -m 2 -H "X-aws-ec2-metadata-token: ${TOKEN}" \
  "http://169.254.169.254/latest/meta-data/public-ipv4" || true)
[[ "$PUBLIC_IP" =~ ^[0-9.]+$ ]] || PUBLIC_IP=$(curl -s -m 5 https://checkip.amazonaws.com | tr -d '[:space:]' || true)
[[ "$PUBLIC_IP" =~ ^[0-9.]+$ ]] || PUBLIC_IP="<your-server-ip>"

# ---------- 4. .env (created once, never overwritten) ----------
if [ ! -f .env ]; then
  say "Creating .env"
  URI="${MONGODB_URI:-}"
  while [[ ! "$URI" =~ ^mongodb(\+srv)?:// ]]; do
    printf 'Paste your MONGODB_URI (the same value as in your Mac .env; input is hidden): ' > /dev/tty
    IFS= read -rs URI < /dev/tty
    printf '\n' > /dev/tty
    [[ "$URI" =~ ^mongodb(\+srv)?:// ]] || printf 'It must start with mongodb:// or mongodb+srv:// - try again.\n' > /dev/tty
  done
  umask 077
  cat > .env <<EOF
NODE_ENV=production
PORT=4000
HOST=127.0.0.1
TRUST_PROXY=1
MONGODB_URI=${URI}
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
BCRYPT_COST=12
CORS_ORIGINS=*
UPLOAD_PROVIDER=local
UPLOAD_DIR=uploads
PUBLIC_BASE_URL=http://${PUBLIC_IP}
LOG_LEVEL=info
EOF
  unset URI
else
  say "Keeping existing .env"
fi

# ---------- 5. Build ----------
say "Installing dependencies and building"
npm install --no-audit --no-fund
npm run build

# ---------- 6. Run with PM2 ----------
say "Starting the API with PM2"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null

# ---------- 7. Nginx on port 80 ----------
say "Configuring Nginx"
NGINX_SITE='server {
    listen 80;
    server_name '"$PUBLIC_IP"' _;
    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}'
if [ -d /etc/nginx/sites-available ]; then
  echo "$NGINX_SITE" | sudo tee /etc/nginx/sites-available/pawsnplay >/dev/null
  sudo ln -sf /etc/nginx/sites-available/pawsnplay /etc/nginx/sites-enabled/pawsnplay
  sudo rm -f /etc/nginx/sites-enabled/default
else
  echo "$NGINX_SITE" | sudo tee /etc/nginx/conf.d/pawsnplay.conf >/dev/null
fi
sudo nginx -t
sudo systemctl enable nginx >/dev/null 2>&1 || true
sudo systemctl restart nginx

# ---------- 8. Check ----------
say "Checking the API"
OK=""
for _ in $(seq 1 15); do
  if curl -fs -m 3 http://127.0.0.1/api/v1/health >/tmp/pawsnplay-health 2>/dev/null; then OK=1; break; fi
  sleep 2
done
if [ -n "$OK" ]; then
  cat /tmp/pawsnplay-health; echo
  if grep -q '"connected"' /tmp/pawsnplay-health; then
    say "Done. API is live: http://${PUBLIC_IP}/api/v1/health"
  else
    say "API is up but MongoDB is NOT connected."
    echo "Add this server's IP (${PUBLIC_IP}) in MongoDB Atlas -> Network Access, then run: pm2 restart ${APP_NAME}"
  fi
else
  echo "The API did not answer. Last log lines:"
  pm2 logs "$APP_NAME" --lines 30 --nostream || true
  die "See the log above. Most often: MONGODB_URI is wrong, or Atlas Network Access does not include ${PUBLIC_IP}."
fi
cat <<EOF

In the app (.env):  EXPO_PUBLIC_API_URL=http://${PUBLIC_IP}/api/v1
Logs:               pm2 logs ${APP_NAME}
Update later:       run the same one-line command again.
EOF
