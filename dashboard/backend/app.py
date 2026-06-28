"""Argon-Monitoring – kleines Backend.

Liest die MQTT-Telemetrie der ESPHome-Durchflussmesser, akkumuliert Verbrauch in
stündliche Buckets (SQLite) und liefert REST-API + statisches Dashboard.

MQTT-Vertrag (pro Anlage, vom ESPHome-Gerät):
    iwb/argon/<machine_id>/status   retained  "online" | "offline"
    iwb/argon/<machine_id>/flow                Nl/min   (Momentandurchfluss)
    iwb/argon/<machine_id>/total               Nl       (monoton, persistent)
    iwb/argon/<machine_id>/voltage             V        (Diagnose)

Start:
    pip install -r requirements.txt
    python app.py            # liest config.json, startet MQTT + Webserver :8000
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

BASE = Path(__file__).parent
CONFIG = json.loads((BASE / "config.json").read_text(encoding="utf-8"))
MACHINES = json.loads((BASE / "machines.json").read_text(encoding="utf-8"))
DB_PATH = BASE / CONFIG.get("db_file", "argon.db")
FRONTEND = BASE.parent / "frontend"

DEPARTMENTS = MACHINES["departments"]
MACHINE_LIST = MACHINES["machines"]            # [{id,name,dept}]
MACHINE_BY_ID = {m["id"]: m for m in MACHINE_LIST}
DEPT_NAME = {d["id"]: d["name"] for d in DEPARTMENTS}

_lock = threading.Lock()
_last_total: dict[str, float] = {}             # machine_id -> letzter Total-Wert (Nl)


# --------------------------------------------------------------------------- DB
def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    with db() as c:
        c.execute(
            "CREATE TABLE IF NOT EXISTS hourly ("
            " machine TEXT, hour_ts INTEGER, nl REAL,"
            " PRIMARY KEY (machine, hour_ts))"
        )
        c.execute(
            "CREATE TABLE IF NOT EXISTS live ("
            " machine TEXT PRIMARY KEY, flow REAL, total REAL,"
            " voltage REAL, status TEXT, updated INTEGER)"
        )
    # letzten Total je Maschine laden, damit Deltas einen Neustart überstehen
    with db() as c:
        for mid, total in c.execute("SELECT machine, total FROM live WHERE total IS NOT NULL"):
            if total is not None:
                _last_total[mid] = total


def hour_start(ts: float) -> int:
    dt = datetime.fromtimestamp(ts).replace(minute=0, second=0, microsecond=0)
    return int(dt.timestamp())


def add_consumption(machine: str, delta_nl: float, ts: float) -> None:
    h = hour_start(ts)
    with _lock, db() as c:
        c.execute(
            "INSERT INTO hourly(machine,hour_ts,nl) VALUES(?,?,?) "
            "ON CONFLICT(machine,hour_ts) DO UPDATE SET nl = nl + excluded.nl",
            (machine, h, delta_nl),
        )


def update_live(machine: str, **fields) -> None:
    fields["updated"] = int(time.time())
    cols = ", ".join(fields)
    ph = ", ".join("?" for _ in fields)
    upd = ", ".join(f"{k}=excluded.{k}" for k in fields)
    with _lock, db() as c:
        c.execute(
            f"INSERT INTO live(machine,{cols}) VALUES(?,{ph}) "
            f"ON CONFLICT(machine) DO UPDATE SET {upd}",
            (machine, *fields.values()),
        )


# ------------------------------------------------------------------------- MQTT
def on_message(client, userdata, msg):
    parts = msg.topic.split("/")          # iwb / argon / <machine_id> / <leaf>
    if len(parts) != 4:
        return
    machine, leaf = parts[2], parts[3]
    if machine not in MACHINE_BY_ID:
        return
    payload = msg.payload.decode("utf-8", "ignore").strip()

    if leaf == "status":
        update_live(machine, status=payload)
    elif leaf == "flow":
        try:
            update_live(machine, flow=float(payload))
        except ValueError:
            pass
    elif leaf == "voltage":
        try:
            update_live(machine, voltage=float(payload))
        except ValueError:
            pass
    elif leaf == "total":
        try:
            value = float(payload)
        except ValueError:
            return
        prev = _last_total.get(machine)
        _last_total[machine] = value
        update_live(machine, total=value)
        if prev is not None and value >= prev:      # value < prev => Geräte-Reset
            add_consumption(machine, value - prev, time.time())


# Laufzeit-Status für das Dashboard (read-only via /api/config).
_broker_state = {"embedded": False, "running": False, "ingest_connected": False, "port": None}


def _run_embedded_broker(bind: str, port: int, allow_anonymous: bool) -> None:
    """Kleiner eingebetteter MQTT-Broker (amqtt) in eigenem Thread + Event-Loop.

    Bindet i. d. R. an 0.0.0.0:1883 -> die ESPHome-Geräte verbinden sich mit der
    LAN-IP dieses PCs, der Ingest-Client unten verbindet sich lokal (127.0.0.1).
    """
    import asyncio
    import logging
    try:
        from amqtt.broker import Broker
    except ImportError:
        print("[broker] amqtt nicht installiert – eingebetteter Broker aus "
              "(pip install amqtt). Stattdessen externen Broker in config.json nutzen.")
        return
    for noisy in ("amqtt", "amqtt.broker", "transitions", "websockets"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    config = {
        "listeners": {"default": {"type": "tcp", "bind": f"{bind}:{port}"}},
        "plugins": {
            "amqtt.plugins.authentication.AnonymousAuthPlugin": {"allow_anonymous": bool(allow_anonymous)},
        },
    }

    async def _start():
        broker = Broker(config)          # muss in laufendem Loop erzeugt werden
        await broker.start()
        return broker

    try:
        loop.run_until_complete(_start())
        _broker_state["running"] = True
        print(f"[broker] eingebetteter MQTT-Broker läuft auf {bind}:{port} "
              f"(anonym={allow_anonymous})")
        loop.run_forever()
    except Exception as exc:                          # noqa: BLE001
        _broker_state["running"] = False
        print(f"[broker] Start auf {bind}:{port} fehlgeschlagen: {exc}")


def start_mqtt() -> None:
    m = CONFIG["mqtt"]
    embedded = bool(m.get("embedded", True))
    port = int(m.get("port", 1883))
    _broker_state.update(embedded=embedded, port=port)

    if embedded:
        threading.Thread(
            target=_run_embedded_broker,
            args=(m.get("bind", "0.0.0.0"), port, m.get("allow_anonymous", True)),
            daemon=True,
        ).start()
        host = "127.0.0.1"               # Ingest verbindet sich immer lokal zum Broker
    else:
        host = m.get("broker", "127.0.0.1")

    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        print("[mqtt] paho-mqtt nicht installiert – kein Ingest "
              "(pip install paho-mqtt für Live-Telemetrie).")
        return

    client = mqtt.Client(client_id="argon-backend", clean_session=True)
    if m.get("username"):
        client.username_pw_set(m["username"], m.get("password", ""))

    def _on_connect(c, userdata, flags, rc, properties=None):
        _broker_state["ingest_connected"] = (rc == 0)
        print(f"[mqtt] Ingest verbunden mit {host}:{port} (rc={rc}), abonniere iwb/argon/#")
        c.subscribe("iwb/argon/#")

    def _on_disconnect(c, userdata, *args):
        _broker_state["ingest_connected"] = False

    client.on_connect = _on_connect
    client.on_disconnect = _on_disconnect
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=1, max_delay=10)
    # connect_async + loop_start: verbindet sich, sobald der (lokale) Broker oben ist,
    # und reconnectet automatisch – ohne den Serverstart zu blockieren.
    client.connect_async(host, port, keepalive=30)
    client.loop_start()


# -------------------------------------------------------------------- Aggregate
def read_hourly(machine: str, since_ts: int) -> dict[int, float]:
    with db() as c:
        rows = c.execute(
            "SELECT hour_ts, nl FROM hourly WHERE machine=? AND hour_ts>=?",
            (machine, since_ts),
        ).fetchall()
    return {ts: nl for ts, nl in rows}


def read_live() -> dict[str, dict]:
    with db() as c:
        rows = c.execute(
            "SELECT machine, flow, total, voltage, status, updated FROM live"
        ).fetchall()
    out = {}
    for machine, flow, total, voltage, status, updated in rows:
        out[machine] = dict(flow=flow, total=total, voltage=voltage,
                            status=status, updated=updated)
    return out


def build_payload() -> dict:
    now = datetime.now()
    today0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_starts = [today0 - timedelta(days=29 - i) for i in range(30)]   # 30 Tage, heute zuletzt
    hour_starts = [today0 + timedelta(hours=h) for h in range(24)]       # 24 Stunden von heute
    earliest = int(day_starts[0].timestamp())

    live = read_live()
    cfg = CONFIG
    stale = cfg.get("stale_seconds", 120)
    leak = cfg.get("leak", {"min": 0.2, "active": 1.0})
    now_ts = int(time.time())

    machines = []
    for m in MACHINE_LIST:
        mid = m["id"]
        buckets = read_hourly(mid, earliest)
        daily = [
            round(sum(buckets.get(int((d + timedelta(hours=h)).timestamp()), 0.0)
                      for h in range(24)), 2)
            for d in day_starts
        ]
        hourly = [round(buckets.get(int(h.timestamp()), 0.0), 2) for h in hour_starts]

        lv = live.get(mid, {})
        fresh = lv.get("updated") and (now_ts - lv["updated"] <= stale)
        status = lv.get("status") or "offline"
        flow = float(lv.get("flow") or 0.0) if fresh else 0.0
        if not fresh:
            status = "offline"

        machines.append({
            "id": mid, "name": m["name"],
            "deptId": m["dept"], "deptName": DEPT_NAME.get(m["dept"], m["dept"]),
            "daily": daily, "hourly": hourly,
            "flow": round(flow, 2), "status": status,
            "total": round(float(lv.get("total") or 0.0), 1),
            "anomaly": detect_anomaly(daily, flow, status, leak),
        })

    return {
        "now": int(now.timestamp() * 1000),
        "pricePerM3": cfg.get("price_per_m3", 120),
        "refDates": [int(d.timestamp() * 1000) for d in day_starts],
        "departments": DEPARTMENTS,
        "machines": machines,
    }


def detect_anomaly(daily: list[float], flow: float, status: str, leak: dict):
    """Einfache, dokumentierte Heuristiken (in config.json justierbar)."""
    # Leck / Leerlauf-Fluss: online, fließt, aber unterhalb der Aktiv-Schwelle
    if status == "online" and leak["min"] <= flow < leak["active"]:
        level = "critical" if flow >= (leak["min"] + leak["active"]) / 2 else "warning"
        return {"type": "leak", "level": level, "pct": 0.0}
    # Mehrverbrauch: Mittel der letzten 7 Tage vs. Mittel der davorliegenden 21 Tage.
    # Gleiche Wochenfenster -> Wochenend-Anteil hebt sich heraus.
    recent = daily[-7:]
    base = daily[-28:-7]
    if base and sum(base) > 0 and sum(recent) > 0:
        mean_recent = sum(recent) / len(recent)
        mean_base = sum(base) / len(base)
        if mean_base > 0:
            pct = mean_recent / mean_base - 1.0
            if pct >= 0.30:
                return {"type": "over", "level": "critical", "pct": round(pct, 2)}
            if pct >= 0.15:
                return {"type": "over", "level": "warning", "pct": round(pct, 2)}
    return None


# --------------------------------------------------------------------------- API
app = FastAPI(title="Argon Monitoring Backend")


@app.get("/api/data")
def api_data():
    return JSONResponse(build_payload())


@app.get("/api/health")
def api_health():
    return {"ok": True, "machines": len(MACHINE_LIST),
            "broker": CONFIG["mqtt"].get("broker", "127.0.0.1"),
            "embedded_broker": _broker_state}


@app.get("/api/config")
def api_get_config():
    """Aktuelle, im Dashboard editierbare Einstellungen (ohne Klartext-Passwort)."""
    m = CONFIG.get("mqtt", {})
    return {
        "price_per_m3": CONFIG.get("price_per_m3", 120),
        "stale_seconds": CONFIG.get("stale_seconds", 120),
        "leak": CONFIG.get("leak", {"min": 0.2, "active": 1.0}),
        "mqtt": {
            "embedded": m.get("embedded", True),
            "bind": m.get("bind", "0.0.0.0"),
            "port": m.get("port", 1883),
            "allow_anonymous": m.get("allow_anonymous", True),
            "username": m.get("username", ""),
            "has_password": bool(m.get("password")),
            "broker": m.get("broker", "127.0.0.1"),
        },
        "status": {
            "embedded_running": _broker_state.get("running", False),
            "ingest_connected": _broker_state.get("ingest_connected", False),
        },
    }


@app.post("/api/config")
async def api_set_config(req: Request):
    """Einstellungen aus dem Dashboard übernehmen und nach config.json schreiben.

    Preis/Schwellwerte greifen sofort (werden pro Request gelesen). Broker-bezogene
    Felder werden erst nach einem Neustart des Backends aktiv -> restart_required.
    """
    try:
        body = await req.json()
    except Exception:                                  # noqa: BLE001
        return JSONResponse({"ok": False, "error": "invalid JSON"}, status_code=400)

    restart = False
    try:
        if "price_per_m3" in body:
            CONFIG["price_per_m3"] = float(body["price_per_m3"])
        if "stale_seconds" in body:
            CONFIG["stale_seconds"] = int(body["stale_seconds"])
        if isinstance(body.get("leak"), dict):
            leak = CONFIG.setdefault("leak", {})
            if body["leak"].get("min") is not None:
                leak["min"] = float(body["leak"]["min"])
            if body["leak"].get("active") is not None:
                leak["active"] = float(body["leak"]["active"])
        if isinstance(body.get("mqtt"), dict):
            mq = CONFIG.setdefault("mqtt", {})
            bm = body["mqtt"]
            for k in ("embedded", "allow_anonymous"):
                if k in bm and bool(bm[k]) != bool(mq.get(k)):
                    mq[k] = bool(bm[k]); restart = True
            if "bind" in bm and str(bm["bind"]) != mq.get("bind"):
                mq["bind"] = str(bm["bind"]); restart = True
            if "broker" in bm and str(bm["broker"]) != mq.get("broker"):
                mq["broker"] = str(bm["broker"]); restart = True
            if "port" in bm and int(bm["port"]) != int(mq.get("port", 1883)):
                mq["port"] = int(bm["port"]); restart = True
            if "username" in bm and str(bm["username"]) != mq.get("username", ""):
                mq["username"] = str(bm["username"]); restart = True
            if bm.get("password"):                     # leer => unverändert
                mq["password"] = str(bm["password"]); restart = True
    except (TypeError, ValueError) as exc:
        return JSONResponse({"ok": False, "error": f"bad value: {exc}"}, status_code=400)

    (BASE / "config.json").write_text(
        json.dumps(CONFIG, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"ok": True, "restart_required": restart}


# Statisches Frontend unter / ausliefern
app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")


if __name__ == "__main__":
    init_db()
    start_mqtt()
    port = int(os.environ.get("PORT", CONFIG.get("port", 8000)))
    uvicorn.run(app, host=CONFIG.get("host", "0.0.0.0"), port=port)
