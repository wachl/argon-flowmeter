# Argon Monitoring – Dashboard

Kleines Backend (FastAPI + paho-mqtt + SQLite) + statisches Frontend. Liest die
MQTT-Telemetrie der 16 ESPHome-Durchflussmesser, akkumuliert den Verbrauch in
stündliche Buckets und zeigt KPIs, Verbrauchs-Trend, Alarme, Abteilungs- und
Maschinenübersicht.

**Eingebetteter MQTT-Broker:** Das Backend bringt einen kleinen Broker (`amqtt`) mit
und startet ihn standardmäßig auf `0.0.0.0:1883` (anonym). Ein separater Mosquitto ist
damit nicht nötig — die ESPHome-Geräte verbinden sich direkt mit der LAN-IP des
Dashboard-PCs. Alles konfigurierbar **im Dashboard** über das Zahnrad-Symbol (⚙) oben
rechts (oder direkt in `config.json`).

```
dashboard/
├─ backend/
│  ├─ app.py            FastAPI-Server: eingebetteter Broker + MQTT-Ingest + REST-API + Frontend
│  ├─ config.json       Broker (eingebettet/extern), Port, Preis €/m³, Schwellwerte
│  ├─ machines.json     Zuordnung machine_id → Klartextname + Abteilung (16 Anlagen)
│  ├─ sim.py            Demo: Historie seeden (--seed) + Live-Telemetrie publizieren
│  └─ requirements.txt
└─ frontend/
   ├─ index.html
   └─ app.js            gesamte Dashboard-Logik (vanilla JS, kein Build)
```

## Schnellstart – Demo ohne Hardware/Broker

```bash
cd dashboard/backend
pip install -r requirements.txt          # fastapi, uvicorn, paho-mqtt, amqtt
python sim.py --seed 30                   # 30 Tage synthetische Historie in die DB
python app.py                             # Broker :1883 + Server auf http://127.0.0.1:8000
```
→ Browser auf **http://127.0.0.1:8000** → der Verbrauchs-Trend ist sofort gefüllt,
zwei Mehrverbrauchs-Alarme sind sichtbar. *Live Flow* ist 0, solange kein Gerät/Sim sendet.

> **Windows:** `127.0.0.1` statt `localhost` verwenden — uvicorn bindet nur IPv4.
> Ohne `amqtt` startet das Backend trotzdem (eingebetteter Broker aus → externen Broker
> in `config.json` eintragen). Ohne `paho-mqtt` läuft nur die DB-Auslieferung.

### Live-Werte simulieren (zusätzlich, braucht Broker)

```bash
# Broker, z. B. Mosquitto, muss laufen und in config.json eingetragen sein
python sim.py            # publiziert flow/total/status für alle 16 Anlagen alle 3 s
```
→ *Live Flow*, laufende Maschinen und der Leerlauf-/Leck-Alarm (anlage-04) werden aktiv.

## MQTT-Broker konfigurieren (Dashboard ⚙ oder `config.json`)

Der `mqtt`-Block in `config.json` steuert den Broker:

```jsonc
"mqtt": {
  "embedded": true,        // eingebetteten amqtt-Broker starten
  "bind": "0.0.0.0",       // Geräte verbinden sich mit der LAN-IP dieses PCs
  "port": 1883,
  "allow_anonymous": true, // beliebige Clients zulassen (User/Passwort egal)
  "broker": "127.0.0.1",   // externer Broker – nur genutzt, wenn embedded=false
  "username": "argon",
  "password": "CHANGE_ME"
}
```

Dieselben Felder (plus Preis & Alarm-Schwellen) lassen sich live über das **⚙-Menü**
im Dashboard ändern. Preis/Schwellwerte greifen sofort; **Broker-Änderungen erst nach
einem Neustart** des Backends (das Dashboard weist darauf hin).

> Die ESPHome-Geräte tragen in `firmware/secrets.yaml` als `mqtt_broker` die **LAN-IP
> dieses PCs** ein (nicht `127.0.0.1`). Bei `allow_anonymous: true` sind die dort
> gesetzten User/Passwort beliebig.

## Echtbetrieb

1. **Broker** wählen: eingebettet lassen (Standard) **oder** in `config.json`/⚙ einen
   externen Broker eintragen (`embedded: false` + `broker`).
2. `machines.json` an die echten 16 Anlagen anpassen (machine_id = `machine_id` der Firmware,
   Klartextname, Abteilung). Preis in `config.json` (`price_per_m3`).
3. `python app.py` als Dienst laufen lassen (z. B. systemd / NSSM / Task).
4. Die ESPHome-Geräte publizieren automatisch auf `iwb/argon/<machine_id>/{flow,total,voltage,status}`.

## REST-API

| Endpoint | Inhalt |
|---|---|
| `GET /api/data` | komplettes Dashboard-Payload (Maschinen, daily[30], hourly[24], live, Alarme) |
| `GET /api/health` | Status, Anzahl Maschinen, Broker, eingebetteter Broker-Status |
| `GET /api/config` | aktuelle Einstellungen (ohne Klartext-Passwort) |
| `POST /api/config` | Einstellungen ändern (`{price_per_m3, stale_seconds, leak, mqtt}`) → `config.json` |
| `GET /` | Dashboard (statisch) |

## Wie der Verbrauch berechnet wird

- Das Gerät sendet einen **monotonen Gesamtzähler** (`total`, Nl). Das Backend bildet
  Deltas zwischen aufeinanderfolgenden Werten und summiert sie in **stündliche Buckets**
  (`hourly`-Tabelle). Ein Zähler-**Reset** (neuer Wert < alter) wird als neue Basislinie
  behandelt (kein negativer Verbrauch).
- Tag/Woche/Monat = Summen der Stundenbuckets. Der letzte Total überlebt einen Neustart
  des Backends (wird aus `live` geladen).
- **Alarme** (in `config.json`/`app.py` justierbar):
  - *Mehrverbrauch*: Mittel der letzten 7 Tage vs. der 21 Tage davor (> 15 % Warnung, > 30 % kritisch).
  - *Leerlauf/Leck*: Anlage online, Durchfluss zwischen `leak.min` und `leak.active` Nl/min.

## Hinweise

- Einheiten-Umschaltung **m³ ↔ €** und Bereich **24 h / 7 d / 30 d** rein im Frontend.
- Klick auf Abteilung, Maschinenzeile oder Alarm fokussiert den Chart (Scope).
- Drei Themes wie im Design: **Control** (dunkel), **Light**, **Mono**.
- `total` ist in **Nl** (Normliter); m³ = Nl/1000. Preis als €/m³ in `config.json`.
