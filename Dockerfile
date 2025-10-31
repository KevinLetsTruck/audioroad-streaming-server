# AudioRoad Streaming Server - Optimized for FFmpeg audio processing

FROM node:20-alpine

# Install FFmpeg (critical for audio processing!)
RUN apk add --no-cache ffmpeg

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose port
EXPOSE 8080

# Start server
CMD ["npm", "start"]

