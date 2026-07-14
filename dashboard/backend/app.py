"""Gas-Monitoring – kleines Backend (Argon + Stickstoff).

Liest die MQTT-Telemetrie der ESPHome-Durchflussmesser, akkumuliert Verbrauch in
stündliche Buckets (SQLite) und liefert REST-API + statisches Dashboard.

Sensoren identifizieren sich über eine hardware-spezifische ID (MAC-abgeleitet) und
veröffentlichen gas-neutral. Zuordnung (Name, Gas, Abteilung, Leck-/Downtime-Regeln)
geschieht im Dashboard und liegt in sensors.json.

MQTT-Vertrag (pro Sensor):
    iwb/gas/<id>/status   retained  "online" | "offline"
    iwb/gas/<id>/flow                Nl/min   (Momentandurchfluss)
    iwb/gas/<id>/total               Nl       (monoton, persistent)
    iwb/gas/<id>/voltage             V        (Diagnose)
    iwb/gas/<id>/cmd     <-          "reset"  (Gesamtzähler des Geräts nullen)

Start:
    pip install -r requirements.txt
    python app.py            # liest config.json + sensors.json, startet Broker + Webserver :8000
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
SENSORS_FILE = BASE / "sensors.json"
DB_PATH = BASE / CONFIG.get("db_file", "argon.db")
FRONTEND = BASE.parent / "frontend"

GAS_ORDER = ("argon", "nitrogen")

_lock = threading.Lock()
_last_total: dict[str, float] = {}             # sensor_id -> letzter Total-Wert (Nl)

# ---------------------------------------------------------------- Sensor-Registry
SENSORS: dict[str, dict] = {}                  # id -> {id,name,gas,dept,leak?,downtime?}
DEPARTMENTS: list[dict] = []


def load_sensors() -> None:
    global DEPARTMENTS
    data = json.loads(SENSORS_FILE.read_text(encoding="utf-8"))
    DEPARTMENTS = data.get("departments", [])
    SENSORS.clear()
    for s in data.get("sensors", []):
        SENSORS[s["id"]] = s


def save_sensors() -> None:
    payload = {"departments": DEPARTMENTS, "sensors": list(SENSORS.values())}
    with _lock:
        SENSORS_FILE.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def dept_name(dept_id: str | None) -> str:
    for d in DEPARTMENTS:
        if d["id"] == dept_id:
            return d["name"]
    return dept_id or "—"


def default_leak() -> dict:
    return dict(CONFIG.get("defaults", {}).get("leak", {"min": 0.2, "active": 1.0}))


def default_downtime() -> dict:
    return json.loads(json.dumps(CONFIG.get("defaults", {}).get(
        "downtime", {"enabled": False, "max_nl": 0.0, "windows": []})))


def sensor_leak(s: dict) -> dict:
    return s.get("leak") or default_leak()


def sensor_downtime(s: dict) -> dict:
    return s.get("downtime") or default_downtime()


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
        c.execute(
            "CREATE TABLE IF NOT EXISTS alarms ("
            " id INTEGER PRIMARY KEY AUTOINCREMENT, sensor TEXT, gas TEXT, type TEXT,"
            " level TEXT, value REAL, raised_at INTEGER,"
            " acknowledged INTEGER DEFAULT 0, ack_at INTEGER, ack_value REAL)"
        )
    with db() as c:
        for sid, total in c.execute("SELECT machine, total FROM live WHERE total IS NOT NULL"):
            if total is not None:
                _last_total[sid] = total


def hour_start(ts: float) -> int:
    dt = datetime.fromtimestamp(ts).replace(minute=0, second=0, microsecond=0)
    return int(dt.timestamp())


def add_consumption(sensor: str, delta_nl: float, ts: float) -> None:
    h = hour_start(ts)
    with _lock, db() as c:
        c.execute(
            "INSERT INTO hourly(machine,hour_ts,nl) VALUES(?,?,?) "
            "ON CONFLICT(machine,hour_ts) DO UPDATE SET nl = nl + excluded.nl",
            (sensor, h, delta_nl),
        )


def update_live(sensor: str, **fields) -> None:
    fields["updated"] = int(time.time())
    cols = ", ".join(fields)
    ph = ", ".join("?" for _ in fields)
    upd = ", ".join(f"{k}=excluded.{k}" for k in fields)
    with _lock, db() as c:
        c.execute(
            f"INSERT INTO live(machine,{cols}) VALUES(?,{ph}) "
            f"ON CONFLICT(machine) DO UPDATE SET {upd}",
            (sensor, *fields.values()),
        )


# ------------------------------------------------------------------------ Alarms
def raise_alarm(sensor: str, gas: str, atype: str, level: str, value: float, now_ts: int,
                *, max_nl: float | None = None) -> None:
    """Alarm anlegen – mit Dedup und Re-Arm nach Quittierung.

    Aktiver (unquittierter) Alarm gleichen Typs -> nur aktualisieren. Nach Quittierung:
    Leck/Mehrverbrauch erst nach 6 h Ruhe erneut; Downtime erst, wenn seit Quittierung
    erneut max_nl zusätzlich verbraucht wurde.
    """
    with _lock, db() as c:
        row = c.execute(
            "SELECT id, acknowledged, ack_at, ack_value FROM alarms "
            "WHERE sensor=? AND type=? ORDER BY id DESC LIMIT 1", (sensor, atype)).fetchone()
        if row:
            aid, ack, ack_at, ack_value = row
            if not ack:
                c.execute("UPDATE alarms SET level=?, value=?, gas=? WHERE id=?",
                          (level, value, gas, aid))
                return
            if atype == "downtime":
                if ack_value is not None and value <= ack_value + (max_nl or 0):
                    return
            elif ack_at and (now_ts - ack_at) < 6 * 3600:
                return
        c.execute(
            "INSERT INTO alarms(sensor,gas,type,level,value,raised_at) VALUES(?,?,?,?,?,?)",
            (sensor, gas, atype, level, value, now_ts))


def ack_alarm(aid: int) -> bool:
    now = int(time.time())
    with _lock, db() as c:
        cur = c.execute(
            "UPDATE alarms SET acknowledged=1, ack_at=?, ack_value=value "
            "WHERE id=? AND acknowledged=0", (now, aid))
        return cur.rowcount > 0


def active_alarms() -> list[dict]:
    with db() as c:
        rows = c.execute(
            "SELECT id, sensor, gas, type, level, value, raised_at FROM alarms "
            "WHERE acknowledged=0 ORDER BY raised_at DESC").fetchall()
    out = []
    for aid, sensor, gas, atype, level, value, raised_at in rows:
        s = SENSORS.get(sensor, {})
        out.append({"id": aid, "sensor": sensor, "sensorName": s.get("name", sensor),
                    "gas": gas, "deptName": dept_name(s.get("dept")),
                    "type": atype, "level": level, "value": value, "raised_at": raised_at})
    return out


# ------------------------------------------------------------------------- MQTT
_mqtt_client = None


def on_message(client, userdata, msg):
    parts = msg.topic.split("/")          # iwb / gas / <id> / <leaf>
    if len(parts) != 4 or parts[0] != "iwb" or parts[1] != "gas":
        return
    sid, leaf = parts[2], parts[3]
    if leaf == "cmd":
        return                            # eigene Kommandos ignorieren
    if sid not in SENSORS:                # neuer Sensor -> unassigned anlegen
        SENSORS[sid] = {"id": sid, "name": sid, "gas": None, "dept": None}
        save_sensors()
    payload = msg.payload.decode("utf-8", "ignore").strip()

    if leaf == "status":
        update_live(sid, status=payload)
    elif leaf == "flow":
        try:
            update_live(sid, flow=float(payload))
        except ValueError:
            pass
    elif leaf == "voltage":
        try:
            update_live(sid, voltage=float(payload))
        except ValueError:
            pass
    elif leaf == "total":
        try:
            value = float(payload)
        except ValueError:
            return
        prev = _last_total.get(sid)
        _last_total[sid] = value
        update_live(sid, total=value)
        if prev is not None and value >= prev:      # value < prev => Geräte-Reset
            add_consumption(sid, value - prev, time.time())


# Laufzeit-Status für das Dashboard (read-only via /api/config).
_broker_state = {"embedded": False, "running": False, "ingest_connected": False, "port": None}


def _run_embedded_broker(bind: str, port: int, allow_anonymous: bool) -> None:
    """Kleiner eingebetteter MQTT-Broker (amqtt) in eigenem Thread + Event-Loop."""
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
    global _mqtt_client
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

    client = mqtt.Client(client_id="gas-backend", clean_session=True)
    if m.get("username"):
        client.username_pw_set(m["username"], m.get("password", ""))

    def _on_connect(c, userdata, flags, rc, properties=None):
        _broker_state["ingest_connected"] = (rc == 0)
        print(f"[mqtt] Ingest verbunden mit {host}:{port} (rc={rc}), abonniere iwb/gas/#")
        c.subscribe("iwb/gas/#")

    def _on_disconnect(c, userdata, *args):
        _broker_state["ingest_connected"] = False

    client.on_connect = _on_connect
    client.on_disconnect = _on_disconnect
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=1, max_delay=10)
    client.connect_async(host, port, keepalive=30)
    client.loop_start()
    _mqtt_client = client


def publish_reset(sensor_id: str) -> bool:
    """Reset-Kommando an das Gerät senden (Gesamtzähler nullen)."""
    if _mqtt_client is None:
        return False
    _mqtt_client.publish(f"iwb/gas/{sensor_id}/cmd", "reset")
    return True


# -------------------------------------------------------------------- Aggregate
def read_hourly(sensor: str, since_ts: int) -> dict[int, float]:
    with db() as c:
        rows = c.execute(
            "SELECT hour_ts, nl FROM hourly WHERE machine=? AND hour_ts>=?",
            (sensor, since_ts),
        ).fetchall()
    return {ts: nl for ts, nl in rows}


def read_live() -> dict[str, dict]:
    with db() as c:
        rows = c.execute(
            "SELECT machine, flow, total, voltage, status, updated FROM live"
        ).fetchall()
    out = {}
    for sensor, flow, total, voltage, status, updated in rows:
        out[sensor] = dict(flow=flow, total=total, voltage=voltage,
                           status=status, updated=updated)
    return out


def _parse_hhmm(s: str) -> tuple[int, int]:
    h, m = s.split(":")
    return int(h), int(m)


def active_window_start(now: datetime, windows: list[dict]) -> datetime | None:
    """Startzeitpunkt des aktuell laufenden Downtime-Fensters – oder None."""
    for back in (0, 1):                    # heute + gestern (für Fenster über Mitternacht)
        day = now - timedelta(days=back)
        wd = day.weekday()
        for w in windows:
            if wd not in w.get("days", []):
                continue
            sh, sm = _parse_hhmm(w.get("start", "00:00"))
            start_dt = day.replace(hour=sh, minute=sm, second=0, microsecond=0)
            end_str = w.get("end", "24:00")
            if end_str == "24:00":
                end_dt = day.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
            else:
                eh, em = _parse_hhmm(end_str)
                end_dt = start_dt.replace(hour=eh, minute=em)
                if end_dt <= start_dt:
                    end_dt += timedelta(days=1)
            if start_dt <= now < end_dt:
                return start_dt
    return None


def downtime_window_volume(sensor: str, start_dt: datetime) -> float:
    buckets = read_hourly(sensor, hour_start(start_dt.timestamp()))
    return sum(buckets.values())


def over_consumption(daily: list[float]):
    """Mehrverbrauch: Mittel der letzten 7 Tage vs. der 21 Tage davor."""
    recent = daily[-7:]
    base = daily[-28:-7]
    if base and sum(base) > 0 and sum(recent) > 0:
        mean_recent = sum(recent) / len(recent)
        mean_base = sum(base) / len(base)
        if mean_base > 0:
            pct = mean_recent / mean_base - 1.0
            if pct >= 0.30:
                return ("critical", round(pct, 2))
            if pct >= 0.15:
                return ("warning", round(pct, 2))
    return None


def evaluate_sensor_alarms(s: dict, daily: list[float], flow: float,
                           status: str, now: datetime, now_ts: int) -> None:
    """Alarme für einen (zugeordneten) Sensor prüfen und ggf. anlegen."""
    sid, gas = s["id"], s["gas"]
    leak = sensor_leak(s)
    if status == "online" and leak["min"] <= flow < leak["active"]:
        level = "critical" if flow >= (leak["min"] + leak["active"]) / 2 else "warning"
        raise_alarm(sid, gas, "leak", level, round(flow, 2), now_ts)

    over = over_consumption(daily)
    if over:
        raise_alarm(sid, gas, "over", over[0], over[1], now_ts)

    dt = sensor_downtime(s)
    if dt.get("enabled") and dt.get("max_nl", 0) > 0:
        start_dt = active_window_start(now, dt.get("windows", []))
        if start_dt:
            vol = downtime_window_volume(sid, start_dt)
            if vol > dt["max_nl"]:
                raise_alarm(sid, gas, "downtime", "critical", round(vol, 1),
                            now_ts, max_nl=dt["max_nl"])


def build_payload() -> dict:
    now = datetime.now()
    now_ts = int(time.time())
    today0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_starts = [today0 - timedelta(days=29 - i) for i in range(30)]
    hour_starts = [today0 + timedelta(hours=h) for h in range(24)]
    earliest = int(day_starts[0].timestamp())

    live = read_live()
    stale = CONFIG.get("stale_seconds", 120)

    sensors_out, unassigned = [], []
    for s in SENSORS.values():
        sid = s["id"]
        buckets = read_hourly(sid, earliest)
        daily = [
            round(sum(buckets.get(int((d + timedelta(hours=h)).timestamp()), 0.0)
                      for h in range(24)), 2)
            for d in day_starts
        ]
        hourly = [round(buckets.get(int(h.timestamp()), 0.0), 2) for h in hour_starts]

        lv = live.get(sid, {})
        fresh = lv.get("updated") and (now_ts - lv["updated"] <= stale)
        status = (lv.get("status") or "offline") if fresh else "offline"
        flow = float(lv.get("flow") or 0.0) if fresh else 0.0
        total = round(float(lv.get("total") or 0.0), 1)

        if not s.get("gas"):
            unassigned.append({"id": sid, "name": s.get("name", sid),
                               "status": status, "flow": round(flow, 2), "total": total,
                               "lastSeen": lv.get("updated")})
            continue

        evaluate_sensor_alarms(s, daily, flow, status, now, now_ts)
        sensors_out.append({
            "id": sid, "name": s.get("name", sid), "gas": s["gas"],
            "deptId": s.get("dept"), "deptName": dept_name(s.get("dept")),
            "daily": daily, "hourly": hourly,
            "flow": round(flow, 2), "status": status, "total": total,
        })

    alarms = active_alarms()
    sev = {"warning": 1, "critical": 2}
    top: dict[str, dict] = {}
    for a in alarms:
        cur = top.get(a["sensor"])
        if cur is None or sev[a["level"]] > sev[cur["level"]]:
            top[a["sensor"]] = a
    for so in sensors_out:
        a = top.get(so["id"])
        so["anomaly"] = {"type": a["type"], "level": a["level"], "value": a["value"]} if a else None

    gcfg = CONFIG.get("gases", {})
    gases_out = [{"id": g, "name": gcfg.get(g, {}).get("name", g.title()),
                  "pricePerM3": gcfg.get(g, {}).get("price_per_m3", 120)}
                 for g in GAS_ORDER if g in gcfg]

    return {
        "now": int(now.timestamp() * 1000),
        "refDates": [int(d.timestamp() * 1000) for d in day_starts],
        "gases": gases_out,
        "departments": DEPARTMENTS,
        "sensors": sensors_out,
        "unassigned": unassigned,
        "alarms": alarms,
    }


# --------------------------------------------------------------------------- API
app = FastAPI(title="Gas Monitoring Backend")


@app.get("/api/data")
def api_data():
    return JSONResponse(build_payload())


@app.get("/api/health")
def api_health():
    return {"ok": True, "sensors": len(SENSORS),
            "broker": CONFIG["mqtt"].get("broker", "127.0.0.1"),
            "embedded_broker": _broker_state}


@app.get("/api/sensors")
def api_get_sensors():
    """Registry inkl. Live-Status für den Sensor-Editor."""
    live = read_live()
    now_ts = int(time.time())
    stale = CONFIG.get("stale_seconds", 120)
    out = []
    for s in SENSORS.values():
        lv = live.get(s["id"], {})
        fresh = lv.get("updated") and (now_ts - lv["updated"] <= stale)
        out.append({
            "id": s["id"], "name": s.get("name", s["id"]),
            "gas": s.get("gas"), "dept": s.get("dept"),
            "leak": sensor_leak(s), "downtime": sensor_downtime(s),
            "online": bool(fresh and (lv.get("status") == "online")),
            "total": round(float(lv.get("total") or 0.0), 1),
            "lastSeen": lv.get("updated"),
        })
    return {"sensors": out, "departments": DEPARTMENTS, "gases": CONFIG.get("gases", {})}


@app.post("/api/sensors/{sid}")
async def api_set_sensor(sid: str, req: Request):
    if sid not in SENSORS:
        return JSONResponse({"ok": False, "error": "unknown sensor"}, status_code=404)
    try:
        body = await req.json()
    except Exception:                                  # noqa: BLE001
        return JSONResponse({"ok": False, "error": "invalid JSON"}, status_code=400)
    s = SENSORS[sid]
    if "name" in body:
        s["name"] = str(body["name"]).strip() or sid
    if "gas" in body:
        gas = body["gas"]
        if gas not in (None, "argon", "nitrogen") and gas not in CONFIG.get("gases", {}):
            return JSONResponse({"ok": False, "error": "bad gas"}, status_code=400)
        s["gas"] = gas or None
    if "dept" in body:
        s["dept"] = body["dept"] or None
    if isinstance(body.get("leak"), dict):
        try:
            s["leak"] = {"min": float(body["leak"]["min"]), "active": float(body["leak"]["active"])}
        except (KeyError, TypeError, ValueError):
            return JSONResponse({"ok": False, "error": "bad leak"}, status_code=400)
    if isinstance(body.get("downtime"), dict):
        s["downtime"] = body["downtime"]
    save_sensors()
    return {"ok": True, "sensor": s}


@app.post("/api/sensors/{sid}/reset")
def api_reset_sensor(sid: str):
    if sid not in SENSORS:
        return JSONResponse({"ok": False, "error": "unknown sensor"}, status_code=404)
    ok = publish_reset(sid)
    return {"ok": ok, "error": None if ok else "no mqtt client"}


@app.delete("/api/sensors/{sid}")
def api_delete_sensor(sid: str):
    if sid in SENSORS:
        del SENSORS[sid]
        save_sensors()
    return {"ok": True}


@app.post("/api/alarms/{aid}/ack")
def api_ack_alarm(aid: int):
    return {"ok": ack_alarm(aid)}


@app.post("/api/departments")
async def api_departments(req: Request):
    """Abteilung anlegen oder umbenennen ({id?, name})."""
    try:
        body = await req.json()
    except Exception:                                  # noqa: BLE001
        return JSONResponse({"ok": False, "error": "invalid JSON"}, status_code=400)
    name = str(body.get("name", "")).strip()
    if not name:
        return JSONResponse({"ok": False, "error": "name required"}, status_code=400)
    did = body.get("id") or name.lower().replace(" ", "-")
    for d in DEPARTMENTS:
        if d["id"] == did:
            d["name"] = name
            save_sensors()
            return {"ok": True, "id": did}
    DEPARTMENTS.append({"id": did, "name": name})
    save_sensors()
    return {"ok": True, "id": did}


@app.get("/api/config")
def api_get_config():
    m = CONFIG.get("mqtt", {})
    return {
        "stale_seconds": CONFIG.get("stale_seconds", 120),
        "gases": CONFIG.get("gases", {}),
        "defaults": CONFIG.get("defaults", {}),
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
    """Einstellungen übernehmen und nach config.json schreiben.

    Preise/Defaults greifen sofort; Broker-Felder erst nach Neustart -> restart_required.
    """
    try:
        body = await req.json()
    except Exception:                                  # noqa: BLE001
        return JSONResponse({"ok": False, "error": "invalid JSON"}, status_code=400)

    restart = False
    try:
        if "stale_seconds" in body:
            CONFIG["stale_seconds"] = int(body["stale_seconds"])
        if isinstance(body.get("gases"), dict):
            gases = CONFIG.setdefault("gases", {})
            for gid, gv in body["gases"].items():
                if gid in gases and isinstance(gv, dict) and gv.get("price_per_m3") is not None:
                    gases[gid]["price_per_m3"] = float(gv["price_per_m3"])
        if isinstance(body.get("defaults"), dict):
            dfl = CONFIG.setdefault("defaults", {})
            bd = body["defaults"]
            if isinstance(bd.get("leak"), dict):
                dfl.setdefault("leak", {})
                if bd["leak"].get("min") is not None:
                    dfl["leak"]["min"] = float(bd["leak"]["min"])
                if bd["leak"].get("active") is not None:
                    dfl["leak"]["active"] = float(bd["leak"]["active"])
            if isinstance(bd.get("downtime"), dict):
                dfl["downtime"] = bd["downtime"]
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
            if bm.get("password"):
                mq["password"] = str(bm["password"]); restart = True
    except (TypeError, ValueError) as exc:
        return JSONResponse({"ok": False, "error": f"bad value: {exc}"}, status_code=400)

    (BASE / "config.json").write_text(
        json.dumps(CONFIG, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"ok": True, "restart_required": restart}


# Statisches Frontend unter / ausliefern
app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")


if __name__ == "__main__":
    load_sensors()
    init_db()
    start_mqtt()
    port = int(os.environ.get("PORT", CONFIG.get("port", 8000)))
    uvicorn.run(app, host=CONFIG.get("host", "0.0.0.0"), port=port)
