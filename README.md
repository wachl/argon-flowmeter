# Argon-Durchflussmessung – iwb / TUM

Erfassung des Argon-Verbrauchs an ~16 Anlagen in der Produktionshalle.
Pro Anlage: **Festo SFAH** (Volumenpuls) → **Olimex ESP32-POE2** (ESPHome, PoE) → **MQTT** →
**Dashboard**.

## Inhalt

| Pfad | Was |
|---|---|
| [`Anleitung_Argon_Durchflussmesser.md`](Anleitung_Argon_Durchflussmesser.md) | Aufbauanleitung (Sensor, Verdrahtung, Konfiguration). |
| [`firmware/`](firmware/) | ESPHome-Firmware für alle 16 Geräte (OTA-fähig). |
| [`dashboard/`](dashboard/) | Backend (MQTT→DB→API) + Dashboard-Frontend. |

## End-to-End in Kürze

1. **Sensor** parametrieren (Anleitung, Abschnitt 4): NPN, **Pin4 = VOL**, SP notieren, GAS = Ar.
2. **Firmware**: SP je Anlage in `firmware/gen_devices.py` → `python gen_devices.py` → `esphome run`.
   Geräte publizieren `iwb/argon/<machine_id>/{flow,total,voltage,status}` (das Backend
   versteht zusätzlich das gas-neutrale Schema `iwb/gas/<id>/…`).
3. **Dashboard**: `cd dashboard/backend && python app.py` → http://127.0.0.1:8000.
   Neue Geräte erscheinen als „nicht zugeordnet“ und werden **im Dashboard** benannt und
   Gas/Abteilung zugewiesen (Sensoren-Button); Broker/Preise/Alarm-Schwellen über ⚙.

Demo ohne Hardware: `cd dashboard/backend && python sim.py --seed 30 && python app.py`.

## Status

- ✅ Aufbauanleitung erstellt (gegen Festo-SFAH- und Olimex-POE2-Datenblätter verifiziert).
- ✅ ESPHome-Firmware erstellt (Ethernet-Config gegen offizielles Olimex-Beispiel verifiziert);
  erstes Gerät (`argon-flow-01`) läuft am eingebetteten Broker.
- ✅ Dashboard: Ingest für beide Topic-Schemata (`iwb/argon/` Bestands-Firmware,
  `iwb/gas/` neu), Sensor-Manager + ⚙-Einstellungen komplett im Frontend.
- ⏳ Offen pro Anlage: SFAH-Variante/Max-Durchfluss → SP, Normbedingung, reale
  Anlagennamen (im Dashboard zuweisbar). Volle `esphome config`-Validierung steht noch aus.
