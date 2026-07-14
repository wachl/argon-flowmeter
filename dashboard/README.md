# Gas-Monitoring – Dashboard

Kleines Backend (FastAPI + paho-mqtt + SQLite) + statisches Frontend. Liest die
MQTT-Telemetrie der ESPHome-Durchflussmesser (Argon + Stickstoff), akkumuliert den
Verbrauch in stündliche Buckets und zeigt KPIs, Verbrauchs-Trend, Alarme, Abteilungs-
und Sensorübersicht.

**Konfiguration komplett im Dashboard:**

- **Sensoren-Button** (Kopfzeile) → Sensor-Manager: neue Geräte erscheinen automatisch
  als „nicht zugeordnet“ und werden hier benannt und einem Gas + einer Abteilung
  zugewiesen; pro Sensor Leck-Schwellen und Downtime-Fenster überschreibbar,
  Gesamtzähler-Reset (MQTT-Kommando ans Gerät), Abteilungen anlegen/löschen.
- **⚙-Button** → Einstellungen: MQTT-Broker (eingebettet/extern, Port, anonym),
  Gas-Preise €/m³, Offline-Schwelle, Standard-Leck-/Downtime-Regeln.

**Eingebetteter MQTT-Broker:** Das Backend bringt einen kleinen Broker (`amqtt`) mit
und startet ihn standardmäßig auf `0.0.0.0:1883` (anonym). Ein separater Mosquitto ist
damit nicht nötig — die ESPHome-Geräte verbinden sich direkt mit der LAN-IP des
Dashboard-PCs.

```
dashboard/
├─ backend/
│  ├─ app.py            FastAPI-Server: eingebetteter Broker + MQTT-Ingest + REST-API + Frontend
│  ├─ config.json       Broker (eingebettet/extern), Port, Preise €/m³, Standard-Schwellwerte
│  ├─ sensors.json      Sensor-Registry (id → Name, Gas, Abteilung, Regeln) – wird vom Dashboard gepflegt
│  ├─ machines.json     nur Demo: Anlagenliste für sim.py
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
python sim.py --seed 30                   # Demo-Registry + 30 Tage synthetische Historie
python app.py                             # Broker :1883 + Server auf http://127.0.0.1:8000
```
→ Browser auf **http://127.0.0.1:8000** → der Verbrauchs-Trend ist sofort gefüllt.
*Live Flow* ist 0, solange kein Gerät/Sim sendet.

> **Windows:** `127.0.0.1` statt `localhost` verwenden — uvicorn bindet nur IPv4.
> Ohne `amqtt` startet das Backend trotzdem (eingebetteter Broker aus → externen Broker
> in ⚙/`config.json` eintragen). Ohne `paho-mqtt` läuft nur die DB-Auslieferung.

### Live-Werte simulieren (zusätzlich)

```bash
python sim.py                  # publiziert flow/total/status für alle 16 Demo-Anlagen alle 3 s
python sim.py --ids anlage-01  # nur einzelne Sensoren
```

### Demo-Daten wieder loswerden

```bash
python sim.py --clear     # leert DB (hourly/live/alarms); entfernt die Demo-Registry,
                          # sofern sensors.json nicht angepasst wurde
```

## Echtbetrieb

1. **Broker wählen** (⚙ im Dashboard): eingebettet lassen (Standard) **oder** externen
   Broker eintragen. Die ESPHome-Geräte tragen in `firmware/secrets.yaml` als
   `mqtt_broker` die **LAN-IP des Dashboard-PCs** ein (nicht `127.0.0.1`).
2. `python app.py` starten (dauerhaft z. B. als Dienst via NSSM / Taskplaner / systemd).
3. Sobald ein Gerät publiziert, erscheint es im Dashboard als **„nicht zugeordnet“** →
   Sensoren-Button → Name, Gas, Abteilung zuweisen. Fertig.
4. Preise, Offline-Schwelle und Standard-Alarmregeln in ⚙ setzen; abweichende Regeln
   pro Sensor direkt am Sensor.

## MQTT-Vertrag

Das Backend abonniert **beide** Topic-Schemata und mappt sie auf dieselbe Sensor-ID:

| Topic | Inhalt |
|---|---|
| `iwb/gas/<id>/status` bzw. `iwb/argon/<id>/status` | retained, `online`/`offline` (LWT) |
| `…/<id>/flow` | Nl/min (Momentandurchfluss) |
| `…/<id>/total` | Nl (monoton, persistent im Gerät) |
| `…/<id>/voltage` | V (Diagnose) |
| `…/<id>/cmd` ← | `reset` = Gesamtzähler des Geräts nullen (wird auf beiden Präfixen gesendet) |

`iwb/argon/` ist das Präfix der Bestands-Firmware (`firmware/argon-flowmeter.yaml`);
neue Firmware kann gas-neutral auf `iwb/gas/` publizieren — Backend versteht beides.

## REST-API

| Endpoint | Inhalt |
|---|---|
| `GET /api/data` | komplettes Dashboard-Payload (Sensoren, daily[30], hourly[24], live, Alarme, Broker-Status) |
| `GET /api/health` | Status, Anzahl Sensoren, Broker |
| `GET /api/sensors` | Registry inkl. Live-Status, Overrides, Defaults (Sensor-Manager) |
| `POST /api/sensors/{id}` | Sensor ändern (`{name, gas, dept, leak, downtime}`; `null` = Standard) |
| `POST /api/sensors/{id}/reset` | Reset-Kommando an das Gerät (Zähler nullen) |
| `DELETE /api/sensors/{id}` | Registry-Eintrag löschen (Gerät registriert sich ggf. neu) |
| `POST /api/departments` · `DELETE /api/departments/{id}` | Abteilung anlegen/umbenennen/löschen |
| `GET /api/config` · `POST /api/config` | Einstellungen lesen/schreiben → `config.json` |
| `GET /` | Dashboard (statisch) |

## Wie der Verbrauch berechnet wird

- Das Gerät sendet einen **monotonen Gesamtzähler** (`total`, Nl). Das Backend bildet
  Deltas zwischen aufeinanderfolgenden Werten und summiert sie in **stündliche Buckets**
  (`hourly`-Tabelle). Ein Zähler-**Reset** (neuer Wert < alter) wird als neue Basislinie
  behandelt (kein negativer Verbrauch).
- Tag/Woche/Monat = Summen der Stundenbuckets. Der letzte Total überlebt einen Neustart
  des Backends (wird aus `live` geladen).
- **Alarme** (Standard in ⚙, pro Sensor überschreibbar):
  - *Mehrverbrauch*: Mittel der letzten 7 Tage vs. der 21 Tage davor (> 15 % Warnung, > 30 % kritisch).
  - *Leerlauf/Leck*: Anlage online, Durchfluss zwischen `leak.min` und `leak.active` Nl/min.
  - *Downtime*: Verbrauch innerhalb definierter Stillstands-Fenster über `max_nl`.

## Hinweise

- Einheiten-Umschaltung **m³ ↔ €** und Bereich **24 h / 7 d / 30 d** rein im Frontend.
- Klick auf Abteilung, Sensorzeile oder Alarm fokussiert den Chart; ✎ öffnet die Sensor-Konfiguration.
- Drei Themes: **Control** (dunkel), **Light**, **Mono**.
- `total` ist in **Nl** (Normliter); m³ = Nl/1000. Preise als €/m³ pro Gas in ⚙.
- Fällt das Backend aus, zeigt das Dashboard einen roten Hinweis mit dem Zeitpunkt des
  letzten erfolgreichen Datenabrufs.
