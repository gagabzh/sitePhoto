FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY src ./src
COPY migrations ./migrations
RUN mkdir -p uploads
EXPOSE 3000
CMD ["node", "src/server.js"]
