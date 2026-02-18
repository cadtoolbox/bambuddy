#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/bambuddy}"
SERVICE_NAME="${SERVICE_NAME:-bambuddy}"
BRANCH="${BRANCH:-}"
VENV_PIP="${VENV_PIP:-$INSTALL_DIR/venv/bin/pip}"
FRONTEND_DIR="${FRONTEND_DIR:-$INSTALL_DIR/frontend}"
BACKUP_DIR="${BACKUP_DIR:-$INSTALL_DIR/backups}"
BAMBUDDY_API_URL="${BAMBUDDY_API_URL:-http://127.0.0.1:8000/api/v1}"
BAMBUDDY_API_KEY="${BAMBUDDY_API_KEY:-}"
BACKUP_MODE="${BACKUP_MODE:-auto}" # auto|require|skip
FORCE="${FORCE:-0}"

SERVICE_STOPPED=0

log() {
  printf '[bambuddy-update] %s\n' "$*"
}

warn() {
  printf '[bambuddy-update] WARNING: %s\n' "$*" >&2
}

die() {
  printf '[bambuddy-update] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

on_error() {
  local exit_code="$1"
  if [ "$SERVICE_STOPPED" -eq 1 ]; then
    warn "Update failed, attempting to restart service: $SERVICE_NAME"
    systemctl start "$SERVICE_NAME" || true
  fi
  exit "$exit_code"
}
trap 'on_error $?' ERR

create_backup() {
  local ts backup_file

  if [ "$BACKUP_MODE" = "skip" ]; then
    log "Skipping backup (BACKUP_MODE=skip)"
    return 0
  fi

  if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    if [ "$BACKUP_MODE" = "require" ]; then
      die "Service is not running; cannot call built-in backup API."
    fi
    warn "Service is not running; skipping built-in backup API call."
    return 0
  fi

  mkdir -p "$BACKUP_DIR"
  ts="$(date +%Y%m%d-%H%M%S)"
  backup_file="$BACKUP_DIR/bambuddy-backup-$ts.zip"

  log "Creating built-in backup via API: $backup_file"
  if [ -n "$BAMBUDDY_API_KEY" ]; then
    if curl --silent --show-error --fail --location \
      --connect-timeout 5 --max-time 900 \
      -H "X-API-Key: $BAMBUDDY_API_KEY" \
      "$BAMBUDDY_API_URL/settings/backup" \
      --output "$backup_file"; then
      log "Backup created successfully"
      return 0
    fi
  else
    if curl --silent --show-error --fail --location \
      --connect-timeout 5 --max-time 900 \
      "$BAMBUDDY_API_URL/settings/backup" \
      --output "$backup_file"; then
      log "Backup created successfully"
      return 0
    fi
  fi

  rm -f "$backup_file"
  if [ "$BACKUP_MODE" = "require" ]; then
    die "Built-in backup API call failed (BACKUP_MODE=require)."
  fi
  warn "Built-in backup API call failed. Continuing because BACKUP_MODE=auto."
}

[ "${EUID:-$(id -u)}" -eq 0 ] || die "Run as root (or with sudo)."

case "$BACKUP_MODE" in
  auto|require|skip) ;;
  *) die "Invalid BACKUP_MODE '$BACKUP_MODE' (expected: auto, require, skip)." ;;
esac

require_cmd git
require_cmd systemctl
require_cmd curl

[ -d "$INSTALL_DIR" ] || die "Install directory not found: $INSTALL_DIR"
cd "$INSTALL_DIR"
[ -d .git ] || die "No git repository found in: $INSTALL_DIR"

if [ -z "$BRANCH" ]; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  [ "$BRANCH" = "HEAD" ] && BRANCH="main"
fi

load_state="$(systemctl show "$SERVICE_NAME" --property=LoadState --value 2>/dev/null || true)"
if [ -z "$load_state" ] || [ "$load_state" = "not-found" ]; then
  die "Service not found: ${SERVICE_NAME}.service"
fi

if [ -n "$(git status --porcelain)" ]; then
  warn "Local changes detected in $INSTALL_DIR."
  warn "This update uses: git reset --hard origin/$BRANCH"
  if [ "$FORCE" != "1" ]; then
    read -r -p "Discard local changes and continue? [y/N]: " answer
    case "${answer:-}" in
      y|Y|yes|YES) ;;
      *) die "Update cancelled by user." ;;
    esac
  else
    warn "Proceeding without prompt because FORCE=1."
  fi
fi

create_backup

old_commit="$(git rev-parse --short HEAD || true)"

log "Stopping service: $SERVICE_NAME"
systemctl stop "$SERVICE_NAME"
SERVICE_STOPPED=1

log "Updating code from origin/$BRANCH"
git fetch --prune origin
git reset --hard "origin/$BRANCH"

if [ -x "$VENV_PIP" ] && [ -f requirements.txt ]; then
  log "Updating Python dependencies"
  "$VENV_PIP" install -r requirements.txt
else
  warn "Skipping Python dependency update (venv pip or requirements.txt missing)."
fi

if [ -f "$FRONTEND_DIR/package.json" ]; then
  if command -v npm >/dev/null 2>&1; then
    log "Building frontend"
    (
      cd "$FRONTEND_DIR"
      npm ci
      npm run build
    )
  else
    warn "Skipping frontend build (npm not installed)."
  fi
else
  warn "Skipping frontend build (frontend/package.json not found)."
fi

log "Starting service: $SERVICE_NAME"
systemctl start "$SERVICE_NAME"
SERVICE_STOPPED=0
systemctl --no-pager --lines=8 status "$SERVICE_NAME"

new_commit="$(git rev-parse --short HEAD || true)"
log "Update complete: ${old_commit:-unknown} -> ${new_commit:-unknown}"
