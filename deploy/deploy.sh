#!/bin/sh
# TV6 — Chạy TRÊN VPS (CD gửi file này cùng docker-compose.prod.yml và Caddyfile). Không chứa secret.
#   sh deploy.sh deploy <tag>     pull image, sao lưu DB, migrate (chỉ thêm), đổi api/web sang <tag>, kiểm tra health;
#                                 health lỗi thì tự quay về bản đang chạy trước đó.
#   sh deploy.sh rollback [tag]   quay về <tag>; bỏ trống = bản chạy tốt trước đó (ghi ở .state/previous_tag).
# Lưu ý: rollback chỉ đổi code (image), KHÔNG hoàn tác migration. Migration phải chỉ thêm cột/bảng để bản cũ vẫn chạy được.
set -eu
cd "$(dirname "$0")"

COMPOSE="docker compose --env-file .env.prod -f docker-compose.prod.yml"
STATE=.state
mkdir -p "$STATE" backups

log() { printf '[deploy] %s\n' "$*"; }

wait_healthy() {
  i=0
  while [ "$i" -lt 30 ]; do
    if $COMPOSE exec -T api node -e "fetch('http://127.0.0.1:4000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 4
  done
  return 1
}

reload_caddy() {
  $COMPOSE exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true
}

backup_db() {
  out="backups/pre-$1.sql.gz"
  $COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$out"
  if [ ! -s "$out" ]; then
    log "Sao lưu DB rỗng, dừng deploy"
    rm -f "$out"
    exit 1
  fi
  # Giữ 5 bản sao lưu mới nhất.
  ls -1t backups/pre-*.sql.gz 2>/dev/null | tail -n +6 | while read -r old; do rm -f "$old"; done
}

cmd_rollback() {
  target="${1:-}"
  if [ -z "$target" ] && [ -f "$STATE/previous_tag" ]; then
    target="$(cat "$STATE/previous_tag")"
  fi
  if [ -z "$target" ]; then
    log "Không có bản trước để quay về"
    exit 2
  fi
  log "Rollback về $target"
  IMAGE_TAG="$target"
  export IMAGE_TAG
  $COMPOSE pull api web
  $COMPOSE up -d api web caddy
  if wait_healthy; then
    if [ -f "$STATE/current_tag" ]; then cp "$STATE/current_tag" "$STATE/failed_tag"; fi
    echo "$target" > "$STATE/current_tag"
    log "Đã quay về $target"
  else
    log "Rollback về $target nhưng health vẫn lỗi, cần xử lý tay"
    exit 1
  fi
}

cmd_deploy() {
  tag="${1:-}"
  if [ -z "$tag" ]; then
    log "Thiếu tag image"
    exit 2
  fi
  if [ ! -f .env.prod ]; then
    log "Thiếu .env.prod trên VPS (xem deploy/env.prod.example)"
    exit 2
  fi
  previous=""
  if [ -f "$STATE/current_tag" ]; then previous="$(cat "$STATE/current_tag")"; fi

  IMAGE_TAG="$tag"
  export IMAGE_TAG
  log "Pull image $tag"
  $COMPOSE --profile tools pull api web migrate
  $COMPOSE up -d --wait db
  log "Sao lưu DB trước khi migrate"
  backup_db "$tag"
  log "Chạy migration"
  $COMPOSE --profile tools run --rm migrate
  # Lần deploy đầu (DB chưa có món): seed rồi migrate lại để áp dụng các migration cần dữ liệu seed.
  # Seed chỉ chạy khi bảng products trống nên các lần deploy sau không đụng tới dữ liệu.
  products="$($COMPOSE exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM products"' 2>/dev/null | tr -d '[:space:]' || true)"
  if [ "$products" = "0" ]; then
    log "DB chưa có sản phẩm: chạy seed lần đầu"
    $COMPOSE --profile tools run --rm migrate npm run db:seed -w apps/api
    $COMPOSE --profile tools run --rm migrate
  fi
  log "Đổi api/web sang $tag"
  $COMPOSE up -d api web caddy
  reload_caddy

  if wait_healthy; then
    if [ -n "$previous" ] && [ "$previous" != "$tag" ]; then echo "$previous" > "$STATE/previous_tag"; fi
    echo "$tag" > "$STATE/current_tag"
    log "Deploy $tag thành công"
  else
    log "Health check lỗi sau khi đổi sang $tag"
    if [ -n "$previous" ] && [ "$previous" != "$tag" ]; then
      cmd_rollback "$previous" || true
    fi
    exit 1
  fi
}

case "${1:-}" in
  deploy) cmd_deploy "${2:-}" ;;
  rollback) cmd_rollback "${2:-}" ;;
  *)
    echo "Dùng: sh deploy.sh deploy <tag> | sh deploy.sh rollback [tag]"
    exit 2
    ;;
esac
