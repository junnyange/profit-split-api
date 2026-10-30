# syntax=docker/dockerfile:1
# 화면 빌드 → API 빌드 → 실행 이미지. amd64/arm64 둘 다 빌드한다.
# 빌드 단계(web, api)는 결과가 플랫폼과 무관한 JS라 빌드하는 PC의 플랫폼($BUILDPLATFORM)에서 돌려
# arm64 빌드 때 느린 에뮬레이션을 피한다. 실행 이미지와 프로덕션 의존성만 대상 플랫폼으로 설치한다.
ARG NODE_IMAGE=node:24-bookworm-slim

FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS api
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM ${NODE_IMAGE}
ENV NODE_ENV=production NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
# 파일은 root 소유(읽기 전용)로 두고, 실행은 node 이미지에 있는 일반 사용자(node)로 한다
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=api /app/dist ./dist
COPY --from=web /web/dist ./web/dist
USER node
EXPOSE 3000
# 시작 순서: (compose가 DB healthy까지 대기) → 마이그레이션 → 멤버 seed → 앱.
# 앞 단계가 실패하면 앱을 띄우지 않고 컨테이너가 종료된다 (restart 정책으로 다시 시도).
# 마지막은 exec로 node가 PID 1이 되어 docker stop 신호(SIGTERM)를 직접 받는다.
CMD ["sh", "-c", "npm run migration:run:prod && npm run seed:members:prod && exec node dist/main.js"]
