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
