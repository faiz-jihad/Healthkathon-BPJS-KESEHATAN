#!/usr/bin/env bash
# =================================================================
# AURA-JKN: Automatic Nginx / Apache Reverse Proxy Setup for Domain
# Domain: hackathon.mataceria.my.id -> http://127.0.0.1:5173
# =================================================================
set -e

DOMAIN="hackathon.mataceria.my.id"

echo "================================================================="
echo "🌐 Mengonfigurasi Web Server VPS untuk domain: $DOMAIN..."
echo "================================================================="

# 1. Buka firewall port 80 dan 443
if command -v ufw &>/dev/null; then
    sudo ufw allow 80/tcp 2>/dev/null || true
    sudo ufw allow 443/tcp 2>/dev/null || true
    sudo ufw allow 5173/tcp 2>/dev/null || true
fi

# 2. Cek apakah Nginx terpasang di host VPS
if command -v nginx &>/dev/null; then
    echo "⚙️ Terdeteksi NGINX pada host VPS. Membuat konfigurasi reverse proxy..."
    sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null << 'EOF'
server {
    listen 80;
    server_name hackathon.mataceria.my.id;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }
}
EOF
    sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl reload nginx || sudo systemctl restart nginx
    echo "✅ Nginx host berhasil dikonfigurasi & di-reload!"

# 3. Cek apakah Apache terpasang di host VPS
elif command -v apache2 &>/dev/null; then
    echo "⚙️ Terdeteksi APACHE2 pada host VPS. Membuat konfigurasi reverse proxy..."
    sudo a2enmod proxy proxy_http proxy_wstunnel headers 2>/dev/null || true
    sudo tee /etc/apache2/sites-available/$DOMAIN.conf > /dev/null << 'EOF'
<VirtualHost *:80>
    ServerName hackathon.mataceria.my.id
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:5173/
    ProxyPassReverse / http://127.0.0.1:5173/
    RequestHeader set X-Forwarded-Proto "https"
</VirtualHost>
EOF
    sudo a2ensite $DOMAIN.conf
    sudo systemctl reload apache2 || sudo systemctl restart apache2
    echo "✅ Apache2 host berhasil dikonfigurasi & di-reload!"
fi

echo ""
echo "================================================================="
echo "🎉 Konfigurasi reverse proxy VPS untuk $DOMAIN selesai!"
echo "⚠️  Pastikan di Cloudflare: Menu SSL/TLS diatur ke 'Flexible'."
echo "🌐 Silakan buka: https://$DOMAIN"
echo "================================================================="
