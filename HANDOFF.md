# Projekt-Übergabe an Jorge — Gas-Durchflussmessung (iwb / TUM)

**Übergabe von:** Lovis Wach · **Stand:** 27.08.2026 · **Bei Fragen jederzeit bei Lovis melden.**

## Worum es geht (2 Minuten)

Erfassung des Gasverbrauchs (Argon, Stickstoff) an **~16 Anlagen** in der Produktionshalle:

> **Festo SFAH** (Volumenpuls) → **Olimex ESP32-POE2** (ESPHome, PoE) → **MQTT** → **Dashboard** (FastAPI + SQLite, eingebetteter MQTT-Broker)

Es gibt **eine Einheits-Firmware für alle Geräte** (`firmware/gas-flowmeter.yaml`) — Identität kommt aus der MAC, Anlagen-ID und SP-Wert werden zur Laufzeit im Geräte-Webinterface gesetzt. Welches Gas eine Anlage verbraucht, wird erst im Dashboard zugeordnet.

**Leseliste in dieser Reihenfolge:**
1. [`README.md`](README.md) — Überblick + End-to-End-Ablauf
2. [`Anleitung_Durchflussmesser.md`](Anleitung_Durchflussmesser.md) — Verdrahtung + Festo-Konfiguration (§3/§4 sind verifizierte Referenzen)
3. [`firmware/README.md`](firmware/README.md) — Inbetriebnahme, OTA, Bench-Test, Designentscheidungen
4. [`dashboard/README.md`](dashboard/README.md) — Backend/Frontend, API, Alarm-Logik

## Aktueller Stand (27.08.2026)

- **Software ist fertig für den Produktivbetrieb** und komplett auf `main` gemergt + gepusht (Stand `47e880a`, inkl. Dashboard-Redesign mit Sidebar, Alarm-Lebenszyklus, Berichten, TV-Modus).
- **2 von 16 Geräten laufen produktiv:**
  | Anlagen-ID | Gerät | IP (DHCP!) | Gas / Abteilung |
  |---|---|---|---|
  | `anlage-01` | Hostname `gas-flow-e4f248`, MAC `10:97:BD:E4:F2:48` | 192.168.178.38 | Argon |
  | `gas-e998c8` | — | 192.168.178.99 | Argon / BP |
- **Die aktuelle Instanz läuft auf Lovis' PC (192.168.178.37, Ports 8000 + 1883) und ist nur Test/Staging.** Kein Autostart (bewusst) — nach einem Reboot des PCs ist sie down, bis jemand sie manuell startet. Die echte Produktion soll auf die VM (deine Aufgabe 2).
- Festo-Sensor an `anlage-01` ist real eingestellt: **SP = 1 Nl**, **PULS = 75 ms** (das PULS-Menü hat nur diskrete Stufen; 75 ms passt zum 30-ms-Firmware-Filter).

---

## Deine Aufgaben

### 1. 3D-gedrucktes Gehäuse designen und drucken

- ⚠️ **Das Filament muss mit einer 0,6-mm-Düse gedruckt werden.** Wandstärken/Details als Vielfache von 0,6 mm auslegen (z. B. 1,2 / 1,8 / 2,4 mm), feine Features < 0,6 mm entfallen.
- Maße/Mechanik des Boards: [`ESP32-PoE2_Rev_B.pdf`](ESP32-PoE2_Rev_B.pdf) im Repo-Root; Olimex stellt zusätzlich CAD-/Designdaten auf seiner Website/GitHub bereit.
- Anforderungen ans Gehäuse:
  - Durchführungen: **RJ45 (PoE)** und **Sensorkabel** (Kabelverschraubung/Zugentlastung), idealerweise **USB-C zugänglich** (Notfall-Flash ohne Ausbau; dabei gilt: erst PoE ab!).
  - Montage nahe der Anlage (Schraublaschen oder Hutschienenclip), **Beschriftungsfeld** für Anlagen-ID/MAC einplanen.
  - Produktionshalle: Staub/Späne + Temperatur → hitzebeständigeres Filament (PETG/ASA statt PLA), Lüftungsschlitze eher sparsam.
  - Das Board ist **nicht galvanisch isoliert** — Gehäuse soll Berührung und leitfähige Fremdkörper fernhalten.

### 2. VM für das Dashboard (mit der IT) aufsetzen und initialisieren

**Anforderungen, die du der IT nennen musst:**
- Erreichbar aus dem Hallen-LAN auf **Port 8000 (HTTP-Dashboard)** und **Port 1883 (MQTT, eingebetteter Broker)**; feste IP oder DNS-Name (die Geräte bekommen die Broker-Adresse einkompiliert!).
- Python 3.11+, Git, ausgehend GitHub-Zugriff. Ressourcen minimal (SQLite, statisches Frontend).

**Setup auf der VM:**
```bash
git clone https://github.com/wachl/argon-flowmeter.git
cd argon-flowmeter/dashboard/backend
pip install -r requirements.txt
python app.py        # Web :8000 + MQTT-Broker :1883; config.json entsteht beim Erststart aus config.json.example
```

**Autostart als Dienst einrichten (systemd) — das ist der wichtigste offene Betriebspunkt.** Auf dem Test-PC gab es keinen Autostart; die Instanz war nach jedem Reboot down. Unter einem Supervisor `GAS_SUPERVISED=1` setzen — dann beendet sich der Prozess beim ⚙-Neustart-Button nur und der Dienst startet ihn neu.

**Migration vom Test-PC (Reihenfolge ist verifiziert):**
1. Vom Test-PC übernehmen (liegen **nicht** im Repo): `dashboard/backend/gas.db` (Messhistorie!), `dashboard/backend/config.json`, `dashboard/backend/sensors.json`, `firmware/secrets.yaml` → Übergabe durch Lovis.
2. In `firmware/secrets.yaml` den `mqtt_broker` auf die **VM-IP** stellen.
3. Im Dashboard „＋ Gerät“ → **Firmware bauen** (~30–60 s) — **vor** dem Umzug bauen, dann bleiben die Geräte solange online.
4. Backend auf der VM starten, danach **pro Gerät OTA** über den Sensor-Manager (6–12 s pro Gerät, nutzt die IP aus dem meta-Topic).
5. Prüfen: beide Geräte „online“, Zählerstände unverändert (OTA fasst den NVS-Zähler nicht an).

**Wichtige Einschränkungen:**
- Der **USB-Erstflash im Browser** (ESP Web Tools) funktioniert nur in **Chrome/Edge auf `http://localhost:8000`** (Web-Serial). Von der VM aus geht das nicht — neue Geräte flashst du entweder mit einem lokal laufenden Dashboard auf deinem PC oder per CLI: `esphome run gas-flowmeter.yaml` (aus `firmware/`, braucht die `secrets.yaml`).
- **Kein TLS** (MQTT und Dashboard-HTTP): Schutz gegen versehentliche LAN-Clients, nicht gegen Mitschneiden. Mit der IT klären: eigenes Netz-Segment und/oder Reverse-Proxy mit HTTPS vor Port 8000.
- Tägliche **Backups** landen in `dashboard/backend/backups/JJJJ-MM-TT/` (Rotation 30 Tage) — auf der VM verifizieren und idealerweise zusätzlich extern wegsichern (VM-Snapshot o. ä.).

### 3. Sensorinstallation mit den Anlagenverantwortlichen besprechen

16 Sensoren sind vorhanden. Pro Anlage klären und dokumentieren:
- **SFAH-Variante / Max-Durchfluss** → daraus ergibt sich der **SP-Wert** (Nl pro Puls) — ist pro Anlage noch offen.
- **Gasart** (Argon oder N2) → wird am Sensor (GAS-Menü) und im Dashboard gesetzt.
- Einbauort/Leitungsanschluss, Zugänglichkeit für PoE-Verkabelung (mit IT: wo sind PoE-Switch-Ports?).
- **Reale Anlagennamen + Abteilung** (werden im Dashboard zugewiesen) und **Stillstandszeiten** (für die Downtime-Alarme).
- Die **Klick-Anleitung für den Festo** ist [`Anleitung_Durchflussmesser.md`](Anleitung_Durchflussmesser.md) §4 (verifiziert gegen das Festo-Handbuch, PDF liegt im Repo): NPN, **Pin 4 = VOL/MASS**, PULS = 75 ms, SP notieren.

### 4. Restliche Sensoren vollständig aufbauen (14 Stück)

- Verdrahtung exakt nach [`Anleitung_Durchflussmesser.md`](Anleitung_Durchflussmesser.md) §3: Pulssignal auf **GPIO4** mit externer Pull-up-Beschaltung (1 kΩ Pull-up an 3,3 V + 1 kΩ + Z-Diode) — der Festo-NPN-Ausgang braucht ≥ 2 mA Last, das Board hat keinen Onboard-Pullup.
- ⚠️ **NIEMALS USB und PoE gleichzeitig anstecken** — das Board ist nicht galvanisch isoliert, das zerstört Board und/oder PC (Olimex-Handbuch).
- ⚠️ **24 V ausschließlich an Festo Pin 1** — nie an einen Board-Pin. Beim Bench-Test gemeinsame Masse zwischen 24-V-Netzteil und Board-GND zwingend (sonst liest GPIO4 Müll). Komplettes Bench-Setup: `firmware/README.md`, Abschnitt „Bench-Test ohne PoE“.
- Der SP-Wert am Festo **muss exakt** dem SP-Wert im Geräte-Webinterface entsprechen, sonst stimmt das Volumen nicht.

### 5. Sensoren mit MAC registrieren lassen, IPs dokumentieren

Ablauf pro Gerät (das How-To ist auch im Dashboard unter **„＋ Gerät“** eingebaut):

1. Firmware bauen (Dashboard oder CLI) → **per USB flashen**.
2. **Ethernet-MAC auslesen** — die Firmware loggt sie beim Boot und alle 15 s auf die USB-Konsole (Achtung: Ethernet-MAC = Basis-MAC + 3; die im Dashboard/meta angezeigte MAC ist bereits die richtige).
3. **MAC bei der IT freischalten lassen — dauert bis zu 2 Arbeitstage.**
   💡 **Deshalb: alle 14 Boards früh flashen und die MACs gesammelt in einem Rutsch bei der IT einreichen** — sonst wartest du 14-mal.
4. PoE anschließen → Gerät holt sich per DHCP eine IP und erscheint im Dashboard als „nicht zugeordnet“ (mit Link auf sein Webinterface).
5. Im **Geräte-Webinterface** `http://<IP>/`: **SP-Wert** und **Anlagen-ID** (z. B. `anlage-07`) setzen.
6. Im **Dashboard** (Administration → Sensoren): Name, Gas, Abteilung zuweisen.
7. **DHCP-Reservierung** für die MAC beantragen/anlegen — sonst ändert sich die IP irgendwann und der Webinterface-Link bricht (ist auf dem Test-Setup schon passiert).

**IP-Dokumentation:** Das Dashboard zeigt IP/MAC/Hostname/FW live (meta-Topic), `dashboard/backend/sensors.json` ist die Registry. Führe zusätzlich eine Tabelle **Anlage ↔ Anlagen-ID ↔ MAC ↔ IP ↔ Hostname** (z. B. hier im Repo als `GERAETE.md`) — das ist das, was IT und Anlagenverantwortliche sehen wollen.

### 6. Fehlende Features & Bugs

Selber beheben, wenn möglich — sonst als **GitHub-Issue** in [`wachl/argon-flowmeter`](https://github.com/wachl/argon-flowmeter) tracken oder Lovis Bescheid geben. **Dafür brauchst du Collaborator-Zugriff aufs Repo → bei Lovis anfragen.**

Bekannte offene Punkte (Kandidaten für die ersten Issues):

| Punkt | Status |
|---|---|
| Autostart der Produktivinstanz | offen → auf der VM per systemd lösen (Aufgabe 2) |
| DHCP-Reservierungen für alle Geräte | offen (Aufgabe 5, Schritt 7) |
| TLS/HTTPS (MQTT + Dashboard) | offen → mit IT klären |
| SP-Werte + reale Anlagennamen pro Anlage | offen (Aufgabe 3) |
| Tank-Füllstände, E-Mail-Reports, Benutzerliste, PDF-Report, Kalibrierdatum, Verbrauchs-Split produktiv/idle | bewusst noch nicht gebaut (keine echten Daten/Anforderungen) |

**Bekannte Eigenheiten (kein Handlungsbedarf, aber gut zu wissen):**
- Der eingebettete amqtt-Broker hält retained Messages **nur im RAM** — ein Backend-Neustart leert sie (Geräte publizieren alle 60 s neu, füllt sich also selbst wieder). Wildcard-Subscriptions matcht amqtt unsauber (liefert zu viel) — beim Debuggen mit `mosquitto_sub` nicht wundern.
- `pulse_meter` publiziert beim Boot einmal `total=0` → kurz nach einem Geräte-Boot kann eine Phantom-Fluss-Anzeige aufblitzen, verbucht aber kein Volumen.
- Verbrauchslogik, Alarm-Lebenszyklus (AKTIV → QUITTIERT → AUFGELÖST) und Re-Arm-Regeln: `dashboard/README.md`, Abschnitt „Wie der Verbrauch berechnet wird“.

**Arbeitsweise:** Feature-Branch → Merge nach `main` → auf der VM deployen (`git pull` + Neustart-Button in der Administration bzw. Dienst-Restart).

---

## Zugangsdaten & Secrets (nicht im Repo!)

Zwei Dateien sind **gitignored** und existieren nur auf dem Test-PC — die bekommst du **persönlich von Lovis**:

| Datei | Inhalt |
|---|---|
| `dashboard/backend/config.json` | MQTT-Benutzer/Passwort, Dashboard-Login-Passwort, Preise/Schwellen |
| `firmware/secrets.yaml` | Broker-IP, MQTT-Zugangsdaten (werden vom Dashboard automatisch synchron gehalten), **OTA-Passwort**, API-Key |

- Das MQTT-Passwort ist im Dashboard unter Administration → MQTT-Broker per 👁 im Klartext einsehbar (nach Login).
- Das **OTA-Passwort** ist einkompiliert; eine Änderung erfordert USB-Reflash aller Geräte — also nicht anfassen.
- **Empfehlung:** Nach dem VM-Umzug MQTT- und Login-Passwort rotieren. Das verifizierte Rezept: Administration → Zugangsdaten ändern (Sync nach `secrets.yaml` automatisch) → Firmware bauen (**vor** dem Neustart!) → Backend-Neustart (Broker-Cutover) → pro Gerät OTA.
- Keine Passwörter in Repo, Issues oder Chat-Nachrichten schreiben.

## Die 5 wichtigsten Warnungen auf einen Blick

1. ⚠️ **Nie USB + PoE gleichzeitig** am ESP32-POE2 (zerstört Board/PC).
2. ⚠️ **24 V nur an Festo Pin 1**, nie ans Board; Bench-Test nur mit gemeinsamer Masse.
3. ⚠️ **Gehäuse-Filament: 0,6-mm-Düse.**
4. ⏳ **IT-MAC-Freischaltung dauert bis 2 Arbeitstage** → MACs gesammelt einreichen.
5. 🔑 **SP am Festo = SP im Geräte-Webinterface**, sonst falsche Volumina.
