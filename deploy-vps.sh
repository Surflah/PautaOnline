#!/usr/bin/env bash
set -e

VPS_HOST="ticamitp@177.153.60.71"
SSH_KEY="$HOME/.ssh/id_ed25519"
APP_DIR="/var/www/pauta"
DOMAIN="pauta.camaraitapoa.sc.gov.br"

echo "🚀 Conectando na VPS ($VPS_HOST) para implantar o PautaOnline..."

ssh -i "$SSH_KEY" "$VPS_HOST" "bash -s" << 'EOF'
set -e

sudo mkdir -p /var/www/pauta
sudo chown -R ticamitp:ticamitp /var/www/pauta

if [ ! -d "/var/www/pauta/.git" ]; then
  git clone https://github.com/Surflah/PautaOnline.git /var/www/pauta
else
  cd /var/www/pauta
  git pull origin main
fi

cd /var/www/pauta

if [ ! -f ".env" ]; then
  cat > .env << 'ENVEOF'
DATABASE_URL="file:./pauta.db"
JWT_SECRET="camara-itapoa-pauta-online-producao-2026-controle-interno"
SAPL_BASE_URL="https://sapl.itapoa.sc.leg.br"
NEXT_PUBLIC_APP_URL="https://pauta.camaraitapoa.sc.gov.br"
ENVEOF
fi

mkdir -p public/uploads/pdfs public/uploads/audios

npm install
npx prisma db push
npm run db:seed
npm run build

sudo cp deploy/pauta.service /etc/systemd/system/pauta.service
sudo systemctl daemon-reload
sudo systemctl enable pauta.service
sudo systemctl restart pauta.service

sudo cp deploy/nginx-pauta.conf /etc/nginx/sites-available/pauta
sudo ln -sf /etc/nginx/sites-available/pauta /etc/nginx/sites-enabled/pauta
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx -d pauta.camaraitapoa.sc.gov.br --non-interactive --agree-tos -m tecnologia@camaraitapoa.sc.gov.br --redirect || true

echo "✅ Deploy em https://pauta.camaraitapoa.sc.gov.br concluído com sucesso!"
EOF
