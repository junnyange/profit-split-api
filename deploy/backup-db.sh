#!/usr/bin/env bash
# 배포 서버 DB 백업. cron으로 하루 한 번 실행한다 (docs/deploy.md C절).
#   결과: ~/backups/profit_split-YYYY-MM-DD_HHMM.sql.gz, KEEP_DAYS(기본 14)일 지난 백업은 삭제
#   예) crontab -e
#       0 19 * * * bash /home/ubuntu/profit-split-api/deploy/backup-db.sh >> /home/ubuntu/backups/backup.log 2>&1
#       (EC2 서버 시간은 보통 UTC라 19:00 UTC = 04:00 KST)
# 백업 파일에는 실제 멤버 이름과 금액이 들어 있다. 레포에 넣거나 공개된 곳에 올리지 않는다.
set -euo pipefail
umask 077 # 백업 파일은 본인만 읽을 수 있게

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/profit_split-$(date +%F_%H%M).sql.gz"

# 비밀번호는 mysql 컨테이너 안의 환경변수로만 쓴다 (서버의 명령줄 기록이나 파일에 남지 않음).
# --single-transaction: 앱을 멈추지 않고도 한 시점의 일관된 백업
docker compose -f docker-compose.prod.yml exec -T mysql sh -c \
  'exec mysqldump --single-transaction --no-tablespaces -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  | gzip > "$OUT.tmp"
mv "$OUT.tmp" "$OUT" # 중간에 실패하면 .tmp만 남고, 완성된 것처럼 보이는 파일은 생기지 않는다

find "$BACKUP_DIR" -name 'profit_split-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date '+%F %T') 백업 완료: $OUT ($(du -h "$OUT" | cut -f1))"
