#!/usr/bin/env python3
"""Extract a readable timeline from Render / app logs.

Supports:
  - Render CLI JSON (-o json): NDJSON objects or a JSON array
  - App file NDJSON: {"timestamp","level","message","data"}
  - Legacy Render text: "YYYY-MM-DD HH:MM:SS  …" multi-line blocks

Examples:
  ./scripts/logs/analyze-render-log.py ~/logs/prod/render-service.log
  ./scripts/logs/analyze-render-log.py ~/logs/prod/*.jsonl --since 2026-08-05 --until 2026-08-05
  ./scripts/logs/analyze-render-log.py ~/logs/prod/render-service.log --errors --restarts --since 2026-08-04
  ./scripts/logs/analyze-render-log.py ~/logs/prod/render-service.log --tournament-id 178 -o timeline.md
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator, Optional

SENSITIVE_KEY_RE = re.compile(
    r"(password|passwd|scorePin|pin|token|secret|authorization|qrToken|cookie)",
    re.I,
)

# Render text prefix: 2026-08-05 01:24:37  <rest>
TEXT_LINE_RE = re.compile(
    r"^(?P<ts>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+(?P<body>.*)$"
)

# App console header: [2026-08-05T01:24:37.537Z] [INFO] Tournament created
APP_HEADER_RE = re.compile(
    r"^\[(?P<iso>[^\]]+)\]\s+\[(?P<level>[^\]]+)\]\s+(?P<message>.+)$"
)

TOURNAMENT_MESSAGES = {
    "Tournament created",
    "Tournament finalized from preregistration",
    "Modifying compound tournament",
    "Compound tournament modified successfully",
    "Match score updated",
    "Tournament completed",
    "tournament_abandoned",
    "tournament_early_completed",
    "Standalone match created successfully",
    "Standalone match created",
}

PLAYER_MESSAGES = {
    "Member created",
    "Member updated",
    "Member deleted",
}

INTERESTING = TOURNAMENT_MESSAGES | PLAYER_MESSAGES

ERROR_LEVELS = frozenset({"error", "err", "fatal"})

RESTART_MESSAGES = {
    "Server started",
}

# Substrings / patterns for deploy / collector / process lifecycle
RESTART_BODY_RES = (
    re.compile(r"stream ended;\s*reconnecting", re.I),
    re.compile(r"Your service is live", re.I),
    re.compile(r"==>\s*Deploying", re.I),
    re.compile(r"^Deploy cancelled\s*$", re.I),
    re.compile(r"^Deploy live\s*$", re.I),
)

ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def strip_ansi(text: str) -> str:
    return ANSI_RE.sub("", text)


@dataclass
class RawRecord:
    ts: datetime
    source: str
    message: str
    level: str = ""
    data: dict[str, Any] = field(default_factory=dict)
    labels: dict[str, str] = field(default_factory=dict)


@dataclass
class Event:
    ts: datetime
    kind: str  # tournament | player | error | restart
    message: str
    data: dict[str, Any]
    source: str
    summary: str
    level: str = ""

    @property
    def fingerprint(self) -> tuple:
        tid = self.data.get("tournamentId")
        mid = self.data.get("memberId")
        parent = self.data.get("parentTournamentId")
        err = self.data.get("error")
        return (
            self.ts.isoformat(),
            self.kind,
            self.message,
            tid,
            mid,
            parent,
            self.data.get("matchId"),
            self.data.get("participantCount"),
            self.data.get("childCount"),
            str(err) if err is not None else None,
            json.dumps(self.data.get("changes"), sort_keys=True, default=str)
            if self.data.get("changes") is not None
            else None,
        )


def ensure_utc(ts: datetime) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc)


def parse_ts(value: str) -> Optional[datetime]:
    value = value.strip()
    if not value:
        return None
    # Date only: 2026-08-05
    if re.match(r"^\d{4}-\d{2}-\d{2}$", value):
        return datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    # 2026-08-05 01:24:37
    if re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$", value):
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    # ISO variants
    try:
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        return ensure_utc(datetime.fromisoformat(value))
    except ValueError:
        return None


def parse_bound_ts(value: str, *, is_until: bool) -> datetime:
    """Parse --since/--until. Date-only until → end of that UTC day."""
    ts = parse_ts(value)
    if ts is None:
        raise argparse.ArgumentTypeError(
            f"Invalid time {value!r}; use ISO8601, 'YYYY-MM-DD', or 'YYYY-MM-DD HH:MM:SS'"
        )
    ts = ensure_utc(ts)
    if is_until and re.match(r"^\d{4}-\d{2}-\d{2}$", value.strip()):
        ts = ts.replace(hour=23, minute=59, second=59, microsecond=999999)
    return ts


def is_error_level(level: str, labels: Optional[dict[str, str]] = None) -> bool:
    lvl = (level or "").strip().lower()
    if lvl in ERROR_LEVELS:
        return True
    if labels:
        return (labels.get("level") or "").strip().lower() in ERROR_LEVELS
    return False


def is_error_record(rec: RawRecord) -> bool:
    if is_error_level(rec.level, rec.labels):
        return True
    msg = rec.message.strip()
    return msg.startswith("Error ") or msg.startswith("Failed ")


def is_restart_message(message: str) -> bool:
    msg = strip_ansi(message).strip()
    if msg in RESTART_MESSAGES:
        return True
    # Header form: "[iso] stream ended; reconnecting…"
    bare = msg
    m = re.match(r"^\[[^\]]+\]\s*(.*)$", msg)
    if m and not APP_HEADER_RE.match(msg):
        bare = m.group(1).strip()
    if bare in RESTART_MESSAGES:
        return True
    for rx in RESTART_BODY_RES:
        if rx.search(bare) or rx.search(msg):
            return True
    return False


def is_restart_record(rec: RawRecord) -> bool:
    return is_restart_message(rec.message)


def should_coalesce_header(message: str, level: str) -> bool:
    return message in INTERESTING or message in RESTART_MESSAGES or is_error_level(level)


def redact(obj: Any) -> Any:
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if SENSITIVE_KEY_RE.search(str(k)):
                out[k] = "[REDACTED]"
            else:
                out[k] = redact(v)
        return out
    if isinstance(obj, list):
        return [redact(x) for x in obj]
    return obj


def flatten_labels(labels: Any) -> dict[str, str]:
    if not isinstance(labels, list):
        return {}
    out: dict[str, str] = {}
    for item in labels:
        if isinstance(item, dict) and "name" in item and "value" in item:
            out[str(item["name"])] = str(item["value"])
    return out


def try_parse_json_value(text: str) -> Optional[Any]:
    text = text.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def iter_json_objects_from_text(text: str) -> Iterator[dict[str, Any]]:
    """Parse NDJSON, a JSON array, or concatenated JSON objects."""
    text = text.strip()
    if not text:
        return
    # Whole-file array
    if text.startswith("["):
        parsed = try_parse_json_value(text)
        if isinstance(parsed, list):
            for item in parsed:
                if isinstance(item, dict):
                    yield item
            return

    # NDJSON / one object per non-empty line; also tolerate pretty multi-line by decoder
    decoder = json.JSONDecoder()
    idx = 0
    n = len(text)
    while idx < n:
        while idx < n and text[idx].isspace():
            idx += 1
        if idx >= n:
            break
        try:
            obj, end = decoder.raw_decode(text, idx)
        except json.JSONDecodeError:
            # Fall back: line-oriented
            line_end = text.find("\n", idx)
            if line_end < 0:
                line_end = n
            line = text[idx:line_end].strip()
            idx = line_end + 1
            if not line or line.startswith("stream ended") or line.startswith("["):
                continue
            obj = try_parse_json_value(line)
            if not isinstance(obj, dict):
                continue
            yield obj
            continue
        if isinstance(obj, dict):
            yield obj
        idx = end


def record_from_render_or_app_json(obj: dict[str, Any], source: str) -> Optional[RawRecord]:
    """Normalize Render envelope or app NDJSON entry."""
    # App file format: {timestamp, level, message, data?}
    if "message" in obj and "timestamp" in obj and "labels" not in obj:
        ts = parse_ts(str(obj.get("timestamp", "")))
        if not ts:
            return None
        data = obj.get("data") if isinstance(obj.get("data"), dict) else {}
        # Sometimes fields are flattened onto the root
        if not data:
            skip = {"timestamp", "level", "message", "data"}
            data = {k: v for k, v in obj.items() if k not in skip}
        msg = str(obj.get("message", ""))
        # Nested JSON string in message
        nested = try_parse_json_value(msg)
        if isinstance(nested, dict) and "message" in nested:
            msg = str(nested.get("message", msg))
            if isinstance(nested.get("data"), dict):
                data = {**data, **nested["data"]}
            else:
                for k, v in nested.items():
                    if k not in ("message", "level", "timestamp", "data"):
                        data[k] = v
        return RawRecord(
            ts=ts,
            source=source,
            message=msg,
            level=str(obj.get("level", "")),
            data=redact(data) if isinstance(data, dict) else {},
        )

    # Render CLI envelope: {timestamp, message, labels:[{name,value}]}
    if "message" in obj and "timestamp" in obj:
        ts = parse_ts(str(obj.get("timestamp", "")))
        if not ts:
            return None
        labels = flatten_labels(obj.get("labels"))
        msg = str(obj.get("message", ""))
        data: dict[str, Any] = {}
        nested = try_parse_json_value(msg)
        if isinstance(nested, dict):
            # App may eventually log JSON to stdout
            if "message" in nested:
                inner_msg = str(nested.get("message", ""))
                inner_data = nested.get("data") if isinstance(nested.get("data"), dict) else {}
                if not inner_data:
                    inner_data = {
                        k: v
                        for k, v in nested.items()
                        if k not in ("message", "level", "timestamp", "data")
                    }
                return RawRecord(
                    ts=ts,
                    source=source,
                    message=inner_msg,
                    level=str(nested.get("level") or labels.get("level", "")),
                    data=redact(inner_data),
                    labels=labels,
                )
            data = redact(nested)
            msg = str(data.get("message", msg))
        return RawRecord(
            ts=ts,
            source=source,
            message=msg,
            level=labels.get("level", ""),
            data=data,
            labels=labels,
        )
    return None


def load_records_from_file(path: Path) -> list[RawRecord]:
    text = path.read_text(errors="replace")
    # Heuristic: JSON-looking file
    stripped = text.lstrip()
    if stripped.startswith("{") or stripped.startswith("["):
        records: list[RawRecord] = []
        for obj in iter_json_objects_from_text(text):
            rec = record_from_render_or_app_json(obj, str(path))
            if rec:
                records.append(rec)
        if records:
            return records
        # Fall through to text if JSON parse yielded nothing useful

    return list(parse_text_log(text, str(path)))


def parse_text_log(text: str, source: str) -> Iterator[RawRecord]:
    """Parse legacy Render text format into RawRecords (header + JSON payload)."""
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        raw = lines[i]
        m = TEXT_LINE_RE.match(raw)

        # Bare reconnect marker from older monitor (no "YYYY-MM-DD HH:MM:SS" prefix)
        if not m and is_restart_message(raw.strip()):
            iso_m = re.match(r"^\[([^\]]+)\]\s*(.*)$", raw.strip())
            if iso_m:
                ts = parse_ts(iso_m.group(1))
                message = iso_m.group(2).strip() or "stream ended; reconnecting…"
            else:
                ts = None
                message = strip_ansi(raw).strip()
            if ts:
                yield RawRecord(ts=ts, source=source, message=message, level="INFO", data={})
            i += 1
            continue

        if not m:
            i += 1
            continue
        ts_raw = m.group("ts")
        body = m.group("body")
        # Skip HTTP access-log noise only
        if body.startswith("clientIP="):
            i += 1
            continue

        # Collector reconnect / deploy lines (not always [LEVEL] headers)
        if is_restart_message(body):
            # Prefer ISO inside "[…Z] stream ended…" when present
            iso_m = re.match(r"^\[([^\]]+)\]\s*(.*)$", body.strip())
            if iso_m and not APP_HEADER_RE.match(body.strip()):
                ts = parse_ts(iso_m.group(1)) or parse_ts(ts_raw)
                message = iso_m.group(2).strip() or "stream ended; reconnecting…"
            else:
                ts = parse_ts(ts_raw)
                message = strip_ansi(body).strip()
            if ts:
                yield RawRecord(ts=ts, source=source, message=message, level="INFO", data={})
            i += 1
            continue

        header = APP_HEADER_RE.match(body)
        if header:
            iso = header.group("iso")
            level = header.group("level")
            message = header.group("message").strip()
            ts = parse_ts(iso) or parse_ts(ts_raw)
            if not ts:
                i += 1
                continue
            # Collect following same-prefix JSON lines
            payload_lines: list[str] = []
            j = i + 1
            while j < len(lines):
                mj = TEXT_LINE_RE.match(lines[j])
                if not mj or mj.group("ts") != ts_raw:
                    break
                b = mj.group("body")
                if APP_HEADER_RE.match(b) or b.startswith("clientIP="):
                    break
                payload_lines.append(b)
                j += 1
            data: dict[str, Any] = {}
            if payload_lines:
                joined = "\n".join(payload_lines)
                parsed = try_parse_json_value(joined)
                if isinstance(parsed, dict):
                    data = redact(parsed)
            yield RawRecord(ts=ts, source=source, message=message, level=level, data=data)
            i = j
            continue

        i += 1


def coalesce_render_json_fragments(records: list[RawRecord]) -> list[RawRecord]:
    """Rebuild pretty-printed console events split across Render JSON lines.

    Pattern:
      message = "[iso] [INFO] Tournament created"
      message = "{"
      message = '  "tournamentId": 178,'
      ...
      message = "}"
    """
    out: list[RawRecord] = []
    i = 0
    while i < len(records):
        rec = records[i]
        header = APP_HEADER_RE.match(rec.message.strip())
        if header and should_coalesce_header(header.group("message").strip(), header.group("level")):
            message = header.group("message").strip()
            level = header.group("level")
            iso = header.group("iso")
            ts = parse_ts(iso) or rec.ts
            payload_lines: list[str] = []
            j = i + 1
            depth = 0
            started = False
            while j < len(records):
                frag = records[j].message
                # Stop if next app header
                if APP_HEADER_RE.match(frag.strip()):
                    break
                # Stop if clearly unrelated access noise
                if frag.startswith("clientIP="):
                    break
                if frag.strip().startswith("{") or started:
                    started = True
                    payload_lines.append(frag)
                    depth += frag.count("{") - frag.count("}")
                    j += 1
                    if started and depth <= 0:
                        break
                    continue
                break
            data: dict[str, Any] = {}
            if payload_lines:
                parsed = try_parse_json_value("\n".join(payload_lines))
                if isinstance(parsed, dict):
                    data = redact(parsed)
            out.append(
                RawRecord(
                    ts=ts,
                    source=rec.source,
                    message=message,
                    level=level,
                    data=data,
                    labels=rec.labels,
                )
            )
            i = j if j > i + 1 else i + 1
            continue

        # Already a complete interesting / error / restart event (app NDJSON or text)
        if rec.message in INTERESTING or is_error_record(rec) or is_restart_record(rec):
            out.append(rec)
        i += 1
    return out


def format_player_name(data: dict[str, Any]) -> str:
    if data.get("name"):
        return str(data["name"])
    first = data.get("firstName") or ""
    last = data.get("lastName") or ""
    name = f"{first} {last}".strip()
    return name or "?"


def summarize_error(message: str, data: dict[str, Any], level: str) -> str:
    err = data.get("error")
    path = data.get("path")
    method = data.get("method")
    tid = data.get("tournamentId")
    mid = data.get("memberId")
    bits = [f"ERROR {message}" if (level or "").upper() != "ERROR" else message]
    if method and path:
        bits.append(f"{method} {path}")
    elif path:
        bits.append(str(path))
    if tid is not None:
        bits.append(f"tournament={tid}")
    if mid is not None:
        bits.append(f"member={mid}")
    if err is not None:
        bits.append(str(err)[:300])
    return " · ".join(bits)


def summarize_restart(message: str, data: dict[str, Any]) -> str:
    msg = strip_ansi(message).strip()
    if msg == "Server started":
        port = data.get("port")
        env = data.get("environment")
        bits = ["Server started (process restart)"]
        if port is not None:
            bits.append(f"port={port}")
        if env:
            bits.append(f"env={env}")
        return " · ".join(bits)
    if re.search(r"stream ended;\s*reconnecting", msg, re.I):
        return "Log stream ended; collector reconnecting"
    if re.search(r"Your service is live", msg, re.I):
        return "Render deploy: service is live"
    if re.search(r"Deploying", msg, re.I):
        return "Render deploy: deploying…"
    if re.search(r"Deploy cancelled", msg, re.I):
        return "Render deploy cancelled"
    return f"Restart/deploy: {msg}"


def summarize(message: str, data: dict[str, Any], *, level: str = "") -> str:
    d = data
    if is_restart_message(message):
        return summarize_restart(message, data)
    if is_error_level(level) or message.startswith("Error ") or message.startswith("Failed "):
        return summarize_error(message, data, level)
    if message == "Tournament created":
        return (
            f"Created tournament **{d.get('tournamentId')}** "
            f"{d.get('name')} ({d.get('type')}, {d.get('status')}, "
            f"{d.get('participantCount')} players"
            f"{', by member ' + str(d['createdByMemberId']) if d.get('createdByMemberId') is not None else ''})"
        )
    if message == "Tournament finalized from preregistration":
        return (
            f"Finalized preregistration → tournament **{d.get('tournamentId')}** "
            f"{d.get('name')} ({d.get('type')})"
        )
    if message == "Modifying compound tournament":
        bits = [f"Modify tournament **{d.get('tournamentId')}** start"]
        if d.get("participantCount") is not None:
            bits.append(f"{d['participantCount']} players")
        if d.get("groupCount") is not None:
            bits.append(f"{d['groupCount']} groups")
        return " · ".join(bits)
    if message == "Compound tournament modified successfully":
        bits = [f"Modify tournament **{d.get('tournamentId')}** done"]
        if d.get("childCount") is not None:
            bits.append(f"{d['childCount']} children")
        if d.get("deletedChildIds"):
            bits.append(f"deleted children {d['deletedChildIds']}")
        if d.get("newChildIds"):
            bits.append(f"new children {d['newChildIds']}")
        return " · ".join(bits)
    if message == "Match score updated":
        a = d.get("member1Name") or d.get("member1Id")
        b = d.get("member2Name") or d.get("member2Id")
        score = f"{d.get('player1Sets')}-{d.get('player2Sets')}"
        flags = []
        if d.get("player1Forfeit"):
            flags.append("P1 forfeit")
        if d.get("player2Forfeit"):
            flags.append("P2 forfeit")
        extra = f" ({', '.join(flags)})" if flags else ""
        done = []
        if d.get("tournamentCompleted"):
            done.append("tournament completed")
        if d.get("parentTournamentCompleted"):
            done.append("parent completed")
        done_s = f" → {', '.join(done)}" if done else ""
        return (
            f"Score on tournament **{d.get('tournamentId')}** "
            f"({d.get('tournamentName') or d.get('tournamentType')}): "
            f"{a} vs {b} = {score}{extra}{done_s}"
        )
    if message == "Tournament completed":
        parent = d.get("parentTournamentId")
        parent_s = f" · parent={parent}" if parent not in (None, "null") else ""
        trigger = f" · via {d['triggeredBy']}" if d.get("triggeredBy") else ""
        return (
            f"Completed tournament **{d.get('tournamentId')}** "
            f"{d.get('name')} ({d.get('type')}){parent_s}{trigger}"
        )
    if message in ("tournament_abandoned", "tournament_early_completed"):
        return f"{message}: tournament **{d.get('tournamentId')}** {d.get('name', '')}".strip()
    if message in ("Standalone match created successfully", "Standalone match created"):
        return f"Standalone match created **{d.get('matchId')}**"
    if message == "Member created":
        return (
            f"Player created **{d.get('memberId')}** {format_player_name(d)} "
            f"(rating={d.get('rating')}, roles={d.get('roles')})"
        )
    if message == "Member updated":
        changes = d.get("changes")
        change_s = ""
        if isinstance(changes, dict) and changes:
            parts = [f"{k}: {v.get('from')}→{v.get('to')}" for k, v in changes.items() if isinstance(v, dict)]
            change_s = " · " + ", ".join(parts)
        return f"Player updated **{d.get('memberId')}** {format_player_name(d)}{change_s}"
    if message == "Member deleted":
        return f"Player deleted **{d.get('memberId')}**"
    return message


def records_to_events(
    records: list[RawRecord],
    *,
    want_tournaments: bool,
    want_players: bool,
    want_errors: bool,
    want_restarts: bool,
) -> list[Event]:
    events: list[Event] = []
    for rec in records:
        msg = rec.message.strip()
        if is_restart_record(rec) and want_restarts:
            events.append(
                Event(
                    ts=ensure_utc(rec.ts),
                    kind="restart",
                    message=msg,
                    data=rec.data,
                    source=rec.source,
                    summary=summarize(msg, rec.data, level=rec.level),
                    level=rec.level or "INFO",
                )
            )
            continue
        is_err = is_error_record(rec)
        if is_err and want_errors:
            events.append(
                Event(
                    ts=ensure_utc(rec.ts),
                    kind="error",
                    message=msg,
                    data=rec.data,
                    source=rec.source,
                    summary=summarize(msg, rec.data, level=rec.level or "ERROR"),
                    level=rec.level or "ERROR",
                )
            )
            continue
        if msg not in INTERESTING:
            continue
        if msg in TOURNAMENT_MESSAGES and not want_tournaments:
            continue
        if msg in PLAYER_MESSAGES and not want_players:
            continue
        kind = "player" if msg in PLAYER_MESSAGES else "tournament"
        events.append(
            Event(
                ts=ensure_utc(rec.ts),
                kind=kind,
                message=msg,
                data=rec.data,
                source=rec.source,
                summary=summarize(msg, rec.data, level=rec.level),
                level=rec.level,
            )
        )
    return events


def dedupe_events(events: list[Event]) -> list[Event]:
    seen: set[tuple] = set()
    out: list[Event] = []
    for ev in events:
        fp = ev.fingerprint
        if fp in seen:
            continue
        seen.add(fp)
        out.append(ev)
    return out


def filter_time_range(
    events: list[Event],
    *,
    since: Optional[datetime],
    until: Optional[datetime],
) -> list[Event]:
    out: list[Event] = []
    for ev in events:
        ts = ensure_utc(ev.ts)
        if since is not None and ts < since:
            continue
        if until is not None and ts > until:
            continue
        out.append(ev)
    return out


def filter_tournament_id(events: list[Event], tournament_id: int) -> list[Event]:
    out: list[Event] = []
    for ev in events:
        if ev.kind == "player":
            continue
        tid = ev.data.get("tournamentId")
        parent = ev.data.get("parentTournamentId")
        try:
            tid_i = int(tid) if tid is not None else None
        except (TypeError, ValueError):
            tid_i = None
        try:
            parent_i = int(parent) if parent not in (None, "null") else None
        except (TypeError, ValueError):
            parent_i = None
        if tid_i == tournament_id or parent_i == tournament_id:
            out.append(ev)
            continue
        if ev.kind == "error" and (
            f"/{tournament_id}" in str(ev.data.get("path", ""))
            or f"tournament {tournament_id}" in ev.message.lower()
            or str(tournament_id) in ev.summary
        ):
            out.append(ev)
    return out


def format_ts(ts: datetime) -> str:
    return ensure_utc(ts).strftime("%Y-%m-%d %H:%M:%S UTC")


def render_timeline(events: list[Event], *, group_tournaments: bool) -> str:
    lines: list[str] = []
    if not events:
        return "No matching events.\n"

    if group_tournaments:
        # Bucket by root-ish id: parent if present else tournamentId; players/errors separate
        buckets: dict[str, list[Event]] = {}
        players: list[Event] = []
        errors: list[Event] = []
        restarts: list[Event] = []
        for ev in events:
            if ev.kind == "player":
                players.append(ev)
                continue
            if ev.kind == "restart":
                restarts.append(ev)
                continue
            if ev.kind == "error" and ev.data.get("tournamentId") is None:
                errors.append(ev)
                continue
            parent = ev.data.get("parentTournamentId")
            tid = ev.data.get("tournamentId")
            key_id = parent if parent not in (None, "null") else tid
            if key_id is None and ev.kind == "error":
                errors.append(ev)
                continue
            key = f"tournament:{key_id}" if key_id is not None else "tournament:unknown"
            buckets.setdefault(key, []).append(ev)

        def sort_key(k: str) -> tuple:
            evs = buckets[k]
            return (evs[0].ts, k)

        for key in sorted(buckets.keys(), key=sort_key):
            evs = buckets[key]
            title_bits = []
            for ev in evs:
                if ev.data.get("name") and ev.data.get("parentTournamentId") in (None, "null"):
                    title_bits = [str(ev.data.get("tournamentId")), str(ev.data.get("name"))]
                    break
            if not title_bits:
                title_bits = [key.split(":", 1)[-1]]
            lines.append(f"## Tournament {' — '.join(title_bits)}")
            lines.append("")
            for ev in evs:
                lines.append(f"{format_ts(ev.ts)}  {ev.summary}")
            lines.append("")

        if players:
            lines.append("## Players")
            lines.append("")
            for ev in players:
                lines.append(f"{format_ts(ev.ts)}  {ev.summary}")
            lines.append("")

        if restarts:
            lines.append("## Restarts / deploys")
            lines.append("")
            for ev in restarts:
                lines.append(f"{format_ts(ev.ts)}  {ev.summary}")
            lines.append("")

        if errors:
            lines.append("## Errors")
            lines.append("")
            for ev in errors:
                lines.append(f"{format_ts(ev.ts)}  {ev.summary}")
            lines.append("")
    else:
        lines.append("## Timeline")
        lines.append("")
        for ev in events:
            lines.append(f"{format_ts(ev.ts)}  {ev.summary}")
        lines.append("")

    return "\n".join(lines)


def load_all(paths: Iterable[Path]) -> list[RawRecord]:
    """Load each file in order, coalesce split JSON lines per file, then merge."""
    all_recs: list[RawRecord] = []
    for path in paths:
        if not path.is_file():
            print(f"skip missing file: {path}", file=sys.stderr)
            continue
        # Keep file order for fragment reassembly; coalesce before cross-file sort.
        file_recs = load_records_from_file(path)
        all_recs.extend(coalesce_render_json_fragments(file_recs))
    all_recs.sort(key=lambda r: (r.ts, r.message))
    return all_recs


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(
        description="Build a readable timeline from Render/app logs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Time filters (UTC). Defaults: full log span.\n"
            "  --since 2026-08-05\n"
            "  --since 2026-08-05T01:00:00Z --until 2026-08-05T05:00:00Z\n"
        ),
    )
    ap.add_argument("files", nargs="+", help="Log files (JSON and/or legacy text)")
    ap.add_argument("--tournaments", action="store_true", help="Include tournament events")
    ap.add_argument("--players", action="store_true", help="Include player events")
    ap.add_argument("--errors", action="store_true", help="Include error-level events")
    ap.add_argument(
        "--restarts",
        action="store_true",
        help="Include process restarts, Render deploys, and log-stream reconnects",
    )
    ap.add_argument(
        "--since",
        metavar="TIME",
        help="Include events at/after this time (default: start of logs)",
    )
    ap.add_argument(
        "--until",
        metavar="TIME",
        help="Include events at/before this time (default: end of logs)",
    )
    ap.add_argument("--tournament-id", type=int, help="Only events for this tournament id (and its children)")
    ap.add_argument("--group-tournaments", action="store_true", help="Group output by tournament")
    ap.add_argument("-o", "--out", type=Path, help="Write markdown to this path (default: stdout)")
    ap.add_argument("--json-events", action="store_true", help="Emit machine-readable JSON events instead of markdown")
    args = ap.parse_args(argv)

    want_t = args.tournaments
    want_p = args.players
    want_e = args.errors
    want_r = args.restarts
    if not want_t and not want_p and not want_e and not want_r:
        want_t = want_p = want_e = want_r = True

    since = parse_bound_ts(args.since, is_until=False) if args.since else None
    until = parse_bound_ts(args.until, is_until=True) if args.until else None
    if since is not None and until is not None and since > until:
        print("--since must be <= --until", file=sys.stderr)
        return 2

    paths = [Path(p).expanduser() for p in args.files]
    # Expand globs passed without shell expansion
    expanded: list[Path] = []
    for p in paths:
        if any(ch in str(p) for ch in "*?["):
            expanded.extend(sorted(Path().glob(str(p))))
        else:
            expanded.append(p)
    if not expanded:
        print("No input files", file=sys.stderr)
        return 1

    records = load_all(expanded)
    events = records_to_events(
        records,
        want_tournaments=want_t,
        want_players=want_p,
        want_errors=want_e,
        want_restarts=want_r,
    )
    events = dedupe_events(events)
    events.sort(key=lambda e: (e.ts, e.kind, e.message))
    events = filter_time_range(events, since=since, until=until)

    if args.tournament_id is not None:
        events = filter_tournament_id(events, args.tournament_id)
        keep_kinds = {"tournament"}
        if args.errors or want_e:
            keep_kinds.add("error")
        if args.players:
            keep_kinds.add("player")
        if args.restarts:
            keep_kinds.add("restart")
        # With --tournament-id alone: tournaments + related errors
        if not args.players and not args.tournaments and not args.errors and not args.restarts:
            keep_kinds = {"tournament", "error"}
        events = [e for e in events if e.kind in keep_kinds]

    if args.json_events:
        payload = [
            {
                "timestamp": e.ts.isoformat(),
                "kind": e.kind,
                "level": e.level,
                "message": e.message,
                "summary": e.summary,
                "data": e.data,
                "source": e.source,
            }
            for e in events
        ]
        text = json.dumps(payload, indent=2, default=str) + "\n"
    else:
        text = render_timeline(events, group_tournaments=args.group_tournaments or args.tournament_id is not None)

    if args.out:
        args.out.write_text(text)
        print(f"Wrote {args.out} ({len(events)} events)", file=sys.stderr)
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
