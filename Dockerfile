FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
