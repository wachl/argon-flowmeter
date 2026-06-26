# Argon Monitoring – Dashboard

Kleines Backend (FastAPI + paho-mqtt + SQLite) + statisches Frontend. Liest die
MQTT-Telemetrie der 16 ESPHome-Durchflussmesser, akkumuliert den Verbrauch in
stündliche Buckets und zeigt KPIs, Verbrauchs-Trend, Alarme, Abteilungs- und
Maschinenübersicht. Optik portiert aus dem Claude-Design `Argon Dashboard.dc.html`
(Original liegt unter `../design_src/`).

```
dashboard/
├─ backend/
│  ├─ app.py            FastAPI-Server: MQTT-Ingest + REST-API + Auslieferung des Frontends
│  ├─ config.json       Broker, Port, Preis €/m³, Schwellwerte
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
pip install -r requirements.txt          # fastapi, uvicorn, paho-mqtt
python sim.py --seed 30                   # 30 Tage synthetische Historie in die DB
python app.py                             # Server auf http://localhost:8000
```
→ Browser auf **http://localhost:8000** → der Verbrauchs-Trend ist sofort gefüllt,
zwei Mehrverbrauchs-Alarme sind sichtbar. *Live Flow* ist 0, solange kein Broker/Sim läuft.

> Ohne installiertes `paho-mqtt` startet der Server trotzdem und zeigt die DB-Daten
> (der MQTT-Teil wird dann übersprungen).

### Live-Werte simulieren (zusätzlich, braucht Broker)

```bash
# Broker, z. B. Mosquitto, muss laufen und in config.json eingetragen sein
python sim.py            # publiziert flow/total/status für alle 16 Anlagen alle 3 s
```
→ *Live Flow*, laufende Maschinen und der Leerlauf-/Leck-Alarm (anlage-04) werden aktiv.

## Echtbetrieb

1. **Broker** in `config.json` eintragen (gleicher wie in der Firmware-`secrets.yaml`).
2. `machines.json` an die echten 16 Anlagen anpassen (machine_id = `machine_id` der Firmware,
   Klartextname, Abteilung). Preis in `config.json` (`price_per_m3`).
3. `python app.py` als Dienst laufen lassen (z. B. systemd / NSSM / Task).
4. Die ESPHome-Geräte publizieren automatisch auf `iwb/argon/<machine_id>/{flow,total,voltage,status}`.

## REST-API

| Endpoint | Inhalt |
|---|---|
| `GET /api/data` | komplettes Dashboard-Payload (Maschinen, daily[30], hourly[24], live, Alarme) |
| `GET /api/health` | Status, Anzahl Maschinen, Broker |
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
