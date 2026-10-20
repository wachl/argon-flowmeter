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

1. **Sensor** parametrieren (Anleitung, Abschnitt 4): NPN, **Pin4 = VOL/MASS**, SP notieren,
   GAS = Ar bzw. N2.
2. **Firmware**: `firmware/gas-flowmeter.yaml` ist **die eine Firmware für alle Geräte**.
   Neues Gerät: im Dashboard **„＋ Gerät“** → Firmware bauen, per USB im Browser
   flashen, **Ethernet-MAC auslesen** → MAC von der IT freischalten lassen (bis zu
   2 Arbeitstage) → PoE anschließen. Jedes Gerät bekommt über seine MAC einen
   eindeutigen Hostnamen (`gas-flow-<MAC-Suffix>`) und per DHCP eine eindeutige IP.
   **SP-Wert** und **Anlagen-ID** werden danach im Geräte-Webinterface `http://<IP>/`
   eingestellt (kein Neu-Flashen bei SP-Änderungen); Firmware-Updates laufen per
   OTA-Button im Sensor-Manager. Geräte publizieren
   `iwb/gas/<anlagen-id>/{flow,total,voltage,status,meta}` (das Backend versteht
   zusätzlich das Legacy-Schema `iwb/argon/<id>/…` der Bestands-Firmware).
3. **Dashboard**: `cd dashboard/backend && python app.py` → http://127.0.0.1:8000.
   Neue Geräte erscheinen als „nicht zugeordnet“ (inkl. Link auf ihr Webinterface) und
   werden **im Dashboard** benannt und Gas/Abteilung zugewiesen (Sensoren-Button);
   Broker/Preise/Alarm-Schwellen über ⚙. Ohne Anmeldung ist das Dashboard nur lesend
   (sobald in ⚙ ein Login-Passwort gesetzt ist); UI Deutsch/Englisch.

## Status

- ✅ Aufbauanleitung erstellt (gegen Festo-SFAH- und Olimex-POE2-Datenblätter verifiziert).
- ✅ ESPHome-Firmware, gas-neutral (`iwb/gas/`-Topics): **eine Einheits-Firmware für
  alle Geräte** — Identität aus der MAC, SP-Wert/Anlagen-ID zur Laufzeit über das
  Geräte-Webinterface (NVS-persistent, kein Neu-Flashen bei SP-Änderungen).
  Ethernet-Config gegen offizielles Olimex-Beispiel verifiziert; erstes Gerät läuft
  am eingebetteten Broker (Migration siehe `firmware/README.md`).
- ✅ Dashboard: Ingest für beide Topic-Schemata (`iwb/gas/` neu, `iwb/argon/` Bestand),
  Sensor-Manager + ⚙-Einstellungen komplett im Frontend.
- ✅ Produktivbetrieb-Features: Benutzer-Ebene (ohne Login nur lesend), UI DE/EN,
  CSV-Export (Anlage/Abteilung/gesamt), Sensor-Notizen, Offline-Alarme mit
  Auto-Auflösung, Alarm-Historie, `firmware/secrets.yaml` vom Backend verwaltet
  (Auto-Anlage, Pflege in der Administration, Build-Vorprüfung), tägliches Backup,
  Backend-Neustart per Klick.
- ⏳ Offen pro Anlage: SFAH-Variante/Max-Durchfluss → SP, Normbedingung, reale
  Anlagennamen (im Dashboard zuweisbar).
- ⏳ Offen Betrieb: Autostart nach Windows-Reboot (Taskplaner/NSSM) für die
  Produktivinstanz einrichten.
