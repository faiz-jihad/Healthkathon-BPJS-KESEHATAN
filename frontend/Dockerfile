# Production Dockerfile for AURA-JKN Frontend Dashboard
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Nginx web server stage
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx configuration for SPA routing and API proxy
RUN echo 'server { \
    listen 5173; \
    listen 80; \
    server_name localhost; \
    client_max_body_size 50M; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
    location /api/ { \
        proxy_pass http://backend:3001/api/; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
        proxy_cache_bypass $http_upgrade; \
        proxy_read_timeout 300s; \
        proxy_connect_timeout 300s; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 5173 80

CMD ["nginx", "-g", "daemon off;"]
