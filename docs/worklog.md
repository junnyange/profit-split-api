# 작업 기록

### 2026-10-30 - REST API 구현 (members, weeks, expenses, settlement)

**만든/수정한 파일과 각 역할**
- `src/main.ts` (수정): 전역 `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })` 등록.
- `src/app.module.ts` (수정): `MembersModule`, `WeeksModule` import.
- `src/common/parse-date.pipe.ts`: `:startDate` 경로 파라미터 검사. `YYYY-MM-DD` 형식이 아니거나 실제로 없는 날짜(예: 2099-02-30)면 400.
- `src/members/members.module.ts`: Member 리포지토리 등록, `MembersService`를 export해서 WeeksModule에서 재사용.
- `src/members/members.controller.ts`: `GET /members`.
- `src/members/members.service.ts`: `findAll()`(id 순), `assertExists(id)`(없으면 404).
- `src/weeks/weeks.module.ts`: Week/Contribution/Expense 리포지토리, `WeeksService`, `SettlementService`를 provider로 등록. MembersModule import.
- `src/weeks/weeks.controller.ts`: 주차 관련 API 6개(`GET /weeks/:startDate`, `PUT .../sales`, `PUT .../contributions/:memberId`, `POST .../expenses`, `DELETE /expenses/:id`, `GET .../settlement`).
- `src/weeks/weeks.service.ts`: 조회, get-or-create, 원자재 upsert, 지출 추가/삭제, 정산 계산 호출.
- `src/weeks/dto/update-sales.dto.ts`, `update-contribution.dto.ts`, `create-expense.dto.ts`: class-validator 입력 검증.
- `src/weeks/weeks.service.spec.ts`: `getSettlement` 단위 테스트 2개 (리포지토리, MembersService mock).

**내린 설계 결정과 이유**
- `DELETE /expenses/:id`는 별도 ExpensesModule을 만들지 않고 `WeeksController`에 넣음. 규칙 8("WeeksModule이 나머지 전부")을 따르고, 컨트롤러는 `@Controller()`에 경로를 전부 적음.
- 날짜 검증은 DTO가 아니라 경로 파라미터라서 커스텀 파이프(`ParseDatePipe`)로 처리. 정규식만으로는 2099-02-30을 못 막아서 `Date`로 한 번 더 확인.
- GET은 `findOne`만 하고, 주차가 없으면 금액 0, 빈 목록, `confirmed: false`로 응답. DB에 아무것도 만들지 않음.
- get-or-create: `findOneBy` 후 없으면 `save`. 동시 요청으로 `ER_DUP_ENTRY`(MySQL unique 위반)가 나면 다시 조회해서 먼저 만들어진 주를 씀.
- 원자재 입력도 `(weekId, memberId)` unique라서 같은 방식으로 처리: 새로 insert하다 중복이면 한 번 더 시도(이번엔 기존 행을 찾아 수정). `upsert()`를 쓰지 않은 이유는 `@VersionColumn` 증가가 확실한 `save()` 경로를 쓰려고.
- 주 조회의 contributions는 `members` 테이블 기준으로 5명 전원을 id 순으로 만들고, 입력 없는 멤버는 0.
- 정산은 `getWeek()` 결과를 그대로 `SettlementService.calculate()`에 넣음. 이렇게 하면 materials 순서가 항상 멤버 id 순으로 맞음. percent만 `Math.round(p * 100) / 100`으로 소수 둘째 자리 반올림. 계산식은 건드리지 않음.
- 정산 응답에는 요청한 gross, fee, expenseAdjusted, distributable, remainder 외에 calculate()가 주는 net, expenseRaw도 함께 들어감(`...totals`로 펼쳤기 때문).
- PUT 응답은 갱신된 주 조회 결과(`getWeek`)를 돌려줌. POST 지출은 만든 지출(`id, item, amount, buyerId`)을 201로 돌려줌.
- `memberId`, `id` 경로 파라미터는 `ParseIntPipe`로 숫자가 아니면 400.

**중간에 난 에러와 해결 방법**
- 파일 생성 셸 스크립트(heredoc)가 파싱 에러로 실행되지 않음. 파일을 하나씩 직접 생성해서 해결.
- `node dist/src/main.js` 실행 시 `MODULE_NOT_FOUND`. 빌드 결과 경로가 `dist/main.js`였음. 경로 수정.
- 포트 3000에는 이미 사용자가 띄운 서버(`node --enable-source-maps dist/main`, watch 모드로 보임)가 떠 있었음. 이 서버는 새 코드를 반영해 400 검증은 동작했지만 DB를 쓰는 요청은 전부 500을 반환함. 그 콘솔 로그를 볼 수 없어서 원인은 확인하지 못함. 같은 빌드를 `PORT=3001`로 따로 띄웠을 때는 모두 정상 동작함.

**확인한 방법과 결과**
- `npm run build`: 에러 없음.
- `npm test`: 3 suites, 8 tests 모두 통과 (기존 테스트 + 새 `weeks.service.spec.ts` 2개).
- 포트 3001에서 curl로 호출, 2099-01-05 주차만 사용 (정산 GET 한 번은 2099-01-12로 호출했지만 GET이라 DB에는 아무것도 생기지 않음):
  - `GET /members` → 200, 5명 id 순.
  - `GET /weeks/2099-01-05` (주차 없음) → 200, 금액 0, contributions 5명 전원 0, expenses 빈 목록.
  - `GET /weeks/2099-1-5`, `/weeks/2099-02-30` → 400.
  - `PUT .../sales` 정상 → 200. `{"salesBefore":-1,"salesAfter":1.5,"x":1}` → 400 (음수, 정수 아님, 허용 안 된 필드).
  - `PUT .../contributions/1`, `/2` → 200, 같은 멤버를 다시 입력하면 값이 수정됨. `/99` → 404, `/abc` → 400.
  - `POST .../expenses` buyerId 있음/없음 → 201. buyerId 99 → 404. item 빈 문자열, amount 0, item 101자 → 400.
  - `GET .../settlement` → 200, 멤버별 percent/share와 합계 값이 나옴 (예: 원자재 2298/2000/0/0/0, 판매 1,000,000→3,000,000, 지출 100,005 → distributable 1,794,994.75, remainder 3).
  - `DELETE /expenses/2` → 204, 다시 호출 → 404.
  - 동시성: 2099-01-05 주차 행을 지운 뒤 `PUT .../contributions/1` 6개를 동시에 보냄 → 모두 200, weeks 행 1개, contributions 행 1개.
- 테스트가 끝난 뒤 2099-01-05 주차 행을 삭제함(cascade로 contributions, expenses도 삭제). 2099년 주차는 남아 있지 않음.

**아직 남은 일 / 확인이 필요한 점**
- 포트 3000에 떠 있는 기존 서버의 500 에러 원인 확인 필요 (그 콘솔 로그 확인, 또는 재시작).
- 동시성 테스트는 모두 200이 나왔지만, 중복 키 재조회 분기(`ER_DUP_ENTRY`)를 실제로 탔는지는 로그로 확인하지 못함.
- 같은 contribution 행을 동시에 수정하면 나중 요청이 덮어씀. 409 처리는 다음 단계(낙관적 락)에서.
- 확정된 주에 대한 쓰기 차단은 아직 없음. 확정 API와 함께 추가할 것.
- 응답에 멤버 이름(`name`)이 들어감. 공개 범위에 따라 필요하면 빼기.
- `fee`, `expenseAdjusted`, `distributable`이 소수가 될 수 있음 (calculate() 그대로 반환). 화면에서 표시 방식 정할 것.
- 마이그레이션 전환 (현재 `synchronize: true`).

### 2026-10-30 - 동시 수정 충돌 처리(낙관적 락, 409) + 확정/확정 해제 API

**만든/수정한 파일과 각 역할**
- `src/weeks/dto/version.dto.ts` (새 파일): `version` 필드 하나(필수, 0 이상 정수). confirm/unconfirm body로 쓰고, 아래 두 DTO가 상속함.
- `src/weeks/dto/update-sales.dto.ts`, `update-contribution.dto.ts` (수정): `VersionDto`를 상속해서 `version`이 필수가 됨.
- `src/weeks/weeks.controller.ts` (수정): `POST /weeks/:startDate/confirm`, `POST /weeks/:startDate/unconfirm` 추가 (`@HttpCode(200)`).
- `src/weeks/weeks.service.ts` (수정):
  - `getWeek()` 응답에 week `version`, contributions 각 `version` 추가. 행이 없으면 0.
  - `updateWithVersion()`: `UPDATE ... SET ..., version = version + 1 WHERE ... AND version = ?` 한 문장으로 실행. affected가 0이면 409.
  - `insertOrConflict()`: version 0일 때 insert하고, unique 충돌이면 409.
  - `setConfirmed()`: 확정/해제. 주차가 없으면 404, 이미 그 상태면 그대로 200.
  - `assertWritable()`: `LOCK_CONFIRMED_WEEKS=true`이고 확정된 주면 409 `WEEK_CONFIRMED`.
  - `ConfigService`를 생성자에 주입.
  - 원자재를 저장하던 기존 `saveContribution()`(읽고 save)은 삭제.
  - `deleteExpense()`는 지출과 그 주차를 먼저 읽어서 확정 여부를 확인하도록 바뀜.
- `src/weeks/weeks.service.spec.ts` (수정): 낙관적 락 5개, 확정 주 차단 3개 테스트 추가. setup에 QueryBuilder mock과 ConfigService mock 추가.
- `README.md` (수정): `LOCK_CONFIRMED_WEEKS` 환경변수, version 사용법, 409 응답 형식 설명.

**환경변수 `LOCK_CONFIRMED_WEEKS`**
- `"true"`일 때만 확정된 주의 sales, contributions, 지출 추가/삭제를 409 `WEEK_CONFIRMED`로 막음. 값이 없거나 다른 값이면 막지 않음(false).
- unconfirm은 항상 허용.
- 서버 시작 시 생성자에서 한 번 읽음. 값을 바꾸면 재시작해야 함.
- `.env`에는 아직 추가하지 않음 (직접 추가할 예정).

**내린 설계 결정과 이유**
- **save()를 쓰지 않은 이유 (확인함)**: TypeORM 1.1.2 `persistence/SubjectExecutor.js`의 update 경로는 `.update(target).set(updateMap).whereEntity(subject.identifier)`라서, WHERE에 기본키만 들어가고 version은 `version + 1`로 올리기만 함. 즉 `@VersionColumn`이 있어도 save()는 충돌을 검사하지 않음. "읽고 → 비교 → save()"는 비교와 저장 사이에 다른 요청이 끼어들면 덮어씀(아래 측정의 "변경 전" 결과). 그래서 조건부 UPDATE 한 문장으로 비교와 저장을 DB 안에서 원자적으로 처리함. 같은 이유를 코드 주석으로 남김.
- **`version = version + 1`을 따로 쓰지 않은 이유**: `UpdateQueryBuilder`는 엔티티에 version 컬럼이 있고 set에 없으면 `version = version + 1`과 `updatedAt = CURRENT_TIMESTAMP`를 자동으로 붙임 (`query-builder/UpdateQueryBuilder.js` 436행). 실제로 한 번 수정할 때마다 version이 정확히 1씩 오르는 것을 확인함.
- **version 0 처리**: version 0이면 insert를 시도함. 그사이 다른 요청이 먼저 만들었으면 unique 충돌(`ER_DUP_ENTRY`)이 나고 409를 줌. 행이 이미 있는데 클라이언트가 0을 보낸 경우도 같은 unique 충돌로 409가 됨.
- **version > 0인데 행이 없는 경우**: UPDATE의 affected가 0이라 409가 됨. 별도 분기는 만들지 않음.
- **원자재 PUT의 주차 생성**: 주차는 지금처럼 get-or-create로 만들고(주차를 만드는 경쟁은 충돌로 보지 않음), version 검사는 contribution 행에만 적용함.
- **confirm 멱등**: 이미 원하는 상태면 version을 검사하지 않고 지금 상태 그대로 200. unconfirm도 같은 규칙으로 맞춤.
- **409 body**: `ConflictException`에 객체를 넘기면 Nest가 그 객체를 그대로 응답 body로 씀. `current`는 `getWeek()` 결과라서 GET 응답과 형식이 같음.
- **확정 주 차단은 "읽고 확인" 방식 (shortcut)**: 주차를 읽어 `confirmed`를 확인한 뒤 씀. confirm과 거의 동시에 들어온 수정 1건은 통과할 수 있음. 코드에 `shortcut:` 주석으로 남김. 필요하면 트랜잭션 + `SELECT ... FOR UPDATE`로 바꿀 것.
- confirm/unconfirm은 POST지만 새 리소스를 만들지 않으므로 201 대신 200을 반환함.

**중간에 난 에러와 해결 방법**
- 변경 전 코드를 비교 측정하려고 scratchpad에 `git archive HEAD`로 풀고 node_modules junction을 만들 때, Git Bash에서 `cmd //c mklink /J`는 인자 파싱이 깨짐. PowerShell `New-Item -ItemType Junction`으로 해결. 측정 후에는 junction(링크)만 지우고, 프로젝트 node_modules가 그대로인 것을 확인함.
- 서버 로그의 `Duplicate entry ... for key 'weeks.IDX_...'` / `'contributions.IDX_...'`: 409로 처리된 unique 충돌을 TypeORM이 `logging: ['error']` 설정 때문에 출력한 것. 서버가 죽은 게 아니고 응답은 정상 409.
- 측정 스크립트의 200/409 개수 세는 첫 번째 버전이 틀렸음 (줄바꿈 없는 파일을 이어 붙여서 `grep -c`가 1을 셈). 결과를 파일마다 한 줄씩 쓰도록 고쳐서 다시 측정함.

**확인한 방법과 결과**
- `npm run build`: 에러 없음.
- `npm test`: 3 suites, **16 tests** 모두 통과 (기존 8 + 새 8).
- 포트 3001에 `LOCK_CONFIRMED_WEEKS=true`로 새 서버를 띄우고 2099-01-05 주차만 사용 (시작 전에 남은 2099-01-05 행 삭제, 0행 확인). confirm 404 확인에 2099-01-12를 한 번 썼지만 행은 생기지 않음.
  - 행이 없을 때 GET → week `version` 0, contributions 5명 모두 `version` 0.
  - version 없이 PUT → 400. version 0으로 sales PUT → 200 (version 1). 다시 version 0 → 409 `VERSION_CONFLICT` + `current`. version 1 → 200 (version 2). 다시 version 1 → 409.
  - contribution version 0 → 200 (version 1). 다시 version 0 → 409.
  - 없는 주 confirm → 404. 틀린 version으로 confirm → 409. 맞는 version → 200 (`confirmed: true`, DB에 `confirmedAt` 기록). 다시 confirm(아무 version) → 200, version 그대로.
  - 확정 상태 + 차단 켜짐: sales, contributions, 지출 추가, 지출 삭제 → 모두 409 `WEEK_CONFIRMED`. 틀린 version으로 unconfirm → 409 `VERSION_CONFLICT`, 맞는 version → 200. 해제 후 지출 추가 201, 삭제 204.
- **동시성 측정 (같은 contribution, 같은 version, 서로 다른 값 10개 동시 전송, 5회 반복)**

  | | 200 | 409 | 최종 값 |
  |---|---|---|---|
  | 변경 후 (조건부 UPDATE) | 매 회 1 | 매 회 9 | 매 회 200을 받은 요청의 값 (version +1) |
  | 변경 전 (version 없이 save, 포트 3002) | 매 회 10 | 0 | 마지막으로 처리된 요청의 값. 나머지 9개 입력은 아무 알림 없이 덮어써짐 (version은 매 회 +10) |

  - 변경 후 5회 합계: 50개 중 200 5개, 409 45개. 잃어버린 입력 0개 (409를 받은 9명은 `current`로 최신 값을 받음).
  - 변경 전 5회 합계: 50개 모두 200. 그중 45개 입력이 조용히 사라짐.
  - 추가 측정: 아직 행이 없는 contribution(멤버 2)에 version 0으로 10개 동시 전송 → 200 1개, 409 9개, 최종 값 = 200을 받은 값, version 1.
  - 변경 전 측정은 `git archive HEAD`(커밋 d929530, 이번 변경 전)를 scratchpad에서 빌드해 포트 3002로 띄우고, 같은 DB, 같은 주차에 version 없이 보냄.
- 측정이 끝난 뒤 2099-01-05 주차 행 삭제 (2099년 weeks 0행, 고아 contributions 0행 확인). 3001, 3002 서버 종료.

**아직 남은 일 / 확인이 필요한 점**
- `.env`에 `LOCK_CONFIRMED_WEEKS` 추가 (직접 할 예정). 지금은 값이 없으므로 차단 꺼짐.
- 확정 주 차단은 읽고 확인하는 방식이라, confirm과 동시에 들어온 수정 1건은 통과할 수 있음. 엄격하게 막으려면 트랜잭션 + `SELECT ... FOR UPDATE`.
- 지출 추가/삭제는 version 검사를 하지 않음. 그래서 지출이 바뀌어도 week version은 그대로임 (정산 결과는 바뀜). 화면이 week version만 보고 "변경 없음"으로 판단하면 안 됨.
- 409 `current`는 충돌 직후 다시 조회한 값이라, 그 사이에 또 바뀌었을 수 있음 (클라이언트가 다시 409를 받으면 재시도).
- 프론트엔드에서 409를 받았을 때 `current`로 다시 그리는 처리.
- 응답에 멤버 이름(`name`)이 들어감. 공개 범위에 따라 필요하면 빼기.
- `fee`, `expenseAdjusted`, `distributable`이 소수가 될 수 있음 (calculate() 그대로 반환). 화면에서 표시 방식 정할 것.
- 마이그레이션 전환 (현재 `synchronize: true`). 다음 단계.
- 해결됨: 같은 contribution 동시 수정 시 덮어쓰기, 확정 API, 확정 주 쓰기 차단.
- 지난 항목의 포트 3000 서버 500 에러: 서버가 꺼져서 이번엔 재현하지 않았음. 원인은 여전히 확인 못 함. 다음에 `npm run start:dev`로 띄웠을 때 다시 보이면 콘솔 로그 확인.

### 2026-10-30 - synchronize 끄고 TypeORM 마이그레이션으로 전환

**만든/수정한 파일과 각 역할**
- `src/data-source.ts` (새 파일): DB 접속 설정을 한곳에 모은 파일. `dataSourceOptions`(앱이 씀)와 `default export new DataSource(...)`(TypeORM CLI가 씀)를 export함. CLI는 Nest 없이 이 파일만 읽으므로 `process.loadEnvFile()`로 `.env`를 직접 불러옴.
- `src/app.module.ts` (수정): 직접 쓰던 `forRootAsync` 설정을 지우고 `TypeOrmModule.forRoot(dataSourceOptions)`로 바꿈. `synchronize: true` 제거됨.
- `src/migrations/1793336942198-InitialSchema.ts` (새 파일): 빈 DB 기준으로 생성한 초기 마이그레이션. 테이블 4개, unique 3개, FK 4개. `down()`에 "실제 데이터 DB에서 revert 금지" 주석 추가.
- `package.json` (수정): `migration:generate`, `migration:run`, `migration:revert`, `migration:show` 스크립트 추가.
- `README.md` (수정): 마이그레이션 명령 사용법(이름 인자 `-- src/migrations/<Name>`, `--check`, `--fake`, 환경변수 덮어쓰기) 추가.

**synchronize를 끈 이유**
- synchronize는 엔티티와 테이블이 다르면 앱이 시작할 때 테이블을 엔티티에 맞게 고침. 어떤 SQL이 실행되는지 미리 보거나 리뷰할 수 없음.
- 컬럼 이름을 바꾸면 TypeORM은 "rename"이 아니라 "옛 컬럼 DROP + 새 컬럼 ADD"로 처리함. 그 컬럼의 데이터가 사라짐. 타입이나 길이를 바꿀 때도 DROP/ADD가 될 수 있음.
- 실수로 엔티티를 잘못 고친 채 서버를 띄우기만 해도 운영 데이터가 바뀜. 되돌리는 방법(down)도 없음.
- 마이그레이션은 SQL이 파일로 남아서 git으로 리뷰할 수 있고, `migrations` 테이블에 어디까지 적용됐는지 기록되고, `down()`으로 되돌릴 수 있음. 다음 단계에서 실제 데이터를 넣기 전에 바꿈.

**내린 설계 결정과 이유**
- **CLI 사용법은 설치된 버전으로 확인함 (typeorm 1.1.2)**: `node_modules/typeorm/package.json`의 bin에 `typeorm-ts-node-commonjs`(내부에서 `require("ts-node").register()`)가 있어서 CJS + ts 조합으로 그대로 씀. `commands/`를 보고 확인한 것:
  - `MigrationGenerateCommand`: `migration:generate <path>`, `-d`, `--check`(차이가 없으면 exit 0, 있으면 exit 1).
  - `MigrationRunCommand`: `--fake`.
  - `CommandUtils.loadDataSource`: DataSource 인스턴스를 default나 named export로 찾음.
- **설정 공유**: 앱과 CLI가 같은 `dataSourceOptions`를 씀. 그래서 entities와 migrations 경로가 어긋날 일이 없음.
  - 앱에서는 `@Module` 데코레이터보다 import가 먼저 실행돼서, ConfigModule이 `.env`를 읽기 전에 options가 만들어짐. 그래서 data-source.ts에서 `.env`를 직접 읽음.
  - `process.loadEnvFile()`(Node 내장)은 이미 설정된 환경변수를 덮어쓰지 않음 (직접 확인). 그래서 `DB_DATABASE=... npm run migration:run`처럼 대상 DB를 바꿀 수 있음.
  - `.env`가 없으면(배포 환경 등) 읽지 않음. 새 의존성(dotenv)은 추가하지 않음.
- **확장자 고정**: `extname(__filename)`으로 CLI(ts-node)에서는 `.ts`, 빌드된 앱에서는 `.js`만 읽음. `{.ts,.js}`로 두면 `dist/migrations/*.d.ts`까지 걸려서 앱이 시작할 때 타입 선언 파일을 마이그레이션으로 불러오려 할 수 있음.
- **자동 실행 안 함**: `migrationsRun: false`. 배포 단계에서 결정.
- **ConfigModule은 유지**: `LOCK_CONFIRMED_WEEKS`를 ConfigService로 읽으므로 그대로 둠.
- **생성된 마이그레이션 파일은 TypeORM 출력 그대로 둠** (큰따옴표, 4칸 들여쓰기). 손으로 고치면 생성 결과와 비교하기 어려워짐.

**기존 DB를 날리지 않고 전환한 방법**
1. 시작 전에 개발 DB(`profit_split`) 전체를 `mysqldump`로 백업함 (scratchpad, 커밋 안 됨).
2. 같은 컨테이너에 root로 임시 DB `profit_split_migtest`를 만들고, `DB_DATABASE`, `DB_USERNAME=root`, `DB_PASSWORD`를 셸 환경변수로만 덮어써서 빈 DB 기준으로 `migration:generate`. root 비밀번호는 `.env`의 `MYSQL_ROOT_PASSWORD`를 셸 변수로만 읽고 화면에 출력하지 않음. mysql 클라이언트에는 `MYSQL_PWD` 환경변수로 넘김. `.env`는 수정하지 않음.
3. 개발 DB에 `migration:generate --check`를 먼저 실행해서 "변경 없음"을 확인함 (읽기만 함).
4. 개발 DB에 `npm run migration:run -- --fake`를 실행함. SQL은 실행하지 않고 `migrations` 테이블에 InitialSchema를 "적용됨"으로만 기록함.
5. 작업 뒤 개발 DB를 다시 덤프해서(`migrations` 테이블 제외) 백업과 `diff` → 덤프 시각 한 줄 말고는 동일함. 스키마와 데이터 모두 그대로.

**"변경 없음" 확인 결과**
- 개발 DB, fake 실행 전: `npm run migration:generate -- src/migrations/Check --check` → `No changes in database schema were found`, exit 0.
- 개발 DB, fake 실행 후: 같은 명령 → `No changes in database schema were found`, exit 0.
- 임시 DB, InitialSchema 실행 후: 같은 명령 → `No changes ...`, exit 0. 즉 "엔티티 = 개발 DB 테이블 = InitialSchema가 만드는 테이블".
- unique/FK 이름(`IDX_e512a...`, `FK_56671...` 등)이 synchronize로 만든 이름과 같음. TypeORM이 테이블+컬럼으로 결정적으로 이름을 만들기 때문.

**중간에 난 에러와 해결 방법**
- 큰 에러는 없었음.
- `migration:run --fake` 출력을 `tail`로 자르다 마지막 "fake 실행" 줄이 잘림. `migration:show`가 `[X] 1 InitialSchema1793336942198`이고, `migrations` 테이블에 1행이 있는 것으로 확인함.
- `.env`에 `MYSQL_ROOT_PASSWORD` 줄이 2개 있음(같은 블록이 두 번 들어 있음). 값은 같아서(`sort -u` 결과 1개) 첫 줄을 씀. `.env`는 직접 정리 필요.

**확인한 방법과 결과**
- 임시 DB 검증:
  - `migration:show` → `[ ] InitialSchema...`.
  - `migration:run` → 테이블 contributions, expenses, members, weeks(+migrations) 생성.
    - unique: `members(name)`, `weeks(startDate)`, `contributions(weekId, memberId)`.
    - FK 4개: `contributions.weekId → weeks`, `expenses.weekId → weeks`는 `ON DELETE CASCADE`. `contributions.memberId → members`, `expenses.buyerId → members`는 `NO ACTION`.
    - `version int NOT NULL`: weeks, contributions, expenses.
  - `migration:revert` → migrations 테이블만 남고 4개 테이블 삭제, migrations 0행.
  - 다시 `migration:run` → 4개 테이블 다시 생성, `migration:show` → `[X] 2 InitialSchema...`.
  - 끝난 뒤 `DROP DATABASE profit_split_migtest`. `SHOW DATABASES LIKE 'profit_split%'` → `profit_split`만 남음.
- 개발 DB: 위 "변경 없음" 확인, fake 기록, 덤프 diff 동일, members 5행(id 1~5) 그대로.
- `npm run build` (dist 삭제 후 새로 빌드): 에러 없음. `dist/migrations/*.js`, `dist/data-source.js` 생성 확인.
- `npm test`: 3 suites, 16 tests 모두 통과.
- 앱 확인: `PORT=3001 node dist/main.js` → `GET /members` 200, `GET /weeks/2099-01-05/settlement` 200 (DB에 쓰지 않는 GET만 호출). 로그에 스키마 변경 쿼리 0줄 (synchronize 꺼짐). 확인 후 3001 서버 종료.

**아직 남은 일 / 확인이 필요한 점**
- 마이그레이션 자동 실행 여부(`migrationsRun`)는 배포 단계에서 정하기. 지금은 스키마를 바꾼 뒤 `npm run migration:run`을 직접 실행해야 함.
- 배포 환경에서는 ts-node가 없으니, 빌드된 JS로 실행하는 방법 필요. 예: `typeorm migration:run -d dist/data-source.js`. 이번엔 스크립트를 추가하지 않음.
- 새 DB(다른 PC, 배포 서버)에 InitialSchema를 실행하면 테이블만 생기고 members 5명은 없음. 멤버 seed 방법을 정해야 함 (마이그레이션에 INSERT를 넣을지, 별도 seed 스크립트로 할지).
- `migration:revert`를 실제 데이터 DB에서 실수로 실행하면 InitialSchema `down()`이 테이블을 전부 지움. 운영 전에 백업 절차를 정할 것.
- `.env`의 중복 블록(`MYSQL_*` 두 번) 정리 (직접).
- 지난 항목에서 이어지는 일: 확정 주 차단 경쟁 조건(트랜잭션 + `SELECT ... FOR UPDATE`), 지출이 week version을 올리지 않는 점, 409 `current`를 받았을 때의 프론트 처리, 응답의 멤버 `name` 공개 범위, `fee` 등 소수 표시 방식.
- 해결됨: 마이그레이션 전환 (synchronize 끔).

### 2026-10-30 - 기존 Google Sheets 앱 데이터 이전 + 정산 결과 대조

**만든/수정한 파일과 각 역할**
- `.gitignore`: `/data/`는 이미 들어 있었음 (직접 추가해 둠). `git check-ignore`로 `data/sheet-data.csv`가 무시되는 것을 확인. 수정하지 않음.
- `src/weeks/week.entity.ts` (수정): `startDate` → `confirmDate` (그 주의 확정일, 화요일). 주석 추가.
- `src/expenses/expense.entity.ts` (수정): `category` 컬럼(varchar(10), nullable) 추가. 허용 값 `EXPENSE_CATEGORIES = ['가계부', '지출']`.
- `src/migrations/1793338507080-RenameStartDateAddCategory.ts` (새 파일, 손으로 작성): `RENAME COLUMN startDate → confirmDate`, unique 인덱스 `RENAME INDEX`, `expenses.category` 추가. `down()`은 반대 순서.
- `src/weeks/weeks.controller.ts`, `weeks.service.ts`, `weeks.service.spec.ts`, `src/common/parse-date.pipe.ts` (수정): `startDate` → `confirmDate`로 이름만 바꿈 (경로 파라미터, 응답 필드, 400 메시지). 지출 응답에 `category` 추가.
- `src/weeks/dto/create-expense.dto.ts` (수정): `category`(선택, `가계부`/`지출`만) 추가.
- `scripts/sheet.ts` (새 파일): CSV 파서, 시트 숫자("1,207,500", "21.18%") 변환, `_data` 행 → DB 형태 매핑과 검증. DB 접근 없는 순수 함수.
- `scripts/import-sheet.ts` (새 파일): `npm run import:sheet [-- --dry-run]`. 전부 검증한 뒤 주차마다 트랜잭션으로 넣음.
- `scripts/verify-sheet.ts` (새 파일): `npm run verify:sheet`. 정산기록 시트와 GET 정산 API를 주차마다 비교해서 표와 일치 건수를 출력.
- `scripts/sheet.spec.ts` (새 파일): 파서/매핑/에러 위치 출력 단위 테스트 6개.
- `package.json` (수정): `import:sheet`, `verify:sheet` 스크립트 추가 (`ts-node`).
- `README.md` (수정): `:startDate` → `:confirmDate`, 주차 날짜 의미, 데이터 이전 방법 추가.

**내린 설계 결정과 이유**
- **날짜 컬럼: (a) 이름 변경으로 결정 (사용자 선택)**. 선택지는 (a) 컬럼 이름 변경 + API 파라미터 변경, (b) 이름은 두고 문서화, (c) 진짜 시작일로 변환해서 저장. (a)를 고른 이유:
  - 이름과 의미가 같아짐.
  - 기존 앱 사용자가 기억하는 날짜(확정일)를 그대로 씀.
  - 변경 시점에 weeks가 0행이라 데이터 위험이 없었음.
  - API 경로 모양(`/weeks/:날짜/...`)은 그대로이고, 응답 필드 이름만 `startDate` → `confirmDate`로 바뀜.
- **마이그레이션을 손으로 쓴 이유**: 엔티티를 바꾼 뒤 `migration:generate --dryrun`을 보면 TypeORM 1.1.2는 `DROP INDEX` → `CHANGE startDate confirmDate` → `ADD UNIQUE INDEX`를 만들었음. 컬럼 데이터는 `CHANGE`라서 남지만, 그 사이 unique 제약이 없어지고 MySQL DDL은 트랜잭션으로 묶이지 않음. `RENAME COLUMN` + `RENAME INDEX`(MySQL 8.4)는 데이터와 제약을 그대로 둔 채 이름만 바꿈. 새 인덱스 이름(`IDX_3f776dbf63e93af56ba53202f3`)은 dry-run에서 TypeORM이 계산한 이름을 그대로 써서 `--check`가 "변경 없음"이 되게 함.
- **지난 항목 정정**: 지난 항목에 "컬럼 이름을 바꾸면 TypeORM은 DROP + ADD로 처리"라고 적었는데, 이번에 실제로 확인해 보니 이 경우(타입이 같고 이름만 바뀜)는 `CHANGE`(이름 변경)로 생성됐음. 항상 DROP + ADD는 아님. 다만 synchronize는 이런 SQL을 미리 보여주지 않고 바로 실행하므로 끈 이유는 그대로 유효함. 생성된 SQL은 매번 직접 확인해야 함.
- **`category`는 nullable**: 시트 데이터는 항상 값이 있지만, API로 추가할 때 생략할 수 있게 함 (기존 클라이언트가 깨지지 않음). DB 레벨 enum 대신 varchar + DTO `@IsIn`.
- **manualLock null: import 시점에 계산 (사용자 선택)**. `확정일 00:00 KST`(`Date.parse('YYYY-MM-DDT00:00:00+09:00')`)가 지났으면 confirmed=true. 실행 시점(2026-10-30) 기준으로 2026-11-03은 false.
- **`confirmedAt`은 null**: 원본에 확정 시각이 없어서 지어내지 않음.
- **전부 검증한 뒤 쓰기**: 이상한 값이 하나라도 있으면 DB에 아무것도 넣지 않음 (일부 주만 들어가는 상태를 막음). 에러 메시지에 위치를 넣음. 예: `week:2026-10-20 expenses[0].amount = "1,000" → 1 이상 정수가 아님`.
- **검증 규칙은 API와 같게 함**: 금액 0 이상 정수, 지출 amount 1 이상, memo 1~100자, buyer 0~4 또는 빈 값, cat은 `가계부`/`지출`, paid는 boolean, 날짜는 `ParseDatePipe` 재사용.
- **중복 방지**: 주차 하나 = 트랜잭션 하나. `confirmDate`로 찾아서 있으면 그 주의 contributions/expenses를 DELETE하고 다시 INSERT, week 행은 merge 후 save.
- **verify 비교 기준**:
  - 총 수익, 지출 ×105%, 분배할 금액: 시트가 원 단위로 반올림해서 보여주므로 `Math.round(API 값) === 시트 값`. 예: 2026-10-20 분배할 금액은 API 168,650,693.2, 시트 168,650,693.
  - 멤버별 %: 0.005 이내.
  - 멤버별 금액: 정확히 일치.
  - 상태: 시트의 "확정"/"수정 가능"과 API `confirmed`도 함께 비교.
- **시트 헤더의 실명**: 열 이름이 아니라 위치로 읽고, 헤더는 출력하지 않음. 작업 중에도 헤더 줄과 memo 내용은 화면에 출력하지 않음. worklog에도 memo를 적지 않음.
- **CSV 라이브러리를 추가하지 않음**: 파일이 작고 형식이 단순해서 30줄 파서 + 테스트로 처리.

**중간에 난 에러와 해결 방법**
- `npx tsc --noEmit`(프로젝트 전체 타입 검사)에서 지난 단계의 `weeks.service.spec.ts` QueryBuilder mock이 `TS7022 implicitly has type 'any'`로 걸림. ts-jest와 `nest build`(spec 제외)에서는 안 보이던 문제. mock 객체에 타입을 붙여 해결.
- `package.json`의 `"test:e2e":"node ..."` 줄 공백이 바뀌어 있어서 첫 Edit가 실패. 실제 내용을 다시 읽고 맞춰서 수정.
- mysql 클라이언트 출력에서 category가 `???`로 보임. 터미널 문자셋 문제였음. `HEX(category)`가 UTF-8 `가계부`(EAB080EAB384EBB680), `지출`(ECA780ECB69C)과 같고, API 응답도 정상.

**확인한 방법과 결과**
- 마이그레이션 (임시 DB `profit_split_migtest`, root):
  - run 2개 → 두 번째만 revert → `startDate`로 행 삽입 → 다시 run.
  - 결과: 행이 `confirmDate`로 그대로 남음, expenses.category NULL, unique 인덱스가 새 이름으로 유지됨(같은 날짜 INSERT → `ERROR 1062 Duplicate entry`).
  - `--check` "변경 없음"(exit 0). revert 2번 → 다시 run 정상. 임시 DB 삭제.
- 개발 DB: `mysqldump` 백업 → `migration:run`(RenameStartDateAddCategory만 실행됨) → `--check` "변경 없음"(exit 0), members 5명 유지.
- `import:sheet -- --dry-run`: 주차 3개, contributions 15건, expenses 13건, 건너뛴 key 0행. DB 변화 없음(weeks 0행 확인).
- `import:sheet` 1회차: 3주 "새로 추가" → weeks 3, contributions 15, expenses 13.
- 2회차: 3주 "기존 주차 교체" → 행 수 그대로 (중복 없음).
- 확정 상태: 10-20 manual true, 10-27 manual true, 11-03 auto false.
- **결과 대조 (`verify:sheet`, 포트 3001)**:
  - **3주 × 5명 = 15개 정산액 중 15개 일치** (1원 단위).
  - 멤버별 % 15/15 일치 (0.005 이내).
  - 합계(총 수익, 지출 ×105%, 분배할 금액) 9/9 일치.
  - 확정 상태 3/3 일치.
  - 불일치 0건이라 원인 분석할 항목 없음.
  - **해석 주의**: 금액이 0이 아닌 정산액은 2026-10-20의 5개뿐. 10-27과 11-03은 판매 금액이 0이라 분배할 금액이 음수이고, 정산액이 모두 0임. 원 단위 버림(`Math.floor`) 검증이 실제로 된 건 1주 5개. 판매가 있는 주차가 늘면 다시 돌려볼 것.
- GET `/weeks/2026-11-03` 응답의 지출에 `category` 들어감. 서버 로그 error 0줄. 확인 후 3001 서버 종료.
- `npx tsc --noEmit -p tsconfig.json`: 에러 없음 (scripts 포함).
- `npm run build`: 에러 없음.
- `npm test`: 4 suites, **22 tests** 모두 통과 (기존 16 + 새 6).

**아직 남은 일 / 확인이 필요한 점**
- **매입자별 미정산 합계** (기존 앱 기능): 아직 만들지 않음. **결정됨(2026-10-30): 매입자가 받을 돈은 지출 원금(`amount`)**, ×105% 아님. 데이터는 준비됨 (`expenses.buyerId`, `distributed`, `category`).
- **자동 확정 규칙 없음**: import 때만 계산함. 2026-11-03은 지금 confirmed=false이고, 11-03 00시가 지나도 저절로 확정되지 않음. 직접 confirm하거나 자동 규칙을 구현해야 함.
- **개발 DB에 실제 데이터가 들어감** (3주). 이제부터 `migration:revert`(특히 InitialSchema)와 테스트용 쓰기 요청은 2099-01-05 주차로만 할 것. 실제 주차를 건드리기 전에는 백업할 것.
- **import 후 version**: 다시 import하면 contributions/expenses가 새 행(version 1, 새 id)이 됨. 화면을 열어둔 채 import하면 그 화면은 409를 받을 수 있음. import는 아무도 안 쓸 때 실행할 것.
- **API 응답 필드 이름 변경**: `startDate` → `confirmDate`. 프론트엔드가 있다면 맞춰야 함.
- 지출 응답에 `distributed`는 아직 없음 (DB에는 들어감). 미정산 합계 기능과 같이 정할 것.
- 새 DB에서 멤버 seed 방법 (지난 항목에서 이어짐).
- 지난 항목에서 이어지는 일: 확정 주 차단 경쟁 조건, 지출이 week version을 올리지 않는 점, 409 `current` 프론트 처리, 응답의 멤버 `name` 공개 범위, `fee` 등 소수 표시, 배포용 마이그레이션 실행 스크립트(dist), `.env` 중복 블록 정리.

### 2026-10-30 - React 화면(web/) + API prefix(/api) + 헬스체크

**만든/수정한 파일과 각 역할**
- 백엔드
  - `src/main.ts` (수정): `app.setGlobalPrefix('api')`. 모든 API가 `/api/...`가 됨.
  - `src/health.controller.ts` (새 파일): `GET /api/health`. DB에 `SELECT 1`이 되면 `200 {status:'ok', db:'up'}`, 실패하면 `503 {status:'error', db:'down'}`.
  - `src/health.controller.spec.ts` (새 파일): 성공/503 단위 테스트 2개.
  - `src/app.controller.ts`, `app.service.ts`, `app.controller.spec.ts` (삭제): Nest 시작 템플릿의 `GET /` "Hello World!". 헬스체크로 대체.
  - `src/app.module.ts` (수정): `HealthController` 등록, AppController/AppService 제거.
  - `test/app.e2e-spec.ts` (수정): prefix를 똑같이 붙이고 `GET /api/health`를 확인하도록 바꿈 (실제 DB 필요, `npm test`에는 포함 안 됨).
  - `scripts/verify-sheet.ts` (수정): 호출 경로에 `/api` 추가.
  - `tsconfig.json` (수정): `"exclude": ["node_modules", "dist", "web"]`. 루트 타입 검사가 web(React, DOM 타입)을 읽지 않게 함.
- 프론트엔드 `web/` (새 폴더, Vite + React 19 + TypeScript)
  - `package.json`: 의존성은 react, react-dom 둘뿐. 개발용은 vite, @vitejs/plugin-react, typescript, @types/react(-dom). `"type": "module"`은 넣지 않음 (아래 결정 참고).
  - `vite.config.mts`: `/api` → `API_TARGET`(기본 `http://localhost:3000`) proxy. dev와 preview 모두.
  - `tsconfig.json`, `index.html`, `.gitignore`(web/node_modules, web/dist).
  - `src/main.tsx`: React를 `#root`에 붙이는 시작점.
  - `src/App.tsx`: 화면 전체 상태(주차, 주차 데이터, 정산, 안내)를 가짐. 불러오기, 저장 큐, 에러 처리, 원자재/판매 금액 입력.
  - `src/api.ts`: API 호출 함수와 응답 타입. HTTP 에러를 사용자용 문장으로 바꿔 `ApiError`로 던짐.
  - `src/week.ts`: 이번 주 키 계산, 주 이동, 날짜 검사, 금액 표시(쉼표). React와 무관한 순수 함수.
  - `src/week.spec.ts`: 위 함수 테스트 7개. 루트 `npm test`(jest)가 같이 실행함.
  - `src/components/MoneyInput.tsx`: 입력 중 쉼표가 붙는 금액 칸. blur 또는 Enter 때만 저장, 커서 위치 유지.
  - `src/components/WeekHeader.tsx`: 이전/다음/이번 주 버튼, 확정 상태 배지, 확정/확정 해제 버튼.
  - `src/components/ExpenseSection.tsx`: 지출 목록(구분, 항목, 매입자, 금액, 삭제)과 추가 폼(항목, 금액, 구분, 매입자 드롭다운: 없음 포함).
  - `src/components/SettlementSection.tsx`: 멤버별 %/금액, 총 수익, 수수료, 지출 ×105%, 분배할 금액, 남는 금액.
  - `src/components/NoticeBar.tsx`: 화면 위에 고정되는 안내. 409/400/404/네트워크 오류 문장과 "내가 입력한 값".
  - `src/styles.css`: 휴대폰 우선 스타일 (한 열, 최대 560px, 버튼/입력 높이 44px, 글자 16px → iOS 입력 확대 방지).
- `README.md` (수정): 실행 방법(API 서버, web 개발 서버, 다른 포트, 휴대폰 접속), 경로를 `/api/...`로 수정.

**내린 설계 결정과 이유**
- **"이번 주" 키 규칙**: 주차 키 = 확정일(화요일)이고, 확정일 00시 KST가 되면 그 주는 확정됨 (지난 단계 결정). 그래서 이번 주 = **오늘(KST) 이후 첫 화요일**. 화요일 당일이면 다음 주 화요일. 2026-10-30(금) 기준 2026-11-03이고, 시트의 "수정 가능" 주와 같음. 브라우저 시간대와 관계없이 KST로 계산함 (테스트로 확인).
- **주소 해시 `#YYYY-MM-DD`**: 새로고침해도 같은 주가 열리고, 두 탭이나 링크로 같은 주를 열 수 있음. 라우터 라이브러리는 넣지 않음.
- **저장 후 항상 다시 불러오기**: 저장이 성공하든 실패하든 끝나면 주차와 정산을 다시 GET함. 지출 추가/삭제는 week version을 바꾸지 않으므로, version을 비교해서 "바뀐 게 없다"고 판단하는 코드는 아예 두지 않음. 정산도 항상 서버 값을 씀 (화면은 계산하지 않음).
- **저장 큐 + 최신 version**: 저장 요청은 한 번에 하나씩 보내고, 보낼 때 가장 최근에 받은 주차 데이터의 version을 씀 (`weekRef`). 판매 전을 저장하자마자 판매 후를 저장해도 내 요청끼리 409가 나지 않음.
- **409 VERSION_CONFLICT**: 응답의 `current`로 바로 다시 그리고, 안내와 함께 "내가 입력한 값: 판매 후 2,000,000원"을 보여줌. 입력칸은 최신 값으로 바뀌고, 내 값은 안내에 남음.
- **409 WEEK_CONFIRMED**: 서버의 `LOCK_CONFIRMED_WEEKS` 설정을 화면은 미리 알 수 없음. 그래서 이 응답을 한 번 받으면 "서버가 확정 주를 막는다"고 기억하고, 확정된 주의 입력칸, 지출 폼, 삭제 버튼을 잠금. 확정 해제 버튼은 항상 열어 둠.
- **400/404/5xx/네트워크**: 상태 코드별로 문장을 정함. 404 예: "대상을 찾을 수 없어요. 이미 삭제됐거나 아직 저장된 내용이 없어요". class-validator의 영어 메시지는 보여주지 않음.
- **입력칸 동기화**: 입력 중인 칸은 다른 저장 결과가 와도 덮어쓰지 않음. 서버에서 새로 받아올 때(`loadCount` 증가)만 입력 중이 아닌 칸을 서버 값으로 맞춤. 그래서 blur 직후 옛 값이 잠깐 보였다 바뀌는 깜빡임이 없음.
- **지출 추가 버튼은 금액 입력 중에도 눌림**: 금액은 blur 때 반영되므로, 금액이 0이라고 버튼을 막아 두면 휴대폰에서 첫 탭이 무시됨. 검사는 제출할 때 하고, 비어 있으면 안내 문구를 보여줌.
- **확정 버튼**: 아직 저장된 내용이 없는 주(version 0)는 서버가 404를 주므로 비활성화.
- **표시 반올림**: `fee`, `distributable` 등은 소수일 수 있어서 화면에서만 원 단위로 반올림. 시트 표시와 같음.
- **web의 테스트를 루트 jest로**: vitest를 추가하지 않으려고, DOM이 필요 없는 `week.ts`만 루트 jest가 테스트함. web/package.json에 `"type": "module"`이 있으면 ts-jest가 ESM으로 처리하려 해서, 넣지 않고 Vite 설정만 `.mts`로 둠.
- **create-vite 템플릿 대신 직접 작성**: 템플릿은 ESLint 등 의존성이 많아서 필요한 파일만 직접 만듦.
- **web의 TypeScript는 ^6**: 최신은 7.x지만 루트와 같은 6을 씀.
- **헬스체크는 직접 구현**: `@nestjs/terminus`는 추가하지 않고 컨트롤러 하나로 처리.

**중간에 난 에러와 해결 방법**
- `git rm`으로 시작 템플릿 파일을 지웠더니 삭제가 git index에 staged 됨. 커밋은 사용자가 하므로 `git reset HEAD -- <파일>`로 staging만 되돌림. 파일은 삭제된 상태로 둠 (`git status`에 ` D`로 보임).
- 루트의 `/node_modules`, `/dist`는 루트에만 적용되어 `web/node_modules`가 무시되지 않음. `web/.gitignore` 추가.
- `React.ChangeEvent`를 import 없이 쓰면 UMD 전역 참조 문제가 생길 수 있어서 `import { type ChangeEvent } from 'react'`로 바꿈.
- 지출 추가 버튼 첫 탭이 무시되는 문제(위 결정)를 브라우저 확인 전에 코드 검토 중 발견해서 수정함.
- headless Edge 실행 명령은 바로 종료되지만(런처) 실제 브라우저는 9222에서 계속 동작함. 끝난 뒤 scratch 프로필을 쓰는 msedge 프로세스만 골라서 종료함 (사용자의 Edge는 건드리지 않음).

**확인한 방법과 결과**
- `cd web && npm run build` (tsc + vite build): 에러 없음. JS 230kB (gzip 73kB).
- 루트 `npm run build`: 에러 없음.
- 루트 `npx tsc --noEmit -p tsconfig.json`: 에러 없음.
- 루트 `npm test`: 5 suites, **30 tests** 모두 통과 (기존 22 - Hello World 1 + health 2 + week 7).
- `GET /api/health` → `{"status":"ok","db":"up"}`. Vite proxy를 거쳐도 같음. prefix 없는 `/weeks/...` → 404.
- `verify:sheet` 다시 실행: 15/15 일치 (경로 변경 후에도 동작).
- **두 탭 브라우저 확인**:
  - 방법: headless Edge + Chrome DevTools Protocol 스크립트(scratchpad, 커밋 안 됨). 휴대폰 크기 390×844로 같은 주(`#2099-01-05`)를 탭 A, B에 열고, 실제 입력 이벤트(`Input.insertText`), blur, Enter로 조작함.
  - 서버: API 3001(`LOCK_CONFIRMED_WEEKS=true`), Vite 5173(`API_TARGET=http://localhost:3001`).
  - 결과: **18/18 통과**.
    - 판매 후: A 저장 → B(옛 version)가 저장 → B에 409 안내 + "내가 입력한 값: 판매 후 2,000,000원", B 입력칸은 A의 값으로 바뀜, DB는 A의 값.
    - 원자재(멤버 1): 같은 방식으로 409, 내 값 7,000원 표시, 칸은 5,000.
    - 쉼표: 한 글자씩 입력하는 중에 `1,234` → `1,234,567`. blur 저장 확인, Enter 저장 확인.
    - 지출 추가: 목록 표시, 구분과 매입자 저장, **week version 3 → 3 그대로인데 정산의 지출 ×105%가 52,500으로 갱신**, 폼 초기화.
    - 404: A가 지운 지출을 B가 삭제 → "대상을 찾을 수 없어요" 안내.
    - 확정: A가 확정 → B가 수정 → WEEK_CONFIRMED 안내, B 입력칸 잠김. B가 확정 해제 → 다시 열림.
    - 오프라인(CDP 네트워크 차단) → "서버에 연결할 수 없어요" + 내 입력 777원 표시.
    - 이번 주 버튼 → `#2026-11-03`.
  - 스크린샷(휴대폰 크기)으로 레이아웃 확인: 한 열, 안내가 맨 위에 고정, 잠긴 칸은 회색.
  - 400은 화면에서 만들 수 있는 경로가 없어서 브라우저로 확인하지 못함 (입력칸이 숫자만 받고, 항목은 maxLength 100, 빈 값은 화면에서 막음). 문장 매핑은 코드로만 확인.
- 확인 후 2099-01-05 주차 삭제. 실제 주차 3개(10-20, 10-27, 11-03)는 version 1/1/1, contributions 15건, expenses 13건으로 그대로 (화면에서 실제 주차는 GET만 함). 3001, 5173, headless Edge 모두 종료.

**아직 남은 일 / 확인이 필요한 점**
- **배포 때 같은 서버에서 화면 서비스**: Nest에서 `web/dist`를 정적 파일로 서비스하는 설정(`@nestjs/serve-static` 또는 express static), `/api` 외 경로를 index.html로. 아직 안 함.
- **매입자별 미정산 합계**: 받을 돈 = 지출 원금(`amount`)으로 결정됨. 기능(범위: 전체 주/주차별, 대상 cat)은 아직 정하지 않았고 구현도 안 함. 화면에 `distributed`(정산 완료) 표시도 그때 같이.
- **실시간 갱신 없음**: 다른 사람이 수정해도 내가 저장하거나 주를 옮기기 전까지 화면은 그대로임. 저장할 때 409로 알게 됨. 필요하면 주기적 새로고침이나 탭 포커스 시 새로고침을 추가할 것.
- **409 안내에서 "내 값 다시 적용" 버튼 없음**: 지금은 사용자가 다시 입력해야 함.
- **확정 해제/확정 충돌 시 안내 문구**: "내가 입력한 값: 확정"처럼 어색하게 나옴. 문구 다듬기.
- **커서 위치 복원**은 숫자 개수 기준. 가운데를 지우거나 붙여넣을 때 휴대폰 실기기에서는 확인 못 함 (headless 데스크톱 엔진에서만 확인).
- **실제 휴대폰(iOS Safari, Android Chrome)에서 확인 필요**: 숫자 키패드(`inputMode="numeric"`), 입력 확대, 안내 고정 위치.
- **시작 템플릿 파일 삭제가 staged 되지 않은 상태**로 남아 있음. 커밋할 때 함께 포함할 것 (`git add -A` 또는 `git rm --cached`).
- 지난 항목에서 이어지는 일: 자동 확정 규칙 없음(11-03이 지나도 자동 확정 안 됨), 확정 주 차단 경쟁 조건, 응답의 멤버 `name` 공개 범위, 배포용 마이그레이션 실행 스크립트(dist), 새 DB 멤버 seed, `.env` 중복 블록 정리.

### 2026-10-30 - 공용 접속 코드 + 확정 잠금 규칙 변경 + 자동 잠금

**만든/수정한 파일과 각 역할**
- 접속 코드 (`src/auth/`, 새 폴더)
  - `auth.service.ts`: 코드 확인(상수 시간 비교), IP별 실패 횟수/15분 잠금(메모리), 쿠키 토큰 발급/검증(HMAC-SHA256), 쿠키 옵션. 환경변수가 없으면 생성자에서 에러를 던져 서버가 시작하지 않음.
  - `auth.guard.ts`: 전역 가드. `@Public()`이 아닌 요청은 `ps_auth` 쿠키 검증, 실패하면 `401 UNAUTHORIZED`. Cookie 헤더 파서 `readCookie` 포함.
  - `auth.controller.ts`: `POST /api/auth/login`(204 + 쿠키), `POST /api/auth/logout`(쿠키 삭제).
  - `public.decorator.ts`: `@Public()` (health, auth에 붙임).
  - `login.dto.ts`: `{ code: string }` (최대 100자).
  - `auth.module.ts`: `APP_GUARD`로 가드를 앱 전체에 등록.
  - `auth.service.spec.ts`(8개), `auth.guard.spec.ts`(4개): 가짜 코드(`0000` 등)만 사용.
- 잠금 규칙
  - `src/common/clock.ts` (새 파일): 현재 시각 provider. 테스트에서 고정 시각을 넣음.
  - `src/weeks/lock.ts` (새 파일): `isWeekLocked(confirmDate, manualLock, now)` = `manualLock ?? now ≥ 확정일 00:00 KST`.
  - `src/weeks/lock.spec.ts` (새 파일): 경계 테스트 3개 (월 23:59:59.999 vs 화 00:00 KST, UTC 기준 같은 순간, 수동 설정 우선).
  - `src/weeks/week.entity.ts`: `confirmed: boolean` → `manualLock: boolean | null`.
  - `src/migrations/1793340632452-ConfirmedToManualLock.ts` (새 파일, 손으로 작성): 컬럼 추가 → 데이터 변환 → `confirmed` 삭제. `down()`도 변환 포함.
  - `src/weeks/weeks.service.ts`: 잠김은 요청마다 계산. 원자재만 차단(`assertMaterialsWritable`). `confirm`(version 검사) / `unconfirm`(version 없음, 항상 성공) 분리. 응답에 `manualLock`, `materialsLocked` 추가. 지출 삭제는 다시 단순 DELETE로.
  - `src/weeks/weeks.controller.ts`: `unconfirm`에서 `@Body()` 제거.
  - `src/weeks/weeks.module.ts`: `Clock` provider.
  - `src/weeks/weeks.service.spec.ts`: 18개 (낙관적 락 4, 확정/해제/자동 경계 6, 잠긴 주 수정 규칙 6, 정산 2).
- `src/app.module.ts`: `AuthModule` 등록. `src/health.controller.ts`: `@Public()`.
- 스크립트
  - `scripts/sheet.ts`, `import-sheet.ts`: import 때 잠김을 계산하지 않고 원본 `manualLock`(null/true/false)을 그대로 저장. `now` 인자 삭제.
  - `scripts/sheet.spec.ts`: manualLock 테스트 교체.
  - `scripts/verify-sheet.ts`: `.env`의 `APP_ACCESS_CODE`로 로그인해서 쿠키로 호출. `sheet-data.csv`의 manualLock과 API manualLock 비교 추가.
- 화면 (`web/src/`)
  - `components/LoginScreen.tsx` (새 파일): 접속 코드 화면. `type=password` + `inputMode=numeric`(숫자 키패드), 틀림/429 안내.
  - `App.tsx`: 401 UNAUTHORIZED를 받으면 코드 화면. 잠긴 주에서는 원자재 칸만 잠그고(`materialsLocked`), 판매 금액과 지출은 열어 둠. 확정 해제는 version 없이 호출. 맨 아래 로그아웃 버튼.
  - `api.ts`: `Week` 타입에 `manualLock`, `materialsLocked`. `login`/`logout`. `unconfirm`은 body 없음. 문장 추가(UNAUTHORIZED, INVALID_CODE, TOO_MANY_ATTEMPTS + 남은 분), WEEK_CONFIRMED 문장 변경.
  - `components/WeekHeader.tsx`: 배지 "확정 (자동)" / "확정" / "수정 가능".
  - `components/ExpenseSection.tsx`: 잠금과 무관하게 항상 열림 (`disabled` prop 제거).
  - `styles.css`: 로그인 화면, 링크 버튼.
- `README.md`: 환경변수 표(APP_ACCESS_CODE, APP_COOKIE_SECRET, LOCK_CONFIRMED_WEEKS 새 의미, NODE_ENV), 접속 코드 절, 확정(잠금) 규칙 절, import/verify 설명 수정.

**내린 설계 결정과 이유**
- **자동 잠금 방식: 제안대로 결정**. `manualLock`(null/true/false)만 저장하고, 잠김은 요청마다 `manualLock ?? (지금 ≥ 확정일 00:00 KST)`로 계산.
  - 다른 방법(스케줄러가 화요일 00시에 `confirmed=true`로 바꾸기)은 그 시각에 서버가 꺼져 있으면 틀리고, 자동/수동 구분이 사라짐.
  - 이 방식은 저장 상태가 없어서 항상 맞고, 자동으로 잠긴 주를 풀면 `false`가 저장돼 다시 잠기지 않음.
  - 그래서 따로 묻지 않고 진행함.
- **마이그레이션 데이터 변환 규칙**: 마이그레이션 시점의 잠김 상태가 바뀌지 않게 정함.
  - `confirmed=1` → `1` (수동 잠금)
  - `confirmed=0`이고 확정일이 지남 → `0` (누가 풀어 둔 주)
  - `confirmed=0`이고 확정일 전 → `NULL` (자동)
  - KST 현재 시각은 `DATE_ADD(UTC_TIMESTAMP(), INTERVAL 9 HOUR)`로 계산해서, DB 세션 시간대와 무관함.
  - `migration:generate`는 이름만 바꾸는 `CHANGE confirmed manualLock`을 만들어서 `false`가 "수동 해제"가 됨. 그러면 2026-11-03이 확정일이 지나도 자동으로 잠기지 않으므로 손으로 작성함.
- **잠긴 주에서 막는 것은 원자재뿐**: `updateContribution`만 검사. 판매 금액, 지출 추가/삭제는 검사 코드를 지움.
- **unconfirm**: version 검사 없이 항상 성공. 이미 풀려 있으면 아무것도 쓰지 않고 200. 행이 없는 지난 주(자동 잠김)면 행을 만들어 `manualLock=false`로 저장. `@Body()`를 없애서, 예전 화면이 `{version}`을 보내도 400이 나지 않음.
- **confirm**: version 검사는 그대로. 이미 잠겼으면(자동 포함) 200.
- **`materialsLocked`를 응답에 추가**: 서버 설정(`LOCK_CONFIRMED_WEEKS`)을 화면이 알 수 있게 해서, 막히기 전에 원자재 칸을 잠금. 지난 단계의 "WEEK_CONFIRMED를 한 번 받아야 잠금" 방식은 없앰. 설정이 false면 `materialsLocked=false`라 기존 동작 그대로.
- **쿠키 서명은 직접 구현 (의존성 추가 없음)**: 토큰 = `만료시각.HMAC-SHA256(secret, "만료시각.접속코드")`(base64url).
  - 서명에 접속 코드를 넣어서, 코드를 바꾸면 모든 기기가 다시 로그인해야 함 (코드 유출 시 바로 차단 가능).
  - `cookie-parser`는 node_modules에 간접 의존성으로만 있어서 쓰지 않고, Cookie 헤더를 직접 읽음 (10줄).
- **상수 시간 비교**: `timingSafeEqual`은 길이가 다르면 에러가 나서, 양쪽을 SHA-256(32바이트)으로 만든 뒤 비교. 코드 확인과 서명 확인 모두 같은 방식.
- **무차별 대입 방어**: IP별 연속 실패 5번 → 15분 동안 429 (맞는 코드도 429). 5번째 실패 응답부터 429로 바로 알려줌. 마지막 실패에서 15분이 지나면 횟수 초기화, 성공하면 초기화. 오래된 기록은 로그인 요청 때 정리.
- **필수 환경변수**: `APP_ACCESS_CODE`가 없거나, `APP_COOKIE_SECRET`이 없거나 32자 미만이면 서버가 시작하지 않음. 비밀값이 짧으면 쿠키 위조가 쉬워지므로 비밀값도 필수로 함.
- **쿠키 옵션**: httpOnly, SameSite=Lax, path=/, 30일, `NODE_ENV=production`에서만 Secure (로컬 http 개발에서도 동작하게).
- **로그인 상태 확인 API는 만들지 않음**: httpOnly 쿠키는 JS로 읽을 수 없으므로, 첫 GET이 401이면 코드 화면을 보여줌.

**무차별 대입 방어의 한계 (중요)**
- 실패 기록이 **서버 메모리**에 있음. 서버를 재시작하면 초기화되고, 서버를 2대 이상으로 늘리면 서버마다 따로 셈 (Redis 등 공용 저장소 필요).
- **IP 기준**이라:
  - IP를 바꿔 가며 시도하면(여러 프록시, IPv6 주소 여러 개) 막을 수 없음. 실제로 `127.0.0.1`과 `::1`도 다른 IP로 셈 (확인함).
  - 같은 Wi-Fi(같은 공인 IP)를 쓰는 사람이 5번 틀리면 같은 IP의 다른 팀원도 15분 동안 막힘.
  - 배포 때 리버스 프록시 뒤에 두면 `req.ip`가 프록시 IP가 되어 모든 사용자가 하나로 묶임. `app.set('trust proxy', ...)` 설정 필요 (코드에 `shortcut:` 주석).
- 코드가 4자리(1만 가지)라, IP 하나로 15분에 5번이면 전부 시도하는 데 약 3만 분(약 3주) 걸림. IP를 여러 개 쓰면 그만큼 빨라짐. 더 강하게 하려면 코드 자리수 늘리기, 전체(IP 무관) 실패 횟수 제한, 실패할 때마다 지연 늘리기 등.

**중간에 난 에러와 해결 방법**
- `migration:generate --dryrun`이 `confirmed`를 `manualLock`으로 이름만 바꾸고 NOT NULL을 풀었다 다시 거는 SQL을 만듦 → 데이터 변환이 없어서 손으로 작성 (위 결정).
- `npx tsc --noEmit`에서 `scripts/import-sheet.ts`가 없어진 `confirmed` 필드를 써서 에러 → import를 `manualLock` 저장으로 바꿔서 해결.
- 429 curl 테스트로 `127.0.0.1`이 15분 잠긴 채라, 브라우저 확인 전에 API 서버를 재시작해서 메모리 기록을 초기화함 (메모리 저장의 한계를 직접 확인한 셈).
- 확인 시작 시점에 실제 주차 2026-10-27이 version 7, `confirmedAt` 15:03으로 바뀌어 있었음 (이번 작업 밖에서 수정된 것). 값은 건드리지 않음. 마이그레이션으로 `manualLock=1`이 되어 시트 원본(true)과 같음.
- worklog를 셸 heredoc으로 추가하려다 파싱 에러로 실행되지 않음 (아무것도 쓰이지 않은 것 확인). 편집 도구로 추가함.

**확인한 방법과 결과**
- 시작 전 `mysqldump` 백업 (scratchpad).
- 마이그레이션 (임시 DB `profit_split_migtest`):
  - 옛 스키마에 4가지 경우를 넣고 up 실행 → (지난 주, 1)→1, (지난 주, 0)→0, (미래 주, 0)→NULL, (미래 주, 1)→1.
  - `--check` "변경 없음". down → confirmed 원래 값으로 복원. 다시 up 정상. 임시 DB 삭제.
- 개발 DB: up 실행 → 2026-10-20 `1`, 2026-10-27 `1`, 2026-11-03 `NULL`. `--check` "변경 없음". 멤버 5명 유지.
- 서버 시작 거부: `APP_ACCESS_CODE` 없음 → `Error: APP_ACCESS_CODE 환경변수가 없어서 서버를 시작하지 않습니다`, exit 1. `APP_COOKIE_SECRET` 없음도 같은 방식으로 실패.
- 테스트용 접속 코드/비밀값은 실행할 때마다 무작위로 만들어 scratchpad에만 두고, 끝난 뒤 삭제 (파일과 문서에 남기지 않음).
- curl (포트 3001, `LOCK_CONFIRMED_WEEKS=true`):
  - `/api/health` 쿠키 없이 200. `/api/weeks/...` 쿠키 없음/틀린 쿠키 → `401 UNAUTHORIZED`.
  - 틀린 코드 1~4번 → `401 INVALID_CODE`(remainingAttempts 4→1). 5번째 → `429 TOO_MANY_ATTEMPTS`(retryAfterSeconds 900). 6번째, 맞는 코드 → 429. 다른 IP(`::1`)에서 맞는 코드 → 204 + `Set-Cookie: ps_auth=…; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax`.
  - 2099-01-05: confirm → 원자재 `409 WEEK_CONFIRMED`(새 문구), 판매 200, 지출 추가 201/삭제 204. body 없는 unconfirm 200 (`manualLock=false`). 다시 unconfirm 200 (version 그대로). `{version:1}`을 보내도 200.
  - 실제 주차는 GET만: 10-20/10-27 `confirmed=true, manualLock=true`, 11-03 `confirmed=false, manualLock=null`.
- `verify:sheet` (로그인 후): **15개 정산액 중 15개 일치**, % 15/15, 합계 9/9, 확정 상태 3/3, **manualLock 3/3 일치**.
- 브라우저 (headless Edge, 휴대폰 크기, Vite 5173 → API 3001): **16/16 통과**, 그리고 429 안내 1/1.
  - 코드 화면: 쿠키 없으면 코드 화면(숫자 키패드), 틀린 코드 → "접속 코드가 맞지 않아요", 맞는 코드 → 정산 화면, 다른 탭은 쿠키 공유로 바로 진입.
  - A 확정 → 원자재 칸만 잠김. 잠긴 상태에서 판매 후 저장, 지출 추가/삭제 성공.
  - B(옛 화면)에서 원자재 수정 → WEEK_CONFIRMED 안내, 새로 받은 뒤 원자재만 잠김.
  - B 확정 해제 → 원자재 열림. A(아직 확정으로 보이는 옛 화면)에서 확정 해제 → 안내 없이 성공.
  - 실제 주차는 보기만: 10-27 "확정"(원자재 잠김, 판매 열림), 11-03 "수정 가능". 행이 없는 지난 주 2026-10-13 "확정 (자동)" (GET만이라 행 생기지 않음, 확인함).
  - 로그아웃 → 코드 화면. 5번 틀림 → "여러 번 틀려서 잠시 막혔어요. 15분 후 다시 시도해 주세요."
- 루트 `npm run build`, `npx tsc --noEmit`, `web` `npm run build`: 모두 에러 없음.
- `npm test`: 8 suites, **53 tests** 모두 통과 (지난 30 → 53. auth.service 8, auth.guard 4, lock 3 추가, weeks.service 10 → 18).
- 끝난 뒤 2099-01-05 삭제. 실제 주차 3개는 manualLock 1/1/NULL, version 1/7/1, contributions 15, expenses 13 그대로. 3001, 5173, headless Edge 종료.

**아직 남은 일 / 확인이 필요한 점**
- **`.env`에 추가 필요** (사용자가 직접): `APP_ACCESS_CODE`, `APP_COOKIE_SECRET`(32자 이상), `LOCK_CONFIRMED_WEEKS=true`. 추가하기 전에는 서버가 시작하지 않음 (`npm run start:dev`, e2e 테스트, `verify:sheet` 포함).
- 무차별 대입 방어 한계 (위 절): 메모리 저장, IP 기준, 프록시 뒤 `trust proxy` 설정.
- 정산기록 시트의 "상태" 열은 내보낸 시점(10-30) 기준이라, 2026-11-03 00:00 KST 이후에는 API가 11-03을 "확정"으로 보여주고 `verify:sheet`의 확정 상태 비교가 2/3이 됨 (정상 동작). manualLock 비교는 계속 3/3.
- 로그인 화면이 뜨면 저장 중이던 입력값은 사라짐 (401 후 다시 입력해야 함). 30일마다 다시 로그인.
- 확정 주 원자재 차단의 경쟁 조건(읽고 확인)은 그대로 (`shortcut:` 주석).
- 매입자별 미정산 합계: 받을 돈 = 지출 원금으로 결정됨. 범위와 구현은 아직.
- 지난 항목에서 이어지는 일: 같은 서버에서 화면 서비스(배포), 실시간 갱신 없음, 실제 휴대폰 확인, 배포용 마이그레이션 실행 스크립트(dist), 새 DB 멤버 seed, `.env` 중복 블록 정리, 응답의 멤버 `name` 공개 범위.
