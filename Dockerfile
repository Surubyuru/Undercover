# Build Frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Production Server
FROM node:18-alpine
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production
COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Serve production build
ENV PORT=6002
EXPOSE 6002

# Serving the static frontend from the backend (simple approach for production)
# We update server.js slightly to serve static files if needed, 
# or use a dedicated production server.
CMD ["node", "backend/server.js"]
