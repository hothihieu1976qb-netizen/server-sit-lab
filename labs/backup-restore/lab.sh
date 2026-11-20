#!/usr/bin/env bash
set -euo pipefail
umask 077

artifact_root=${LAB_ARTIFACT_DIR:-/artifacts}
source_db=source-db
recovery_db=recovery-db
staging=''
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { printf '%s [%s] %s\n' "$(now)" "$1" "$2" | tee -a "$artifact_root/operations.log" >&2; }
fail() { log ERROR "$1"; exit 1; }

select_archive() {
  local id=${1:?pass an archive directory name}
  [[ "$id" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$ ]] || fail 'invalid archive directory name'
  archive_dir="$artifact_root/$id"
  archive="$archive_dir/orders.dump"
  [[ -s "$archive" && -s "$archive.sha256" ]] || fail "archive or checksum missing: $id"
}

verify_archive() {
  local expected
  read -r expected _ < "$archive.sha256" || fail 'cannot read checksum'
  archive_hash=$(sha256sum -- "$archive") || fail 'cannot hash archive'
  archive_hash=${archive_hash%% *}
  [[ "$expected" == "$archive_hash" ]] || fail 'checksum mismatch; archive rejected'
  pg_restore --list "$archive" >/dev/null || fail 'archive catalog is unreadable'
  log INFO "checksum and PostgreSQL archive catalog verified: ${archive_dir##*/}"
}

backup() {
  local id started completed
  started=$(now)
  staging=$(mktemp -d "$artifact_root/.incoming.XXXXXXXX") || fail 'cannot create a staging directory'
  trap 'exit 130' INT
  trap 'exit 143' TERM
  trap 'if [[ -d "${staging:-}" ]]; then rm -f -- "$staging/orders.dump" "$staging/orders.dump.sha256" "$staging/manifest.txt"; rmdir -- "$staging"; fi' EXIT
  id="backup-$(date -u +%Y%m%dT%H%M%SZ)-${staging##*.}"
  log INFO "backup started: $id"
  pg_dump -w -h "$source_db" -Fc --file="$staging/orders.dump" || fail 'pg_dump failed; earlier backups are unchanged'
  (cd "$staging" && sha256sum orders.dump > orders.dump.sha256) || fail 'could not write checksum'
  pg_restore --list "$staging/orders.dump" >/dev/null || fail 'new archive catalog is unreadable'
  completed=$(now)
  printf 'source=%s\ndatabase=orders\nstarted_at=%s\ncompleted_at=%s\n' "$source_db" "$started" "$completed" > "$staging/manifest.txt" || fail 'could not write manifest'
  mv -T -- "$staging" "$artifact_root/$id" || fail 'could not publish completed archive'
  trap - EXIT INT TERM
  log INFO "backup completed: $id"
  printf '%s\n' "$id"
}

restore() {
  local state started completed receipt
  verify_archive
  state=$(psql -w -h "$recovery_db" -XtA -v ON_ERROR_STOP=1 -c "SELECT to_regnamespace('api') IS NULL") || fail 'recovery database is unreachable'
  [[ "$state" == t ]] || fail 'recovery database already contains the api schema; no data was overwritten'
  started=$(now)
  log INFO "restore started on recovery-db: ${archive_dir##*/}"
  pg_restore -w -h "$recovery_db" -d orders --exit-on-error --single-transaction "$archive" || fail 'restore failed; recovery transaction rolled back'
  completed=$(now)
  receipt="$archive_dir/restore-receipt.txt"
  printf 'target=recovery-db\nsha256=%s\nstarted_at=%s\ncompleted_at=%s\n' "$archive_hash" "$started" "$completed" > "$receipt" || fail 'restore finished but the receipt could not be written'
  log INFO "restore completed; verify records in SQL and through the recovery API"
}

mkdir -p -- "$artifact_root"
case ${1:-} in
  backup) backup ;;
  verify) select_archive "${2:-}"; verify_archive ;;
  list) select_archive "${2:-}"; verify_archive; pg_restore --list "$archive" ;;
  restore) select_archive "${2:-}"; restore ;;
  *) printf 'Usage: lab.sh backup | verify ID | list ID | restore ID\n' >&2; exit 2 ;;
esac
