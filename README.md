<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## 실행 방법 (API 서버 + 화면)

API는 모두 `/api`로 시작한다 (예: `GET /api/weeks/2026-11-03`). 헬스체크는 `GET /api/health` → DB에 붙으면 `200 {"status":"ok","db":"up"}`, 안 되면 `503`.

```bash
# 1) DB (docker) - 처음 한 번 또는 꺼져 있을 때
$ docker compose up -d

# 2) API 서버 (루트, 포트 3000)
$ npm run start:dev

# 3) 화면 개발 서버 (web/, 포트 5173) - 다른 터미널에서
$ cd web
$ npm install        # 처음 한 번
$ npm run dev        # http://localhost:5173 , /api 요청은 localhost:3000으로 proxy
```

- API를 다른 포트로 띄웠다면: `API_TARGET=http://localhost:3001 npm run dev` (web/에서).
- 휴대폰에서 같은 Wi-Fi로 보려면: `npm run dev -- --host` 후 표시되는 Network 주소로 접속.
- 주소 뒤에 `#2026-11-03`을 붙이면 그 주차가 열린다. 붙이지 않으면 "이번 주" = 오늘(KST) 이후 첫 화요일.
- 화면 빌드: `cd web && npm run build` → `web/dist/`. (같은 서버에서 화면을 서비스하는 설정은 배포 단계에서 할 예정)

## 환경변수

`.env`에 DB 접속 정보(`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`) 외에 아래 값을 둔다. 실제 값은 문서나 커밋에 쓰지 않는다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `APP_ACCESS_CODE` | **필수** | 공용 접속 코드. 없으면 서버가 시작하지 않는다 (잠금 없이 배포되는 것을 막음). 바꾸면 기존 로그인 쿠키가 모두 무효가 된다. |
| `APP_COOKIE_SECRET` | **필수** | 로그인 쿠키 서명용 비밀값, 32자 이상. 없거나 짧으면 서버가 시작하지 않는다. 생성 예: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `LOCK_CONFIRMED_WEEKS` | `false` | `"true"`일 때만 확정된(잠긴) 주의 **원자재 생산 금액**(`PUT .../contributions/:memberId`)을 `409 WEEK_CONFIRMED`로 막는다. 판매 금액과 지출은 잠긴 뒤에도 수정 가능. 값이 없거나 다른 값이면 막지 않는다. 서버 시작 시 한 번 읽으므로 바꾸면 재시작해야 한다. |
| `NODE_ENV` | - | `production`이면 로그인 쿠키에 `Secure`를 붙인다 (HTTPS 전용). |

## 접속 코드 (로그인)

- `POST /api/auth/login` `{ "code": "..." }` → 맞으면 `204` + 서명된 httpOnly 쿠키 `ps_auth` (SameSite=Lax, 30일). 틀리면 `401 { code: "INVALID_CODE", remainingAttempts }`.
- 같은 IP에서 연속 5번 틀리면 15분 동안 `429 { code: "TOO_MANY_ATTEMPTS", retryAfterSeconds }` (맞는 코드여도 429).
- `POST /api/auth/logout` → 쿠키 삭제.
- `/api/health`, `/api/auth/*`를 뺀 모든 `/api` 요청은 쿠키가 없거나 틀리면 `401 { code: "UNAUTHORIZED" }`.
- 실패 기록은 서버 메모리에 있다. 서버 1대 기준이고 재시작하면 초기화된다.

## 확정(잠금) 규칙

- 잠김 여부 = `manualLock`(수동 설정)이 있으면 그 값, 없으면(`null`) **확정일(화요일) 00:00 KST가 지났는지**. 요청마다 계산하므로 그 시각에 서버가 꺼져 있어도 맞다.
- `POST /api/weeks/:confirmDate/confirm` `{ version }` → `manualLock = true` (version 검사, 이미 잠겼으면 그대로 200).
- `POST /api/weeks/:confirmDate/unconfirm` (body 없음) → `manualLock = false`. version 검사 없이 항상 성공, 이미 풀려 있으면 그대로 200. 자동으로 잠긴 주를 풀면 다시 잠기지 않는다.
- `GET /api/weeks/:confirmDate` 응답: `confirmed`(지금 잠겼는지), `manualLock`(null = 자동), `materialsLocked`(원자재 입력이 막혀 있는지 = `LOCK_CONFIRMED_WEEKS` && `confirmed`).

## DB 마이그레이션

`synchronize`는 꺼져 있다. 스키마는 `src/migrations/`의 마이그레이션 파일로만 바꾼다. 앱(`AppModule`)과 TypeORM CLI는 같은 설정(`src/data-source.ts`)을 쓰고, 앱이 시작할 때 마이그레이션을 자동 실행하지 않는다.

```bash
# 엔티티를 바꾼 뒤, 현재 DB와의 차이로 마이그레이션 파일 생성 (경로 마지막 부분이 이름)
$ npm run migration:generate -- src/migrations/AddMemoToExpense
#  → src/migrations/<timestamp>-AddMemoToExpense.ts

# 엔티티와 DB가 일치하는지만 확인 (파일을 만들지 않음, 차이가 있으면 exit 1)
$ npm run migration:generate -- src/migrations/Check --check

# 아직 실행 안 된 마이그레이션 실행 / 마지막 1개 되돌리기 / 실행 여부 목록
$ npm run migration:run
$ npm run migration:revert
$ npm run migration:show
```

- 접속 정보는 `.env`의 `DB_*`를 읽는다. 셸에서 이미 설정한 환경변수가 우선한다. 예: `DB_DATABASE=다른DB npm run migration:run`
- `migration:revert`는 `down()`을 실행한다. `InitialSchema`의 `down()`은 테이블을 전부 지우므로(멤버 데이터 포함), 실제 데이터가 있는 DB에서는 쓰지 않는다.
- 이미 테이블이 있는 DB에 마이그레이션을 "적용됨"으로만 기록하려면: `npm run migration:run -- --fake`

## 주차 날짜 (`confirmDate`)

주차는 그 주의 **확정일(화요일)** `YYYY-MM-DD`로 부른다 (`/api/weeks/:confirmDate/...`). 기존 시트 앱의 key 날짜와 같다. 예전 이름 `startDate`는 마이그레이션 `RenameStartDateAddCategory`에서 바뀌었다.

## 기존 시트 앱 데이터 옮기기

`data/`에 시트에서 내보낸 CSV를 둔다. 실제 데이터라서 `.gitignore`에 들어 있다 (커밋 금지).

- `data/sheet-data.csv`: `_data` 시트 (`key,json,updatedAt`)
- `data/sheet-summary.csv`: 정산기록 시트

```bash
# 매핑 결과와 건수만 출력 (DB에 쓰지 않음)
$ npm run import:sheet -- --dry-run

# 주차마다 트랜잭션으로 넣기. 다시 실행하면 그 주의 contributions/expenses를 교체 (중복 없음)
$ npm run import:sheet

# 서버를 띄운 뒤, 주차마다 GET /api/weeks/:confirmDate/settlement 결과와 정산기록 시트 비교
$ PORT=3001 npm run start:prod
$ npm run verify:sheet            # 다른 주소면 VERIFY_BASE_URL=http://localhost:3000 npm run verify:sheet (/api는 스크립트가 붙임)
```

- 원본에 이상한 값(음수, 숫자가 아닌 금액, 범위 밖 buyer, 모르는 cat 등)이 하나라도 있으면 아무것도 넣지 않고 멈춘 뒤, 어느 주의 어떤 값인지 출력한다.
- 매핑: `material[i]` → 멤버 id `i+1`, `buyer` 인덱스 → id `+1`(빈 값은 null), `memo` → `item`, `cat` → `category`, `paid` → `distributed`, `manualLock` → `manualLock` (원본 그대로, null = 자동 잠금).
- `verify:sheet`는 `.env`의 `APP_ACCESS_CODE`로 로그인한 뒤 호출하고, `sheet-data.csv`의 `manualLock`과 API의 `manualLock`도 비교한다.
- 비교 기준: 총 수익, 지출 ×105%, 분배할 금액은 API 값을 반올림해서 시트 표시값과 같은지 본다. 멤버별 %는 0.005 이내, 멤버별 금액은 1원 단위로 정확히 일치해야 한다. 불일치가 있으면 exit 1.

## 동시 수정 충돌 (낙관적 락)

`GET /api/weeks/:confirmDate` 응답의 `version`(주차)과 `contributions[].version`(멤버별 원자재)을 수정 요청 body에 그대로 보낸다. 행이 아직 없으면 `0`.

- `PUT /api/weeks/:confirmDate/sales` `{ salesBefore, salesAfter, version }`
- `PUT /api/weeks/:confirmDate/contributions/:memberId` `{ materialAmount, version }`
- `POST /api/weeks/:confirmDate/confirm` `{ version }` (확정 해제는 version 검사 없음)

그사이 다른 사람이 먼저 수정했으면 `409`와 함께 최신 주차 데이터를 `current`로 돌려준다.

```json
{ "statusCode": 409, "code": "VERSION_CONFLICT", "message": "다른 사람이 먼저 수정했습니다. 최신 값을 확인하세요", "current": { "...": "GET /api/weeks/:confirmDate 와 같은 형식" } }
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

To add it to this project, run this and approve the code it prints at [observe.nestjs.com/link](https://observe.nestjs.com/link) - signing up for free if you have no account:

```bash
$ npx @nestjs/observe link
```

It installs `@nestjs/observe`, wires it into `AppModule` and `main.ts`, and writes the app key and secret into `.env`, which every `nest start` script (`start`, `start:dev`, `start:debug`) then loads. In production, set `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment instead.

Or do it by hand:

```bash
$ npm install @nestjs/observe
```

Then follow the [setup guide](https://docs.nestjs.com/observability/sdk) - it takes a single import and an app key.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
