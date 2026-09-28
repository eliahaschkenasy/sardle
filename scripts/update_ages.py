"""Refresh player ages (and club/position) in data/players.js.

ligadle.app only exposes a player's current age through its guess endpoint, so we
send one guess per player (in fresh 9-guess sessions) and read back `ageValue`.
Players with a `birthDate` are skipped; the page computes their age itself.

Usage: python scripts/update_ages.py [--force]
Without --force the script exits early if the data is already from today (Israel date).
"""

import datetime
import http.cookiejar
import json
import re
import sys
import threading
import time
import urllib.request
from zoneinfo import ZoneInfo

PATH = "data/players.js"
API = "https://ligadle.app/api/game/guess"
WORKERS = 2
GUESSES_PER_SESSION = 9
MAX_TRIES = 5
MAX_FAIL_RATIO = 0.05

def israel_today():
    # ligadle.app's own game date is what its ages are computed against.
    try:
        req = urllib.request.Request("https://ligadle.app/api/game/status", headers={"User-Agent": "Mozilla/5.0"})
        return json.load(urllib.request.urlopen(req, timeout=40))["date"]
    except Exception:
        return datetime.datetime.now(ZoneInfo("Asia/Jerusalem")).date().isoformat()


today = israel_today()
src = open(PATH, encoding="utf-8").read()
players = json.loads(re.search(r"window\.PLAYERS=(\[.*\]);", src, re.S).group(1))
as_of = re.search(r'window\.PLAYERS_AS_OF="([\d-]+)"', src)
as_of = as_of.group(1) if as_of else None

if as_of == today and "--force" not in sys.argv:
    print(f"Data already from {today}, nothing to do.")
    sys.exit(0)

todo = [p for p in players if not p.get("birthDate")]
results, failed = {}, []
lock = threading.Lock()


def new_session():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def worker(batch):
    op, used = new_session(), 0
    for p in batch:
        for attempt in range(MAX_TRIES):
            if used >= GUESSES_PER_SESSION:
                op, used = new_session(), 0
            req = urllib.request.Request(
                API,
                data=json.dumps({"playerId": p["id"]}).encode(),
                headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (sardle age refresh)"},
            )
            try:
                g = json.load(op.open(req, timeout=40))
                used += 1
                if "playerId" not in g:
                    raise ValueError(g)
                with lock:
                    results[p["id"]] = g
                if g.get("gameOver"):
                    op, used = new_session(), 0
                break
            except Exception as e:  # network hiccup or exhausted session: retry in a new one
                print(f"retry {p['id']} ({attempt + 1}/{MAX_TRIES}): {e}", flush=True)
                op, used = new_session(), 0
                time.sleep(3 * (attempt + 1))
        else:
            with lock:
                failed.append(p["id"])
        time.sleep(0.2)


threads = [threading.Thread(target=worker, args=(todo[i::WORKERS],)) for i in range(WORKERS)]
for t in threads:
    t.start()
for t in threads:
    t.join()

changes = []
for p in players:
    g = results.get(p["id"])
    if not g:
        continue
    for field, key in (("age", "ageValue"), ("club", "clubName"), ("position", "positionLabel"), ("group", "positionGroup")):
        new = g.get(key)
        if new is not None and new != p.get(field):
            changes.append(f"{p['id']} {field}: {p.get(field)} -> {new}")
            p[field] = new

ok = len(failed) <= MAX_FAIL_RATIO * len(todo)
new_as_of = today if ok else as_of
with open(PATH, "w", encoding="utf-8") as f:
    if new_as_of:
        f.write(f'window.PLAYERS_AS_OF="{new_as_of}";\n')
    f.write("window.PLAYERS=" + json.dumps(players, ensure_ascii=False, separators=(",", ":")) + ";\n")

print(f"Checked {len(results)}/{len(todo)} players, {len(failed)} failed, {len(changes)} changes.")
for c in changes:
    print("  " + c)
if not ok:
    print(f"Too many failures ({len(failed)}): {failed}")
    sys.exit(1)
