FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN mkdir -p ./downloads ./storage
EXPOSE 3000
CMD ["node", "--loader", "ts-node/esm", "src/index.ts"]