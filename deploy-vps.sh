#!/usr/bin/env bash
# Deploy do PautaOnline na VPS.
# Uso: ADMIN_PASSWORD='senha' ./deploy-vps.sh
#   - ADMIN_PASSWORD é opcional: se informado, redefine a senha do admin (hash scrypt) no servidor.
#   - Nenhuma credencial é gravada no repositório. O JWT_SECRET é gerado no servidor na 1ª instalação.
set -e

VPS_HOST="${VPS_HOST:-ticamitp@177.153.60.71}"
VPS_PORT="${VPS_PORT:-22}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"

echo "🚀 Conectando na VPS ($VPS_HOST:$VPS_PORT) para implantar o PautaOnline..."

REMOTE_ENV="export ADMIN_PASSWORD=$(printf '%q' "${ADMIN_PASSWORD:-}");"

ssh -p "$VPS_PORT" -i "$SSH_KEY" "$VPS_HOST" "$REMOTE_ENV bash -s" << 'EOF'
set -e

APP_DIR=/var/www/pauta
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER":"$USER" "$APP_DIR"

if [ ! -d "$APP_DIR/.git" ]; then
  git clone https://github.com/Surflah/PautaOnline.git "$APP_DIR"
else
  cd "$APP_DIR"
  git fetch origin main
  git reset --hard origin/main
fi

cd "$APP_DIR"

if [ ! -f ".env" ]; then
  cat > .env << ENVEOF
DATABASE_URL="file:./pauta.db"
JWT_SECRET="$(openssl rand -hex 48)"
SAPL_BASE_URL="https://sapl.itapoa.sc.leg.br"
NEXT_PUBLIC_APP_URL="https://pauta.camaraitapoa.sc.gov.br"
ENVEOF
  chmod 600 .env
fi

mkdir -p public/uploads/pdfs public/uploads/audios

npm ci || npm install
npx prisma db push --skip-generate
npx prisma generate
npm run db:seed

if [ -n "$ADMIN_PASSWORD" ]; then
  npx tsx scripts/set-admin-password.ts
fi

npm run build

# Ajusta o caminho do npm no service conforme o Node instalado
NPM_BIN="$(command -v npm)"
sed -e "s#^User=.*#User=$USER#" -e "s#/usr/bin/npm#$NPM_BIN#" deploy/pauta.service | sudo tee /etc/systemd/system/pauta.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable pauta.service
sudo systemctl restart pauta.service

if [ ! -f /etc/nginx/sites-available/pauta ] || ! grep -q "ssl_certificate" /etc/nginx/sites-available/pauta; then
  sudo cp deploy/nginx-pauta.conf /etc/nginx/sites-available/pauta
  sudo ln -sf /etc/nginx/sites-available/pauta /etc/nginx/sites-enabled/pauta
  sudo nginx -t
  sudo systemctl reload nginx
  sudo certbot --nginx -d pauta.camaraitapoa.sc.gov.br --non-interactive --agree-tos \
    -m tecnologia@camaraitapoa.sc.gov.br --redirect || true
fi

sleep 3
curl -sS -o /dev/null -w "HTTP local: %{http_code}\n" http://127.0.0.1:3005/login || true
echo "✅ Deploy em https://pauta.camaraitapoa.sc.gov.br concluído!"
EOF
