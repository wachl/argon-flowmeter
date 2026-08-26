# ESPHome-Firmware – Gas-Durchflussmesser (Argon, Stickstoff, ...)

Olimex **ESP32-POE2** + Festo **SFAH** (Volumenpuls-Ausgang). PoE liefert Strom **und**
Netzwerk. Updates laufen nach dem ersten Flashen **per OTA über Ethernet**.

Es gibt **eine Firmware für alle Geräte** — keine Geräte-Dateien, keine einkompilierten
Kennwerte. Identität und Konfiguration entstehen zur Laufzeit:

| Was | Woher |
|---|---|
| Hostname | `gas-flow-<MAC-Suffix>` (eindeutig je Gerät, aus der MAC) |
| IP-Adresse | DHCP vergibt sie an die eindeutige MAC → im Router **reservieren** = stabile IP |
| **Anlagen-ID** | Geräte-Webinterface `http://<IP>/` (Standard: `gas-<MAC-Suffix>`) |
| **SP-Wert** (Nl/Puls) | Geräte-Webinterface — muss exakt dem Festo-SP entsprechen (Standard: 1.0) |

Anlagen-ID und SP-Wert liegen im NVS-Flash des Geräts und überleben Reboot,
Stromausfall und OTA-Updates. Die Firmware ist **gas-neutral**: welches Gas
(Argon/Stickstoff) eine Anlage verbraucht, wird erst im Dashboard zugeordnet.

## Dateien

| Datei | Zweck |
|---|---|
| `gas-flowmeter.yaml` | **Die** Firmware. Wird direkt geflasht (alle Geräte identisch). |
| `gas_id.h` | C++-Helfer (Anlagen-ID/Topics zur Laufzeit), wird von der YAML eingebunden. |
| `secrets.yaml.example` | Vorlage → als `secrets.yaml` ablegen (Broker, Passwörter, API-Key). |
| `diag-*.yaml` | Diagnose-Firmwares (MAC auslesen, Pin-Test). |

## Setup

1. **ESPHome installieren** (CLI reicht):
   ```bash
   pip install esphome
   ```
2. **Secrets anlegen:**
   ```bash
   cp secrets.yaml.example secrets.yaml
   # mqtt_broker / Passwörter eintragen; API-Key erzeugen:
   openssl rand -base64 32
   ```
   `mqtt_user`/`mqtt_password` pflegt danach das **Dashboard**: Änderungen in
   ⚙ → MQTT-Broker werden automatisch in diese Datei gespiegelt, damit jeder
   Build (und damit jeder Erstflash) die aktuellen Zugangsdaten einkompiliert
   bekommt. Bereits laufende Geräte brauchen nach einer Passwortänderung einmal
   Build + OTA.

## Neues Gerät in Betrieb nehmen

> ⚠️ **PoE-Kabel abziehen, solange USB steckt.** Der ESP32-POE2 ist nicht galvanisch
> isoliert – USB **und** PoE gleichzeitig zerstört Board/PC (Olimex-Handbuch).

**Bequemster Weg: im Dashboard über den „＋ Gerät“-Button** (Chrome/Edge auf
`http://localhost:8000` am Dashboard-PC): Firmware bauen → per USB im Browser
flashen (ESP Web Tools) → **MAC-Adresse auslesen** → MAC bei der IT freischalten
lassen (bis zu 2 Arbeitstage) → PoE anschließen. Das eingebaute How-To führt
durch alle Schritte. Per CLI geht es genauso:

1. **Flashen (einmalig per USB):**
   ```bash
   esphome run gas-flowmeter.yaml
   ```
   Die Firmware loggt beim Boot (und alle 15 s, solange kein Netzwerk da ist) die
   **Ethernet-MAC** auf die USB-Konsole — das ist die Adresse für die
   IT-Freischaltung (Espressif-Schema: Basis-MAC + 3).
2. USB trennen → PoE anschließen (nach der IT-Freischaltung). Das Gerät holt sich
   per DHCP eine IP und meldet sich am Broker als `gas-<MAC-Suffix>` → erscheint
   im Dashboard automatisch als **„nicht zugeordnet“** (inkl. seiner IP im
   Sensor-Manager).
3. **Geräte-Webinterface öffnen** — `http://<IP>/` (Link im Sensor-Manager) oder
   `http://gas-flow-<MAC-Suffix>.local/` — und einstellen:
   - **SP-Wert (Nl pro Puls)** = der am Festo-SFAH eingestellte Schwellwert **SP**
     (Anleitung, Abschnitt 4). Wirkt sofort, kein Neustart nötig.
   - **Anlagen-ID** (optional, z. B. `anlage-17`) = Sensor-ID im Dashboard und in
     den MQTT-Topics. Leer = MAC-basierte ID. Eine Änderung räumt die alten
     retained Topics ab und startet das Gerät mit der neuen ID neu.
4. **Im Dashboard** (Sensoren-Button): Name, Gas und Abteilung zuweisen.
5. Empfohlen: **DHCP-Reservierung** für die MAC im Router anlegen, damit die IP
   (und damit der Webinterface-Link) stabil bleibt.

Das Webinterface zeigt außerdem den Live-Status: Durchfluss, Gesamtvolumen,
Puls-Eingang (Debug-Zähler), IP/MAC, aktive Anlagen-ID, Versorgungsspannung, Uptime.

- **SP am Sensor geändert?** → im Geräte-Webinterface den SP-Wert nachziehen.
  **Kein Neu-Flashen mehr.** (Wirkt nur auf künftige Pulse, nicht rückwirkend.)
- **Gerät ersetzt?** → neues Gerät flashen, im Webinterface die alte Anlagen-ID
  eintragen → Dashboard führt Historie und Zuordnung nahtlos weiter.

## Bench-Test ohne PoE

Zum Testen am Schreibtisch geht es ohne PoE — **aber das Board erzeugt die 24 V nur aus PoE**
(VPP/EXT1 Pin 1 ist tot bei USB-Versorgung). Der Sensor braucht daher eine **separate** 24-V-Quelle.

**1. Board versorgen** (eine Option):
- **USB-C** vom PC (zugleich Flashen + Logs). ⚠️ Dann **kein** PoE anstecken.
- oder extern **+5 V** auf **EXT1 Pin 5 (+5V)** + **GND** (EXT1 Pin 2). ⚠️ Pin 5 hängt an USB-5V → nicht zusätzlich USB.

> Ethernet/MQTT läuft komplett über USB-Strom. Für reinen Firmware-/Netzwerktest ist kein Sensor nötig.

**2. Festo-Sensor separat mit 24 V** (Labornetzteil 22–26 V):
- +24 V → Festo **Pin 1 (BN)**, 0 V → Festo **Pin 3 (BU)**
- 🔑 **PSU-0 V zusätzlich an Board-GND** (EXT1 Pin 2) — gemeinsame Masse ist Pflicht, sonst liest GPIO4 Müll.

**3. Pulssignal** wie im Echtbetrieb: Festo **Pin 4 (BK)** → 1 kΩ Pull-up (3,3 V) + 1 kΩ + Z-Diode → **GPIO4**.

```
   PC ──USB-C──> ESP32-POE2 (5V → ESP + Ethernet)
                   │ GND ●───────────────┐
   24V-Netzteil ─┬─ +24V ──> Festo Pin1   │  (0V == Board-GND!)
                 └─ 0V ──────> Festo Pin3 ─┘
                          Festo Pin4 ──[1k pull-up / 1k / Zener]──> GPIO4
```

⚠️ **Niemals 24 V an einen 5-V-/3,3-V-Pin** — die 24 V gehen nur an Sensor-Pin 1. Board ist nicht
galvanisch isoliert → **potenzialfreies** Netzteil verwenden. Der 12/24-V-Jumper ist beim Test egal.

**Alternative (näher am Echtbetrieb):** ein einziges 24-V-Netzteil → Sensor Pin 1 **und** über ein
Step-down-Modul 24 V→5 V auf EXT1 Pin 5/GND. Kein USB, kein PoE, alles auf gemeinsamer Masse.

## Updates danach (OTA, kein USB)

Ein Build, alle Geräte — die Konfiguration bleibt dabei unangetastet (NVS).

**Bequemster Weg:** im Dashboard-Sensor-Manager auf **„Firmware-Update (OTA)“**
klicken (nutzt den zuletzt über „＋ Gerät“ → „Firmware bauen“ erzeugten Stand;
die Geräte-IP kommt aus dem meta-Topic). Per CLI:

```bash
esphome run --no-logs gas-flowmeter.yaml --device <GERÄTE-IP>
# oder per mDNS:
esphome run --no-logs gas-flowmeter.yaml --device gas-flow-a1b2c3.local
```

Optional ein **ESPHome-Dashboard** als Verwaltungsoberfläche (OTA-Buttons, Live-Logs, Status):
```bash
esphome dashboard .
```

## Migration von Bestandsgeräten

**Alte Geräte-Firmware (`gas-flow-NN` mit einkompilierter `machine_id`):**

```bash
esphome run --no-logs gas-flowmeter.yaml --device <GERÄTE-IP>
```

- Nach dem Update publiziert das Gerät zunächst als `gas-<MAC-Suffix>` („nicht
  zugeordnet“ im Dashboard). Im Geräte-Webinterface die **bisherige Anlagen-ID**
  (z. B. `anlage-01`) und den **SP-Wert** (bisheriges `liter_per_pulse`) eintragen →
  Historie und Zuordnung laufen nahtlos weiter; den übrig gebliebenen
  `gas-<MAC>`-Eintrag im Sensor-Manager löschen.
- Der **persistente Gesamtzähler bleibt erhalten**: er hängt an der internen
  Global-ID `vol_total` (unverändert), nicht am Gerätenamen; OTA lässt den
  NVS-Speicher unangetastet.
- Der mDNS-Name ändert sich (`gas-flow-01.local` → `gas-flow-<MAC-Suffix>.local`),
  daher `--device <IP>` verwenden.

**Uralt-Firmware (`argon-flow-NN`, publiziert `iwb/argon/…`):** gleicher Weg; das
Backend versteht das Legacy-Präfix weiterhin und mappt auf dieselbe Sensor-ID.

## MQTT-Schnittstelle (pro Anlage)

Topic-Präfix: `iwb/gas/<anlagen-id>` (z. B. `iwb/gas/anlage-01`).
Bestands-Firmware nutzt `iwb/argon/<machine_id>` – das Backend abonniert beides.

| Topic | Richtung | Inhalt |
|---|---|---|
| `.../status` | Publish (retained, LWT) | `online` / `offline` |
| `.../flow` | Publish (retained) | momentaner Durchfluss [Nl/min] |
| `.../total` | Publish (retained) | persistentes Gesamtvolumen [Nl] |
| `.../voltage` | Publish (retained) | Diagnose-Spannung [V] |
| `.../uptime` | Publish (retained) | Uptime [s] (Diagnose) |
| `.../meta` | Publish (retained) | JSON `{ip, mac, hostname, sp, fw}` (alle 60 s) |
| `.../cmd` | Subscribe | `reset` → setzt Gesamtvolumen auf 0 |

Bei einer Änderung der Anlagen-ID räumt das Gerät seine alten retained Topics
selbst ab (leere retained Publishes) und startet mit der neuen ID neu.

Reset auch über den Button „Gesamtvolumen zurücksetzen“ im Geräte-Webinterface
oder den „Zähler nullen“-Knopf im Dashboard-Sensor-Manager.

## Wichtige Designentscheidungen (verifiziert gegen Datenblätter/ESPHome-Quellen)

- **Eine Firmware, Laufzeit-Identität** – `name_add_mac_suffix` macht den Hostnamen
  eindeutig; Anlagen-ID und SP-Wert sind `template text`/`template number` mit
  `restore_value` (NVS). Die MQTT-Topics werden per Lambda aus der Anlagen-ID
  gebaut (`gas_id.h`), deshalb `topic_prefix: null` (keine automatischen
  ESPHome-Topics). LWT/Birth/Shutdown-Message werden in `on_boot` (Prio 600,
  nach dem NVS-Restore bei Prio 800, vor dem MQTT-Setup bei Prio 250) auf die
  Laufzeit-Topics gesetzt.
- **Reset-Kommando per Wildcard** – das Gerät abonniert `iwb/gas/+/cmd` und filtert
  im Callback auf die eigene ID (die ID ist zur Compile-Zeit unbekannt).
- **SP-Änderung wirkt nicht rückwirkend** – das pulse_meter-Sitzungstotal wird
  **unskaliert** (rohe Pulse) geführt; erst das Puls-Delta wird mit dem aktuellen
  SP-Wert multipliziert. Eine SP-Änderung mitten in der Sitzung erzeugt so keinen
  Sprung im Gesamtzähler.
- **Ethernet-Takt GPIO0 / CLK_OUT** – Besonderheit des WROVER-basierten POE2
  (offizielles Olimex-Beispiel + Arduino `ETH_CLOCK_GPIO0_OUT`). Mit GPIO17 wie beim
  alten POE bleibt Ethernet tot.
- **`api: reboot_timeout: 0s`** – sonst rebootet das Gerät alle 15 min, wenn **kein**
  Home-Assistant-Client verbunden ist (reiner MQTT-/Dashboard-Betrieb).
- **Persistenter Totalizer** via `globals: restore_value: true` – das `pulse_meter`-
  `total` allein überlebt einen Stromausfall **nicht**. `preferences: flash_write_interval: 10s`
  begrenzt den Rückwärtssprung des Zählers nach hartem Stromausfall auf ≤ 10 s.
  Der NVS-Schlüssel hängt nur an der Global-ID `vol_total` → Zähler übersteht
  auch den Wechsel auf die Einheits-Firmware.
- **Zähler-Reset** (MQTT `cmd`/Button) nullt zusätzlich das pulse_meter-Sitzungstotal
  (`set_total_pulses(0)`) – sonst springt der Zähler beim nächsten Puls
  auf das Sitzungsvolumen zurück.
- **`internal_filter: 30ms` im Modus `PULSE`** – zählt nur Pegel, die ≥ 30 ms stabil
  anliegen (Festo-Pulsbreite `PULS` = 75–100 ms, real eingestellt: 75 ms). Entprellt **und** filtert Störspitzen,
  die im EDGE-Modus als Geisterverbrauch zählen würden.
- **`timeout: 90s`** – ohne Pulse fällt der Momentandurchfluss nach 90 s auf 0
  (vorher 5 min „Phantom-Fluss“ nach dem letzten Puls).
- **`web_server: local: true`** – das Webinterface funktioniert auch ohne
  Internetzugang (JS liegt im Gerät, kein CDN).
- **Pulssignal GPIO4** = UEXT Pin 3 / EXT1 Pin 19, kein Onboard-Pullup → externer
  Pull-up am Sensoreingang nötig (Festo-NPN braucht ≥ 2 mA Last). Siehe Anleitung, Abschnitt 3.
