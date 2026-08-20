# Gas-Durchflussmessung (Argon & Stickstoff) – iwb / TUM

Erfassung des Gasverbrauchs (Argon, Stickstoff) an ~16 Anlagen in der Produktionshalle.
Pro Anlage: **Festo SFAH** (Volumenpuls) → **Olimex ESP32-POE2** (ESPHome, PoE) → **MQTT** →
**Dashboard**. Firmware und Backend sind gas-neutral; welches Gas eine Anlage verbraucht,
wird im Dashboard zugeordnet.

## Inhalt

| Pfad | Was |
|---|---|
| [`Anleitung_Durchflussmesser.md`](Anleitung_Durchflussmesser.md) | Aufbauanleitung (Sensor, Verdrahtung, Konfiguration). |
| [`firmware/`](firmware/) | ESPHome-Firmware für alle Geräte (OTA-fähig). |
| [`dashboard/`](dashboard/) | Backend (MQTT→DB→API) + Dashboard-Frontend. |

## End-to-End in Kürze

1. **Sensor** parametrieren (Anleitung, Abschnitt 4): NPN, **Pin4 = VOL**, SP notieren,
   GAS = Ar bzw. N2.
2. **Firmware**: Gerätedatei `firmware/devices/gas-flow-NN.yaml` ist die Konfiguration
   der Messstelle — SP dort als `liter_per_pulse` eintragen → `esphome run`.
   Geräte publizieren `iwb/gas/<machine_id>/{flow,total,voltage,status}` (das Backend
   versteht zusätzlich das Legacy-Schema `iwb/argon/<id>/…` der Bestands-Firmware).
3. **Dashboard**: `cd dashboard/backend && python app.py` → http://127.0.0.1:8000.
   Neue Geräte erscheinen als „nicht zugeordnet“ und werden **im Dashboard** benannt und
   Gas/Abteilung zugewiesen (Sensoren-Button); Broker/Preise/Alarm-Schwellen über ⚙.

## Status

- ✅ Aufbauanleitung erstellt (gegen Festo-SFAH- und Olimex-POE2-Datenblätter verifiziert).
- ✅ ESPHome-Firmware erstellt, gas-neutral (`iwb/gas/`-Topics); Konfiguration je Gerät
  direkt in `devices/gas-flow-NN.yaml` (kein Generator-Skript mehr).
  Ethernet-Config gegen offizielles Olimex-Beispiel verifiziert; erstes Gerät läuft am
  eingebetteten Broker (noch alte `argon-flow-01`-Firmware → Legacy-Ingest greift; beim
  nächsten OTA-Update wechselt es aufs neutrale Schema, siehe `firmware/README.md`).
- ✅ Dashboard: Ingest für beide Topic-Schemata (`iwb/gas/` neu, `iwb/argon/` Bestand),
  Sensor-Manager + ⚙-Einstellungen komplett im Frontend.
- ⏳ Offen pro Anlage: SFAH-Variante/Max-Durchfluss → SP, Normbedingung, reale
  Anlagennamen (im Dashboard zuweisbar).
