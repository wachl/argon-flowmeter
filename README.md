# Argon-Durchflussmessung – iwb / TUM

Erfassung des Argon-Verbrauchs an ~16 Anlagen in der Produktionshalle.
Pro Anlage: **Festo SFAH** (Volumenpuls) → **Olimex ESP32-POE2** (ESPHome, PoE) → **MQTT** →
**Dashboard**.

## Inhalt

| Pfad | Was |
|---|---|
| [`Pruefbericht_Anleitung.md`](Pruefbericht_Anleitung.md) | Review der Original-Anleitung (Findings inkl. kritischem Pin4-Fehler). |
| [`Anleitung_Argon_Durchflussmesser_v2.md`](Anleitung_Argon_Durchflussmesser_v2.md) | Korrigierte Aufbauanleitung. |
| [`firmware/`](firmware/) | ESPHome-Firmware für alle 16 Geräte (OTA-fähig). |
| [`dashboard/`](dashboard/) | Backend (MQTT→DB→API) + Dashboard-Frontend. |
| [`design_src/`](design_src/) | Original Claude-Design (Referenz). |

## End-to-End in Kürze

1. **Sensor** parametrieren (Anleitung v2, Abschnitt 4): NPN, **Pin4 = VOL**, SP notieren, GAS = Ar.
2. **Firmware**: SP je Anlage in `firmware/gen_devices.py` → `python gen_devices.py` → `esphome run`.
   Geräte publizieren `iwb/argon/<machine_id>/{flow,total,voltage,status}`.
3. **Dashboard**: `dashboard/backend` konfigurieren (Broker, `machines.json`) → `python app.py` →
   http://localhost:8000.

Demo ohne Hardware: `cd dashboard/backend && python sim.py --seed 30 && python app.py`.

## Status

- ✅ Anleitung geprüft, Korrekturen dokumentiert (gegen Festo-SFAH- und Olimex-POE2-Datenblätter).
- ✅ ESPHome-Firmware erstellt (Ethernet-Config gegen offizielles Olimex-Beispiel verifiziert).
- ✅ Dashboard implementiert und mit Seed-Daten lauffähig getestet.
- ⏳ Offen pro Anlage: SFAH-Variante/Max-Durchfluss → SP, Normbedingung, reale Anlagennamen,
  Broker-IP. Volle `esphome config`-Validierung steht noch aus (ESPHome lokal nicht installiert).
