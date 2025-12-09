# Build frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

# Create non-root user for npm
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

COPY --chown=nodejs:nodejs frontend/package*.json ./
RUN npm ci

COPY --chown=nodejs:nodejs frontend/ ./
RUN npm run build

# Production image
FROM python:3.13-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend
COPY backend/ ./backend/

# Copy built frontend from builder stage
COPY --from=frontend-builder /app/static ./static

# Create data directory for persistent storage
RUN mkdir -p /app/data /app/logs

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV DATA_DIR=/app/data

EXPOSE 8000

# Run the application
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
