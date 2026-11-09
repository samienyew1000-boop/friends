# Official lightweight Node.js 20 Alpine Linux image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy dependency manifests and install production dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy application server and client public assets
COPY server/ ./server/
COPY public/ ./public/

# Expose default HTTP/WebSocket port
EXPOSE 3030

# Environment variables
ENV PORT=3030
ENV NODE_ENV=production

# Start JetX game server
CMD ["node", "server/index.js"]
