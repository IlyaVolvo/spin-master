#!/usr/bin/env bash
# scripts/logs/monitor-env.sh — tail Render service logs into local JSONL files.
# Collected files go under LOGS_DATA_ROOT (default: ~/logs), not this scripts dir.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_NAME="${1:-}"
LOGS_DATA_ROOT="${LOGS_DATA_ROOT:-$HOME/logs}"

usage() {
  echo "Usage: $0 <staging|prod>" >&2
  echo "Writes to \$LOGS_DATA_ROOT/<env>/render-service.jsonl (default: ~/logs/<env>/)" >&2
  exit 1
}

[[ -n "$ENV_NAME" ]] || usage

# Each env: Render service id
case "$ENV_NAME" in
  staging)
    SERVICE_ID="srv-d9en4ttaeets73bhnq6g"   # replace if needed
    ;;
  prod)
    SERVICE_ID="srv-d6jsconkijhs73d9sf9g"
    ;;
  *)
    usage
    ;;
esac

LOG_DIR="${LOGS_DATA_ROOT}/${ENV_NAME}"

mkdir -p "$LOG_DIR"
# JSON NDJSON from `render logs -o json` (one envelope per line when tailed)
OUT="$LOG_DIR/render-service.jsonl"

# Last Render JSON timestamp in OUT → ISO for --start
last_log_start() {
  local f="$1" ts
  [[ -s "$f" ]] || return 1
  ts="$(tail -n 200 "$f" \
    | grep -oE '"timestamp"[[:space:]]*:[[:space:]]*"[^"]+"' \
    | tail -n 1 \
    | sed -E 's/.*"timestamp"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')" || return 1
  [[ -n "$ts" ]] || return 1
  if [[ "$ts" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T ]]; then
    echo "$ts"
  else
    return 1
  fi
}

printf '\033]1;%s\007' "render:${ENV_NAME}"
echo "Monitoring $ENV_NAME ($SERVICE_ID) → $OUT" >&2
echo "(scripts: $SCRIPT_DIR)" >&2

while true; do
  args=(--resources "$SERVICE_ID" --tail -o json)
  if start="$(last_log_start "$OUT")"; then
    args+=(--start "$start")
    echo "resuming from $start" >&2
  fi
  # Compact each Render JSON object to one line (CLI pretty-prints by default).
  # Keep CLI stderr out of the JSON stream so jq can parse.
  render logs "${args[@]}" 2>/dev/null | jq -c . | tee -a "$OUT" || true
  # Reconnect marker as a JSON line so the analyzer can ignore it easily
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"message\":\"stream ended; reconnecting…\",\"labels\":[]}" | tee -a "$OUT" >&2
  sleep 2
done
