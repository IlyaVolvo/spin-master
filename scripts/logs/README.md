# Render log tools

Scripts for collecting Render service logs and turning them into a readable timeline.

| Script | Role |
|--------|------|
| `monitor-env.sh` | Tail Render logs into local JSONL files |
| `analyze-render-log.py` | Extract tournament / player / error timelines |

Collected dumps live under **`~/logs/<env>/`** by default (not in this repo). Override with `LOGS_DATA_ROOT`.

Requires the [Render CLI](https://render.com/docs/cli) (`render`) logged in for monitoring.

---

## `monitor-env.sh`

Continuously tails a Render web service and appends **JSON** envelopes (`render logs -o json`) to a local file. On disconnect it resumes from the last stored timestamp (reduces backlog duplicates).

### Usage

```bash
./scripts/logs/monitor-env.sh prod
./scripts/logs/monitor-env.sh staging
```

### Output

| Env | Default path |
|-----|----------------|
| prod | `~/logs/prod/render-service.jsonl` |
| staging | `~/logs/staging/render-service.jsonl` |

Custom data root:

```bash
LOGS_DATA_ROOT=/var/log/spin ./scripts/logs/monitor-env.sh prod
# → /var/log/spin/prod/render-service.jsonl
```

### Notes

- Format is **JSON** (NDJSON-style when tailed), not text.
- Service IDs are hardcoded in the script; update them if Render resources change.
- Legacy text archives (e.g. older `render-service.log`) are still readable by the analyzer.

---

## `analyze-render-log.py`

Builds a chronological timeline from one or more log files.

**Supported inputs**

- Render CLI JSON (`-o json`) / `.jsonl`
- App file NDJSON (`{"timestamp","level","message","data"}`)
- Legacy Render **text** logs

**Default event set** (if you pass no category flags): tournaments + players + errors + restarts.

Sensitive fields (`password`, `scorePin`, tokens, etc.) are redacted in output.

### Usage

```bash
# Full timeline (tournaments, players, errors)
./scripts/logs/analyze-render-log.py ~/logs/prod/render-service.jsonl

# Multiple files (merged, sorted by time, deduped)
./scripts/logs/analyze-render-log.py ~/logs/prod/*.jsonl ~/logs/prod/render-service.log

# One tournament (parent + children)
./scripts/logs/analyze-render-log.py ~/logs/prod/render-service.log --tournament-id 178

# Time range (UTC). Defaults: start of logs → end of logs
./scripts/logs/analyze-render-log.py ~/logs/prod/render-service.log \
  --since 2026-08-05 --until 2026-08-05

./scripts/logs/analyze-render-log.py ~/logs/prod/render-service.jsonl \
  --since 2026-08-05T01:00:00Z --until 2026-08-05T05:00:00Z

# Categories
./scripts/logs/analyze-render-log.py ~/logs/prod/render-service.log --errors
./scripts/logs/analyze-render-log.py ~/logs/prod/render-service.log --restarts
./scripts/logs/analyze-render-log.py ~/logs/prod/render-service.log --tournaments --players

# Write markdown or machine-readable JSON
./scripts/logs/analyze-render-log.py ~/logs/prod/render-service.log \
  --tournament-id 178 -o /tmp/tournament-178.md

./scripts/logs/analyze-render-log.py ~/logs/prod/render-service.log \
  --errors --since 2026-08-04 --json-events -o /tmp/errors.json
```

### Flags

| Flag | Meaning |
|------|---------|
| `--since TIME` | Events at/after this time (default: beginning of logs) |
| `--until TIME` | Events at/before this time (default: end of logs) |
| `--tournaments` | Tournament create / modify / score / complete / abandon |
| `--players` | Member created / updated / deleted |
| `--errors` | ERROR-level and `Error …` / `Failed …` messages |
| `--restarts` | `Server started`, Render deploy lines, log-stream reconnects |
| `--tournament-id N` | Only that tournament and its children (related errors when included) |
| `--group-tournaments` | Group markdown by tournament (on by default with `--tournament-id`) |
| `-o PATH` | Write output to a file |
| `--json-events` | Emit JSON array of events instead of markdown |

`TIME` may be:

- `YYYY-MM-DD` (date-only `--until` = end of that UTC day)
- `YYYY-MM-DD HH:MM:SS`
- ISO-8601, e.g. `2026-08-05T01:24:37Z`

### Example markdown output

```text
## Tournament 178 — Multi Round Robin 8/4/2026

2026-08-05 01:24:37 UTC  Created tournament **178** … (18 players, by member 82)
2026-08-05 01:30:45 UTC  Modify tournament **178** start · 19 players · 4 groups
…
2026-08-05 04:19:29 UTC  Completed tournament **178** … via child_tournament_completed

## Players

2026-08-05 01:12:55 UTC  Player created **220** …

## Errors

2026-08-04 18:56:44 UTC  Error fetching tournament · tournament=147 · …
```

---

## Typical workflow

```bash
# Terminal 1 — collect
./scripts/logs/monitor-env.sh prod

# Terminal 2 — analyze (legacy text and/or new jsonl)
./scripts/logs/analyze-render-log.py \
  ~/logs/prod/render-service.log \
  ~/logs/prod/render-service.jsonl \
  --since 2026-08-05 \
  --tournament-id 178 \
  -o ~/logs/prod/tournament-178.md
```
