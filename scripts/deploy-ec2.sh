#!/usr/bin/env bash
# PawsNPlay - one-command setup / update for a single EC2 instance (Ubuntu or Amazon Linux 2023).
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/kushdevui/PawsNPlayServer/main/scripts/deploy-ec2.sh)
#
# One instance serves everything through Nginx:
#   /api/v1/*, /uploads/*  -> Node API on 127.0.0.1:4000 (PM2)
#   /faqs/                 -> static FAQ page (web/faqs in this repo); GET / redirects there
#   everything else        -> Expo web build of the app (SPA: /login, /admin/..., /staff, /user)
#
# First run: installs Node 22, git, Nginx, PM2 (+ swap on small instances), clones the API to
# ~/PawsNPlayServer, asks for MONGODB_URI and the domain once, writes .env with fresh JWT secrets,
# builds the API and the web app, configures Nginx and - when the domain points here - HTTPS (certbot).
# Later runs: pull the latest code, rebuild and restart. .env is never overwritten (only PUBLIC_BASE_URL
# moves from http://<ip> to https://<domain> once HTTPS works). Safe to re-run any time.
#
# Optional env vars (skip the questions):
#   MONGODB_URI=...      first run only
#   DOMAIN=example.com   or DOMAIN= (empty) for IP-only mode; remembered in ~/.pawsnplay-deploy
#   CERT_EMAIL=me@x.com  Let's Encrypt expiry notices (optional; remembered)
#   APP_BRANCH=...       app branch to build (default feat/admin-boarding)
set -euo pipefail

REPO_URL="https://github.com/kushdevui/PawsNPlayServer.git"
APP_DIR="$HOME/PawsNPlayServer"
APP_NAME="pawsnplay-api"
WEB_REPO_URL="https://github.com/kushdevui/PawsNPlayRender.git"
WEB_DIR="$HOME/PawsNPlayRender"
WEB_BRANCH="${APP_BRANCH:-feat/admin-boarding}"
WWW_ROOT="/var/www/pawsnplay"
STATE_FILE="$HOME/.pawsnplay-deploy" # non-secret: DOMAIN, CERT_EMAIL
DEFAULT_DOMAIN="pawsnplaywithme.com"

say() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33mWARNING: %s\033[0m\n' "$*" >&2; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
have_tty() { [ -r /dev/tty ] && [ -w /dev/tty ] && (exec </dev/tty) 2>/dev/null; }
state_get() { [ -f "$STATE_FILE" ] && grep -E "^$1=" "$STATE_FILE" | tail -n1 | cut -d= -f2- || true; }

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
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y curl git nginx build-essential openssl rsync
  if [ "${NODE_MAJOR:-0}" != "22" ]; then
    say "Installing Node.js 22"
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
else
  say "Installing system packages (dnf)"
  sudo dnf install -y git nginx gcc-c++ make openssl tar rsync
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

# ---------- 2. Swap (expo export needs memory on small instances) ----------
MEM_KB=$(awk '/^MemTotal:/ {m=$2} /^SwapTotal:/ {s=$2} END {print m+s}' /proc/meminfo)
if [ "${MEM_KB:-0}" -lt $((3 * 1024 * 1024)) ] && [ ! -f /swapfile ]; then
  say "Adding a 2 GB swapfile (RAM + swap is below 3 GB)"
  sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
fi
if [ -f /swapfile ]; then
  swapon --show=NAME --noheadings 2>/dev/null | grep -qx /swapfile || sudo swapon /swapfile || warn "Could not enable /swapfile."
  grep -qE '^/swapfile[[:space:]]' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# ---------- 3. Code ----------
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

# ---------- 4. Public address and domain ----------
TOKEN=$(curl -s -m 2 -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)
PUBLIC_IP=$(curl -s -m 2 -H "X-aws-ec2-metadata-token: ${TOKEN}" \
  "http://169.254.169.254/latest/meta-data/public-ipv4" || true)
[[ "$PUBLIC_IP" =~ ^[0-9.]+$ ]] || PUBLIC_IP=$(curl -s -m 5 https://checkip.amazonaws.com | tr -d '[:space:]' || true)
[[ "$PUBLIC_IP" =~ ^[0-9.]+$ ]] || PUBLIC_IP="<your-server-ip>"

# DOMAIN: env var (even empty = IP-only) > ~/.pawsnplay-deploy > ask once.
if [ -n "${DOMAIN+x}" ]; then
  :
elif [ -f "$STATE_FILE" ] && grep -q '^DOMAIN=' "$STATE_FILE"; then
  DOMAIN=$(state_get DOMAIN)
elif have_tty; then
  printf 'Domain for this server [%s] (type "none" for IP-only): ' "$DEFAULT_DOMAIN" > /dev/tty
  IFS= read -r DOMAIN < /dev/tty || DOMAIN=""
  DOMAIN="${DOMAIN:-$DEFAULT_DOMAIN}"
  if [ -z "${CERT_EMAIL+x}" ]; then
    printf "Email for Let's Encrypt expiry notices (optional, Enter to skip): " > /dev/tty
    IFS= read -r CERT_EMAIL < /dev/tty || CERT_EMAIL=""
  fi
else
  DOMAIN="$DEFAULT_DOMAIN"
fi
DOMAIN=$(printf '%s' "$DOMAIN" | tr '[:upper:]' '[:lower:]' | sed -E 's#^https?://##; s#/.*$##; s/^www\.//')
[ "$DOMAIN" = "none" ] && DOMAIN=""
if [ -n "$DOMAIN" ] && ! [[ "$DOMAIN" =~ ^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$ ]]; then
  die "\"$DOMAIN\" does not look like a domain. Re-run with DOMAIN=example.com (or DOMAIN= for IP-only)."
fi
CERT_EMAIL="${CERT_EMAIL-$(state_get CERT_EMAIL)}"
printf 'DOMAIN=%s\nCERT_EMAIL=%s\n' "$DOMAIN" "$CERT_EMAIL" > "$STATE_FILE"
if [ -n "$DOMAIN" ]; then say "Domain: $DOMAIN (saved in $STATE_FILE)"; else say "IP-only mode (no domain)"; fi

# ---------- 5. .env (created once, never overwritten) ----------
if [ ! -f .env ]; then
  say "Creating .env"
  URI="${MONGODB_URI:-}"
  while [[ ! "$URI" =~ ^mongodb(\+srv)?:// ]]; do
    printf 'Paste your MONGODB_URI (the same value as in your Mac .env; input is hidden): ' > /dev/tty
    IFS= read -rs URI < /dev/tty
    printf '\n' > /dev/tty
    [[ "$URI" =~ ^mongodb(\+srv)?:// ]] || printf 'It must start with mongodb:// or mongodb+srv:// - try again.\n' > /dev/tty
  done
  (
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
  )
  unset URI
else
  say "Keeping existing .env"
fi

# ---------- 6. Build the API ----------
say "Installing dependencies and building the API"
npm install --no-audit --no-fund
npm run build

# ---------- 7. Run with PM2 ----------
say "Starting the API with PM2"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null

# ---------- 8. Static pages (web/<page>/) + robots.txt ----------
say "Publishing static pages (web/*)"
sudo mkdir -p "$WWW_ROOT/app" "$WWW_ROOT/faqs"
# Every web/<page>/index.html becomes /<page>/ (faqs, know-your-dog, ...). Names used by the app or the API
# are skipped so they can never shadow app routes.
STATIC_PAGES=()
for dir in web/*/; do
  page=$(basename "$dir")
  [ -f "$dir/index.html" ] || continue
  if ! [[ "$page" =~ ^[a-z0-9][a-z0-9-]*$ ]] || [[ " api uploads admin login staff user assets _expo app " == *" $page "* ]]; then
    warn "Skipping web/$page (name is reserved or invalid)."
    continue
  fi
  sudo mkdir -p "$WWW_ROOT/$page"
  sudo rsync -a --delete --chmod=D755,F644 "$dir" "$WWW_ROOT/$page/"
  sudo chmod 755 "$WWW_ROOT/$page"
  STATIC_PAGES+=("$page")
done
if [[ " ${STATIC_PAGES[*]} " != *" faqs "* ]]; then
  warn "web/faqs/index.html is missing in the repo - /faqs will show a placeholder."
  echo '<!doctype html><title>FAQs</title><p>FAQs are coming soon.</p>' | sudo tee "$WWW_ROOT/faqs/index.html" >/dev/null
  STATIC_PAGES+=(faqs)
fi
if [ -f web/robots.txt ]; then
  sudo install -m 644 web/robots.txt "$WWW_ROOT/robots.txt"
else
  printf 'User-agent: *\nAllow: /\n' | sudo tee "$WWW_ROOT/robots.txt" >/dev/null
fi
# Until the first web build succeeds, keep a placeholder so the SPA fallback has an index.html.
if [ ! -f "$WWW_ROOT/app/index.html" ]; then
  echo '<!doctype html><title>Paws N Play</title><p>The app is being deployed. Please check back soon.</p>' \
    | sudo tee "$WWW_ROOT/app/index.html" >/dev/null
fi
sudo chmod 755 /var/www "$WWW_ROOT" "$WWW_ROOT/app" "$WWW_ROOT/faqs"

# ---------- 9. Nginx ----------
if [ -d /etc/nginx/sites-available ]; then
  NGINX_CONF=/etc/nginx/sites-available/pawsnplay
else
  NGINX_CONF=/etc/nginx/conf.d/pawsnplay.conf
fi

# Locations shared by every server block (quoted heredoc: $vars are Nginx variables).
nginx_locations() {
  cat <<'EOF'
    client_max_body_size 12m;
    server_tokens off;
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml text/plain;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /uploads/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = / { return 302 /faqs/; }
    location = /robots.txt { alias /var/www/pawsnplay/robots.txt; }

    # Expo web build (SPA). Hashed bundles are immutable; index.html must always be revalidated.
    root /var/www/pawsnplay/app;
    location ^~ /_expo/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    location ^~ /assets/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    location = /index.html { add_header Cache-Control "no-cache"; }
    location / { try_files $uri $uri/ /index.html; }
EOF
  # Static pages from web/<page>/ (published to /var/www/pawsnplay/<page>/).
  local page
  for page in "${STATIC_PAGES[@]}"; do
    printf '    location = /%s { return 301 /%s/; }\n' "$page" "$page"
    printf '    location ^~ /%s/ {\n        root /var/www/pawsnplay;\n        index index.html;\n' "$page"
    printf '        try_files $uri $uri/ =404;\n        add_header Cache-Control "no-cache";\n    }\n'
  done
}

CERT_DIR=""
IP_NAME="$PUBLIC_IP"
[[ "$IP_NAME" =~ ^[0-9.]+$ ]] || IP_NAME="localhost-ip-unknown"
[ -n "$DOMAIN" ] && CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
cert_ready() { [ -n "$CERT_DIR" ] && sudo test -s "$CERT_DIR/fullchain.pem" && sudo test -s "$CERT_DIR/privkey.pem"; }
cert_has() { sudo openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -text 2>/dev/null | grep -q "DNS:$1\b"; }

# Writes the whole site. HTTPS blocks only when a certificate exists, so re-runs never depend on
# certbot having edited this file.
write_nginx() {
  local names="" ssl_names=""
  {
    # IP / fallback block first (default for port 80 on Ubuntu; also used for the local health check).
    printf 'server {\n    listen 80;\n    server_name %s localhost 127.0.0.1 _;\n' "$IP_NAME"
    nginx_locations
    printf '}\n\n'

    if [ -n "$DOMAIN" ]; then
      names="$DOMAIN www.$DOMAIN"
      if cert_ready; then
        ssl_names="$DOMAIN"
        cert_has "www.$DOMAIN" && ssl_names="$DOMAIN www.$DOMAIN"
        printf 'server {\n    listen 80;\n    server_name %s;\n    location / { return 301 https://$host$request_uri; }\n}\n\n' "$names"
        printf 'server {\n    listen 443 ssl http2;\n    server_name %s;\n' "$ssl_names"
        printf '    ssl_certificate %s/fullchain.pem;\n    ssl_certificate_key %s/privkey.pem;\n' "$CERT_DIR" "$CERT_DIR"
        if sudo test -f /etc/letsencrypt/options-ssl-nginx.conf; then
          printf '    include /etc/letsencrypt/options-ssl-nginx.conf;\n'
        else
          printf '    ssl_protocols TLSv1.2 TLSv1.3;\n'
        fi
        sudo test -f /etc/letsencrypt/ssl-dhparams.pem && printf '    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;\n'
        nginx_locations
        printf '}\n'
      else
        printf 'server {\n    listen 80;\n    server_name %s;\n' "$names"
        nginx_locations
        printf '}\n'
      fi
    fi
  } | sudo tee "$NGINX_CONF" >/dev/null
  if [ -d /etc/nginx/sites-available ]; then
    sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/pawsnplay
    sudo rm -f /etc/nginx/sites-enabled/default
  fi
  sudo nginx -t
  sudo systemctl enable nginx >/dev/null 2>&1 || true
  if systemctl is-active --quiet nginx; then sudo systemctl reload nginx; else sudo systemctl restart nginx; fi
}

say "Configuring Nginx"
write_nginx

# ---------- 10. HTTPS (Let's Encrypt) ----------
resolves_here() { getent ahostsv4 "$1" 2>/dev/null | awk '{print $1}' | sort -u | grep -qx "$PUBLIC_IP"; }

HTTPS=""
if [ -n "$DOMAIN" ]; then
  if resolves_here "$DOMAIN"; then
    say "$DOMAIN points to this server - setting up HTTPS"
    if ! command -v certbot >/dev/null; then
      if [ "$PKG" = apt ]; then
        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx || true
      else
        sudo dnf install -y certbot python3-certbot-nginx || true
      fi
    fi
    if command -v certbot >/dev/null; then
      sudo systemctl enable --now certbot.timer >/dev/null 2>&1 \
        || sudo systemctl enable --now certbot-renew.timer >/dev/null 2>&1 || true
      CERT_ARGS=(-d "$DOMAIN")
      if resolves_here "www.$DOMAIN"; then
        CERT_ARGS+=(-d "www.$DOMAIN")
      else
        warn "www.$DOMAIN does not point to $PUBLIC_IP yet - the certificate covers $DOMAIN only."
      fi
      if [ -n "$CERT_EMAIL" ]; then EMAIL_ARGS=(-m "$CERT_EMAIL"); else EMAIL_ARGS=(--register-unsafely-without-email); fi
      # certonly + our own server blocks (written below) keeps re-runs predictable; renewals reload Nginx.
      if sudo certbot certonly --nginx -n --agree-tos "${EMAIL_ARGS[@]}" --cert-name "$DOMAIN" \
        --keep-until-expiring --expand --deploy-hook "systemctl reload nginx" "${CERT_ARGS[@]}"; then
        :
      else
        warn "certbot failed (see above). Continuing over HTTP."
      fi
    else
      warn "Could not install certbot. Continuing over HTTP."
    fi
    if cert_ready; then
      write_nginx
      HTTPS=1
    fi
  else
    warn "$DOMAIN does not point to this server yet. Continuing over HTTP."
    cat <<EOF
Create these DNS records at your domain registrar, then run this script again:
  Type A   Name @     Value ${PUBLIC_IP}
  Type A   Name www   Value ${PUBLIC_IP}
EOF
  fi
fi

# PUBLIC_BASE_URL (absolute upload URLs): switch http://<ip> to https://<domain> once HTTPS works.
if [ -n "$HTTPS" ]; then
  if grep -qE '^PUBLIC_BASE_URL=http://[0-9.]+/?$' .env; then
    sed -i -E "s#^PUBLIC_BASE_URL=http://[0-9.]+/?\$#PUBLIC_BASE_URL=https://${DOMAIN}#" .env
    say "PUBLIC_BASE_URL is now https://${DOMAIN}"
    pm2 reload "$APP_NAME" --update-env >/dev/null
  elif ! grep -q '^PUBLIC_BASE_URL=' .env; then
    printf 'PUBLIC_BASE_URL=https://%s\n' "$DOMAIN" >> .env
    pm2 reload "$APP_NAME" --update-env >/dev/null
  fi
fi

if [ -n "$HTTPS" ]; then
  SITE_URL="https://$DOMAIN"
elif [ -n "$DOMAIN" ] && resolves_here "$DOMAIN"; then
  SITE_URL="http://$DOMAIN"
else
  SITE_URL="http://$PUBLIC_IP"
fi
API_URL="$SITE_URL/api/v1"

# ---------- 11. Web app (Expo web export) ----------
build_web() {
  if [ -d "$WEB_DIR/.git" ]; then
    git -C "$WEB_DIR" fetch origin "$WEB_BRANCH" &&
      git -C "$WEB_DIR" checkout -q -f -B "$WEB_BRANCH" "origin/$WEB_BRANCH" &&
      git -C "$WEB_DIR" reset -q --hard "origin/$WEB_BRANCH" || return 1
  else
    git clone --branch "$WEB_BRANCH" "$WEB_REPO_URL" "$WEB_DIR" || return 1
  fi
  (
    cd "$WEB_DIR"
    npm install --no-audit --no-fund || npm install --no-audit --no-fund --legacy-peer-deps || exit 1
    rm -rf dist-web
    # Build-time settings come from the environment only; the app's .env is never written.
    CI=1 NODE_OPTIONS="--max-old-space-size=2048" EXPO_PUBLIC_API_URL="$API_URL" EXPO_PUBLIC_USE_MOCKS=false \
      npx expo export -p web --output-dir dist-web || exit 1
    [ -f dist-web/index.html ] || exit 1
  ) || return 1
  sudo rsync -a --delete --chmod=D755,F644 "$WEB_DIR/dist-web/" "$WWW_ROOT/app/"
}

say "Building the web app ($WEB_BRANCH) with EXPO_PUBLIC_API_URL=$API_URL"
WEB_OK=""
if build_web; then
  WEB_OK=1
else
  warn "The web app build failed - the API and FAQ page are deployed, the app pages show a placeholder. Fix the build and re-run this script."
fi

# ---------- 12. Check ----------
say "Checking the API"
OK=""
CODE=""
for _ in $(seq 1 15); do
  CODE=$(curl -s -m 3 -o /tmp/pawsnplay-health -w '%{http_code}' -H "Host: ${PUBLIC_IP}" \
    http://127.0.0.1/api/v1/health 2>/dev/null || true)
  if [ "$CODE" = 200 ] || [ "$CODE" = 503 ]; then OK=1; break; fi
  sleep 2
done
if [ -n "$OK" ]; then
  cat /tmp/pawsnplay-health; echo
  if grep -q '"connected"' /tmp/pawsnplay-health; then
    say "Done. API is live: ${API_URL}/health"
  else
    say "API is up but MongoDB is NOT connected."
    echo "Add this server's IP (${PUBLIC_IP}) in MongoDB Atlas -> Network Access, then run: pm2 restart ${APP_NAME}"
  fi
else
  echo "The API did not answer (HTTP ${CODE:-none}). Last log lines:"
  pm2 logs "$APP_NAME" --lines 30 --nostream || true
  die "See the log above. Most often: MONGODB_URI is wrong, or Atlas Network Access does not include ${PUBLIC_IP}."
fi

ADMIN_NOTE=""
[ -n "$WEB_OK" ] || ADMIN_NOTE=" (web build failed - placeholder page)"
cat <<EOF

FAQ page:          ${SITE_URL}/faqs
Admin (web app):   ${SITE_URL}/admin${ADMIN_NOTE}
API health:        ${API_URL}/health
Phone app (.env):  EXPO_PUBLIC_API_URL=${API_URL}
Logs:              pm2 logs ${APP_NAME}
Update later:      run the same one-line command again.
EOF
