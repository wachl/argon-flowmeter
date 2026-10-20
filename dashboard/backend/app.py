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

import base64
import hashlib
import hmac
import importlib.util
import ipaddress
import json
import os
import re
import secrets as pysecrets
import shutil
import socket
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
# config.json ist lokal (gitignored, kann das MQTT-Passwort enthalten);
# beim ersten Start wird sie aus der eingecheckten Vorlage erzeugt.
if not (BASE / "config.json").exists():
    shutil.copyfile(BASE / "config.json.example", BASE / "config.json")
    print("[config] config.json aus config.json.example angelegt")
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


def save_config() -> None:
    with _lock:
        _write_json(BASE / "config.json", CONFIG)


# ------------------------------------------------------------------ Auth/Login
# Benutzer-Ebene: Ist ein admin_password gesetzt, ist das Dashboard ohne Login
# nur lesend (Live-Ansicht, Historie, Export); alle aendernden Aktionen und die
# Einstellungen verlangen ein Login-Token (HMAC-signiert, 30 Tage gueltig).
# Ohne admin_password bleibt alles offen (Erstinbetriebnahme).
TOKEN_TTL = 30 * 86400


def _ensure_auth_secret() -> None:
    if not CONFIG.get("auth_secret"):
        CONFIG["auth_secret"] = pysecrets.token_hex(32)
        save_config()


def make_token() -> str:
    _ensure_auth_secret()
    exp = int(time.time()) + TOKEN_TTL
    sig = hmac.new(CONFIG["auth_secret"].encode(), str(exp).encode(),
                   hashlib.sha256).hexdigest()
    return f"{exp}.{sig}"


def check_token(tok: str) -> bool:
    secret = CONFIG.get("auth_secret", "")
    if not secret or not tok:
        return False
    try:
        exp_s, sig = tok.split(".", 1)
        exp = int(exp_s)
    except ValueError:
        return False
    if exp < time.time():
        return False
    want = hmac.new(secret.encode(), exp_s.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, sig)


def auth_required() -> bool:
    return bool(CONFIG.get("admin_password"))


def is_admin(req) -> bool:
    if not auth_required():
        return True
    tok = req.headers.get("x-auth") or req.query_params.get("auth") or ""
    return check_token(tok)


def deny():
    return JSONResponse({"ok": False, "error": "login required"}, status_code=401)


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
        # Migration: auto_cleared markiert Alarme, die sich selbst aufgeloest
        # haben (z. B. Offline-Alarm, Geraet wieder online)
        acols = [r[1] for r in c.execute("PRAGMA table_info(alarms)")]
        if "auto_cleared" not in acols:
            c.execute("ALTER TABLE alarms ADD COLUMN auto_cleared INTEGER DEFAULT 0")
        # Migration: Alarm-Lebenszyklus ACTIVE -> ACK -> RESOLVED. "acknowledged"
        # hiess bisher "erledigt"; Bestandsdaten werden als RESOLVED uebernommen.
        if "resolved" not in acols:
            c.execute("ALTER TABLE alarms ADD COLUMN resolved INTEGER DEFAULT 0")
            c.execute("ALTER TABLE alarms ADD COLUMN resolved_at INTEGER")
            c.execute("UPDATE alarms SET resolved=1, resolved_at=ack_at WHERE acknowledged=1")
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
# Lebenszyklus: ACTIVE (offen) -> ACK (quittiert, Ursache besteht weiter, bleibt
# sichtbar) -> RESOLVED (erledigt, nur noch Historie). Re-Arm-Regeln greifen erst
# nach RESOLVED.
def raise_alarm(sensor: str, gas: str, atype: str, level: str, value: float, now_ts: int,
                *, max_nl: float | None = None, last_seen: int | None = None) -> None:
    """Alarm anlegen – mit Dedup und Re-Arm nach Aufloesung.

    Offener Alarm gleichen Typs (ACTIVE oder ACK) -> nur aktualisieren. Nach RESOLVED:
    Leck/Mehrverbrauch erst nach 6 h Ruhe erneut; Downtime erst, wenn seither erneut
    max_nl zusätzlich verbraucht wurde; Offline erst, wenn das Gerät seit der
    Aufloesung wieder online war (last_seen > resolved_at).
    """
    with _lock, db() as c:
        row = c.execute(
            "SELECT id, resolved, resolved_at, ack_value FROM alarms "
            "WHERE sensor=? AND type=? ORDER BY id DESC LIMIT 1", (sensor, atype)).fetchone()
        if row:
            aid, resolved, resolved_at, ack_value = row
            if not resolved:
                c.execute("UPDATE alarms SET level=?, value=?, gas=? WHERE id=?",
                          (level, value, gas, aid))
                return
            if atype == "downtime":
                if ack_value is not None and value <= ack_value + (max_nl or 0):
                    return
            elif atype == "offline":
                if resolved_at and last_seen is not None and resolved_at >= last_seen:
                    return                 # gleiche Offline-Phase, bereits erledigt
            elif resolved_at and (now_ts - resolved_at) < 6 * 3600:
                return
        c.execute(
            "INSERT INTO alarms(sensor,gas,type,level,value,raised_at) VALUES(?,?,?,?,?,?)",
            (sensor, gas, atype, level, value, now_ts))


def clear_offline_alarm(sensor: str) -> None:
    """Offline-Alarm automatisch aufloesen, sobald das Geraet wieder online ist."""
    now = int(time.time())
    with _lock, db() as c:
        c.execute(
            "UPDATE alarms SET acknowledged=1, ack_at=COALESCE(ack_at,?), resolved=1,"
            " resolved_at=?, ack_value=value, auto_cleared=1 "
            "WHERE sensor=? AND type='offline' AND resolved=0",
            (now, now, sensor))


def ack_alarm(aid: int) -> bool:
    """Quittieren: gesehen, Ursache besteht weiter — Alarm bleibt gelistet (ACK)."""
    now = int(time.time())
    with _lock, db() as c:
        cur = c.execute(
            "UPDATE alarms SET acknowledged=1, ack_at=? "
            "WHERE id=? AND acknowledged=0 AND resolved=0", (now, aid))
        return cur.rowcount > 0


def resolve_alarm(aid: int) -> bool:
    """Aufloesen: erledigt — wandert in die Historie, Re-Arm-Regeln starten."""
    now = int(time.time())
    with _lock, db() as c:
        cur = c.execute(
            "UPDATE alarms SET acknowledged=1, ack_at=COALESCE(ack_at,?),"
            " resolved=1, resolved_at=?, ack_value=value "
            "WHERE id=? AND resolved=0", (now, now, aid))
        return cur.rowcount > 0


def active_alarms() -> list[dict]:
    """Alle offenen Alarme (ACTIVE + ACK), neueste zuerst."""
    with db() as c:
        rows = c.execute(
            "SELECT id, sensor, gas, type, level, value, raised_at, acknowledged, ack_at "
            "FROM alarms WHERE resolved=0 ORDER BY raised_at DESC").fetchall()
    out = []
    for aid, sensor, gas, atype, level, value, raised_at, ack, ack_at in rows:
        s = SENSORS.get(sensor, {})
        out.append({"id": aid, "sensor": sensor, "sensorName": s.get("name", sensor),
                    "gas": gas, "deptName": dept_name(s.get("dept")),
                    "type": atype, "level": level, "value": value, "raised_at": raised_at,
                    "state": "ack" if ack else "active", "ack_at": ack_at})
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
_broker_state = {"embedded": False, "running": False, "ingest_connected": False,
                 "port": None, "auth": False}


def _run_embedded_broker(bind: str, port: int,
                         username: str | None, password: str | None) -> None:
    """Kleiner eingebetteter MQTT-Broker (amqtt) in eigenem Thread + Event-Loop.

    Auth ergibt sich aus den Zugangsdaten: Benutzer UND Passwort gesetzt ->
    der Broker prueft echte Logins (FileAuthPlugin, sha512-Hash-Datei —
    automatisch aus der Konfiguration erzeugt); sonst sind anonyme Clients
    erlaubt. (amqtts AnonymousAuthPlugin allein prueft KEINE Passwoerter.)
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

    auth = bool(username and password)
    if auth:
        from passlib.apps import custom_app_context   # amqtt-Dependency; gleicher
        pw_file = BASE / "mqtt_passwd"                # Kontext wie FileAuthPlugin.verify
        pw_file.write_text(f"{username}:{custom_app_context.hash(password)}\n",
                           encoding="utf-8")
        plugins = {"amqtt.plugins.authentication.FileAuthPlugin": {
            "password_file": str(pw_file)}}
        print(f"[broker] Passwort-Prüfung aktiv (Benutzer: {username})")
    else:
        plugins = {"amqtt.plugins.authentication.AnonymousAuthPlugin": {
            "allow_anonymous": True}}
    _broker_state["auth"] = auth

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    config = {
        "listeners": {"default": {"type": "tcp", "bind": f"{bind}:{port}"}},
        "plugins": plugins,
    }

    async def _start():
        broker = Broker(config)          # muss in laufendem Loop erzeugt werden
        await broker.start()
        return broker

    try:
        loop.run_until_complete(_start())
        _broker_state["running"] = True
        print(f"[broker] eingebetteter MQTT-Broker läuft auf {bind}:{port} "
              f"(auth={'an' if auth else 'aus'})")
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
            args=(m.get("bind", "0.0.0.0"), port,
                  m.get("username") or None, m.get("password") or None),
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
SECRETS_FILE = FIRMWARE_DIR / "secrets.yaml"
SECRETS_EXAMPLE = FIRMWARE_DIR / "secrets.yaml.example"
# Alle Schluessel, die gas-flowmeter.yaml per !secret einbindet.
SECRET_KEYS = ("mqtt_broker", "mqtt_user", "mqtt_password", "ota_password", "api_encryption_key")
_PLACEHOLDER_RE = re.compile(r"CHANGE_ME|REPLACE_WITH", re.I)
_LOCAL_HOSTS = {"127.0.0.1", "localhost", "0.0.0.0", "::1"}


# --------------------------------------------- firmware/secrets.yaml-Verwaltung
# Alle Werte, die gas-flowmeter.yaml per !secret einbindet, werden zur BUILD-ZEIT
# in die Firmware einkompiliert. Die Datei ist gitignored — damit ein frisch
# geklonter Server ohne Handarbeit bauen kann, verwaltet das Backend sie selbst:
#   - beim Start angelegt (ensure_secrets): Broker = LAN-IP dieses Rechners,
#     OTA-Passwort und API-Key werden zufaellig erzeugt
#   - mqtt_user/mqtt_password werden immer aus config.json gespiegelt
#     (config.json ist die Quelle der Wahrheit fuer den Broker)
#   - Broker-Adresse, OTA-Passwort und API-Key sind in der Administration
#     (MQTT-Broker -> Firmware-Secrets) einsehbar und aenderbar
#   - vor jedem Build wird die Datei auf Vollstaendigkeit geprueft
#     (secrets_problems) und ein klarer Fehler statt eines esphome-Stacktraces
#     zurueckgegeben.
def _secret_value(rest: str) -> str:
    rest = rest.strip()
    m = re.match(r'^"((?:[^"\\]|\\.)*)"', rest)
    if m:
        return m.group(1).replace('\\"', '"').replace("\\\\", "\\")
    return rest.split("#", 1)[0].strip().strip("'")


def read_secrets() -> dict[str, str]:
    out: dict[str, str] = {}
    if not SECRETS_FILE.exists():
        return out
    try:
        for line in SECRETS_FILE.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$", line)
            if m:
                out[m.group(1)] = _secret_value(m.group(2))
    except OSError:
        pass
    return out


def _q(v: str) -> str:
    return '"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"'


def write_secrets(updates: dict[str, str]) -> bool:
    """Schluessel in firmware/secrets.yaml setzen/ergaenzen (Kommentare bleiben).

    Fehlt die Datei, entsteht sie aus secrets.yaml.example (sonst leer).
    """
    if not FIRMWARE_DIR.exists():
        print(f"[secrets] Firmware-Ordner fehlt: {FIRMWARE_DIR}")
        return False
    try:
        if SECRETS_FILE.exists():
            lines = SECRETS_FILE.read_text(encoding="utf-8").splitlines()
        else:
            lines = (SECRETS_EXAMPLE.read_text(encoding="utf-8").splitlines()
                     if SECRETS_EXAMPLE.exists() else [])
            lines.insert(0, f"# Vom Dashboard angelegt am {datetime.now():%d.%m.%Y %H:%M} — "
                            "Werte: Administration -> MQTT-Broker -> Firmware-Secrets.")
        for key, val in updates.items():
            for i, line in enumerate(lines):
                if re.match(rf"^{key}\s*:", line):
                    lines[i] = f"{key}: {_q(val)}"
                    break
            else:
                lines.append(f"{key}: {_q(val)}")
        SECRETS_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return True
    except OSError as exc:
        print(f"[secrets] Schreiben fehlgeschlagen: {exc}")
        return False


def sync_secrets(username: str, password: str) -> bool:
    """mqtt_user/mqtt_password in firmware/secrets.yaml nachziehen."""
    return write_secrets({"mqtt_user": username, "mqtt_password": password})


def _api_key_ok(val: str) -> bool:
    """ESPHome verlangt fuer api.encryption.key genau 32 Byte als Base64."""
    try:
        return len(base64.b64decode(val, validate=True)) == 32
    except ValueError:
        return False


def _device_broker_default() -> str:
    """Broker-Adresse, die neue Geraete bekommen sollen."""
    mq = CONFIG.get("mqtt", {})
    if not mq.get("embedded", True):
        ext = str(mq.get("broker", "")).strip()
        if ext and ext not in _LOCAL_HOSTS:
            return ext
    return lan_ip() or ""


def ensure_secrets() -> dict[str, str]:
    """secrets.yaml anlegen bzw. vervollstaendigen; gibt den aktuellen Inhalt zurueck.

    Aufruf beim Backend-Start, vor jedem Build und nach dem Speichern in der
    Administration. Vorhandene, plausible Werte bleiben unangetastet — nur
    fehlende/leere Werte und Vorlagen-Platzhalter werden ersetzt.
    """
    if not FIRMWARE_YAML.exists():
        return read_secrets()
    sec = read_secrets()
    created = not SECRETS_FILE.exists()
    mq = CONFIG.get("mqtt", {})
    upd: dict[str, str] = {
        "mqtt_user": str(mq.get("username", "")),
        "mqtt_password": str(mq.get("password", "")),
    }
    broker = sec.get("mqtt_broker", "")
    if created or not broker or _PLACEHOLDER_RE.search(broker):
        upd["mqtt_broker"] = _device_broker_default()
    ota = sec.get("ota_password", "")
    if not ota or _PLACEHOLDER_RE.search(ota):
        upd["ota_password"] = pysecrets.token_hex(12)
    key = sec.get("api_encryption_key", "")
    if not key or _PLACEHOLDER_RE.search(key) or not _api_key_ok(key):
        upd["api_encryption_key"] = base64.b64encode(os.urandom(32)).decode()
    upd = {k: v for k, v in upd.items() if sec.get(k) != v}
    if upd:
        what = ", ".join(upd)
        if write_secrets(upd):
            print(f"[secrets] {SECRETS_FILE.name} {'angelegt' if created else 'ergänzt'} ({what})")
        sec = read_secrets()
    return sec


def secrets_problems() -> list[str]:
    """Gruende, warum ein Firmware-Build (noch) nicht moeglich ist (leer = ok)."""
    if not FIRMWARE_YAML.exists():
        return [f"{FIRMWARE_YAML.name} fehlt (Firmware-Ordner nicht ausgecheckt?)"]
    if not SECRETS_FILE.exists():
        return ["firmware/secrets.yaml fehlt — wird beim Backend-Start angelegt "
                "(Schreibrechte im Ordner firmware/ prüfen)"]
    sec = read_secrets()
    out: list[str] = []
    for key in SECRET_KEYS:
        if key not in sec:
            out.append(f"{key} fehlt")
    for key in ("mqtt_broker", "ota_password", "api_encryption_key"):
        val = sec.get(key)
        if val is None:
            continue
        if not val:
            out.append(f"{key} ist leer")
        elif _PLACEHOLDER_RE.search(val):
            out.append(f"{key} ist noch der Platzhalter aus der Vorlage")
    broker = sec.get("mqtt_broker", "")
    if broker and broker.split(":")[0].lower() in _LOCAL_HOSTS:
        out.append("mqtt_broker darf nicht localhost sein — die Geräte brauchen die "
                   "LAN-IP dieses Servers")
    key = sec.get("api_encryption_key", "")
    if key and not _PLACEHOLDER_RE.search(key) and not _api_key_ok(key):
        out.append("api_encryption_key ungültig (32 Byte, Base64)")
    return out


def secrets_warnings() -> list[str]:
    """Hinweise, die den Build nicht blockieren, aber im Betrieb auffallen wuerden."""
    sec = read_secrets()
    mq = CONFIG.get("mqtt", {})
    out: list[str] = []
    if _PLACEHOLDER_RE.search(str(mq.get("password", ""))):
        out.append("MQTT-Passwort ist noch der Vorlagenwert aus config.json.example — "
                   "vor dem Produktivbetrieb ändern")
    broker = sec.get("mqtt_broker", "")
    if broker:
        if mq.get("embedded", True):
            ip = lan_ip()
            if ip and broker != ip:
                out.append(f"mqtt_broker ({broker}) ≠ LAN-IP dieses Servers ({ip}) — "
                           "die Geräte verbinden sich mit dem eingebetteten Broker hier")
        else:
            ext = str(mq.get("broker", "")).strip()
            if ext and broker != ext:
                out.append(f"mqtt_broker ({broker}) ≠ externer Broker ({ext})")
    return out


_esphome_cache: dict = {"ok": None, "ts": 0.0}


def esphome_available() -> bool:
    """Ist das esphome-Python-Paket im Interpreter des Backends installiert?"""
    if time.time() - _esphome_cache["ts"] < 15 and _esphome_cache["ok"] is not None:
        return _esphome_cache["ok"]
    try:
        ok = importlib.util.find_spec("esphome") is not None
    except (ImportError, ValueError):
        ok = False
    _esphome_cache.update(ok=ok, ts=time.time())
    return ok


def _esphome_requirement() -> str:
    """esphome-Pin aus requirements.txt (eine Quelle der Wahrheit fuer die Version)."""
    try:
        for line in (BASE / "requirements.txt").read_text(encoding="utf-8").splitlines():
            spec = line.split("#", 1)[0].strip()
            if re.match(r"^esphome\b", spec, re.I):
                return spec
    except OSError:
        pass
    return "esphome"


_lan_ip_cache: dict = {"ip": None, "ts": 0.0}


def lan_ip() -> str | None:
    """LAN-IP dieses PCs (= Broker-Adresse fuer die Geraete bei eingebettetem Broker).

    UDP-connect sendet kein Paket, liefert aber die Quell-IP der gewaehlten Route.
    Probiert werden das Internet (Default-Route) und private Netze, damit auch
    eine VM ohne Internetzugang ihre LAN-Adresse findet.
    """
    if time.time() - _lan_ip_cache["ts"] < 60 and _lan_ip_cache["ip"]:
        return _lan_ip_cache["ip"]
    ip = None
    for probe in ("8.8.8.8", "10.1.1.1", "192.168.1.1", "172.16.1.1"):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(1)
            s.connect((probe, 80))
            cand = s.getsockname()[0]
            s.close()
        except OSError:
            continue
        if cand and not cand.startswith("127."):
            ip = cand
            break
    if not ip:
        try:
            cands = sorted({ai[4][0] for ai in
                            socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)})
            ip = next((c for c in cands if not c.startswith("127.")), None)
        except OSError:
            ip = None
    _lan_ip_cache.update(ip=ip, ts=time.time())
    return ip

_fw_lock = threading.Lock()
_fw_job: dict = {"type": None, "target": None, "running": False, "ok": None,
                 "started": None, "finished": None, "log": deque(maxlen=300)}

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def _fw_run_job(jtype: str, args: list[str], target: str | None, timeout: int,
                module: str = "esphome") -> None:
    """Subprozess (python -m <module> ...) ausfuehren und Ausgabe in das Job-Log spiegeln."""
    ok = False
    try:
        proc = subprocess.Popen(
            [sys.executable, "-m", module, *args],
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
    if jtype == "install":
        _esphome_cache.update(ok=None, ts=0.0)      # Verfuegbarkeit neu pruefen
    print(f"[firmware] Job {jtype} ({target or '-'}) beendet: {'OK' if ok else 'FEHLER'}")


def start_fw_job(jtype: str, args: list[str], target: str | None, timeout: int,
                 module: str = "esphome") -> bool:
    """Job starten; False, wenn bereits einer laeuft."""
    with _fw_lock:
        if _fw_job["running"]:
            return False
        _fw_job.update(type=jtype, target=target, running=True, ok=None,
                       started=int(time.time()), finished=None)
        _fw_job["log"].clear()
        _fw_job["log"].append(f"[start] {module} {' '.join(args)}")
    threading.Thread(target=_fw_run_job, args=(jtype, args, target, timeout, module),
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
        "esphome": esphome_available(),
        "esphome_req": _esphome_requirement(),
        "python": sys.executable,
        "secrets_problems": secrets_problems(),
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


def evaluate_sensor_alarms(s: dict, daily: list[float], flow: float, status: str,
                           last_seen: int | None, now: datetime, now_ts: int) -> None:
    """Alarme für einen (zugeordneten) Sensor prüfen und ggf. anlegen."""
    sid, gas = s["id"], s["gas"]
    leak = sensor_leak(s)
    if status == "online" and leak["min"] <= flow < leak["active"]:
        level = "critical" if flow >= (leak["min"] + leak["active"]) / 2 else "warning"
        raise_alarm(sid, gas, "leak", level, round(flow, 2), now_ts)

    # Offline-Warnung: Sensor meldet sich laenger als die Schwelle nicht mehr.
    # Loest sich automatisch auf, sobald das Geraet wieder online ist.
    off_min = int(CONFIG.get("offline_alarm_minutes", 15) or 0)
    if status == "online":
        clear_offline_alarm(sid)
    elif off_min > 0 and last_seen:
        off_s = now_ts - last_seen
        if off_s >= off_min * 60:
            level = "critical" if off_s >= 2 * 3600 else "warning"
            raise_alarm(sid, gas, "offline", level, round(off_s / 60), now_ts,
                        last_seen=last_seen)

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
    # Rollierendes 24-h-Fenster (endet mit der laufenden Stunde) fuer die 24-H-Ansicht
    cur_hour = now.replace(minute=0, second=0, microsecond=0)
    hour_starts24 = [cur_hour - timedelta(hours=23 - i) for i in range(24)]
    earliest = int(min(day_starts[0], hour_starts24[0]).timestamp())

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
        hourly24 = [round(buckets.get(int(h.timestamp()), 0.0), 2) for h in hour_starts24]

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

        evaluate_sensor_alarms(s, daily, flow, status, lv.get("updated"), now, now_ts)
        leak = sensor_leak(s)
        dt_rule = sensor_downtime(s)
        sensors_out.append({
            "id": sid, "name": s.get("name", sid), "gas": s["gas"],
            "deptId": s.get("dept"), "deptName": dept_name(s.get("dept")),
            "daily": daily, "hourly": hourly, "hourly24": hourly24,
            "flow": round(flow, 2), "status": status, "total": total,
            "lastSeen": lv.get("updated"), "note": s.get("note") or "",
            # Geraete-Metadaten (Einheits-Firmware) fuer die Anlagen-Info-Karte
            "meta": parse_meta(lv.get("meta")),
            # Effektive Regeln (Override oder Standard) fuer die Schwellen-Karte
            "rules": {"leak": leak,
                      "leakCustom": bool(s.get("leak")),
                      "downtime": {"enabled": bool(dt_rule.get("enabled")),
                                   "max_nl": dt_rule.get("max_nl", 0)},
                      "downtimeCustom": bool(s.get("downtime"))},
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
        "refHours24": [int(h.timestamp() * 1000) for h in hour_starts24],
        "gases": gases_out,
        "departments": DEPARTMENTS,
        "sensors": sensors_out,
        "unassigned": unassigned,
        "alarms": alarms,
        "authRequired": auth_required(),
        "staleSeconds": stale,
        "offlineAlarmMinutes": int(CONFIG.get("offline_alarm_minutes", 15) or 0),
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


@app.get("/api/auth")
def api_auth(req: Request):
    return {"required": auth_required(), "admin": is_admin(req)}


@app.post("/api/login")
async def api_login(req: Request):
    try:
        body = await req.json()
    except Exception:                                  # noqa: BLE001
        return JSONResponse({"ok": False, "error": "invalid JSON"}, status_code=400)
    if not auth_required():
        return {"ok": True, "token": "", "required": False}
    pw = str(body.get("password", ""))
    if not hmac.compare_digest(pw, str(CONFIG.get("admin_password", ""))):
        time.sleep(0.8)                    # bremst Durchprobieren
        return JSONResponse({"ok": False, "error": "wrong password"}, status_code=403)
    return {"ok": True, "token": make_token(), "required": True}


@app.get("/api/sensors")
def api_get_sensors(req: Request):
    """Registry inkl. Live-Status für den Sensor-Editor (Admin).

    leak/downtime sind die Sensor-Overrides (null = Standardwerte greifen);
    die Standardwerte selbst stehen in defaults.
    """
    if not is_admin(req):
        return deny()
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
            "note": s.get("note") or "",
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
    if not is_admin(req):
        return deny()
    if sid not in SENSORS:
        return JSONResponse({"ok": False, "error": "unknown sensor"}, status_code=404)
    try:
        body = await req.json()
    except Exception:                                  # noqa: BLE001
        return JSONResponse({"ok": False, "error": "invalid JSON"}, status_code=400)
    s = SENSORS[sid]
    if "name" in body:
        s["name"] = str(body["name"]).strip() or sid
    if "note" in body:                     # persistente Kurz-Notiz ("" = entfernen)
        note = str(body["note"] or "").strip()[:2000]
        if note:
            s["note"] = note
        else:
            s.pop("note", None)
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
def api_reset_sensor(sid: str, req: Request):
    if not is_admin(req):
        return deny()
    if sid not in SENSORS:
        return JSONResponse({"ok": False, "error": "unknown sensor"}, status_code=404)
    ok = publish_reset(sid)
    return {"ok": ok, "error": None if ok else "no mqtt client"}


@app.get("/api/firmware")
def api_firmware_info(req: Request):
    """Status der Firmware-Verwaltung: Builds, laufender Job, Log-Ausschnitt."""
    if not is_admin(req):
        return deny()
    return fw_info()


@app.post("/api/firmware/build")
def api_firmware_build(req: Request):
    """Firmware neu bauen (esphome compile) — Voraussetzung fuer Flash/OTA."""
    if not is_admin(req):
        return deny()
    if not FIRMWARE_YAML.exists():
        return JSONResponse({"ok": False, "error": f"{FIRMWARE_YAML} fehlt"}, status_code=500)
    if not esphome_available():
        return JSONResponse({"ok": False, "error": "esphome ist im Backend-Python nicht installiert — "
                             "Button „esphome installieren“ oder: "
                             f"{sys.executable} -m pip install {_esphome_requirement()}"},
                            status_code=500)
    ensure_secrets()                 # fehlende Werte erzeugen, MQTT-Zugangsdaten spiegeln
    problems = secrets_problems()
    if problems:
        return JSONResponse({"ok": False, "problems": problems,
                             "error": "firmware/secrets.yaml unvollständig: " + "; ".join(problems)
                             + " → Administration → MQTT-Broker → Firmware-Secrets"},
                            status_code=400)
    if not start_fw_job("build", ["compile", FIRMWARE_YAML.name], None, timeout=900):
        return JSONResponse({"ok": False, "error": "es läuft bereits ein Job"}, status_code=409)
    return {"ok": True}


@app.post("/api/firmware/install-esphome")
def api_firmware_install(req: Request):
    """esphome per pip in den Interpreter des Backends installieren (Job mit Log).

    Gleiche Aktion wie `pip install -r requirements.txt` — fuer Server, auf denen
    das Backend schon lief, bevor esphome in requirements.txt stand.
    """
    if not is_admin(req):
        return deny()
    if esphome_available():
        return JSONResponse({"ok": False, "error": "esphome ist bereits installiert"}, status_code=400)
    if not start_fw_job("install", ["install", _esphome_requirement()], None,
                        timeout=1200, module="pip"):
        return JSONResponse({"ok": False, "error": "es läuft bereits ein Job"}, status_code=409)
    return {"ok": True}


@app.post("/api/sensors/{sid}/ota")
def api_sensor_ota(sid: str, req: Request):
    """OTA-Update: aktuellen Build auf das Gerät schieben (IP aus dem meta-Topic)."""
    if not is_admin(req):
        return deny()
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
def api_firmware_manifest(req: Request):
    """ESP-Web-Tools-Manifest fuer den Erstflash per USB (Web Serial).

    factory.bin enthaelt die einkompilierten MQTT-Zugangsdaten -> Admin-Token
    noetig. ESP Web Tools laedt Manifest + parts selbst (ohne unsere Header),
    daher wird das Token als ?auth=-Query durchgereicht.
    """
    if not is_admin(req):
        return deny()
    if not FW_FACTORY_BIN.exists():
        return JSONResponse({"error": "kein Build vorhanden"}, status_code=404)
    version = datetime.fromtimestamp(FW_FACTORY_BIN.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
    tok = req.query_params.get("auth", "")
    part = "factory.bin" + (f"?auth={tok}" if tok else "")
    return {
        "name": "Gas-Durchflussmesser (iwb)",
        "version": version,
        "new_install_prompt_erase": True,
        "builds": [{"chipFamily": "ESP32",
                    "parts": [{"path": part, "offset": 0}]}],
    }


@app.get("/api/firmware/factory.bin")
def api_firmware_factory(req: Request):
    if not is_admin(req):
        return deny()
    if not FW_FACTORY_BIN.exists():
        return JSONResponse({"error": "kein Build vorhanden"}, status_code=404)
    return FileResponse(str(FW_FACTORY_BIN), media_type="application/octet-stream",
                        filename="gas-flowmeter.factory.bin")


@app.delete("/api/sensors/{sid}")
def api_delete_sensor(sid: str, req: Request):
    if not is_admin(req):
        return deny()
    if sid in SENSORS:
        del SENSORS[sid]
        save_sensors()
    return {"ok": True}


@app.post("/api/alarms/{aid}/ack")
def api_ack_alarm(aid: int, req: Request):
    if not is_admin(req):
        return deny()
    return {"ok": ack_alarm(aid)}


@app.post("/api/alarms/{aid}/resolve")
def api_resolve_alarm(aid: int, req: Request):
    if not is_admin(req):
        return deny()
    return {"ok": resolve_alarm(aid)}


@app.get("/api/alarms/history")
def api_alarm_history(limit: int = 200):
    """Alarm-Historie: offene und aufgeloeste Alarme, neueste zuerst (read-only)."""
    limit = max(1, min(int(limit), 1000))
    with db() as c:
        rows = c.execute(
            "SELECT id, sensor, gas, type, level, value, raised_at,"
            " acknowledged, ack_at, auto_cleared, resolved, resolved_at FROM alarms"
            " ORDER BY raised_at DESC, id DESC LIMIT ?", (limit,)).fetchall()
    out = []
    for (aid, sensor, gas, atype, level, value, raised_at,
         ack, ack_at, auto_cleared, resolved, resolved_at) in rows:
        s = SENSORS.get(sensor, {})
        state = "resolved" if resolved else ("ack" if ack else "active")
        out.append({"id": aid, "sensor": sensor, "sensorName": s.get("name", sensor),
                    "gas": gas, "deptName": dept_name(s.get("dept")),
                    "type": atype, "level": level, "value": value,
                    "raised_at": raised_at, "acknowledged": bool(ack),
                    "ack_at": ack_at, "auto_cleared": bool(auto_cleared),
                    "state": state, "resolved_at": resolved_at})
    return {"alarms": out}


@app.get("/api/report/monthly")
def api_report_monthly(limit: int = 24):
    """Monats-Aggregate aus den Stundenbuckets: je Monat Nl gesamt, je Gas, je
    Abteilung (read-only, treibt den Reports-Bildschirm)."""
    limit = max(1, min(int(limit), 60))
    with db() as c:
        rows = c.execute(
            "SELECT strftime('%Y-%m', hour_ts, 'unixepoch', 'localtime') AS ym,"
            " machine, SUM(nl) FROM hourly GROUP BY ym, machine ORDER BY ym").fetchall()
    months: dict[str, dict] = {}
    for ym, machine, nl in rows:
        s = SENSORS.get(machine)
        if not s or not s.get("gas"):
            continue                       # nicht (mehr) zugeordnete Sensoren auslassen
        m = months.setdefault(ym, {"ym": ym, "total_nl": 0.0,
                                   "per_gas": {}, "per_dept_gas": {}})
        m["total_nl"] += nl
        m["per_gas"][s["gas"]] = m["per_gas"].get(s["gas"], 0.0) + nl
        dg = m["per_dept_gas"].setdefault(s.get("dept") or "", {})
        dg[s["gas"]] = dg.get(s["gas"], 0.0) + nl
    out = sorted(months.values(), key=lambda m: m["ym"], reverse=True)[:limit]
    for m in out:
        m["total_nl"] = round(m["total_nl"], 1)
        m["per_gas"] = {k: round(v, 1) for k, v in m["per_gas"].items()}
        m["per_dept_gas"] = {d: {g: round(v, 1) for g, v in gg.items()}
                             for d, gg in m["per_dept_gas"].items()}
    return {"months": out}


@app.post("/api/departments")
async def api_departments(req: Request):
    """Abteilung anlegen oder umbenennen ({id?, name})."""
    if not is_admin(req):
        return deny()
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
def api_delete_department(did: str, req: Request):
    """Abteilung löschen; zugeordnete Sensoren werden auf 'keine Abteilung' gesetzt."""
    global DEPARTMENTS
    if not is_admin(req):
        return deny()
    if not any(d["id"] == did for d in DEPARTMENTS):
        return JSONResponse({"ok": False, "error": "unknown dept"}, status_code=404)
    DEPARTMENTS = [d for d in DEPARTMENTS if d["id"] != did]
    for s in SENSORS.values():
        if s.get("dept") == did:
            s["dept"] = None
    save_sensors()
    return {"ok": True}


@app.get("/api/config")
def api_get_config(req: Request):
    """Einstellungen inkl. MQTT-Passwort im Klartext — deshalb Admin-only."""
    if not is_admin(req):
        return deny()
    m = CONFIG.get("mqtt", {})
    sec = read_secrets()
    bk = CONFIG.get("backup", {})
    return {
        "stale_seconds": CONFIG.get("stale_seconds", 120),
        "offline_alarm_minutes": CONFIG.get("offline_alarm_minutes", 15),
        "gases": CONFIG.get("gases", {}),
        "defaults": CONFIG.get("defaults", {}),
        "backup": {"enabled": bool(bk.get("enabled", True)),
                   "keep_days": int(bk.get("keep_days", 30))},
        "auth": {"required": auth_required()},
        "mqtt": {
            "embedded": m.get("embedded", True),
            "bind": m.get("bind", "0.0.0.0"),
            "port": m.get("port", 1883),
            "username": m.get("username", ""),
            "password": m.get("password", ""),
            "broker": m.get("broker", "127.0.0.1"),
        },
        # Abgleich mit firmware/secrets.yaml (Build-Zeit-Zugangsdaten der Geräte)
        "secrets": {
            "exists": SECRETS_FILE.exists(),
            "user_match": sec.get("mqtt_user", "") == m.get("username", ""),
            "password_match": sec.get("mqtt_password", "") == m.get("password", ""),
            "broker": sec.get("mqtt_broker", ""),
            "ota_password": sec.get("ota_password", ""),
            "api_encryption_key": sec.get("api_encryption_key", ""),
            "lan_ip": lan_ip(),
            "problems": secrets_problems(),
            "warnings": secrets_warnings(),
        },
        "status": {
            "embedded_running": _broker_state.get("running", False),
            "ingest_connected": _broker_state.get("ingest_connected", False),
            "auth": _broker_state.get("auth", False),
        },
    }


@app.post("/api/config")
async def api_set_config(req: Request):
    """Einstellungen übernehmen und nach config.json schreiben.

    Preise/Defaults greifen sofort; Broker-Felder erst nach Neustart -> restart_required.
    MQTT-Zugangsdaten werden zusätzlich nach firmware/secrets.yaml gespiegelt,
    damit der nächste Firmware-Build automatisch passt. Unter "secrets" können
    Broker-Adresse, OTA-Passwort und API-Key der Geräte gesetzt werden.
    """
    if not is_admin(req):
        return deny()
    try:
        body = await req.json()
    except Exception:                                  # noqa: BLE001
        return JSONResponse({"ok": False, "error": "invalid JSON"}, status_code=400)

    restart = False
    creds_changed = False
    fresh_token = None
    secrets_upd: dict[str, str] = {}
    try:
        if isinstance(body.get("secrets"), dict):
            bs = body["secrets"]
            for key in ("mqtt_broker", "ota_password", "api_encryption_key"):
                if key in bs:
                    secrets_upd[key] = str(bs[key]).strip()
            k = secrets_upd.get("api_encryption_key")
            if k and not _api_key_ok(k):
                return JSONResponse({"ok": False, "error": "api_encryption_key: 32 Byte Base64 "
                                     "erwartet (Button „Neu erzeugen“)"}, status_code=400)
        if "stale_seconds" in body:
            CONFIG["stale_seconds"] = int(body["stale_seconds"])
        if "offline_alarm_minutes" in body:
            v = max(0, int(body["offline_alarm_minutes"]))
            CONFIG["offline_alarm_minutes"] = v
        if isinstance(body.get("backup"), dict):
            bk = CONFIG.setdefault("backup", {})
            if "enabled" in body["backup"]:
                bk["enabled"] = bool(body["backup"]["enabled"])
            if "keep_days" in body["backup"]:
                bk["keep_days"] = max(1, int(body["backup"]["keep_days"]))
        if "admin_password" in body:
            newpw = str(body["admin_password"])
            if newpw != CONFIG.get("admin_password", ""):
                CONFIG["admin_password"] = newpw
                # Secret rotieren -> alle alten Login-Tokens werden ungültig
                CONFIG["auth_secret"] = pysecrets.token_hex(32)
                fresh_token = make_token() if newpw else ""
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
            if "embedded" in bm and bool(bm["embedded"]) != bool(mq.get("embedded")):
                mq["embedded"] = bool(bm["embedded"]); restart = True
            if "bind" in bm and str(bm["bind"]) != mq.get("bind"):
                mq["bind"] = str(bm["bind"]); restart = True
            if "broker" in bm and str(bm["broker"]) != mq.get("broker"):
                mq["broker"] = str(bm["broker"]); restart = True
            if "port" in bm and int(bm["port"]) != int(mq.get("port", 1883)):
                mq["port"] = int(bm["port"]); restart = True
            if "username" in bm and str(bm["username"]) != mq.get("username", ""):
                mq["username"] = str(bm["username"]); restart = creds_changed = True
            if "password" in bm and str(bm["password"]) != mq.get("password", ""):
                mq["password"] = str(bm["password"]); restart = creds_changed = True
    except (TypeError, ValueError) as exc:
        return JSONResponse({"ok": False, "error": f"bad value: {exc}"}, status_code=400)

    save_config()
    secrets_synced = None
    secrets_saved = None
    if secrets_upd:
        secrets_saved = write_secrets(secrets_upd)
    if creds_changed or secrets_upd:
        # Zugangsdaten spiegeln, leere/ungültige Werte auffüllen
        ensure_secrets()
        secrets_synced = creds_changed and bool(SECRETS_FILE.exists())
    out = {"ok": True, "restart_required": restart, "secrets_synced": secrets_synced,
           "secrets_saved": secrets_saved}
    if fresh_token is not None:
        out["token"] = fresh_token         # Setzer bleibt eingeloggt
    return out


@app.post("/api/restart")
def api_restart(req: Request):
    """Backend neu starten (Broker-/Konfig-Änderungen übernehmen).

    Antwortet sofort; danach beendet sich der Prozess und ein abgekoppelter
    Helfer startet app.py neu, sobald der Port frei ist. Läuft das Backend
    unter einem Supervisor (GAS_SUPERVISED gesetzt), reicht das Beenden.
    """
    if not is_admin(req):
        return deny()
    threading.Timer(0.7, _do_restart).start()
    return {"ok": True}


def _do_restart() -> None:
    print("[restart] Backend-Neustart angefordert — Prozess beendet sich")
    try:
        if not os.environ.get("GAS_SUPERVISED"):
            port = int(os.environ.get("PORT", CONFIG.get("port", 8000)))
            logdir = Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "gas-dashboard"
            logdir.mkdir(parents=True, exist_ok=True)
            # Helfer: wartet, bis der Webport frei ist, und startet app.py neu
            # (Logs im bewährten Ablageort, wie beim Start via Start-Process).
            helper = (
                "import socket,subprocess,sys,time\n"
                f"port={port}\n"
                "for _ in range(240):\n"
                "    s=socket.socket()\n"
                "    try:\n"
                "        s.bind(('127.0.0.1',port)); s.close(); break\n"
                "    except OSError:\n"
                "        s.close(); time.sleep(0.5)\n"
                f"out=open(r'{logdir / 'app.out.log'}','ab')\n"
                f"err=open(r'{logdir / 'app.err.log'}','ab')\n"
                f"subprocess.Popen([sys.executable, r'{BASE / 'app.py'}'],"
                f" cwd=r'{BASE}', stdout=out, stderr=err)\n"
            )
            kw: dict = {"close_fds": True}
            if os.name == "nt":
                # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP: überlebt das Ende
                # dieses Prozesses und hängt an keiner Konsole
                kw["creationflags"] = 0x00000008 | 0x00000200
            else:
                kw["start_new_session"] = True
            subprocess.Popen([sys.executable, "-c", helper], **kw)
    except Exception as exc:                           # noqa: BLE001
        print(f"[restart] Helfer-Start fehlgeschlagen: {exc} — beende trotzdem")
    with _lock:                            # keine halbe DB-Transaktion abschneiden
        os._exit(0)


# ------------------------------------------------------------------ CSV-Export
@app.get("/api/export.csv")
def api_export(scope: str = "total", res: str = "day",
               start: str = "", end: str = ""):
    """Historische Verbrauchsdaten als CSV (deutsches Excel: ';' + Dezimalkomma).

    scope: total | dept:<id> | sensor:<id>   res: hour | day
    start/end: YYYY-MM-DD (inklusive); Standard: letzte 30 Tage.
    Read-only und damit wie das Dashboard ohne Login nutzbar.
    """
    if res not in ("hour", "day"):
        return JSONResponse({"ok": False, "error": "res must be hour|day"}, status_code=400)
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        d_end = datetime.strptime(end, "%Y-%m-%d") if end else today
        d_start = datetime.strptime(start, "%Y-%m-%d") if start else d_end - timedelta(days=29)
    except ValueError:
        return JSONResponse({"ok": False, "error": "bad date (YYYY-MM-DD)"}, status_code=400)
    if d_start > d_end:
        d_start, d_end = d_end, d_start
    if (d_end - d_start).days > 400:
        return JSONResponse({"ok": False, "error": "range too large (max 400 days)"},
                            status_code=400)

    if scope == "total":
        sel = [s for s in SENSORS.values() if s.get("gas")]
    elif scope.startswith("dept:"):
        did = scope[5:]
        sel = [s for s in SENSORS.values() if s.get("gas") and s.get("dept") == did]
    elif scope.startswith("sensor:"):
        sid = scope[7:]
        sel = [SENSORS[sid]] if sid in SENSORS else []
    else:
        return JSONResponse({"ok": False, "error": "bad scope"}, status_code=400)
    if not sel:
        return JSONResponse({"ok": False, "error": "no sensors in scope"}, status_code=404)

    ts_from = int(d_start.timestamp())
    ts_to = int((d_end + timedelta(days=1)).timestamp())
    per_sensor: dict[str, dict[int, float]] = {}
    with db() as c:
        for s in sel:
            rows = c.execute(
                "SELECT hour_ts, nl FROM hourly WHERE machine=? AND hour_ts>=? AND hour_ts<?",
                (s["id"], ts_from, ts_to)).fetchall()
            per_sensor[s["id"]] = {ts: nl for ts, nl in rows}

    def de(v: float, d: int) -> str:
        return f"{v:.{d}f}".replace(".", ",")

    def field(v: str) -> str:
        v = str(v)
        return '"' + v.replace('"', '""') + '"' if any(ch in v for ch in ';"\n') else v

    gases = CONFIG.get("gases", {})
    lines = ["Zeit;SensorID;Name;Gas;Abteilung;Verbrauch_Nl;Verbrauch_m3;Kosten_EUR"]
    step = timedelta(hours=1) if res == "hour" else timedelta(days=1)
    fmt = "%Y-%m-%d %H:%M" if res == "hour" else "%Y-%m-%d"
    t = d_start
    while t < d_end + timedelta(days=1):
        for s in sel:
            if res == "hour":
                nl = per_sensor[s["id"]].get(int(t.timestamp()), 0.0)
            else:
                nl = sum(per_sensor[s["id"]].get(int((t + timedelta(hours=h)).timestamp()), 0.0)
                         for h in range(24))
            gas = s.get("gas") or ""
            price = gases.get(gas, {}).get("price_per_m3", 0) if gas else 0
            lines.append(";".join([
                t.strftime(fmt), field(s["id"]), field(s.get("name", s["id"])),
                field(gases.get(gas, {}).get("name", gas) if gas else "—"),
                field(dept_name(s.get("dept"))),
                de(nl, 1), de(nl / 1000, 3), de(nl / 1000 * price, 2),
            ]))
        t += step

    slug = scope.replace(":", "-")
    fname = f"gas-export_{slug}_{d_start:%Y-%m-%d}_{d_end:%Y-%m-%d}_{res}.csv"
    body = "﻿" + "\r\n".join(lines) + "\r\n"     # BOM: Excel erkennt UTF-8
    from fastapi.responses import Response
    return Response(content=body, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})


# -------------------------------------------------------------------- Backup
def _backup_once() -> bool:
    """Tagesbackup von DB + Registry + Konfiguration; rotiert alte Stände."""
    bk = CONFIG.get("backup", {})
    if not bk.get("enabled", True):
        return False
    bdir = BASE / "backups"
    tgt = bdir / datetime.now().strftime("%Y-%m-%d")
    if tgt.exists():
        return False
    tgt.mkdir(parents=True, exist_ok=True)
    try:
        with _lock:
            src = sqlite3.connect(DB_PATH)
            dst = sqlite3.connect(tgt / DB_PATH.name)
            src.backup(dst)                # konsistent trotz WAL
            dst.close(); src.close()
        for f in ("sensors.json", "config.json"):
            if (BASE / f).exists():
                shutil.copyfile(BASE / f, tgt / f)
    except Exception as exc:                           # noqa: BLE001
        print(f"[backup] fehlgeschlagen: {exc}")
        return False
    keep = max(1, int(bk.get("keep_days", 30)))
    dirs = sorted(d for d in bdir.iterdir()
                  if d.is_dir() and re.match(r"^\d{4}-\d{2}-\d{2}$", d.name))
    for d in dirs[:-keep]:
        shutil.rmtree(d, ignore_errors=True)
    print(f"[backup] {tgt.name} angelegt ({len(dirs)} Stände, behalte {keep})")
    return True


def _backup_loop() -> None:
    while True:
        try:
            _backup_once()
        except Exception as exc:                       # noqa: BLE001
            print(f"[backup] Loop-Fehler: {exc}")
        time.sleep(3600)


# Statisches Frontend unter / ausliefern
app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")


def _ssl_kwargs() -> dict:
    """Optionales HTTPS: config.json "https": {"certfile", "keyfile"} (Pfade relativ zu backend/).

    Browser erlauben Web Serial (USB-Flash und MAC-Konsole im Dialog "+ Geraet") nur
    in sicheren Kontexten (https:// oder localhost). Laeuft das Dashboard auf einem
    Server, geht das Flashen von anderen PCs aus also nur per HTTPS — oder mit dem
    Chrome-Flag #unsafely-treat-insecure-origin-as-secure auf dem jeweiligen PC.
    """
    h = CONFIG.get("https") or {}
    cert, key = str(h.get("certfile") or "").strip(), str(h.get("keyfile") or "").strip()
    if not cert or not key:
        return {}
    cp, kp = BASE / cert, BASE / key
    if not (cp.exists() and kp.exists()):
        print(f"[https] Zertifikat/Key nicht gefunden ({cp} / {kp}) — starte mit HTTP")
        return {}
    print(f"[https] aktiv: {cp.name} / {kp.name}")
    return {"ssl_certfile": str(cp), "ssl_keyfile": str(kp)}


if __name__ == "__main__":
    load_sensors()
    _ensure_auth_secret()
    ensure_secrets()                 # firmware/secrets.yaml anlegen/vervollständigen
    _migrate_legacy_db()
    init_db()
    start_mqtt()
    threading.Thread(target=_alarm_loop, daemon=True).start()
    threading.Thread(target=_backup_loop, daemon=True).start()
    port = int(os.environ.get("PORT", CONFIG.get("port", 8000)))
    uvicorn.run(app, host=CONFIG.get("host", "0.0.0.0"), port=port, **_ssl_kwargs())
