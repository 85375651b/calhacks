FROM apify/actor-node-playwright-chrome:24-1.61.1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY --chown=myuser:myuser package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --chown=myuser:myuser . ./
RUN npm run build
CMD ["npm", "start"]
