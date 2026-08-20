# ESPHome-Firmware – Gas-Durchflussmesser (Argon, Stickstoff, ...)

Olimex **ESP32-POE2** + Festo **SFAH** (Volumenpuls-Ausgang). PoE liefert Strom **und**
Netzwerk; Strom-/Datenanbindung aus einer Quelle. Updates laufen nach dem ersten
Flashen **per OTA über Ethernet** – kein USB-Stecken mehr an den Geräten.

Die Firmware ist **gas-neutral**: das Gerät zählt nur Volumenpulse. Welches Gas
(Argon/Stickstoff) eine Anlage verbraucht, wird erst im Dashboard zugeordnet.

## Dateien

| Datei | Zweck |
|---|---|
| `gas-flowmeter.yaml` | Gemeinsames Package (gesamte Logik). Wird nicht direkt geflasht. |
| `devices/gas-flow-01.yaml` … `-16.yaml` | **Eine Datei pro Gerät = dessen Konfiguration.** Direkt editieren. |
| `device-template.yaml` | Vorlage für zusätzliche Geräte (nach `devices/` kopieren). |
| `secrets.yaml.example` | Vorlage → als `secrets.yaml` ablegen (Broker, Passwörter, API-Key). |

## Konfiguration je Gerät

Es gibt **keinen Generator** und keine zentrale Liste: die Gerätedatei unter
`devices/` ist die einzige Quelle. Sie besteht nur aus vier `substitutions`:

```yaml
substitutions:
  device_name: "gas-flow-01"                 # Hostname/OTA-Name, Schema gas-flow-NN
  friendly_name: "Gas Flow 01 – Anlage 01"   # Anzeigename
  machine_id: "anlage-01"                    # Sensor-ID im Dashboard + MQTT-Topics
  liter_per_pulse: "1.0"                     # = Festo-SP (Nl/Puls) – MUSS exakt passen!
```

- **SP geändert am Sensor?** → `liter_per_pulse` in der Gerätedatei anpassen und
  das Gerät per OTA neu flashen (s. u.). Git-Historie = Kalibrier-Historie.
- **Neues Gerät?** → `cp device-template.yaml devices/gas-flow-17.yaml`, Nummer/SP
  anpassen, flashen. Es meldet sich im Dashboard automatisch als „nicht zugeordnet“
  und bekommt dort Name, Gas und Abteilung.

> Der `liter_per_pulse`-Wert **muss exakt** dem am jeweiligen Festo-SFAH eingestellten
> Schwellwert **SP** entsprechen. Siehe `../Anleitung_Durchflussmesser.md`, Abschnitt 4.

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
3. **Gerätedatei prüfen/anpassen** (`devices/gas-flow-NN.yaml`, s. o.).

## Erstes Flashen (einmalig, per USB)

> ⚠️ **PoE-Kabel abziehen, solange USB steckt.** Der ESP32-POE2 ist nicht galvanisch
> isoliert – USB **und** PoE gleichzeitig zerstört Board/PC (Olimex-Handbuch).

```bash
esphome run devices/gas-flow-01.yaml
```
USB trennen → PoE anschließen → Gerät meldet sich am Broker (`iwb/gas/anlage-01/status = online`).

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

```bash
esphome run devices/gas-flow-07.yaml     # baut + lädt über Ethernet hoch
# oder alle:
for f in devices/*.yaml; do esphome run --no-logs "$f"; done
```

Optional ein **ESPHome-Dashboard** als Verwaltungsoberfläche (OTA-Buttons, Live-Logs, Status):
```bash
esphome dashboard .
```

## Migration von Bestandsgeräten (alte `argon-flow-XX`-Firmware)

Geräte mit der alten Firmware publizieren auf `iwb/argon/<machine_id>` – das
Dashboard-Backend versteht dieses Legacy-Präfix weiterhin, ein Update ist also
**nicht dringend**. Beim nächsten OTA-Update wechselt das Gerät automatisch auf
das neutrale Schema:

```bash
esphome run --no-logs devices/gas-flow-01.yaml --device <GERÄTE-IP>
```

- `--device <IP>` verwenden: der mDNS-Name ändert sich durch das Update von
  `argon-flow-NN.local` auf `gas-flow-NN.local`.
- Die `machine_id` bleibt gleich → das Dashboard führt Historie und Zuordnung
  nahtlos weiter (beide Topic-Präfixe landen auf derselben Sensor-ID).
- Der **persistente Gesamtzähler bleibt erhalten**: er hängt an der internen
  Global-ID `vol_total` (unverändert), nicht am Gerätenamen; OTA lässt den
  NVS-Speicher unangetastet.

## MQTT-Schnittstelle (pro Anlage)

Topic-Präfix: `iwb/gas/<machine_id>` (z. B. `iwb/gas/anlage-01`).
Bestands-Firmware nutzt `iwb/argon/<machine_id>` – das Backend abonniert beides.

| Topic | Richtung | Inhalt |
|---|---|---|
| `.../status` | Publish (retained, LWT) | `online` / `offline` |
| `.../flow` | Publish | momentaner Durchfluss [Nl/min] |
| `.../total` | Publish | persistentes Gesamtvolumen [Nl] |
| `.../voltage` | Publish | Diagnose-Spannung [V] |
| `.../uptime` | Publish | Uptime [s] (Diagnose) |
| `.../cmd` | Subscribe | `reset` → setzt Gesamtvolumen auf 0 |

(Zusätzlich publiziert ESPHome die Entitäten unter `.../sensor/<object_id>/state`;
das Dashboard nutzt nur die kurzen Topics oben.)

Reset auch über Button (`Gesamtvolumen zurücksetzen`) im ESPHome-Dashboard / Home Assistant.

## Wichtige Designentscheidungen (verifiziert gegen die Datenblätter)

- **Ethernet-Takt GPIO0 / CLK_OUT** – Besonderheit des WROVER-basierten POE2
  (offizielles Olimex-Beispiel + Arduino `ETH_CLOCK_GPIO0_OUT`). Mit GPIO17 wie beim
  alten POE bleibt Ethernet tot.
- **`api: reboot_timeout: 0s`** – sonst rebootet das Gerät alle 15 min, wenn **kein**
  Home-Assistant-Client verbunden ist (reiner MQTT-/Dashboard-Betrieb).
- **Persistenter Totalizer** via `globals: restore_value: true` – das `pulse_meter`-
  `total` allein überlebt einen Stromausfall **nicht**. `preferences: flash_write_interval: 10s`
  begrenzt den Rückwärtssprung des Zählers nach hartem Stromausfall auf ≤ 10 s.
- **Zähler-Reset** (MQTT `cmd`/Button) nullt zusätzlich das pulse_meter-Sitzungstotal
  (`pulse_meter.set_total_pulses: 0`) – sonst springt der Zähler beim nächsten Puls
  auf das Sitzungsvolumen zurück.
- **`internal_filter: 30ms` im Modus `PULSE`** – zählt nur Pegel, die ≥ 30 ms stabil
  anliegen (Festo-Pulsbreite `PULS` = 100 ms). Entprellt **und** filtert Störspitzen,
  die im EDGE-Modus als Geisterverbrauch zählen würden.
- **`timeout: 90s`** – ohne Pulse fällt der Momentandurchfluss nach 90 s auf 0
  (vorher 5 min „Phantom-Fluss“ nach dem letzten Puls).
- **Pulssignal GPIO4** = UEXT Pin 3 / EXT1 Pin 19, kein Onboard-Pullup → externer
  Pull-up am Sensoreingang nötig (Festo-NPN braucht ≥ 2 mA Last). Siehe Anleitung, Abschnitt 3.
