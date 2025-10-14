FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY . .

# Expose application port
EXPOSE 3001

# Start application with tracing
CMD ["node", "--require", "./tracing.js", "app.js"]

