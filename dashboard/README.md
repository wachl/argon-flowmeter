# Gas-Monitoring – Dashboard

Kleines Backend (FastAPI + paho-mqtt + SQLite) + statisches Frontend. Liest die
MQTT-Telemetrie der ESPHome-Durchflussmesser (Argon + Stickstoff), akkumuliert den
Verbrauch in stündliche Buckets und zeigt KPIs, Verbrauchs-Trend, Alarme, Abteilungs-
und Sensorübersicht. Oberfläche **Deutsch/Englisch** umschaltbar (Header, wird im
Browser gemerkt).

## Benutzer-Ebenen

- **Ohne Anmeldung** (sobald ein Login-Passwort gesetzt ist): komplettes Dashboard
  **nur lesend** — Live-Status, Historie, Kosten, Alarme, Alarm-Historie und
  **CSV-Export**. Keine Änderungen möglich (Buttons ausgeblendet, API-seitig gesperrt).
- **Angemeldet** (Login-Button → Passwort): zusätzlich Sensor-Manager, ⚙-Einstellungen,
  „＋ Gerät“/Firmware, Alarm-Quittierung, Zähler-Reset, Backend-Neustart.
- Login-Passwort setzen: ⚙ → **Dashboard-Login**. Ohne gesetztes Passwort ist alles
  offen (Erstinbetriebnahme). Sessions halten 30 Tage; Passwortänderung meldet alle ab.

**Konfiguration komplett im Dashboard:**

- **Sensoren-Button** → Sensor-Manager: neue Geräte erscheinen automatisch als
  „nicht zugeordnet“ und werden hier benannt und einem Gas + einer Abteilung
  zugewiesen; pro Sensor **Notizfeld** (persistent, 📝 in der Tabelle),
  Leck-Schwellen und Downtime-Fenster überschreibbar, Gesamtzähler-Reset,
  Abteilungen anlegen/löschen. Die Geräte-Box zeigt IP (Link aufs
  Geräte-Webinterface), SP-Wert, MAC, Firmware und bietet **Firmware-Update (OTA)**.
- **＋ Gerät-Button** → Inbetriebnahme neuer Geräte mit How-To: Firmware bauen,
  **Erstflash per USB im Browser** (ESP Web Tools, vendored), **MAC-Adresse auslesen**
  (IT-Freischaltung). Nur Chrome/Edge über `http://localhost:8000` (Web Serial).
- **Export-Button** → historische Verbrauchsdaten als **CSV**: Umfang (gesamt /
  Abteilung / Anlage), Zeitraum von–bis, Auflösung Tag/Stunde. Semikolon-getrennt
  mit Dezimalkomma → öffnet direkt in deutschem Excel.
- **⚙-Button** → Einstellungen: MQTT-Broker (eingebettet/extern, Benutzer/Passwort —
  **Klartext-Anzeige** per 👁), Gas-Preise €/m³, Offline-Schwelle, **Offline-Alarm**,
  tägliches **Backup**, Standard-Leck-/Downtime-Regeln, Dashboard-Login,
  **Backend-Neustart** per Klick.

**Eingebetteter MQTT-Broker:** Das Backend bringt einen kleinen Broker (`amqtt`) mit
und startet ihn standardmäßig auf `0.0.0.0:1883`. Ein separater Mosquitto ist nicht
nötig — die ESPHome-Geräte verbinden sich mit der LAN-IP des Dashboard-PCs.

**MQTT-Zugangsschutz:** Benutzer **und** Passwort in ⚙ gesetzt → der Broker prüft
echte Logins (amqtt-`FileAuthPlugin`; Hash-Datei `mqtt_passwd` erzeugt das Backend
automatisch). Beides leer → anonyme Clients erlaubt. Die Zugangsdaten werden beim
Speichern **automatisch nach `firmware/secrets.yaml` gespiegelt** (dort holt sie der
Firmware-Build ab — Erstflash enthält sie also direkt); weicht die Datei ab, zeigt ⚙
eine Warnung. Änderungen greifen nach Backend-Neustart (Button in ⚙); danach brauchen
**bereits geflashte** Geräte einmal Build + OTA, damit sie die neuen Zugangsdaten
einkompiliert bekommen. MQTT läuft ohne TLS: Schutz gegen versehentliche/neugierige
LAN-Clients, nicht gegen Mitschneiden — gleiches gilt für das Dashboard-Login (HTTP).

> Bekannte amqtt-Eigenheit (getestet mit 0.11.3): retained Messages werden bei
> jedem Subscribe an **alle** neuen Subscriptions ausgeliefert, auch wenn das
> Topic nicht passt. Für dieses System harmlos — beim Debuggen mit
> `mosquitto_sub` aber nicht wundern.

```
dashboard/
├─ backend/
│  ├─ app.py                 FastAPI-Server: eingebetteter Broker + MQTT-Ingest + REST-API + Frontend
│  ├─ config.json.example    Vorlage → wird beim ersten Start als config.json kopiert
│  ├─ config.json            lokale Konfiguration (gitignored — enthält MQTT-/Login-Passwort)
│  ├─ sensors.json           Sensor-Registry (id → Name, Gas, Abteilung, Notiz, Regeln) – vom Dashboard gepflegt
│  ├─ backups/               tägliche Backups (DB + Konfig, rotierend; gitignored)
│  └─ requirements.txt
└─ frontend/
   ├─ index.html
   └─ app.js            gesamte Dashboard-Logik (vanilla JS, kein Build), DE/EN via I18N-Tabelle
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

1. **Broker wählen** (⚙): eingebettet lassen (Standard) **oder** externen Broker
   eintragen. Die Geräte tragen in `firmware/secrets.yaml` als `mqtt_broker` die
   **LAN-IP des Dashboard-PCs** ein (nicht `127.0.0.1`; ⚙ zeigt die LAN-IP an).
2. **MQTT-Benutzer/Passwort** in ⚙ setzen (wird nach `secrets.yaml` gespiegelt),
   **Login-Passwort** für das Dashboard setzen, Preise/Schwellen prüfen.
3. `python app.py` starten (dauerhaft z. B. via NSSM / Taskplaner). Der
   **Neustart-Button** in ⚙ startet den Prozess selbstständig neu (abgekoppelter
   Helfer wartet, bis der Port frei ist; unter einem Supervisor stattdessen
   `GAS_SUPERVISED=1` setzen — dann beendet sich der Prozess nur).
4. **Neues Gerät:** „＋ Gerät“ folgen (How-To eingebaut): Firmware bauen → per USB
   flashen (MQTT-Zugangsdaten sind ab dem Erstflash enthalten) → MAC auslesen →
   IT-Freischaltung (bis 2 Arbeitstage) → PoE → als „nicht zugeordnet“ zuweisen.
5. Backups liegen unter `backend/backups/JJJJ-MM-TT/` (täglich, Rotation per ⚙).

> **Update von älteren Installationen:** Die Datenbank heißt `gas.db` (früher
> `argon.db`, wird beim ersten Start automatisch umbenannt). `allow_anonymous` in
> `config.json` ist obsolet — ob der Broker Logins prüft, ergibt sich jetzt allein
> daraus, ob Benutzer **und** Passwort gesetzt sind.

## MQTT-Vertrag

Das Backend abonniert **beide** Topic-Schemata und mappt sie auf dieselbe Sensor-ID:

| Topic | Inhalt |
|---|---|
| `iwb/gas/<id>/status` bzw. `iwb/argon/<id>/status` | retained, `online`/`offline` (LWT) |
| `…/<id>/flow` | Nl/min (Momentandurchfluss) |
| `…/<id>/total` | Nl (monoton, persistent im Gerät) |
| `…/<id>/voltage` | V (Diagnose) |
| `…/<id>/uptime` | s (Diagnose) |
| `…/<id>/meta` | retained JSON `{ip, mac, hostname, sp, fw}` — Geräte-Box, IP-Ziel für OTA |
| `…/<id>/cmd` ← | `reset` = Gesamtzähler des Geräts nullen (auf beiden Präfixen gesendet) |

`iwb/gas/` ist das Präfix der aktuellen Firmware (`firmware/gas-flowmeter.yaml`);
`iwb/argon/` publizieren nur noch Bestandsgeräte ohne Update — das Backend versteht beides.

## REST-API

Öffentlich (read-only): `data`, `health`, `auth`, `login`, `export.csv`, `alarms/history`.
Alles Ändernde sowie `config`/`sensors`/`firmware` verlangen den Login-Token
(`X-Auth`-Header; ESP-Web-Tools-Downloads alternativ `?auth=`-Query).

| Endpoint | Inhalt |
|---|---|
| `GET /api/data` | komplettes Dashboard-Payload (Sensoren inkl. Notiz, daily[30], hourly[24], live, Alarme) |
| `GET /api/health` | Status, Anzahl Sensoren, Broker |
| `GET /api/auth` · `POST /api/login` | Login-Status · Login (`{password}` → `{token}`) |
| `GET /api/export.csv?scope=&res=&start=&end=` | CSV-Export (`scope`: `total`\|`dept:<id>`\|`sensor:<id>`, `res`: `day`\|`hour`, Datum `YYYY-MM-DD`) |
| `GET /api/alarms/history` | Alarm-Historie (aktiv + quittiert + auto-aufgelöst) |
| `GET /api/sensors` | Registry inkl. Live-Status, Overrides, Defaults (Sensor-Manager) |
| `POST /api/sensors/{id}` | Sensor ändern (`{name, note, gas, dept, leak, downtime}`; `null` = Standard) |
| `POST /api/sensors/{id}/reset` · `/ota` | Zähler-Reset-Kommando · OTA-Update (IP aus meta) |
| `GET /api/firmware` · `POST /api/firmware/build` | Build-/Job-Status · Firmware bauen |
| `GET /api/firmware/manifest.json` · `…/factory.bin` | ESP-Web-Tools-Manifest + Factory-Image (Token nötig — Image enthält Secrets) |
| `DELETE /api/sensors/{id}` | Registry-Eintrag löschen |
| `POST /api/departments` · `DELETE /api/departments/{id}` | Abteilung anlegen/umbenennen/löschen |
| `POST /api/alarms/{id}/ack` | Alarm quittieren |
| `GET /api/config` · `POST /api/config` | Einstellungen lesen/schreiben (`config.json`; MQTT-Passwort im Klartext → Admin-only) |
| `POST /api/restart` | Backend neu starten |
| `GET /` | Dashboard (statisch) |

## Wie der Verbrauch berechnet wird

- Das Gerät sendet einen **monotonen Gesamtzähler** (`total`, Nl). Das Backend bildet
  Deltas zwischen aufeinanderfolgenden Werten und summiert sie in **stündliche Buckets**
  (`hourly`-Tabelle). Ein Zähler-**Reset** (neuer Wert < alter) wird als neue Basislinie
  behandelt (kein negativer Verbrauch).
- Tag/Woche/Monat = Summen der Stundenbuckets; der CSV-Export liest dieselben Buckets.
- **Alarme** (Standard in ⚙, pro Sensor überschreibbar) werden minütlich im Backend
  ausgewertet — auch ohne offenes Dashboard:
  - *Mehrverbrauch*: Mittel der letzten 7 vollen Tage vs. der 21 Tage davor
    (> 15 % Warnung, > 30 % kritisch).
  - *Leerlauf/Leck*: Anlage online, Durchfluss zwischen `leak.min` und `leak.active` Nl/min.
  - *Downtime*: Verbrauch innerhalb definierter Stillstands-Fenster über `max_nl`.
  - *Offline*: zugeordneter Sensor länger als die Schwelle (⚙, Standard 15 min) ohne
    Daten → Warnung (kritisch ab 2 h). **Löst sich automatisch auf**, sobald das Gerät
    wieder online ist (in der Historie als „auto aufgelöst“ sichtbar).

## Hinweise

- Einheiten-Umschaltung **m³ ↔ €**, Bereich **24 h / 7 d / 30 d**, Sprache **DE/EN**
  und Theme rein im Frontend (werden im Browser gemerkt).
- Klick auf Abteilung, Sensorzeile oder Alarm fokussiert den Chart.
- `total` ist in **Nl** (Normliter); m³ = Nl/1000. Preise als €/m³ pro Gas in ⚙.
- Fällt das Backend aus, zeigt das Dashboard einen roten Hinweis mit dem Zeitpunkt des
  letzten erfolgreichen Datenabrufs.
