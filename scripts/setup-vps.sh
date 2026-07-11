#!/bin/bash
# Complete VPS setup for PolyBot server (Ubuntu 22.04+)
set -e

echo "=== PolyBot Server Setup ==="

echo "Step 1: System hardening..."
sudo apt update && sudo apt -y upgrade
sudo apt -y install ufw fail2ban python3-venv git caddy

echo "Step 2: Creating bot user..."
sudo adduser --disabled-password --gecos "" bot 2>/dev/null || true
sudo usermod -aG sudo bot

echo "Step 3: Cloning repository..."
cd /home/bot
sudo -u bot git clone -b server-phase3 https://github.com/morashidian8/Tictactoestevie.git polybot-app
cd polybot-app

echo "Step 4: Installing Python dependencies..."
sudo -u bot python3 -m venv .venv
sudo -u bot .venv/bin/pip install -r polybot/requirements.txt

echo "Step 5: Configuring environment..."
sudo -u bot cp .env.example .env
echo "⚠️ Edit .env and set POLYBOT_TOKEN"

echo "Step 6: Installing systemd service..."
sudo cp polybot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable polybot

echo "Step 7: Configuring firewall..."
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "✅ Setup complete!"
echo "Next: Edit .env, configure Caddyfile, run: sudo systemctl start polybot"
