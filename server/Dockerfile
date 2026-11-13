FROM node:24-alpine
WORKDIR /app
COPY server/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts
COPY server/index.cjs ./index.cjs
RUN mkdir -p /data && chown node:node /data
USER node
ENV PORT=8787 DATA_FILE=/data/rooms.json
EXPOSE 8787
VOLUME ["/data"]
CMD ["node", "index.cjs"]
