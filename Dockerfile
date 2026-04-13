# Base image
FROM node:22-alpine AS build

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Build the application
RUN npm run build

# Production image
FROM node:22-alpine

WORKDIR /usr/src/app

# Copy only the necessary files from the build stage
COPY --from=build /usr/src/app/package*.json ./
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/node_modules ./node_modules

# Expose the port the app runs on
EXPOSE 3001

# Start the application
CMD ["npm", "run", "start:prod"]
