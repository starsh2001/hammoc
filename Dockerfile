FROM node:20-bookworm

RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts/ scripts/
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

RUN npm install --include=dev

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY packages/client/ packages/client/

RUN npm run build

# Mark Claude Code's first-run wizard (theme selection) as already completed so
# the bundled CLI boots straight to the input prompt. Without this the fresh
# container shows the theme picker, which the in-app login flow can't drive
# (it expects the input prompt to inject /login). This mirrors a real user who
# has run claude at least once. Credentials are intentionally NOT seeded, so the
# onboarding/login flow stays testable.
RUN echo '{"hasCompletedOnboarding":true,"lastOnboardingVersion":"2.1.186"}' > /root/.claude.json

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV TERMINAL_ENABLED=false

EXPOSE 3000

CMD ["node", "packages/server/dist/index.js"]
