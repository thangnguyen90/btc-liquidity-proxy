#!/bin/bash
# Setup EC2 Ubuntu lần đầu cho btc-liquidity-proxy
# Chạy: bash <(curl -s https://raw.githubusercontent.com/thangnguyen90/btc-liquidity-proxy/main/scripts/setup-ec2.sh)

set -e

echo "🚀 Bắt đầu setup EC2..."

# ---- Cập nhật hệ thống ----
sudo apt update -y && sudo apt upgrade -y

# ---- Cài Docker ----
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update -y
sudo apt install -y docker-ce docker-ce-cli containerd.io

# Cho phép user ubuntu chạy docker không cần sudo
sudo usermod -aG docker ubuntu
sudo systemctl enable docker
sudo systemctl start docker

# ---- Cài AWS CLI ----
sudo apt install -y unzip
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip"
unzip /tmp/awscliv2.zip -d /tmp
sudo /tmp/aws/install
rm -rf /tmp/awscliv2.zip /tmp/aws

# ---- Tạo thư mục app và file .env mẫu ----
mkdir -p /home/ubuntu/btc-proxy

cat > /home/ubuntu/btc-proxy/.env << 'EOF'
# Port app lắng nghe
PORT=19082
HOST=0.0.0.0

# Binance API (nếu cần)
# BINANCE_API_KEY=
# BINANCE_API_SECRET=

# Discord webhook (nếu cần thông báo)
# DISCORD_WEBHOOK_URL=

# Các biến môi trường khác
EOF

echo ""
echo "✅ Setup hoàn tất!"
echo ""
echo "Việc cần làm tiếp theo:"
echo "  1. Đăng xuất và đăng nhập lại để docker group có hiệu lực:"
echo "     exit → ssh lại"
echo "  2. Điền các giá trị vào /home/ubuntu/btc-proxy/.env"
echo "  3. Push code lên GitHub → CI/CD tự deploy"
echo ""
echo "Kiểm tra Docker:"
echo "  docker --version"
echo "  aws --version"
