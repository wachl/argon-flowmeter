"""Demo-Simulator für das Argon-Dashboard (ohne echte Hardware).

Zwei Funktionen:
  python sim.py --seed [TAGE]   # schreibt synthetische Historie direkt in die DB
  python sim.py                 # publiziert live MQTT-Telemetrie für alle 16 Anlagen

Typischer Demo-Ablauf:
  python sim.py --seed 30       # 30 Tage Verlauf in die DB (Chart ist sofort gefüllt)
  python app.py                 # Backend + Dashboard starten (anderes Terminal)
  python sim.py                 # Live-Werte publizieren (Broker nötig)

Die Live-Werte brauchen einen MQTT-Broker (config.json). Die Seed-Funktion nicht.
"""
from __future__ import annotations

import argparse
import json
import math
import sqlite3
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

BASE = Path(__file__).parent
CONFIG = json.loads((BASE / "config.json").read_text(encoding="utf-8"))
MACHINES = json.loads((BASE / "machines.json").read_text(encoding="utf-8"))["machines"]
DB_PATH = BASE / CONFIG.get("db_file", "argon.db")

# Tagesbasisverbrauch (Nl/Tag) + Wochenend-Faktor + optionale Anomalie je Anlage
PROFILE = {
    "anlage-01": (3200, 0.40, None), "anlage-02": (3000, 0.40, None),
    "anlage-03": (2400, 0.40, None), "anlage-04": (7800, 0.40, ("leak",)),
    "anlage-05": (9800, 0.55, None), "anlage-06": (10400, 0.55, ("over", 0.45)),
    "anlage-07": (8700, 0.55, None), "anlage-08": (2600, 0.40, None),
    "anlage-09": (2900, 0.40, None), "anlage-10": (4100, 0.40, None),
    "anlage-11": (6400, 0.70, ("over", 0.17)), "anlage-12": (5900, 0.70, None),
    "anlage-13": (8200, 0.70, None), "anlage-14": (2200, 0.50, None),
    "anlage-15": (700, 0.50, None), "anlage-16": (1300, 0.50, None),
}
# Tagesgang (24 Stundengewichte): Tagschicht-lastig
WT = [0.18,0.16,0.15,0.15,0.18,0.30,0.62,0.86,1,1,1,0.95,0.80,0.95,1,1,0.95,0.80,0.60,0.45,0.35,0.28,0.22,0.20]
SUMW = sum(WT)


def rng_factory(seed):
    s = [seed & 0xFFFFFFFF]
    def r():
        s[0] = (s[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = s[0]
        t = (t ^ (t >> 15)) * (1 | t) & 0xFFFFFFFF
        t = (t + ((t ^ (t >> 7)) * (61 | t) & 0xFFFFFFFF) ^ t) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return r


def hour_ts(dt: datetime) -> int:
    return int(dt.replace(minute=0, second=0, microsecond=0).timestamp())


def daily_value(base, wkf, anomaly, day_index, days, r):
    v = base * wkf * (0.82 + 0.36 * r())
    if anomaly and anomaly[0] == "over" and day_index >= days - 7:   # nur die letzte Woche
        v *= 1 + anomaly[1]
    if anomaly and anomaly[0] == "leak":
        v += base * 0.42
    return v


def seed(days: int) -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("CREATE TABLE IF NOT EXISTS hourly (machine TEXT, hour_ts INTEGER, nl REAL, PRIMARY KEY (machine, hour_ts))")
    conn.execute("CREATE TABLE IF NOT EXISTS live (machine TEXT PRIMARY KEY, flow REAL, total REAL, voltage REAL, status TEXT, updated INTEGER)")
    today0 = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    n = 0
    for m in MACHINES:
        mid = m["id"]
        base, wkf, anomaly = PROFILE.get(mid, (3000, 0.5, None))
        r = rng_factory(sum(ord(ch) for ch in mid) * 7919 + 99173)
        for di in range(days):
            day = today0 - timedelta(days=days - 1 - di)
            wd = day.weekday()
            f = wkf if wd >= 5 else 1.0
            dv = daily_value(base, f, anomaly, di, days, r)
            for h in range(24):
                if day.date() == today0.date() and h > datetime.now().hour:
                    continue  # Zukunft des heutigen Tages leer lassen
                hv = dv * WT[h] / SUMW * (0.8 + 0.4 * r())
                if anomaly and anomaly[0] == "leak" and WT[h] < 0.30:
                    hv = max(hv, base * 0.42 / 22)
                ts = hour_ts(day + timedelta(hours=h))
                conn.execute(
                    "INSERT INTO hourly(machine,hour_ts,nl) VALUES(?,?,?) "
                    "ON CONFLICT(machine,hour_ts) DO UPDATE SET nl=excluded.nl",
                    (mid, ts, round(hv, 2))
                )
                n += 1
    conn.commit(); conn.close()
    print(f"Seed fertig: {n} Stunden-Buckets fuer {len(MACHINES)} Anlagen ueber {days} Tage -> {DB_PATH}")


def live() -> None:
    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        sys.exit("paho-mqtt fehlt: pip install -r requirements.txt")
    mc = CONFIG["mqtt"]
    client = mqtt.Client(client_id="argon-sim")
    if mc.get("username"):
        client.username_pw_set(mc["username"], mc.get("password", ""))
    client.connect(mc["broker"], mc.get("port", 1883), 30)
    client.loop_start()

    totals = {m["id"]: PROFILE.get(m["id"], (3000, .5, None))[0] * 30.0 for m in MACHINES}
    for m in MACHINES:
        client.publish(f"iwb/argon/{m['id']}/status", "online", retain=True)
    print("Live-Simulation läuft – STRG+C zum Beenden.")
    interval = 3.0
    try:
        while True:
            now = datetime.now()
            h = now.hour
            for m in MACHINES:
                mid = m["id"]
                base, wkf, anomaly = PROFILE.get(mid, (3000, 0.5, None))
                wkf = wkf if now.weekday() >= 5 else 1.0
                daily = base * wkf
                rate = daily * WT[h] / SUMW / 60.0          # Nl/min im Mittel dieser Stunde
                rate *= 0.8 + 0.4 * (0.5 + 0.5 * math.sin(time.time() / 7 + len(mid)))
                if anomaly and anomaly[0] == "leak" and rate < 0.4:
                    rate = 0.4                                # Leerlauf-Leck
                rate = max(0.0, rate)
                totals[mid] += rate * (interval / 60.0)
                client.publish(f"iwb/argon/{mid}/flow", f"{rate:.2f}")
                client.publish(f"iwb/argon/{mid}/total", f"{totals[mid]:.1f}")
                client.publish(f"iwb/argon/{mid}/voltage", f"{24.0 + 0.2*math.sin(time.time()/30):.2f}")
            time.sleep(interval)
    except KeyboardInterrupt:
        for m in MACHINES:
            client.publish(f"iwb/argon/{m['id']}/status", "offline", retain=True)
        client.loop_stop()
        print("\nbeendet.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", nargs="?", const=30, type=int, metavar="TAGE",
                    help="Synthetische Historie in die DB schreiben (Standard 30 Tage)")
    args = ap.parse_args()
    if args.seed is not None:
        seed(args.seed)
    else:
        live()
