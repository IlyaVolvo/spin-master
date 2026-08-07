#!/usr/bin/env bash
# Follow a file of Render JSON log objects (pretty-printed or NDJSON) from the
# last complete object, piping compact one-liners through jq.
#
# Usage:
#   ./scripts/logs/tail-render-jsonl.sh /path/to/capture.jsonl
set -euo pipefail

usage() {
  echo "Usage: $0 <path-to-json-log>" >&2
  exit 1
}

[[ $# -eq 1 ]] || usage
[[ "$1" != "-h" && "$1" != "--help" ]] || usage

FILE="$1"
FILE="${FILE/#\~/$HOME}"

if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE" >&2
  exit 1
fi

echo "Following $FILE (from last complete JSON object)" >&2

# Emit complete JSON values as one compact line each (handles multi-line pretty JSON).
follow_json_objects() {
  python3 -u - "$1" <<'PY'
import json
import sys
import time

path = sys.argv[1]
decoder = json.JSONDecoder()


def skip_ws(s: str, i: int) -> int:
    n = len(s)
    while i < n and s[i].isspace():
        i += 1
    return i


def read_text() -> str:
    with open(path, "r", errors="replace") as fh:
        return fh.read()


def emit_from(text: str, start: int) -> int:
    """Print compact JSON lines for each complete value from text[start:].
    Returns index after last consumed value.
    """
    i = start
    last_good = start
    n = len(text)
    while True:
        i = skip_ws(text, i)
        if i >= n:
            return last_good
        try:
            obj, end = decoder.raw_decode(text, i)
        except json.JSONDecodeError:
            return last_good
        sys.stdout.write(json.dumps(obj, separators=(",", ":")) + "\n")
        sys.stdout.flush()
        last_good = end
        i = end


def find_last_object_start(text: str):
    i = 0
    last_start = None
    n = len(text)
    while True:
        i = skip_ws(text, i)
        if i >= n:
            return last_start
        try:
            _, end = decoder.raw_decode(text, i)
        except json.JSONDecodeError:
            return last_start
        last_start = i
        i = end


text = read_text()
last_start = find_last_object_start(text)
if last_start is None:
    print(f"No complete JSON object in {path} yet; waiting…", file=sys.stderr)
    consumed = 0
else:
    consumed = emit_from(text, last_start)

while True:
    time.sleep(0.25)
    text = read_text()
    if len(text) < consumed:
        last_start = find_last_object_start(text)
        if last_start is None:
            consumed = 0
        else:
            consumed = emit_from(text, last_start)
        continue
    if len(text) > consumed:
        consumed = emit_from(text, consumed)
PY
}

follow_json_objects "$FILE" | jq --unbuffered -c '
  {t: .timestamp, msg: .message} + (([.labels[]? | {(.name): .value}] | add) // {})
'
