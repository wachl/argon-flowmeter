# Argon-Durchflussmesser — Aufbauanleitung

**Olimex ESP32-POE2 + Festo SFAH | iwb / TUM**

Erfassung des Argon-Verbrauchs über den Volumenpuls-Ausgang des Festo SFAH. Versorgung und Datenanbindung erfolgen aus einer einzigen Quelle (PoE). Der ESP32 zählt die Pulse, berechnet Durchfluss und Volumina und veröffentlicht sie via Ethernet/MQTT. Reset ist per MQTT-Kommando möglich.

---

## 1. Stückliste

| Komponente | Bezeichnung | Hinweis |
|---|---|---|
| Controller | Olimex ESP32-POE2 | WROVER, PoE+ (IEEE 802.3at), Ethernet 100 Mbit |
| Sensor | Festo SFAH (Durchflusssensor) | Variante mit M8x1-Stecker, Volumenpuls/kumulierte Messung |
| Netzwerk | PoE+-Switch oder PoE+-Injektor | min. IEEE 802.3at, isoliert empfohlen |
| Schutz | 1 kΩ Widerstand + 3,3 V Z-Diode (oder BAT54-Schottky) | Clamp an GPIO4 (empfohlen) |
| Verkabelung | M8-Anschlussleitung NEBA-M8…, Litze für EXT1 | — |

---

## 2. Konzept: Single-Source-Versorgung

Eine Energiequelle für alles:

```
PoE+  ->  ESP32-POE2  ->  24 V (EXT1)  ->  Festo SFAH
                                     ->  Volumenpuls -> GPIO4
```

Vorteil: Sensor und Controller teilen sich dieselbe Masse — keine Massschleife. Wichtig, da der ESP32-POE2 **nicht** galvanisch isoliert ist.

---

## 3. Verdrahtung (NPN, EXT1)

### Jumper

- **12/24-V-Selektor** auf dem Board auf **24 V** stellen.

### Anschlüsse

| Verbindung | von ESP32-POE2 | nach Festo SFAH (M8x1) |
|---|---|---|
| Versorgung +24 V | EXT1: 24-V-Schiene | Pin 1 — BN (braun) |
| Masse 0 V | EXT1: GND | Pin 3 — BU (blau) |
| Puls-Signal | UEXT1 Pin 3 = GPIO4 | Pin 4 — BK (schwarz), OutA |

Festo Pin 2 (WH/weiß) bleibt frei.

### Schutzbeschaltung an GPIO4 (empfohlen)

```
Festo Pin4 (OutA, NPN) ---[ 1 kΩ ]---+--- GPIO4
                                     |
                                   [Z 3,3 V]   (Kathode an GPIO4, Anode an GND)
                                     |
                                    GND
```

GPIO4 wird im Code als `INPUT_PULLUP` betrieben. Der NPN-Open-Collector zieht im aktiven Zustand gegen 0 V → saubere 3,3-V-Logik, nie 24 V am Pin.

> **Warnung:** Niemals PNP verwenden bzw. 24 V direkt an einen GPIO legen. Nur NPN-Modus ist ohne Pegelwandlung zulässig.

---

## 4. Festo SFAH konfigurieren (SPEC-Menü)

Bedienung über die drei Tasten am Sensor ([A], [Edit], [B]).

1. **[Edit]** ca. 3 s halten → EDIT-Modus.
2. Mit **[A]/[B]** zu **`Spec` / `Menu`** navigieren, mit **[Edit]** bestätigen.
3. **Ausgangsart auf NPN:** Parameter **`bin / Out`** → **`NPN`**.
4. **Pin 4 als Pulsausgang:** Parameter **`bin / Pin4`** → **`Flow`**.
5. **Schaltlogik OutA:** **`LOGC`** → **`NO`** (Schließer).
6. **Pulswertigkeit festlegen:** Schaltpunkt **`SP`** für die kumulierte Volumenmessung. **Diesen Wert exakt notieren** — er bestimmt, welches Normvolumen einem Puls entspricht und geht 1:1 in `LITER_PER_PULSE` im Code ein.
7. **Pulsbreite:** **`PULS`** → **100 ms**.
8. **Optional:** Gas (`GAS`) und Normbedingung (`REF / Cond`) prüfen. Ist Argon nicht direkt wählbar, den Normierungsfaktor für Argon berücksichtigen.
9. EDIT-Modus verlassen — Werte werden gespeichert.

> **Aufwärmzeit:** Nach dem Einschalten benötigt der Sensor ca. **10 Minuten** bis zur spezifizierten Genauigkeit.

---

## 5. ESP32 flashen

### Voraussetzungen (Arduino IDE)

- Board: **„OLIMEX ESP32-PoE2"** (ESP32-Arduino-Core installiert)
- Bibliotheken:
  - `PubSubClient` (Nick O'Leary)
  - `ArduinoJson` (Benoit Blanchon)
  - `ETH`, `Preferences` (im Core enthalten)

### Vor dem Kompilieren anpassen (im Sketch)

| Parameter | Bedeutung |
|---|---|
| `LITER_PER_PULSE` | Pulswertigkeit aus Schritt 6 (z. B. 0.01 für 10 ml/Puls) |
| `MQTT_BROKER` | IP des MQTT-Brokers |
| `MQTT_USER` / `MQTT_PASS` | optional, falls Broker Authentifizierung verlangt |
| `MQTT_CLIENTID` | eindeutige Client-ID |
| `DEBOUNCE_US` | Entprellung, auf `PULS`-Breite abgestimmt (Standard 5000 µs) |

### Flashen

1. **PoE-Kabel abziehen** (USB und PoE dürfen nie gleichzeitig anliegen — sonst Schaden am Board/PC).
2. Per USB-C verbinden, Sketch hochladen.
3. USB trennen, PoE-Kabel anschließen — Betrieb startet.

---

## 6. MQTT-Schnittstelle

| Topic | Richtung | Inhalt |
|---|---|---|
| `iwb/argon/flow/state` | Publish | JSON-Telemetrie (alle 5 s) |
| `iwb/argon/flow/status` | Publish (retained, LWT) | `online` / `offline` |
| `iwb/argon/flow/cmd` | Subscribe | Kommandos (Reset) |

### Telemetrie (`state`)

```json
{
  "flow_lpm": 2.4,
  "vol_per_min": 0.12,
  "vol_per_hour": 4.8,
  "vol_per_day": 95.0,
  "vol_per_week": 410.0,
  "vol_per_month": 1620.0,
  "vol_total": 18540.0,
  "unit": "Nl",
  "uptime_s": 86400
}
```

### Reset (`cmd`)

```json
{ "cmd": "reset", "scope": "all" }
```

| `scope` | Wirkung |
|---|---|
| `all` | setzt alle Zähler inkl. Gesamtwert zurück |
| `total` | setzt nur den Gesamtwert zurück |
| `windows` | setzt nur die Zeitfenster (min/h/Tag/Woche/Monat) zurück |

---

## 7. Inbetriebnahme-Check

- [ ] Jumper auf 24 V
- [ ] Festo: NPN / Pin4=Flow / NO / PULS=100 ms / SP gesetzt und notiert
- [ ] `LITER_PER_PULSE` = notierter SP-Wert
- [ ] Schutzbeschaltung an GPIO4 vorhanden
- [ ] PoE+-Quelle mit ausreichender Leistung (Board + Sensor)
- [ ] MQTT-Broker erreichbar, Topics abonniert
- [ ] 10 min Aufwärmzeit vor Messbeginn

---

## 8. Hinweise & Grenzen

- **Genauigkeit der Zählung** hängt von der eingestellten Pulswertigkeit ab — kleinere `SP`-Werte ergeben höhere Auflösung, aber höhere Pulsfrequenz. Entprellzeit (`DEBOUNCE_US`) entsprechend prüfen.
- **Persistenz:** Gesamt- und Monatszähler werden im NVS gesichert (überstehen Reboot/Stromausfall); Sicherung alle 5 min sowie bei Monatswechsel.
- **Alternative IO-Link:** Für direkten Zugriff auf den kumulierten Messwert, Diagnose und Fern-Parametrierung wäre IO-Link (Pin 2, C/Q) nötig — erfordert jedoch einen zusätzlichen IO-Link-Master-Transceiver (z. B. MAX14819). Für reine Zählerstandserfassung ist der Pulsweg vorzuziehen.
