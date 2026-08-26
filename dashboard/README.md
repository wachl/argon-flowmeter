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
  Die Geräte-Box zeigt IP (Link aufs Geräte-Webinterface), SP-Wert, MAC, Firmware
  und bietet **Firmware-Update (OTA)** per Klick.
- **＋ Gerät-Button** → Inbetriebnahme neuer Geräte, mit eingebautem How-To:
  Firmware bauen (`esphome compile` als Backend-Job), **Erstflash per USB im
  Browser** (ESP Web Tools/Web Serial, lokal vendored unter `frontend/vendor/`),
  **MAC-Adresse auslesen** über die USB-Konsole (fürs Freischalten der MAC durch
  die IT — dauert erfahrungsgemäß bis zu 2 Arbeitstage). USB-Flashen/MAC-Auslesen
  funktionieren nur in Chrome/Edge über `http://localhost:8000` am Dashboard-PC
  (Web Serial braucht einen Secure Context).
- **⚙-Button** → Einstellungen: MQTT-Broker (eingebettet/extern, Port, anonym),
  Gas-Preise €/m³, Offline-Schwelle, Standard-Leck-/Downtime-Regeln.

**Eingebetteter MQTT-Broker:** Das Backend bringt einen kleinen Broker (`amqtt`) mit
und startet ihn standardmäßig auf `0.0.0.0:1883` (anonym). Ein separater Mosquitto ist
damit nicht nötig — die ESPHome-Geräte verbinden sich direkt mit der LAN-IP des
Dashboard-PCs.

**Passwortschutz:** In ⚙ „Anonyme Clients zulassen“ abwählen **und** Benutzer/Passwort
setzen → der Broker prüft echte Logins (amqtt-`FileAuthPlugin`; die sha512-Hash-Datei
`mqtt_passwd` erzeugt das Backend beim Start automatisch aus der Konfiguration).
Benutzer/Passwort müssen zu `firmware/secrets.yaml` (`mqtt_user`/`mqtt_password`)
passen — die Geräte haben ihre Zugangsdaten einkompiliert. Achtung: nur den Haken
rauszunehmen (ohne Benutzer/Passwort) prüft lediglich, ob *irgendein* Username
mitgeschickt wird — amqtts Anonymous-Plugin ignoriert Passwörter. MQTT läuft ohne
TLS: Schutz gegen versehentliche/neugierige LAN-Clients, nicht gegen Mitschneiden.

> Bekannte amqtt-Eigenheit (getestet mit 0.11.3): retained Messages werden bei
> jedem Subscribe an **alle** neuen Subscriptions ausgeliefert, auch wenn das
> Topic nicht passt. Für dieses System harmlos (Backend abonniert per Wildcard,
> die Firmware filtert Topics selbst) — beim Debuggen mit `mosquitto_sub` aber
> nicht wundern.

```
dashboard/
├─ backend/
│  ├─ app.py                 FastAPI-Server: eingebetteter Broker + MQTT-Ingest + REST-API + Frontend
│  ├─ config.json.example    Vorlage → wird beim ersten Start als config.json kopiert
│  ├─ config.json            lokale Konfiguration (gitignored — kann das MQTT-Passwort enthalten)
│  ├─ sensors.json           Sensor-Registry (id → Name, Gas, Abteilung, Regeln) – wird vom Dashboard gepflegt
│  └─ requirements.txt
└─ frontend/
   ├─ index.html
   └─ app.js            gesamte Dashboard-Logik (vanilla JS, kein Build)
```

## Start

```bash
cd dashboard/backend
pip install -r requirements.txt          # fastapi, uvicorn, paho-mqtt, amqtt
python app.py                            # Broker :1883 + Server auf http://127.0.0.1:8000
```
→ Browser auf **http://127.0.0.1:8000**. Alle Daten kommen von den echten Geräten;
ohne verbundene Geräte bleiben Trend und Live-Werte leer.

> **Windows:** `127.0.0.1` statt `localhost` verwenden — uvicorn bindet nur IPv4.
> Ohne `amqtt` startet das Backend trotzdem (eingebetteter Broker aus → externen Broker
> in ⚙/`config.json` eintragen). Ohne `paho-mqtt` läuft nur die DB-Auslieferung.

## Echtbetrieb

1. **Broker wählen** (⚙ im Dashboard): eingebettet lassen (Standard) **oder** externen
   Broker eintragen. Die ESPHome-Geräte tragen in `firmware/secrets.yaml` als
   `mqtt_broker` die **LAN-IP des Dashboard-PCs** ein (nicht `127.0.0.1`).
2. `python app.py` starten (dauerhaft z. B. als Dienst via NSSM / Taskplaner / systemd).
3. **Neues Gerät:** „＋ Gerät“-Button im Dashboard folgen (How-To eingebaut):
   Firmware bauen → Board per USB flashen → **Ethernet-MAC auslesen** → MAC von der
   IT freischalten lassen (**bis zu 2 Arbeitstage**) → Gerät per PoE anschließen.
   Es erscheint dann als **„nicht zugeordnet“** → Sensoren-Button → Name, Gas,
   Abteilung zuweisen; SP-Wert im Geräte-Webinterface (IP-Link) setzen. Fertig.
4. Preise, Offline-Schwelle und Standard-Alarmregeln in ⚙ setzen; abweichende Regeln
   pro Sensor direkt am Sensor.

> **Update von älteren Installationen:** Die Datenbank heißt jetzt `gas.db`
> (vorher `argon.db`). Beim ersten Start von `app.py` wird eine vorhandene
> `argon.db` automatisch umbenannt — Historie bleibt erhalten. Sollen alte
> (z. B. simulierte) Daten komplett weg: Backend stoppen und `gas.db` löschen.

## MQTT-Vertrag

Das Backend abonniert **beide** Topic-Schemata und mappt sie auf dieselbe Sensor-ID:

| Topic | Inhalt |
|---|---|
| `iwb/gas/<id>/status` bzw. `iwb/argon/<id>/status` | retained, `online`/`offline` (LWT) |
| `…/<id>/flow` | Nl/min (Momentandurchfluss) |
| `…/<id>/total` | Nl (monoton, persistent im Gerät) |
| `…/<id>/voltage` | V (Diagnose) |
| `…/<id>/uptime` | s (Diagnose) |
| `…/<id>/meta` | retained JSON `{ip, mac, hostname, sp, fw}` — Geräte-Box im Sensor-Manager, IP-Ziel für OTA |
| `…/<id>/cmd` ← | `reset` = Gesamtzähler des Geräts nullen (wird auf beiden Präfixen gesendet) |

`iwb/gas/` ist das Präfix der aktuellen Firmware (`firmware/gas-flowmeter.yaml`);
`iwb/argon/` publizieren nur noch Bestandsgeräte, die ihr OTA-Update auf die
gas-neutrale Firmware noch nicht bekommen haben — das Backend versteht beides.

## REST-API

| Endpoint | Inhalt |
|---|---|
| `GET /api/data` | komplettes Dashboard-Payload (Sensoren, daily[30], hourly[24], live, Alarme, Broker-Status) |
| `GET /api/health` | Status, Anzahl Sensoren, Broker |
| `GET /api/sensors` | Registry inkl. Live-Status, Overrides, Defaults (Sensor-Manager) |
| `POST /api/sensors/{id}` | Sensor ändern (`{name, gas, dept, leak, downtime}`; `null` = Standard) |
| `POST /api/sensors/{id}/reset` | Reset-Kommando an das Gerät (Zähler nullen) |
| `POST /api/sensors/{id}/ota` | OTA-Update: aktuellen Build aufs Gerät schieben (IP aus dem meta-Topic) |
| `GET /api/firmware` | Build-/Job-Status (Build vorhanden? Job läuft? Log-Ausschnitt) |
| `POST /api/firmware/build` | Firmware bauen (`esphome compile` im `firmware/`-Ordner des Checkouts) |
| `GET /api/firmware/manifest.json` · `…/factory.bin` | ESP-Web-Tools-Manifest + Factory-Image für den USB-Erstflash |
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
- **Alarme** (Standard in ⚙, pro Sensor überschreibbar) werden minütlich im Backend
  ausgewertet — auch wenn gerade kein Dashboard offen ist:
  - *Mehrverbrauch*: Mittel der letzten 7 vollen Tage (ohne den laufenden Tag)
    vs. der 21 Tage davor (> 15 % Warnung, > 30 % kritisch).
  - *Leerlauf/Leck*: Anlage online, Durchfluss zwischen `leak.min` und `leak.active` Nl/min.
  - *Downtime*: Verbrauch innerhalb definierter Stillstands-Fenster über `max_nl`.

## Hinweise

- Einheiten-Umschaltung **m³ ↔ €** und Bereich **24 h / 7 d / 30 d** rein im Frontend.
- Klick auf Abteilung, Sensorzeile oder Alarm fokussiert den Chart; ✎ öffnet die Sensor-Konfiguration.
- Drei Themes: **Control** (dunkel), **Light**, **Mono**.
- `total` ist in **Nl** (Normliter); m³ = Nl/1000. Preise als €/m³ pro Gas in ⚙.
- Fällt das Backend aus, zeigt das Dashboard einen roten Hinweis mit dem Zeitpunkt des
  letzten erfolgreichen Datenabrufs.
