# 自架用（Oracle Cloud / 內網 Docker）。Render 走原生 Node 環境，見 render.yaml
FROM node:22-alpine
WORKDIR /app

# 先複製 lock 與各 workspace 的 package.json，讓依賴層可以被快取
COPY package*.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY . .
# 打包前端後移除 devDependencies（npm run start 內部會設 NODE_ENV=production）
RUN npm run build && npm prune --omit=dev

ENV PORT=2567
EXPOSE 2567
CMD ["npm", "run", "start"]
