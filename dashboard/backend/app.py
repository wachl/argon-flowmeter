"""Gas-Monitoring – kleines Backend (Argon + Stickstoff).

Liest die MQTT-Telemetrie der ESPHome-Durchflussmesser, akkumuliert Verbrauch in
stündliche Buckets (SQLite) und liefert REST-API + statisches Dashboard.

Sensoren identifizieren sich über ihre konfigurierte machine_id (Firmware-Substitution)
und veröffentlichen gas-neutral. Zuordnung (Name, Gas, Abteilung, Leck-/Downtime-Regeln)
geschieht im Dashboard und liegt in sensors.json. Unbekannte IDs werden automatisch als
"nicht zugeordnet" registriert und im Dashboard zugewiesen.

MQTT-Vertrag (pro Sensor, Präfix iwb/gas/ – neues Schema – oder iwb/argon/ – Bestands-
Firmware; beide werden ingestiert und auf dieselbe Sensor-ID gemappt):
    iwb/gas/<id>/status   retained  "online" | "offline"
    iwb/gas/<id>/flow                Nl/min   (Momentandurchfluss)
    iwb/gas/<id>/total               Nl       (monoton, persistent)
    iwb/gas/<id>/voltage             V        (Diagnose)
    iwb/gas/<id>/meta     retained   JSON {ip, mac, hostname, sp, fw} (Einheits-Firmware)
    iwb/gas/<id>/cmd     <-          "reset"  (Gesamtzähler des Geräts nullen)

Start:
    pip install -r requirements.txt
    python app.py            # liest config.json + sensors.json, startet Broker + Webserver :8000
"""
from __future__ import annotations

import ipaddress
import json
import os
import re
import sqlite3
import subprocess
import sys
import threading
import time
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

BASE = Path(__file__).parent
CONFIG = json.loads((BASE / "config.json").read_text(encoding="utf-8"))
SENSORS_FILE = BASE / "sensors.json"
DB_PATH = BASE / CONFIG.get("db_file", "gas.db")
FRONTEND = BASE.parent / "frontend"


def _migrate_legacy_db() -> None:
    """Alte argon.db (samt WAL/SHM) einmalig auf den neuen DB-Namen umziehen."""
    legacy = BASE / "argon.db"
    if DB_PATH.name == legacy.name or DB_PATH.exists() or not legacy.exists():
        return
    for suffix in ("", "-wal", "-shm"):
        src = BASE / (legacy.name + suffix)
        if src.exists():
            src.rename(BASE / (DB_PATH.name + suffix))
    print(f"[db] {legacy.name} -> {DB_PATH.name} migriert")

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


def _write_json(path: Path, payload) -> None:
    """Atomar schreiben (tmp + rename), damit ein Absturz keine halbe Datei hinterlässt."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def save_sensors() -> None:
    payload = {"departments": DEPARTMENTS, "sensors": list(SENSORS.values())}
    with _lock:
        _write_json(SENSORS_FILE, payload)


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


def norm_leak(raw) -> dict | None:
    """Leck-Schwellen prüfen/normalisieren. None bei ungültiger Eingabe."""
    if not isinstance(raw, dict):
        return None
    try:
        mn, ac = float(raw["min"]), float(raw["active"])
    except (KeyError, TypeError, ValueError):
        return None
    if not (0 <= mn < ac):
        return None
    return {"min": mn, "active": ac}


def norm_downtime(raw) -> dict | None:
    """Downtime-Regel prüfen/normalisieren. None bei ungültiger Eingabe.

    Erwartet {enabled, max_nl, windows:[{days:[0-6 – Mo=0], start:"HH:MM", end:"HH:MM"|"24:00"}]}.
    """
    if not isinstance(raw, dict):
        return None

    def _valid_time(t: str, allow_24: bool) -> bool:
        try:
            h, m = _parse_hhmm(t)
        except (AttributeError, TypeError, ValueError):
            return False
        if allow_24 and (h, m) == (24, 0):
            return True
        return 0 <= h <= 23 and 0 <= m <= 59

    try:
        enabled = bool(raw.get("enabled", False))
        max_nl = float(raw.get("max_nl", 0.0))
        if max_nl < 0:
            return None
        windows = []
        for w in raw.get("windows", []) or []:
            days = sorted({int(d) for d in w.get("days", [])})
            start = str(w.get("start", "00:00"))
            end = str(w.get("end", "24:00"))
            if any(d < 0 or d > 6 for d in days):
                return None
            if not _valid_time(start, allow_24=False) or not _valid_time(end, allow_24=True):
                return None
            windows.append({"days": days, "start": start, "end": end})
    except (TypeError, ValueError):
        return None
    return {"enabled": enabled, "max_nl": max_nl, "windows": windows}


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
            " voltage REAL, status TEXT, updated INTEGER, meta TEXT)"
        )
        # Migration: meta-Spalte (Geräte-Metadaten der Einheits-Firmware) nachrüsten
        cols = [r[1] for r in c.execute("PRAGMA table_info(live)")]
        if "meta" not in cols:
            c.execute("ALTER TABLE live ADD COLUMN meta TEXT")
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

# Nur wohlgeformte Sensor-IDs registrieren: schuetzt Registry und Frontend vor
# kaputten/fremden Topics (MQTT-Topic-Level duerfen fast beliebige Zeichen enthalten).
_SID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_legacy_purged: set[str] = set()


def on_message(client, userdata, msg):
    parts = msg.topic.split("/")          # iwb / gas|argon / <id> / <leaf>
    if len(parts) != 4 or parts[0] != "iwb" or parts[1] not in ("gas", "argon"):
        return
    sid, leaf = parts[2], parts[3]
    if leaf == "cmd":
        return                            # eigene Kommandos ignorieren
    if not _SID_RE.match(sid):
        return
    payload = msg.payload.decode("utf-8", "ignore").strip()
    if not payload:
        return                            # leere Nachrichten (retained-Loeschungen)
    if sid not in SENSORS:                # neuer Sensor -> unassigned anlegen
        # Aber nicht aus alten retained-Resten (z. B. geloeschte Geist-IDs nach
        # einer Anlagen-ID-Aenderung): Registrierung nur durch Live-Nachrichten
        # (retain-Flag setzt der Broker nur bei Zustellung aus dem Retained-Store)
        # oder ein retained "online" (Birth-Message eines laufenden Geraets).
        if msg.retain and not (leaf == "status" and payload == "online"):
            return
        SENSORS[sid] = {"id": sid, "name": sid, "gas": None, "dept": None}
        save_sensors()

    if leaf == "status":
        update_live(sid, status=payload)
        # Geraet publiziert auf dem neuen Praefix -> veraltetes retained-Status-Flag
        # unter iwb/argon/ einmalig loeschen. Sonst liefert der Broker es bei jedem
        # Backend-Neustart erneut aus und meldet ein offline-Geraet als "online".
        if parts[1] == "gas" and sid not in _legacy_purged:
            _legacy_purged.add(sid)
            client.publish(f"iwb/argon/{sid}/status", payload=None, retain=True)
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
    elif leaf == "meta":
        # Geräte-Metadaten der Einheits-Firmware (retained JSON):
        # {ip, mac, hostname, sp, fw} -> IP-Link + SP-Anzeige im Sensor-Manager
        try:
            if isinstance(json.loads(payload), dict):
                update_live(sid, meta=payload)
        except ValueError:
            pass


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

    # paho-mqtt 2.x verlangt die Callback-API-Version als erstes Argument;
    # unsere Callback-Signaturen sind mit VERSION2 und 1.x kompatibel.
    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                             client_id="gas-backend", clean_session=True)
    except AttributeError:                             # paho-mqtt 1.x
        client = mqtt.Client(client_id="gas-backend", clean_session=True)
    if m.get("username"):
        client.username_pw_set(m["username"], m.get("password", ""))

    def _on_connect(c, userdata, flags, rc, properties=None):
        # rc: int (paho 1.x) oder ReasonCode (2.x)
        ok = (not rc.is_failure) if hasattr(rc, "is_failure") else (rc == 0)
        _broker_state["ingest_connected"] = ok
        print(f"[mqtt] Ingest verbunden mit {host}:{port} (rc={rc}), "
              "abonniere iwb/gas/# + iwb/argon/#")
        c.subscribe([("iwb/gas/#", 0), ("iwb/argon/#", 0)])

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
    """Reset-Kommando an das Gerät senden (Gesamtzähler nullen).

    Auf beiden Topic-Schemata, damit auch Bestands-Firmware (iwb/argon/) reagiert.
    """
    if _mqtt_client is None or not _mqtt_client.is_connected():
        return False
    _mqtt_client.publish(f"iwb/gas/{sensor_id}/cmd", "reset")
    _mqtt_client.publish(f"iwb/argon/{sensor_id}/cmd", "reset")
    return True


# ------------------------------------------------------- Firmware-Verwaltung
# Build (esphome compile) und OTA-Updates laufen als Subprozess auf dem
# Dashboard-PC; der Web-Flasher (ESP Web Tools, Erstflash per USB) bekommt
# Manifest + factory.bin ueber /api/firmware/. Es laeuft max. ein Job zugleich.
FIRMWARE_DIR = BASE.parent.parent / "firmware"
FIRMWARE_YAML = FIRMWARE_DIR / "gas-flowmeter.yaml"
FW_BUILD_DIR = FIRMWARE_DIR / ".esphome" / "build" / "gas-flow" / ".pioenvs" / "gas-flow"
FW_FACTORY_BIN = FW_BUILD_DIR / "firmware.factory.bin"
FW_OTA_BIN = FW_BUILD_DIR / "firmware.ota.bin"

_fw_lock = threading.Lock()
_fw_job: dict = {"type": None, "target": None, "running": False, "ok": None,
                 "started": None, "finished": None, "log": deque(maxlen=300)}

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def _fw_run_job(jtype: str, args: list[str], target: str | None, timeout: int) -> None:
    """esphome-Subprozess ausfuehren und Ausgabe in das Job-Log spiegeln."""
    ok = False
    try:
        proc = subprocess.Popen(
            [sys.executable, "-m", "esphome", *args],
            cwd=str(FIRMWARE_DIR), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace",
        )
        deadline = time.time() + timeout
        for line in proc.stdout:
            _fw_job["log"].append(_ANSI_RE.sub("", line.rstrip())[:300])
            if time.time() > deadline:
                proc.kill()
                _fw_job["log"].append(f"[abbruch] Timeout nach {timeout} s")
                break
        ok = proc.wait(timeout=30) == 0
    except Exception as exc:                           # noqa: BLE001
        _fw_job["log"].append(f"[fehler] {exc}")
    _fw_job.update(running=False, ok=ok, finished=int(time.time()))
    print(f"[firmware] Job {jtype} ({target or '-'}) beendet: {'OK' if ok else 'FEHLER'}")


def start_fw_job(jtype: str, args: list[str], target: str | None, timeout: int) -> bool:
    """Job starten; False, wenn bereits einer laeuft."""
    with _fw_lock:
        if _fw_job["running"]:
            return False
        _fw_job.update(type=jtype, target=target, running=True, ok=None,
                       started=int(time.time()), finished=None)
        _fw_job["log"].clear()
        _fw_job["log"].append(f"[start] esphome {' '.join(args)}")
    threading.Thread(target=_fw_run_job, args=(jtype, args, target, timeout),
                     daemon=True).start()
    return True


def fw_info() -> dict:
    def _bin(p: Path) -> dict | None:
        if not p.exists():
            return None
        st = p.stat()
        return {"size": st.st_size, "mtime": int(st.st_mtime)}
    return {
        "yaml_exists": FIRMWARE_YAML.exists(),
        "factory": _bin(FW_FACTORY_BIN),
        "ota": _bin(FW_OTA_BIN),
        "job": {
            "type": _fw_job["type"], "target": _fw_job["target"],
            "running": _fw_job["running"], "ok": _fw_job["ok"],
            "started": _fw_job["started"], "finished": _fw_job["finished"],
            "log": list(_fw_job["log"])[-40:],
        },
    }


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
            "SELECT machine, flow, total, voltage, status, updated, meta FROM live"
        ).fetchall()
    out = {}
    for sensor, flow, total, voltage, status, updated, meta in rows:
        out[sensor] = dict(flow=flow, total=total, voltage=voltage,
                           status=status, updated=updated, meta=meta)
    return out


def parse_meta(raw: str | None) -> dict:
    """Geräte-Metadaten (JSON-String aus live.meta) tolerant parsen."""
    if not raw:
        return {}
    try:
        m = json.loads(raw)
    except ValueError:
        return {}
    return m if isinstance(m, dict) else {}


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
    """Mehrverbrauch: Mittel der letzten 7 vollen Tage vs. der 21 Tage davor.

    Der laufende (unvollstaendige) heutige Tag bleibt aussen vor — er wuerde den
    Mittelwert der letzten Woche sonst tageszeitabhaengig nach unten druecken.
    """
    recent = daily[-8:-1]
    base = daily[-29:-8]
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
    for s in list(SENSORS.values()):      # Snapshot: Registry kann parallel mutieren
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
            meta = parse_meta(lv.get("meta"))
            unassigned.append({"id": sid, "name": s.get("name", sid),
                               "status": status, "flow": round(flow, 2), "total": total,
                               "lastSeen": lv.get("updated"),
                               "ip": meta.get("ip"), "hostname": meta.get("hostname")})
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

    # Gase komplett config-getrieben (Reihenfolge = Reihenfolge in config.json)
    gases_out = [{"id": g, "name": gv.get("name", g.title()),
                  "pricePerM3": gv.get("price_per_m3", 0)}
                 for g, gv in CONFIG.get("gases", {}).items()]

    return {
        "now": int(now.timestamp() * 1000),
        "refDates": [int(d.timestamp() * 1000) for d in day_starts],
        "gases": gases_out,
        "departments": DEPARTMENTS,
        "sensors": sensors_out,
        "unassigned": unassigned,
        "alarms": alarms,
        "broker": {
            "embedded": _broker_state.get("embedded", False),
            "embedded_running": _broker_state.get("running", False),
            "ingest_connected": _broker_state.get("ingest_connected", False),
        },
    }


def _alarm_loop() -> None:
    """Alarme minuetlich auswerten, auch wenn niemand das Dashboard offen hat.

    build_payload() prueft alle Sensor-Alarme als Seiteneffekt. Ohne diesen Loop
    wuerden fenstergebundene Alarme (Downtime nachts, Leck am Wochenende) nur
    erfasst, solange ein Browser /api/data pollt.
    """
    while True:
        time.sleep(60)
        try:
            build_payload()
        except Exception as exc:                       # noqa: BLE001
            print(f"[alarms] Auswertung fehlgeschlagen: {exc}")


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
    """Registry inkl. Live-Status für den Sensor-Editor.

    leak/downtime sind die Sensor-Overrides (null = Standardwerte greifen);
    die Standardwerte selbst stehen in defaults.
    """
    live = read_live()
    now_ts = int(time.time())
    stale = CONFIG.get("stale_seconds", 120)
    out = []
    for s in list(SENSORS.values()):
        lv = live.get(s["id"], {})
        fresh = lv.get("updated") and (now_ts - lv["updated"] <= stale)
        out.append({
            "id": s["id"], "name": s.get("name", s["id"]),
            "gas": s.get("gas"), "dept": s.get("dept"),
            "leak": s.get("leak"), "downtime": s.get("downtime"),
            "online": bool(fresh and (lv.get("status") == "online")),
            "flow": round(float(lv.get("flow") or 0.0), 2) if fresh else 0.0,
            "total": round(float(lv.get("total") or 0.0), 1),
            "lastSeen": lv.get("updated"),
            # Geräte-Metadaten der Einheits-Firmware ({} bei Bestands-Firmware)
            "meta": parse_meta(lv.get("meta")),
        })
    return {"sensors": out, "departments": DEPARTMENTS, "gases": CONFIG.get("gases", {}),
            "defaults": {"leak": default_leak(), "downtime": default_downtime()}}


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
        if gas is not None and gas not in CONFIG.get("gases", {}):
            return JSONResponse({"ok": False, "error": "bad gas"}, status_code=400)
        s["gas"] = gas or None
    if "dept" in body:
        dept = body["dept"] or None
        if dept is not None and not any(d["id"] == dept for d in DEPARTMENTS):
            return JSONResponse({"ok": False, "error": "unknown dept"}, status_code=400)
        s["dept"] = dept
    if "leak" in body:                     # null -> Override entfernen (Defaults greifen)
        if body["leak"] is None:
            s.pop("leak", None)
        else:
            leak = norm_leak(body["leak"])
            if leak is None:
                return JSONResponse(
                    {"ok": False, "error": "bad leak (0 <= min < active)"}, status_code=400)
            s["leak"] = leak
    if "downtime" in body:                 # null -> Override entfernen (Defaults greifen)
        if body["downtime"] is None:
            s.pop("downtime", None)
        else:
            dt = norm_downtime(body["downtime"])
            if dt is None:
                return JSONResponse({"ok": False, "error": "bad downtime"}, status_code=400)
            s["downtime"] = dt
    save_sensors()
    return {"ok": True, "sensor": s}


@app.post("/api/sensors/{sid}/reset")
def api_reset_sensor(sid: str):
    if sid not in SENSORS:
        return JSONResponse({"ok": False, "error": "unknown sensor"}, status_code=404)
    ok = publish_reset(sid)
    return {"ok": ok, "error": None if ok else "no mqtt client"}


@app.get("/api/firmware")
def api_firmware_info():
    """Status der Firmware-Verwaltung: Builds, laufender Job, Log-Ausschnitt."""
    return fw_info()


@app.post("/api/firmware/build")
def api_firmware_build():
    """Firmware neu bauen (esphome compile) — Voraussetzung fuer Flash/OTA."""
    if not FIRMWARE_YAML.exists():
        return JSONResponse({"ok": False, "error": f"{FIRMWARE_YAML} fehlt"}, status_code=500)
    if not start_fw_job("build", ["compile", FIRMWARE_YAML.name], None, timeout=900):
        return JSONResponse({"ok": False, "error": "es läuft bereits ein Job"}, status_code=409)
    return {"ok": True}


@app.post("/api/sensors/{sid}/ota")
def api_sensor_ota(sid: str):
    """OTA-Update: aktuellen Build auf das Gerät schieben (IP aus dem meta-Topic)."""
    if sid not in SENSORS:
        return JSONResponse({"ok": False, "error": "unknown sensor"}, status_code=404)
    if not FW_OTA_BIN.exists():
        return JSONResponse({"ok": False, "error": "kein Build vorhanden — erst bauen"},
                            status_code=400)
    ip = parse_meta(read_live().get(sid, {}).get("meta")).get("ip")
    try:
        ipaddress.ip_address(ip)
    except (TypeError, ValueError):
        return JSONResponse({"ok": False, "error": "Geräte-IP unbekannt (kein meta-Topic — "
                            "Bestands-Firmware? Einmal per USB/CLI flashen)"}, status_code=400)
    if not start_fw_job("ota", ["upload", FIRMWARE_YAML.name, "--device", ip], sid, timeout=300):
        return JSONResponse({"ok": False, "error": "es läuft bereits ein Job"}, status_code=409)
    return {"ok": True, "ip": ip}


@app.get("/api/firmware/manifest.json")
def api_firmware_manifest():
    """ESP-Web-Tools-Manifest fuer den Erstflash per USB (Web Serial)."""
    if not FW_FACTORY_BIN.exists():
        return JSONResponse({"error": "kein Build vorhanden"}, status_code=404)
    version = datetime.fromtimestamp(FW_FACTORY_BIN.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
    return {
        "name": "Gas-Durchflussmesser (iwb)",
        "version": version,
        "new_install_prompt_erase": True,
        "builds": [{"chipFamily": "ESP32",
                    "parts": [{"path": "factory.bin", "offset": 0}]}],
    }


@app.get("/api/firmware/factory.bin")
def api_firmware_factory():
    if not FW_FACTORY_BIN.exists():
        return JSONResponse({"error": "kein Build vorhanden"}, status_code=404)
    return FileResponse(str(FW_FACTORY_BIN), media_type="application/octet-stream",
                        filename="gas-flowmeter.factory.bin")


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
    if body.get("id"):                     # explizite ID -> Umbenennen
        did = str(body["id"])
        for d in DEPARTMENTS:
            if d["id"] == did:
                d["name"] = name
                save_sensors()
                return {"ok": True, "id": did}
        return JSONResponse({"ok": False, "error": "unknown dept"}, status_code=404)
    # Neu anlegen: ID als sauberer Slug, bei Kollision durchnummerieren
    # (sonst wuerde eine Namensdopplung stillschweigend die bestehende Abteilung umbenennen)
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "abteilung"
    did, n = slug, 2
    while any(d["id"] == did for d in DEPARTMENTS):
        did = f"{slug}-{n}"
        n += 1
    DEPARTMENTS.append({"id": did, "name": name})
    save_sensors()
    return {"ok": True, "id": did}


@app.delete("/api/departments/{did}")
def api_delete_department(did: str):
    """Abteilung löschen; zugeordnete Sensoren werden auf 'keine Abteilung' gesetzt."""
    global DEPARTMENTS
    if not any(d["id"] == did for d in DEPARTMENTS):
        return JSONResponse({"ok": False, "error": "unknown dept"}, status_code=404)
    DEPARTMENTS = [d for d in DEPARTMENTS if d["id"] != did]
    for s in SENSORS.values():
        if s.get("dept") == did:
            s["dept"] = None
    save_sensors()
    return {"ok": True}


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
            if "leak" in bd:
                leak = norm_leak(bd["leak"])
                if leak is None:
                    return JSONResponse(
                        {"ok": False, "error": "bad leak (0 <= min < active)"}, status_code=400)
                dfl["leak"] = leak
            if "downtime" in bd:
                dt = norm_downtime(bd["downtime"])
                if dt is None:
                    return JSONResponse({"ok": False, "error": "bad downtime"}, status_code=400)
                dfl["downtime"] = dt
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

    _write_json(BASE / "config.json", CONFIG)
    return {"ok": True, "restart_required": restart}


# Statisches Frontend unter / ausliefern
app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")


if __name__ == "__main__":
    load_sensors()
    _migrate_legacy_db()
    init_db()
    start_mqtt()
    threading.Thread(target=_alarm_loop, daemon=True).start()
    port = int(os.environ.get("PORT", CONFIG.get("port", 8000)))
    uvicorn.run(app, host=CONFIG.get("host", "0.0.0.0"), port=port)
