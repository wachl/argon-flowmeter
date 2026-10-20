# Gas-Monitoring – Dashboard

Kleines Backend (FastAPI + paho-mqtt + SQLite) + statisches Frontend. Liest die
MQTT-Telemetrie der ESPHome-Durchflussmesser (Argon + Stickstoff), akkumuliert den
Verbrauch in stündliche Buckets und zeigt KPIs, Verbrauchs-Trend, Alarme, Abteilungs-
und Sensorübersicht. Oberfläche **Deutsch/Englisch** umschaltbar (Sidebar, wird im
Browser gemerkt).

**Oberfläche (Redesign 2026-08, TUM-Look):** feste Sidebar mit den Bildschirmen

- **Übersicht** – KPI-Zeile, Verbrauchs-Trend je Abteilung, aktive Alarme,
  Abteilungs-Karten, Anlagen-Tabelle (Zeile → Anlagen-Ansicht)
- **Abteilungen** → Abteilungs-Detail (Trend, Verbrauch je Anlage, Tabelle, Anteil am Werk)
- **Anlagen** → Anlagen-Detail (Alarm-Banner mit Quittieren/Auflösen, Tages-/Stunden-
  Chart, Alarm-Historie der Anlage, Geräte-Info inkl. IP/MAC/FW/SP, Schwellen, Notiz)
- **Alarme** – Filter Aktiv/Quittiert/Aufgelöst, Dauer, Aktionen, 30-Tage-Statistik
  (Anzahl, mittlere Lösungszeit, geschätzter Leck-Verlust), Log-Export
- **Berichte** – Monats-Aggregate aus den Stundendaten (m³ je Gas, Kosten,
  Vergleich zum Vormonat, CSV je Monat), Kosten je Abteilung, Inline-CSV-Export
- **Administration** (nur mit Login) – Tabs Sensoren / Abteilungen /
  Preise & Schwellen / MQTT-Broker / Login & System; „＋ Gerät hinzufügen“ öffnet den
  Flasher (USB/OTA/MAC wie gehabt)
- **TV-Modus** (`#/tv`, Link unten in der Sidebar) – dunkler Vollbild-Schirm für den
  Hallenmonitor: Live-Durchfluss je Gas (24-h-Balken), Alarme, Abteilungs-Balken,
  Laufband mit allen Anlagen. Klick beendet ihn.

Gas-Filter, Zeitraum (24 h/7 d/30 d) und Einheit (m³/€) wirken auf alle Zahlen und
Charts; alle Inhalte kommen live aus dem Backend (kein Platzhalter-Inhalt).

## Benutzer-Ebenen

- **Ohne Anmeldung** (sobald ein Login-Passwort gesetzt ist): komplettes Dashboard
  **nur lesend** — Live-Status, Historie, Kosten, Alarme, Alarm-Historie und
  **CSV-Export**. Keine Änderungen möglich (Buttons ausgeblendet, API-seitig gesperrt).
- **Angemeldet** (Benutzer-Chip in der Sidebar → Passwort): zusätzlich die komplette
  Administration (Sensoren, Abteilungen, Preise/Schwellen, Broker, Firmware),
  Alarm-Quittieren/-Auflösen, Notizen, Zähler-Reset, Backend-Neustart.
- Login-Passwort setzen: Administration → **Login & System**. Ohne gesetztes Passwort
  ist alles offen (Erstinbetriebnahme). Sessions halten 30 Tage; Passwortänderung
  meldet alle ab.

**Konfiguration komplett im Dashboard (Administration):**

- **Tab Sensoren**: neue Geräte erscheinen automatisch als „nicht zugeordnet“ und
  werden hier benannt und einem Gas + einer Abteilung zugewiesen; pro Sensor
  **Notizfeld** (persistent, 📝 in der Tabelle, auch auf der Anlagen-Seite editierbar),
  Leck-Schwellen und Downtime-Fenster überschreibbar, Gesamtzähler-Reset. Die
  Geräte-Box zeigt IP (Link aufs Geräte-Webinterface), SP-Wert, MAC, Firmware und
  bietet **Firmware-Update (OTA)**.
- **Tab Abteilungen**: anlegen, umbenennen, löschen.
- **„＋ Gerät hinzufügen“** (Kopfzeile) → Inbetriebnahme neuer Geräte mit How-To:
  Firmware bauen, **Erstflash per USB im Browser** (ESP Web Tools, vendored),
  **MAC-Adresse auslesen** (IT-Freischaltung). Nur Chrome/Edge über
  `http://localhost:8000` (Web Serial).
- **Export CSV** (Kopfzeile jedes Bildschirms, vorbelegt auf Abteilung/Anlage; auch
  als Karte unter Berichte) → historische Verbrauchsdaten als **CSV**: Umfang
  (gesamt / Abteilung / Anlage), Zeitraum von–bis, Auflösung Tag/Stunde.
  Semikolon-getrennt mit Dezimalkomma → öffnet direkt in deutschem Excel.
- **Tab Preise & Schwellen**: Gas-Preise €/m³, Offline-Schwelle, **Offline-Alarm**,
  Standard-Leck-/Downtime-Regeln. **Tab MQTT-Broker**: eingebettet/extern,
  Benutzer/Passwort (**Klartext-Anzeige** per 👁), **Firmware-Secrets** (Broker-Adresse
  für die Geräte, OTA-Passwort, API-Key → `firmware/secrets.yaml`).
  **Tab Login & System**: Dashboard-Login, tägliches **Backup**,
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

**Firmware-Secrets:** `firmware/secrets.yaml` (gitignored) wird vom Backend verwaltet:
beim Start angelegt bzw. vervollständigt (Broker = LAN-IP des Servers, OTA-Passwort und
API-Key zufällig erzeugt, MQTT-Zugangsdaten aus `config.json`), in ⚙ → MQTT-Broker →
Firmware-Secrets editierbar und vor jedem Build geprüft — fehlt etwas, blockiert der
Dialog „＋ Gerät“ mit Klartext-Hinweis statt eines esphome-Fehlers. Ein frischer Klon
kann damit sofort Firmware bauen. Läuft das Dashboard auf einem Server ohne Web-Serial,
lässt sich das gebaute `factory.bin` im Dialog herunterladen und am PC flashen:
`python -m esptool --chip esp32 write_flash 0x0 gas-flowmeter.factory.bin`.

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
   eintragen. Die Broker-Adresse für die Geräte (`mqtt_broker` in `firmware/secrets.yaml`)
   setzt das Backend beim Start auf die **LAN-IP des Dashboard-PCs**; prüfen/ändern in
   ⚙ → MQTT-Broker → Firmware-Secrets (nicht `127.0.0.1`).
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

Öffentlich (read-only): `data`, `health`, `auth`, `login`, `export.csv`,
`alarms/history`, `report/monthly`. Alles Ändernde sowie `config`/`sensors`/`firmware`
verlangen den Login-Token (`X-Auth`-Header; ESP-Web-Tools-Downloads alternativ
`?auth=`-Query).

| Endpoint | Inhalt |
|---|---|
| `GET /api/data` | komplettes Dashboard-Payload (Sensoren inkl. Notiz/Meta/Regeln, daily[30], hourly[24], hourly24 (rollierend), live, Alarme mit `state`) |
| `GET /api/report/monthly` | Monats-Aggregate aus den Stundenbuckets (Nl je Monat, je Gas, je Abteilung×Gas) — Berichte-Bildschirm |
| `GET /api/health` | Status, Anzahl Sensoren, Broker |
| `GET /api/auth` · `POST /api/login` | Login-Status · Login (`{password}` → `{token}`) |
| `GET /api/export.csv?scope=&res=&start=&end=` | CSV-Export (`scope`: `total`\|`dept:<id>`\|`sensor:<id>`, `res`: `day`\|`hour`, Datum `YYYY-MM-DD`) |
| `GET /api/alarms/history` | Alarm-Historie (aktiv + quittiert + aufgelöst, `state` je Eintrag) |
| `GET /api/sensors` | Registry inkl. Live-Status, Overrides, Defaults (Sensor-Manager) |
| `POST /api/sensors/{id}` | Sensor ändern (`{name, note, gas, dept, leak, downtime}`; `null` = Standard) |
| `POST /api/sensors/{id}/reset` · `/ota` | Zähler-Reset-Kommando · OTA-Update (IP aus meta) |
| `GET /api/firmware` · `POST /api/firmware/build` | Build-/Job-Status (inkl. `secrets_problems`, `esphome`) · Firmware bauen (400 mit Klartext, wenn `secrets.yaml` unvollständig) |
| `GET /api/firmware/manifest.json` · `…/factory.bin` | ESP-Web-Tools-Manifest + Factory-Image (Token nötig — Image enthält Secrets) |
| `DELETE /api/sensors/{id}` | Registry-Eintrag löschen |
| `POST /api/departments` · `DELETE /api/departments/{id}` | Abteilung anlegen/umbenennen/löschen |
| `POST /api/alarms/{id}/ack` | Alarm quittieren (gesehen, bleibt gelistet) |
| `POST /api/alarms/{id}/resolve` | Alarm auflösen (erledigt → Historie, Re-Arm-Regeln starten) |
| `GET /api/config` · `POST /api/config` | Einstellungen lesen/schreiben (`config.json`; MQTT-Passwort im Klartext → Admin-only). `secrets` = Firmware-Secrets (`mqtt_broker`, `ota_password`, `api_encryption_key` → `firmware/secrets.yaml`) |
| `POST /api/restart` | Backend neu starten |
| `GET /` | Dashboard (statisch) |

## Wie der Verbrauch berechnet wird

- Das Gerät sendet einen **monotonen Gesamtzähler** (`total`, Nl). Das Backend bildet
  Deltas zwischen aufeinanderfolgenden Werten und summiert sie in **stündliche Buckets**
  (`hourly`-Tabelle). Ein Zähler-**Reset** (neuer Wert < alter) wird als neue Basislinie
  behandelt (kein negativer Verbrauch).
- Tag/Woche/Monat = Summen der Stundenbuckets; der CSV-Export liest dieselben Buckets.
- **Alarme** (Standard in der Administration, pro Sensor überschreibbar) werden
  minütlich im Backend ausgewertet — auch ohne offenes Dashboard. Lebenszyklus
  **AKTIV → QUITTIERT → AUFGELÖST**: Quittieren heißt „gesehen, Ursache besteht
  weiter“ (Alarm bleibt gelistet und aktualisiert seinen Wert), Auflösen heißt
  „erledigt“ (wandert in die Historie; erst danach greifen die Re-Arm-Regeln:
  Leck/Mehrverbrauch frühestens nach 6 h wieder, Downtime nach erneutem
  Mehrverbrauch, Offline erst wenn das Gerät zwischenzeitlich online war):
  - *Mehrverbrauch*: Mittel der letzten 7 vollen Tage vs. der 21 Tage davor
    (> 15 % Warnung, > 30 % kritisch).
  - *Leerlauf/Leck*: Anlage online, Durchfluss zwischen `leak.min` und `leak.active` Nl/min.
  - *Downtime*: Verbrauch innerhalb definierter Stillstands-Fenster über `max_nl`.
  - *Offline*: zugeordneter Sensor länger als die Schwelle (⚙, Standard 15 min) ohne
    Daten → Warnung (kritisch ab 2 h). **Löst sich automatisch auf**, sobald das Gerät
    wieder online ist (in der Historie als „auto aufgelöst“ sichtbar).

## Hinweise

- Einheiten-Umschaltung **m³ ↔ €**, Bereich **24 h / 7 d / 30 d** und Sprache
  **DE/EN** rein im Frontend (werden im Browser gemerkt). **24 h** ist ein
  rollierendes Fenster bis zur laufenden Stunde.
- Klick auf Abteilungs-Karte/-Zeile öffnet die Abteilung, Klick auf eine
  Anlagen-Zeile oder einen Alarm die Anlagen-Ansicht.
- `total` ist in **Nl** (Normliter); m³ = Nl/1000. Preise als €/m³ pro Gas in ⚙.
- Fällt das Backend aus, zeigt das Dashboard einen roten Hinweis mit dem Zeitpunkt des
  letzten erfolgreichen Datenabrufs.
