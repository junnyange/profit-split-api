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
