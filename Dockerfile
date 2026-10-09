FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund || true
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
