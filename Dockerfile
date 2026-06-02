# ============================================================
# Dockerfile cho btc-liquidity-proxy
# Node.js 20 Alpine - nhẹ, phù hợp t3.micro
# ============================================================

FROM node:20-alpine

WORKDIR /app

# Cài dependencies trước (tận dụng Docker cache)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source code
COPY src ./src
COPY public ./public

# Tạo thư mục data (dùng để lưu cache/log)
RUN mkdir -p data

# Port app lắng nghe (server.js dùng HTTP)
EXPOSE 3000

# Chạy web server
ENV HOST=0.0.0.0

CMD ["node", "src/server.js"]
