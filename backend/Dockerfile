# EcoStream backend
FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY prisma ./prisma
RUN npm install --omit=dev
COPY . .

RUN mkdir -p database uploads logs
ENV PORT=4000
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/api/health', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]