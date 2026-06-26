# ESPHome-Firmware – Argon-Durchflussmesser (16 Einheiten)

Olimex **ESP32-POE2** + Festo **SFAH** (Volumenpuls-Ausgang). PoE liefert Strom **und**
Netzwerk; Strom-/Datenanbindung aus einer Quelle. Updates laufen nach dem ersten
Flashen **per OTA über Ethernet** – kein USB-Stecken mehr an den 16 Geräten.

## Dateien

| Datei | Zweck |
|---|---|
| `argon-flowmeter.yaml` | Gemeinsames Package (gesamte Logik). Wird nicht direkt geflasht. |
| `devices/argon-flow-01.yaml` | Beispiel-Gerätedatei. Eine pro Anlage. |
| `gen_devices.py` | Erzeugt alle 16 Gerätedateien aus einer Liste. |
| `secrets.yaml.example` | Vorlage → als `secrets.yaml` ablegen (Broker, Passwörter, API-Key). |

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
3. **Geräte definieren:** SP-Werte (Nl/Puls) je Anlage in `gen_devices.py` eintragen, dann
   ```bash
   python gen_devices.py
   ```
   > Der `liter_per_pulse`-Wert **muss exakt** dem am jeweiligen Festo-SFAH eingestellten
   > Schwellwert **SP** entsprechen. Siehe `../Anleitung_Argon_Durchflussmesser_v2.md`, Schritt 6.

## Erstes Flashen (einmalig, per USB)

> ⚠️ **PoE-Kabel abziehen, solange USB steckt.** Der ESP32-POE2 ist nicht galvanisch
> isoliert – USB **und** PoE gleichzeitig zerstört Board/PC (Olimex-Handbuch).

```bash
esphome run devices/argon-flow-01.yaml
```
USB trennen → PoE anschließen → Gerät meldet sich am Broker (`iwb/argon/anlage-01/status = online`).

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
esphome run devices/argon-flow-07.yaml   # baut + lädt über Ethernet hoch
# oder alle:
for f in devices/*.yaml; do esphome run --no-logs "$f"; done
```

Optional ein **ESPHome-Dashboard** als Verwaltungsoberfläche (OTA-Buttons, Live-Logs, Status):
```bash
esphome dashboard .
```

## MQTT-Schnittstelle (pro Anlage)

Topic-Präfix: `iwb/argon/<machine_id>` (z. B. `iwb/argon/anlage-01`).

| Topic | Richtung | Inhalt |
|---|---|---|
| `.../status` | Publish (retained, LWT) | `online` / `offline` |
| `.../sensor/argon-durchfluss/state` | Publish | momentaner Durchfluss [Nl/min] |
| `.../sensor/argon-gesamtvolumen/state` | Publish | persistentes Gesamtvolumen [Nl] |
| `.../sensor/versorgungsspannung-sense/state` | Publish | Diagnose-Spannung [V] |
| `.../cmd` | Subscribe | `reset` → setzt Gesamtvolumen auf 0 |

Reset auch über Button (`Gesamtvolumen zurücksetzen`) im ESPHome-Dashboard / Home Assistant.

## Wichtige Designentscheidungen (verifiziert gegen die Datenblätter)

- **Ethernet-Takt GPIO0 / CLK_OUT** – Besonderheit des WROVER-basierten POE2
  (offizielles Olimex-Beispiel + Arduino `ETH_CLOCK_GPIO0_OUT`). Mit GPIO17 wie beim
  alten POE bleibt Ethernet tot.
- **`api: reboot_timeout: 0s`** – sonst rebootet das Gerät alle 15 min, wenn **kein**
  Home-Assistant-Client verbunden ist (reiner MQTT-/Dashboard-Betrieb).
- **Persistenter Totalizer** via `globals: restore_value: true` – das `pulse_meter`-
  `total` allein überlebt einen Stromausfall **nicht**.
- **`internal_filter: 30ms`** < Festo-Pulsbreite `PULS` (100 ms) → entprellt, ohne
  echte Pulse zu verschlucken.
- **Pulssignal GPIO4** = UEXT Pin 3 / EXT1 Pin 19, kein Onboard-Pullup → externer
  Pull-up am Sensoreingang nötig (Festo-NPN braucht ≥ 2 mA Last). Siehe Anleitung v2.
