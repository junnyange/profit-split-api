# 배포 가이드: 클라우드 서버 한 대 + Docker Compose

서버 한 대에 `docker-compose.prod.yml`로 app(NestJS + 화면), mysql, caddy(HTTPS 프록시)를 띄운다.
특정 클라우드 기능을 쓰지 않아서, AWS EC2에서 Oracle Cloud로 옮길 때도 같은 순서를 따른다.
이미지는 서버에서 직접 빌드하므로 amd64(x86), arm64(Graviton, Ampere) 어디서든 동작한다.

```
인터넷 ──80/443──▶ caddy ──▶ app:3000 ──▶ mysql:3306
                   (서버에서 외부로 열리는 포트는 22, 80, 443뿐. app과 mysql은 내부 네트워크만)
```

> 표기: `<서버IP>`, `<도메인>`처럼 꺾쇠로 감싼 부분은 본인 값으로 바꾼다.
> 가격과 무료 한도는 바뀔 수 있다. **"추정"이라고 적은 숫자는 확인되지 않은 값**이니 공식 링크에서 다시 확인한다.

목차
- [A. AWS EC2에 올리기](#a-aws-ec2에-올리기)
- [B. 도메인 연결과 HTTPS](#b-도메인-연결과-https)
- [C. DB 백업과 복원](#c-db-백업과-복원)
- [D. Oracle Cloud Always Free로 옮기기](#d-oracle-cloud-always-free로-옮기기)
- [E. 비용이 생기는 지점](#e-비용이-생기는-지점)
- [F. 다 쓰고 나서 정리하기](#f-다-쓰고-나서-정리하기)

---

## A. AWS EC2에 올리기

### A-1. 계정 플랜 확인 (Free plan인지)

1. AWS 콘솔에 로그인 → 검색창에 **Billing and Cost Management** → 첫 화면(Home).
2. **Free plan**이라고 표시되는지, 남은 **크레딧 잔액**과 **플랜 종료일**을 확인한다.
   - Free plan: 요금이 청구되지 않는다. 크레딧이 다 떨어지거나 6개월이 지나면 **계정이 자동으로 닫힌다** (E절).
   - Paid plan으로 바꾸면 크레딧을 넘는 사용량은 실제로 청구된다. 이 가이드는 Free plan 기준.
3. 공식 설명: https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html

### A-2. 루트 계정 MFA 설정

루트 계정은 모든 권한이 있어서, 비밀번호만 털려도 계정 전체를 잃는다. 가장 먼저 한다.

1. 콘솔 오른쪽 위 계정 이름 → **Security credentials**.
2. **Multi-factor authentication (MFA)** → **Assign MFA device**.
3. Passkey(지문/보안키) 또는 Authenticator app(Google Authenticator 등) 선택 → 화면 안내대로 등록.
4. 로그아웃 후 다시 로그인해서 MFA를 묻는지 확인.

공식 문서: https://docs.aws.amazon.com/IAM/latest/UserGuide/enable-mfa-for-root.html

### A-3. 예산 알림 만들기

Free plan은 청구되지 않지만, 크레딧이 빨리 줄어드는 것(=계정이 일찍 닫히는 것)을 알아채려고 만든다.
Paid plan으로 바꾼 뒤에도 그대로 쓸 수 있다.

1. **Billing and Cost Management** → 왼쪽 **Budgets** → **Create budget**.
2. **Use a template** → **Monthly cost budget** 선택.
3. 금액: 예) `5` USD. 알림 받을 이메일 입력 → **Create budget**.
4. (선택) 같은 방법으로 **Zero spend budget**(실제 청구액이 0.01달러를 넘으면 알림)도 만든다.

> 예산 금액에 크레딧이 포함되는지는 고급 옵션(Charge types)에 따라 달라진다 (확인 필요).
> 크레딧 잔액은 일주일에 한 번 Billing 첫 화면에서 직접 확인하는 습관이 가장 확실하다.

공식 문서: https://docs.aws.amazon.com/cost-management/latest/userguide/budget-templates.html

### A-4. 인스턴스 만들기

1. 오른쪽 위 리전을 **Asia Pacific (Seoul) ap-northeast-2**로 바꾼다.
2. **EC2** → **Launch instance**.
3. 설정:
   - **Name**: `profit-split`
   - **AMI**: **Ubuntu Server 24.04 LTS**. 아키텍처는 아래 인스턴스 유형에 맞춘다 (t4g = 64-bit Arm, t3 = 64-bit x86).
   - **Instance type**: 목록에서 **Free tier eligible** 표시가 있는 것 중 고른다.
     - 메모리 1GB(예: `t3.micro`, `t4g.micro`)에서도 돌아가게 설정해 두었다 (MySQL 메모리 줄임). 단, 서버에서 이미지를 빌드하려면 아래 A-6의 스왑이 필요하다.
     - 2GB(예: `t4g.small`)면 더 여유 있지만 크레딧이 더 빨리 준다 (E절).
     - 어떤 유형이 Free plan 대상인지는 콘솔 표시를 따른다 (위 예시는 추정).
   - **Key pair**: **Create new key pair** → 이름 `profit-split`, 유형 ED25519, 형식 `.pem` → 내려받은 파일을 잘 보관 (다시 받을 수 없음).
   - **Network settings** → **Edit**:
     - **Auto-assign public IP**: Enable
     - **Create security group** (이름 `profit-split-sg`), 인바운드 규칙:

       | 유형 | 포트 | 소스 | 이유 |
       |---|---|---|---|
       | SSH | 22 | **My IP** | 접속은 내 PC에서만. 집/카페 IP가 바뀌면 이 규칙을 다시 My IP로 수정 |
       | HTTP | 80 | Anywhere (0.0.0.0/0) | 화면 접속, HTTPS 인증서 발급 확인 |
       | HTTPS | 443 | Anywhere (0.0.0.0/0) | 화면 접속 (HTTPS) |
       | Custom UDP | 443 | Anywhere (0.0.0.0/0) | (선택) HTTP/3 |

       3306(MySQL), 3000(app)은 **열지 않는다**.
   - **Configure storage**: 20 GiB, gp3. (Advanced에서 **Delete on termination = Yes**인지 확인 → 인스턴스를 지울 때 디스크도 같이 지워짐)
4. **Launch instance** → 인스턴스 목록에서 **Public IPv4 address**를 확인 (`<서버IP>`).

### A-5. 접속

Windows PowerShell:

```powershell
# 키 파일을 본인만 읽을 수 있게 (안 하면 ssh가 "UNPROTECTED PRIVATE KEY FILE" 오류로 거부)
icacls .\profit-split.pem /inheritance:r /grant:r "$($env:USERNAME):(R)"
ssh -i .\profit-split.pem ubuntu@<서버IP>
```

macOS/Linux: `chmod 400 profit-split.pem && ssh -i profit-split.pem ubuntu@<서버IP>`

### A-6. 서버 준비: 업데이트, 스왑, Docker

아래는 모두 서버(ssh 접속한 터미널)에서 실행한다.

```bash
sudo apt update && sudo apt upgrade -y

# 스왑 2GB: 메모리 1GB 서버에서 npm ci / 화면 빌드가 메모리 부족으로 죽지 않게
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h   # Swap 2.0Gi 확인

# Docker 설치 (공식 설치 스크립트: https://docs.docker.com/engine/install/ubuntu/)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu   # sudo 없이 docker 쓰기
exit                             # 다시 ssh 접속해야 그룹이 적용됨
```

다시 접속한 뒤:

```bash
docker version
docker compose version
```

### A-7. 레포 받기

```bash
git clone https://github.com/<내 계정>/profit-split-api.git
cd profit-split-api
```

- 비공개 레포라면 GitHub의 **Deploy key**(읽기 전용) 또는 `gh auth login`을 쓴다.
- `data/`(시트에서 내보낸 실제 데이터)는 레포에 없다. 서버에 둘 필요도 없다.

### A-8. `.env.production` 작성

```bash
cp .env.production.example .env.production
chmod 600 .env.production        # 본인만 읽기
openssl rand -hex 32             # APP_COOKIE_SECRET 값 생성 (64자)
openssl rand -hex 16             # MySQL 비밀번호 생성 (두 번 실행해서 root용, app용)
nano .env.production
```

채울 값 (설명은 파일 안 주석 참고):
- `DOMAIN`: 도메인이 아직 없으면 비워 둔다 (B절).
- `APP_ACCESS_CODE`, `APP_COOKIE_SECRET`: 필수.
- `COOKIE_SECURE`: 도메인 없이 IP로 테스트할 때만 `false`. 도메인 연결 후에는 비워 둔다 (B절 위험 참고).
- `LOCK_CONFIRMED_WEEKS=true`
- `SEED_MEMBERS`: 빈 DB에 넣을 멤버 이름 (쉼표 구분, 순서대로 id 1~5). **기존 데이터를 복원할 거라면 비워 둔다** (복원한 DB에 멤버가 들어 있음).
- `MYSQL_*`, `DB_*`: `DB_DATABASE/DB_USERNAME/DB_PASSWORD`는 `MYSQL_DATABASE/MYSQL_USER/MYSQL_PASSWORD`와 **똑같이** 적는다.

> `MYSQL_*` 값은 **mysql 컨테이너가 처음(빈 볼륨으로) 시작할 때만** 쓰인다. 나중에 파일에서 비밀번호를 바꿔도 DB 안의 비밀번호는 그대로라서 앱이 접속하지 못한다. 바꾸려면 DB 안에서 `ALTER USER`로 바꾼다.

### A-9. 띄우기

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

- 처음 빌드는 몇 분 걸린다 (메모리 1GB + 스왑이면 5~10분 정도, 추정).
- 컨테이너 시작 순서: mysql healthy → app(마이그레이션 → 멤버 seed → 앱 시작) healthy → caddy.
- 브라우저에서 `http://<서버IP>` → 접속 코드 화면이 나오면 성공.

### A-10. 상태와 로그 보기

```bash
docker compose -f docker-compose.prod.yml ps                 # 세 컨테이너 모두 Up, app은 (healthy)
docker compose -f docker-compose.prod.yml logs -f app        # 앱 로그 (Ctrl+C로 나가기)
docker compose -f docker-compose.prod.yml logs --tail 50 caddy
docker compose -f docker-compose.prod.yml logs --tail 50 mysql
docker stats --no-stream                                     # 메모리 사용량
curl -s localhost/api/health                                 # {"status":"ok","db":"up"}
```

로그에서 볼 것:
- `No migrations are pending` 또는 `Migration ... has been executed successfully` → 마이그레이션 정상.
- `[seed] 멤버 5명 추가` / `[seed] members에 이미 5명이 있어 건너뜀` / `[seed] SEED_MEMBERS가 비어 있어 건너뜀`.
- `접속 코드 실패 ip=...` → 로그인 실패한 사용자 IP. 실제 사용자 IP(프록시 IP가 아님)가 찍혀야 정상.

긴 명령이 번거로우면 서버에서 `echo "alias dc='docker compose -f docker-compose.prod.yml'" >> ~/.bashrc` 후 `dc ps`, `dc logs -f app`처럼 쓴다.

### A-11. 기존 데이터 옮기기 (개발 DB의 실제 주차)

내 PC의 개발 DB를 서버로 옮길 때 (처음 한 번):

```powershell
# 내 PC (PowerShell). 개발 DB 컨테이너 안에서 백업 파일을 만든 뒤 꺼내서 서버로 복사.
# (PowerShell의 > 로 받으면 인코딩이 바뀌어 한글이 깨질 수 있어서 docker cp를 쓴다)
docker exec profit-split-db sh -c 'mysqldump --single-transaction --no-tablespaces -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" > /tmp/dev-dump.sql'
docker cp profit-split-db:/tmp/dev-dump.sql .\dev-dump.sql
docker exec profit-split-db rm /tmp/dev-dump.sql
scp -i .\profit-split.pem .\dev-dump.sql ubuntu@<서버IP>:~/
```

서버에서 C-3의 복원 순서를 `dev-dump.sql`로 따른다 (`gunzip -c` 대신 `cat dev-dump.sql`).
옮긴 뒤 내 PC와 서버의 `dev-dump.sql`은 지운다 (실제 이름이 들어 있음).

### A-12. 업데이트 (새 코드 배포)

```bash
cd ~/profit-split-api
bash deploy/backup-db.sh                                       # 1) 먼저 백업 (C절)
docker tag profit-split-app:latest profit-split-app:prev       # 2) 지금 이미지를 prev로 보관 (되돌리기용)
git pull                                                       # 3) 새 코드
docker compose -f docker-compose.prod.yml up -d --build        # 4) 다시 빌드. 새 마이그레이션은 시작할 때 자동 실행
docker compose -f docker-compose.prod.yml logs --tail 100 app  # 5) 확인
```

### A-13. 되돌리기

새 버전에 문제가 있을 때:

```bash
# 새 버전에 마이그레이션이 없었다면: 이전 이미지로 바로 되돌리기
docker tag profit-split-app:prev profit-split-app:latest
docker compose -f docker-compose.prod.yml up -d --no-build app
git checkout <이전 커밋>    # 코드도 맞춰 둔다 (다음에 --build할 때 다시 새 버전이 되지 않게)
```

새 버전에 **마이그레이션이 있었다면** DB 구조도 되돌려야 한다. 둘 중 하나:
- (권장) 업데이트 직전 백업으로 복원(C-3) 후 위처럼 이전 이미지로 되돌리기. 업데이트 뒤에 입력된 데이터는 사라진다.
- 이전 이미지로 바꾸기 **전에**, 새 이미지가 떠 있는 상태에서 마지막 마이그레이션 되돌리기:
  `docker compose -f docker-compose.prod.yml exec app npx typeorm migration:revert -d dist/data-source.js` (되돌릴 개수만큼 반복). 그다음 이전 이미지로.

---

## B. 도메인 연결과 HTTPS

### B-1. 도메인 없이 IP로 테스트 (임시)

`.env.production`에서 `DOMAIN=` (비움), `COOKIE_SECURE=false` → `http://<서버IP>`로 접속.

**위험 (짧게만 쓸 것)**
- HTTP는 암호화되지 않는다. 같은 Wi-Fi나 중간 네트워크에서 **접속 코드와 로그인 쿠키를 그대로 볼 수 있다.**
- 공인 IP는 자동 스캐너가 늘 훑고 다닌다. 접속 코드가 4자리면 IP별 15분 잠금이 있어도 여러 IP로 시도하면 뚫릴 수 있다.
- 테스트가 끝나면 도메인을 연결하고(B-2), `COOKIE_SECURE`를 지우고, **접속 코드를 바꾼다** (코드를 바꾸면 기존 쿠키가 모두 무효가 됨).

### B-2. 도메인 연결

1. 도메인을 준비한다 (가비아, Cloudflare, Namecheap 등에서 구매. 연 1~2만 원대, 추정).
2. 서버 공인 IP를 고정한다: EC2 → **Elastic IPs** → **Allocate** → 인스턴스에 **Associate**.
   - 고정하지 않으면 인스턴스를 중지/시작할 때마다 공인 IP가 바뀌어 DNS를 다시 바꿔야 한다.
   - Elastic IP도 시간당 요금 대상이다. 인스턴스에 붙어 있지 않아도 요금이 나온다 (E절). 안 쓰면 바로 **Release**.
3. 도메인 DNS 설정에서 **A 레코드** 추가: 이름 `@`(또는 `split` 같은 서브도메인) → 값 `<서버IP>`. TTL은 300초 정도.
   - Cloudflare를 쓴다면 처음에는 프록시(주황 구름)를 끄고 **DNS only**로 둔다 (Caddy가 직접 인증서를 받아야 함).
4. 확인: 내 PC에서 `nslookup <도메인>` → `<서버IP>`가 나오면 된다.

### B-3. HTTPS 켜기

```bash
nano .env.production
#   DOMAIN=<도메인>          예) split.example.com
#   COOKIE_SECURE=           (비우거나 true)
docker compose -f docker-compose.prod.yml up -d --force-recreate app caddy
docker compose -f docker-compose.prod.yml logs -f caddy   # "certificate obtained successfully" 확인
```

- Caddy가 Let's Encrypt 인증서를 자동으로 받고, 만료 전에 자동 갱신한다. `http://`로 들어오면 `https://`로 보낸다.
- 인증서 발급에는 **80, 443 포트가 인터넷에 열려 있어야** 한다 (A-4 보안 그룹).
- 인증서는 `caddy-data` 볼륨에 저장된다. 이 볼륨을 자주 지우면 Let's Encrypt 발급 횟수 제한에 걸릴 수 있다.
- 확인: `curl -I https://<도메인>` → `HTTP/2 200`. 브라우저 주소창 자물쇠 표시.

---

## C. DB 백업과 복원

### C-1. 하루 한 번 자동 백업

[deploy/backup-db.sh](../deploy/backup-db.sh): mysql 컨테이너 안에서 `mysqldump`를 실행해 `~/backups/profit_split-날짜_시각.sql.gz`로 저장하고, 14일 지난 백업은 지운다.

```bash
# 한 번 직접 실행해서 확인
bash ~/profit-split-api/deploy/backup-db.sh
ls -lh ~/backups

# 매일 04:00 KST(= 19:00 UTC, EC2 기본 시간대는 UTC)에 실행
crontab -e
# 맨 아래에 한 줄 추가:
0 19 * * * bash /home/ubuntu/profit-split-api/deploy/backup-db.sh >> /home/ubuntu/backups/backup.log 2>&1
```

- 서버 시간대 확인: `timedatectl` (Time zone이 UTC인지).
- 보관 기간 바꾸기: `KEEP_DAYS=30 bash .../backup-db.sh`.

### C-2. 서버 밖으로 복사 (중요)

백업이 서버 디스크에만 있으면 인스턴스나 디스크를 잃을 때 같이 사라진다. 주기적으로 내 PC에 받아 둔다.

```powershell
# 내 PC (PowerShell)
mkdir backups -Force
scp -i .\profit-split.pem "ubuntu@<서버IP>:~/backups/*.sql.gz" .\backups\
```

백업에는 실제 멤버 이름과 금액이 들어 있다. 레포 폴더 안에 두지 말고(실수로 커밋될 수 있음), 공개된 곳에 올리지 않는다.

### C-3. 복원

```bash
cd ~/profit-split-api
F=docker-compose.prod.yml
docker compose -f $F stop app      # 1) 복원 중에 앱이 쓰지 않게 멈춤
gunzip -c ~/backups/<백업파일>.sql.gz \
  | docker compose -f $F exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'
docker compose -f $F start app     # 2) 앱 다시 시작 (마이그레이션 확인 → seed는 멤버가 있으니 건너뜀)
docker compose -f $F logs --tail 30 app
```

- 백업 파일은 테이블마다 `DROP TABLE IF EXISTS` → `CREATE TABLE` → 데이터 순서라서, **지금 DB 내용을 백업 시점으로 통째로 바꾼다** (마이그레이션 기록 테이블 포함).
- 복원 전에 지금 상태도 `bash deploy/backup-db.sh`로 백업해 두면 되돌릴 수 있다.

---

## D. Oracle Cloud Always Free로 옮기기

AWS Free plan이 끝나기 전에(E절) 옮긴다. 순서: Oracle 서버 준비 → 같은 방법으로 띄우기 → 백업 복원 → DNS 변경 → AWS 정리.

### D-1. 가입 전에 확인할 것

- **홈 리전**: 가입할 때 고르는 홈 리전은 나중에 바꿀 수 없고, **Always Free 컴퓨트는 홈 리전에서만** 만들 수 있다.
  - 공식 문서에 따르면 Ampere A1(Arm)은 **South Korea North (Chuncheon)를 제외한** 곳에서 만들 수 있다. 서울(South Korea Central, `ap-seoul-1`)을 고르면 된다. 가입 직전에 문서를 다시 확인한다.
- **Arm(Ampere A1) 무료 한도**: 문서 기준 월 1,500 OCPU 시간 + 9,000 GB 시간 = **항상 켜 두면 2 OCPU, 12GB 메모리** (예전 자료의 4 OCPU / 24GB와 다름). 1 OCPU / 6GB 하나면 이 앱에 충분하다.
- **디스크**: 부트 볼륨과 블록 볼륨 합쳐 200GB, 볼륨 백업 5개까지 무료.
- **유휴 회수**: 7일 동안 CPU(95퍼센타일), 네트워크, 메모리(A1만) 사용률이 모두 20% 미만이면 Oracle이 인스턴스를 **회수할 수 있다**. 이 앱은 사용량이 적어서 해당될 수 있다.
  - 계정을 Pay As You Go로 올리면 회수 대상에서 빠진다는 안내가 있지만 (추정, 확인 필요), 그러면 무료 한도를 넘는 사용은 청구된다.
  - 어느 쪽이든 **C절 백업을 내 PC로 계속 받아 둔다.**
- **용량 부족**: "Out of host capacity" 오류가 나면 다른 가용 도메인(AD)을 고르거나 시간을 두고 다시 시도한다.
- 공식 문서: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm , https://www.oracle.com/cloud/free/

### D-2. 인스턴스 만들기

1. **Compute → Instances → Create instance**.
2. **Image**: Canonical Ubuntu 24.04 (aarch64). **Shape**: Ampere → `VM.Standard.A1.Flex`, 1 OCPU, 6GB.
3. **Networking**: 새 VCN + public subnet, **Assign a public IPv4 address** 선택.
4. **SSH keys**: 키를 만들어 내려받거나 내 공개키 붙여넣기.
5. **Boot volume**: 기본(약 50GB). 무료 한도 안.
6. 만든 뒤 VCN → Subnet → **Security List** → Ingress Rules 추가:
   - TCP 22: 소스 `<내 IP>/32`
   - TCP 80, TCP 443: 소스 `0.0.0.0/0`
   - (선택) UDP 443: `0.0.0.0/0`

### D-3. 서버 준비와 띄우기

접속: `ssh -i <키파일> ubuntu@<Oracle서버IP>`

Oracle의 Ubuntu 이미지는 **OS 방화벽(iptables)이 기본으로 대부분 막혀 있다.** Security List만 열고 접속이 안 되면 OS 방화벽을 연다:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

(Docker가 연 포트는 보통 Docker가 넣는 규칙으로 통과하지만, 이미지마다 다를 수 있다.)

그다음은 AWS와 같다:
- A-6에서 스왑을 뺀 나머지 (메모리가 6GB라 스왑은 선택). `usermod`의 사용자 이름은 `ubuntu`.
- A-7 레포 받기, A-8 `.env.production` (**AWS와 같은 값**을 쓰고 `SEED_MEMBERS`는 비움. `DOMAIN`은 DNS를 바꾸기 전까지 비우고 `COOKIE_SECURE=false`로 잠깐 확인해도 됨).
- A-9 `up -d --build`. arm64 서버에서 직접 빌드하므로 이미지가 자동으로 arm64가 된다.

### D-4. 데이터 옮기기

```bash
# 1) AWS 서버: 마지막 백업 (이 시점 이후 AWS에 입력한 데이터는 옮겨지지 않으니, 팀원에게 잠시 입력을 멈춰 달라고 한다)
bash ~/profit-split-api/deploy/backup-db.sh
```

```powershell
# 2) 내 PC: AWS → 내 PC → Oracle
scp -i .\profit-split.pem "ubuntu@<AWS서버IP>:~/backups/<백업파일>.sql.gz" .
scp -i .\oracle.key .\<백업파일>.sql.gz ubuntu@<Oracle서버IP>:~/
```

3) Oracle 서버에서 C-3 복원 (`~/backups/<백업파일>` 대신 `~/<백업파일>`). 브라우저로 데이터가 그대로인지 확인.

### D-5. DNS 바꾸기

1. 하루 전에 A 레코드 TTL을 300초로 낮춰 둔다.
2. A 레코드 값을 `<Oracle서버IP>`로 바꾼다.
3. Oracle 서버 `.env.production`에 `DOMAIN=<도메인>`, `COOKIE_SECURE` 비움 → `up -d --force-recreate app caddy` (B-3).
4. `https://<도메인>` 접속 확인. Oracle 서버에도 C-1 cron 등록.
5. 며칠 문제없으면 AWS를 정리한다 (F절).

---

## E. 비용이 생기는 지점

### E-1. AWS Free plan

| 항목 | 내용 | 확실한 정도 |
|---|---|---|
| Free plan 요금 | 청구되지 않음. 대신 사용량이 크레딧에서 빠짐 | 공식 문서 |
| 크레딧 | 가입 시 100달러 + 활동 완료 시 최대 100달러 추가 | 공식 문서 |
| 종료 시점 | **6개월이 지나거나 크레딧을 다 쓰면 (먼저 오는 쪽)** 계정이 자동으로 닫힘 | 공식 문서 |
| 종료 후 | 리소스와 데이터에 접근 불가. 90일 안에 Paid plan으로 올리면 복구, 지나면 계정과 데이터 영구 삭제 | 공식 문서 |
| Paid plan으로 올리면 | 남은 크레딧은 계속 쓰이고, 넘는 사용량은 실제로 청구됨 | 공식 문서 |

공식: https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html , https://aws.amazon.com/free/

**크레딧이 빠지는 것 (= 계정 종료를 앞당기는 것)**

| 항목 | 가격 | 확실한 정도 |
|---|---|---|
| 공인 IPv4 주소 | 시간당 0.005달러 (사용 중이든 아니든, Elastic IP 포함). 하루 종일 켜 두면 한 달 약 3.6달러 | 공식 가격표 |
| EC2 인스턴스 | 유형마다 다름. 예) t3.micro 한 달 약 9~10달러, t4g.small 한 달 약 15달러 (서울) | **추정** |
| EBS 디스크 (gp3) | GB당 한 달 약 0.09달러 (서울) → 20GB면 약 1.8달러 | **추정** |
| EBS 스냅샷 | GB당 한 달 약 0.05달러 | **추정** |
| 인터넷으로 나가는 데이터 | 매달 100GB까지 무료로 알려져 있음. 이 앱은 훨씬 적게 씀 | **추정** |

- 공식 가격: 공인 IPv4 https://aws.amazon.com/vpc/pricing/ , EC2 https://aws.amazon.com/ec2/pricing/on-demand/ , EBS https://aws.amazon.com/ebs/pricing/ , 계산기 https://calculator.aws/
- 예) t4g.small + 공인 IP + 20GB를 한 달 내내 켜면 약 20달러(추정). 크레딧이 100달러뿐이면 6개월 전에 바닥나서 계정이 일찍 닫힐 수 있다. **작은 유형(micro)을 쓰고, Billing 첫 화면에서 크레딧이 줄어드는 속도를 확인한다.**
- 인스턴스를 **중지(Stop)** 해도 EBS 디스크와 Elastic IP 요금은 계속 나간다. 완전히 안 쓰려면 F절대로 삭제한다.

### E-2. Oracle Cloud

- Always Free 한도 안(D-1)이면 요금이 없다. 가입 후 무료 체험 기간(체험 크레딧)이 끝난 Free Tier 계정은 한도를 넘는 리소스를 만들 수 없게 막혀 있다 (체험 기간 동안에는 유료 리소스도 크레딧으로 만들어지니, 만들 때 "Always Free-eligible" 표시를 확인).
- Pay As You Go로 올리면 한도를 넘는 사용(예: A1을 2 OCPU보다 크게, 홈 리전 밖에 볼륨)은 청구된다. 올린다면 **Budgets** 알림을 만든다 (Billing & Cost Management → Budgets).
- 공식: https://www.oracle.com/cloud/free/

---

## F. 다 쓰고 나서 정리하기

### F-1. AWS (서울 리전에서, 순서대로)

- [ ] 마지막 백업을 내 PC로 받았다 (C-2).
- [ ] **EC2 → Instances**: 인스턴스 선택 → Instance state → **Terminate**. 상태가 `Terminated`가 될 때까지 확인.
- [ ] **EC2 → Volumes**: 목록이 비었는지. 남아 있으면(Delete on termination이 꺼져 있었던 경우) **Delete volume**.
- [ ] **EC2 → Snapshots**, **AMIs**: 만든 게 있으면 삭제 (AMI는 Deregister 후 스냅샷 삭제).
- [ ] **EC2 → Elastic IPs**: 있으면 **Disassociate → Release**. (안 붙어 있어도 요금이 나간다)
- [ ] (선택) Security Groups, Key Pairs 삭제 — 요금은 없지만 정리.
- [ ] 다른 리전에 실수로 만든 게 없는지: 콘솔 오른쪽 위 리전을 바꿔 가며 EC2 대시보드 확인, 또는 **Billing → Bills**에서 리전별 사용량 확인.
- [ ] 며칠 뒤 **Billing**에서 사용량이 더 늘지 않는지 확인. 예산 알림(A-3)은 남겨 둬도 된다.
- [ ] 도메인 DNS의 A 레코드를 지우거나 새 서버로 바꿨다.
- [ ] (선택) 계정을 더 쓰지 않으면 계정 해지 (Account → Close account).

### F-2. Oracle (옮긴 뒤 더 쓰지 않을 때)

- [ ] 백업을 내 PC로 받았다.
- [ ] **Compute → Instances → Terminate** (부트 볼륨도 삭제 체크).
- [ ] **Storage → Block Volumes / Boot Volumes / Backups**: 남은 것 삭제.
- [ ] **Networking → Reserved Public IPs**: 있으면 삭제.
- [ ] (선택) VCN 삭제.

### F-3. 내 PC

- [ ] `dev-dump.sql`, 내려받은 백업 등 실제 데이터 파일을 레포 폴더 밖에 두었거나 지웠다.
- [ ] 키 파일(`.pem`)은 서버를 지웠으면 삭제해도 된다.
