# Build stage for frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY vite.config.ts tsconfig.json ./
COPY src/renderer ./src/renderer
RUN npm run build:frontend

# Final stage for runtime
FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install native dependencies first
COPY package*.json ./
RUN npm ci --production

# Copy source files
COPY src/server ./src/server
COPY src/core ./src/core
COPY src/shared ./src/shared
COPY tsconfig.server.json ./

# Copy built frontend
COPY --from=frontend-builder /app/dist/web ./dist/web

# Create data directory
RUN mkdir -p /app/data

# Expose ports
EXPOSE 3000 8310

# Environment variables
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/auth/status', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["node", "-e", "import('./src/server/index.ts').catch(console.error)", "--import", "tsx/esm"]
