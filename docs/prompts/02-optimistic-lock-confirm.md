# 지시문: 동시 수정 충돌 처리(낙관적 락, 409) + 확정/확정 해제 API

docs/worklog.md를 먼저 읽고 지금까지 한 작업을 파악해줘. 이번 작업도 같은 규칙으로 진행하고, 끝나면 worklog.md에 같은 형식으로 새 항목을 추가해줘. 나는 백엔드를 공부 중이라, 끝나고 나서 바뀐 파일마다 역할을 한국어로 짧게 설명해줘.

## 배경
5명이 같은 주차 화면을 동시에 열어두고 값을 고치는 앱이야. 지금은 같은 값을 동시에 고치면 나중 요청이 앞 요청을 조용히 덮어써. 이걸 version으로 감지해서 409 Conflict를 돌려주게 바꿀 거야. weeks와 contributions에는 이미 @VersionColumn이 있어.

## 1. version 규칙
- GET /weeks/:startDate 응답에 week의 version과 contributions[]의 각 version을 추가해. 아직 DB에 행이 없으면 version은 0으로 보여줘.
- 수정 요청은 body에 "내가 마지막으로 본 version"을 반드시 보내게 해 (DTO에서 필수, 0 이상 정수).
  - PUT /weeks/:startDate/sales  { salesBefore, salesAfter, version }  → week version 기준
  - PUT /weeks/:startDate/contributions/:memberId  { materialAmount, version }  → 그 멤버 contribution 행의 version 기준
- version 0 = "아직 행이 없다고 알고 있음". 행이 없으면 새로 만들고, 그사이 누가 먼저 만들었으면(unique 충돌) 409.
- version이 현재 DB 값과 다르면 409.
- 지출 추가(POST)와 삭제(DELETE)는 version 검사 안 해. 추가끼리는 충돌하지 않고, 이미 지워진 지출 삭제는 지금처럼 404.

## 2. 구현 방식 (중요)
- "읽고 → 비교하고 → save()" 방식은 쓰지 마. 읽은 뒤 저장하기 전 사이에 다른 요청이 끼어들 수 있어서 경쟁 조건이 남아.
- `UPDATE ... SET ..., version = version + 1 WHERE id = ? AND version = ?` 한 문장으로 처리하고, affected 행 수가 0이면 409로 처리해 (QueryBuilder update 사용).
- TypeORM의 save()는 @VersionColumn이 있어도 update할 때 version을 검사하지 않는다는 점을 확인하고, 코드 주석으로 왜 이렇게 했는지 남겨줘.

## 3. 409 응답 형식
`{ statusCode: 409, code: "VERSION_CONFLICT", message: "다른 사람이 먼저 수정했습니다. 최신 값을 확인하세요", current: <GET /weeks/:startDate와 같은 최신 주차 데이터> }`
화면에서 409를 받으면 current로 바로 다시 그릴 수 있게 하려는 거야.

## 4. 확정 / 확정 해제 API
- POST /weeks/:startDate/confirm   { version }  → confirmed = true, confirmedAt = 지금
- POST /weeks/:startDate/unconfirm { version }  → confirmed = false, confirmedAt = null
- 둘 다 week version 검사 (위와 같은 방식, 충돌 시 409). 주차가 없으면 404.
- 이미 확정된 주를 다시 confirm하면 지금 상태 그대로 200 (멱등).

## 5. 확정된 주 쓰기 차단 (설정으로 켜고 끄기)
- 환경변수 LOCK_CONFIRMED_WEEKS를 ConfigService로 읽어. "true"일 때만 차단하고, 값이 없으면 false로 취급해.
- 켜져 있으면 confirmed 주에 대한 sales, contributions, 지출 추가/삭제를 409로 막아: `{ statusCode: 409, code: "WEEK_CONFIRMED", message: "확정된 주입니다. 확정 해제 후 수정하세요" }`
- unconfirm은 항상 허용.
- .env는 내가 직접 고칠 거니까 건드리지 말고, 이 변수 설명은 README와 worklog에 적어줘.

## 6. 테스트와 측정 (포트폴리오에 숫자로 쓸 거야)
- 단위 테스트: version 일치 시 성공, 불일치 시 409(VERSION_CONFLICT), 차단 켜짐/꺼짐에 따른 WEEK_CONFIRMED 동작. 기존 테스트도 전부 통과해야 해.
- 동시성 측정: 서버를 띄워서 같은 contribution에 같은 version으로 서로 다른 값을 담은 요청 10개를 동시에 보내. 기대 결과는 200 1개, 409 9개, 최종 값은 200을 받은 요청의 값. 결과 숫자를 worklog에 기록해줘.
- 비교를 위해 이번 변경 전 방식(version 없이 save)이면 어떻게 되는지도 같은 조건으로 설명하거나 측정해서 적어줘. "10개 모두 200, 9개의 입력이 아무 알림 없이 덮어써짐" 같은 식으로.
- 측정은 2099-01-05 주차만 써. 지난 테스트에서 남은 2099-01-05 주차 행이 DB에 있을 수 있으니, 시작 전과 끝난 뒤에 지워줘 (weeks에서 지우면 CASCADE로 같이 지워져).
- 포트 3000 서버는 내가 꺼뒀어. 측정용 서버는 다른 포트(예: 3001)로 띄우고, 끝나면 꺼줘.

## 하지 말 것
- SettlementService 계산식 변경 금지.
- .env 수정, git commit/push 금지. 커밋은 내가 할게.
- 멤버 실명을 코드나 문서에 쓰지 마.
- 마이그레이션 전환(synchronize 끄기)은 다음 단계야. 이번엔 하지 마.

## 끝나고 확인
1. npm run build 에러 없음
2. npm test 전부 통과 (몇 개인지 적어줘)
3. worklog에 "남은 일"을 갱신해줘
