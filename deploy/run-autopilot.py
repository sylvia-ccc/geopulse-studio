#!/usr/bin/env python3
"""Daily queue attempt and private aggregate feedback. Never sends outreach emails."""
import argparse
import json
import os
from pathlib import Path
import sqlite3
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def environment(path):
    values = {}
    for raw in Path(path).read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("\"'")
    return values


def snapshot(database):
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    def grouped(table, field, where="", args=()):
        return dict(connection.execute(f"SELECT {field},COUNT(*) FROM {table} {where} GROUP BY {field}", args))
    result = {
        "time": datetime.now(timezone.utc).isoformat(),
        "windowDays": 7,
        "telemetry": grouped("telemetry_events", "event_type", "WHERE created_at >= ?", (since,)),
        "leads": grouped("outreach_leads", "status"),
        "sendAttempts": grouped("email_send_attempts", "status", "WHERE created_at >= ?", (since,)),
        "queue": grouped("growth_topics", "status"),
        "articles": grouped("articles", "status"),
        "paymentReceiptCount": connection.execute("SELECT COUNT(*) FROM payment_webhook_events").fetchone()[0],
        "interpretation": "Requests are nonunique; bot identities are UA claims; API acceptance is not delivery; payment receipt count is not verified revenue.",
    }
    connection.close()
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="/opt/geopulse-studio")
    parser.add_argument("--snapshot-only", action="store_true")
    args = parser.parse_args()
    root = Path(args.root)
    os.umask(0o077)
    measurement = snapshot(root / "data/geopulse.sqlite")
    if not args.snapshot_only:
        env = environment(root / ".env")
        secret = env.get("CRON_SECRET", "")
        if not secret:
            raise RuntimeError("CRON_SECRET is not configured")
        request = Request("http://127.0.0.1:3100/api/cron/autopilot", data=b'{"action":"run_next"}', headers={"Content-Type":"application/json", "Authorization":f"Bearer {secret}", "x-geopulse-test":"1"}, method="POST")
        try:
            with urlopen(request, timeout=120) as response:
                payload = json.loads(response.read(131072))
            measurement["queueAttempt"] = {"ok":bool(payload.get("ok")),"ran":bool(payload.get("ran")),"topicId":payload.get("topic",{}).get("id"),"status":payload.get("topic",{}).get("status")}
        except (HTTPError, URLError, TimeoutError, ValueError) as error:
            # No automatic retry: the upstream may have accepted a publication.
            measurement["queueAttempt"] = {"ok":False,"errorType":type(error).__name__,"httpStatus":getattr(error,"code",None),"retry":False}
    output = root / "data/growth-measurements.jsonl"
    with output.open("a") as handle:
        handle.write(json.dumps(measurement, ensure_ascii=False)+"\n")
    output.chmod(0o600)
    print(json.dumps(measurement, ensure_ascii=False))


if __name__ == "__main__":
    main()
