ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}
WORKDIR /app
COPY package.json package-lock.json tsconfig.json next-env.d.ts ./
COPY src ./src
RUN npm ci --omit=dev --ignore-scripts && npm install --no-save --ignore-scripts tsx@4.20.5
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["npx", "tsx", "--tsconfig", "tsconfig.json", "src/intranetApi.ts"]
