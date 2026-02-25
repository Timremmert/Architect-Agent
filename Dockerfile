FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.30.1

# Copy the whole project (will respect .dockerignore)
COPY . .

# Install dependencies for all workspaces
RUN pnpm install

# Build the frontend application
RUN pnpm --filter client run build

# Expose standard Cloud Run port (Cloud Run sets PORT automatically)
EXPOSE 8080

# Default command to start the backend server
WORKDIR /app/server
CMD ["npm", "start"]
