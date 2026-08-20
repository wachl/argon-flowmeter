# Gas-Durchflussmesser (Argon / Stickstoff) — Aufbauanleitung

**Olimex ESP32-POE2 + Festo SFAH | iwb / TUM**

Erfassung des Gasverbrauchs (Argon oder Stickstoff) über den **Volumenpuls-Ausgang** des Festo SFAH. Versorgung
und Datenanbindung aus einer einzigen Quelle (PoE). Der ESP32 (ESPHome) zählt die Pulse,
berechnet Durchfluss und Gesamtvolumen und veröffentlicht sie via Ethernet/MQTT. Updates
laufen nach dem ersten Flashen **per OTA über Ethernet**.

---

## 1. Stückliste (pro Einheit)

| Komponente | Bezeichnung | Hinweis |
|---|---|---|
| Controller | Olimex **ESP32-POE2** (WROVER-E, nicht ISO) | PoE+ (802.3at), 100 Mbit; nur POE2 liefert 24 V |
| Sensor | Festo **SFAH** (Variante nach Messbereich) | M8x1-Stecker, Volumenpuls/kumulierte Messung |
| Netzwerk | **isolierter** PoE+-Switch/-Injektor | min. 802.3at; Switch-Leistungsbudget für 16× prüfen |
| Schutz | **1 kΩ Pull-up** + **1 kΩ** Vorwiderstand + **3,3 V Z-Diode** (oder BAT54) | Clamp + Mindestlast an GPIO4 |
| Verkabelung | M8-Leitung NEBA-M8…, Litze für EXT1 | — |

---

## 2. Konzept: Single-Source-Versorgung

```
PoE+  ->  ESP32-POE2  ->  24 V (EXT1 Pin1 VPP)  ->  Festo SFAH (Pin1 +24V)
                                              ->  Volumenpuls (SFAH Pin4) -> GPIO4
```

Sensor und Controller teilen sich dieselbe Masse — keine Massescheife. Wichtig, da der
ESP32-POE2 **nicht** galvanisch isoliert ist → **isolierten PoE-Switch** verwenden.

---

## 3. Verdrahtung (NPN, EXT1 + UEXT)

### Jumper
- **12/24-V-Selektor** auf dem Board auf **24 V** stellen.

### Anschlüsse

| Verbindung | von ESP32-POE2 | nach Festo SFAH (M8x1) |
|---|---|---|
| Versorgung +24 V | **EXT1 Pin 1 (VPP)** | Pin 1 — BN (braun) |
| Masse 0 V | **EXT1 Pin 2 (GND)** | Pin 3 — BU (blau) |
| Puls-Signal | **GPIO4** (= UEXT Pin 3 **oder** EXT1 Pin 19) | Pin 4 — BK (schwarz), OutA/Puls |

Festo Pin 2 (WH/weiß) bleibt frei. GPIO4 liegt auf UEXT **und** EXT1 – nur **einen** Header nutzen.

### Vollständiges Verdrahtungsschema

Versorgung (+24 V / 0 V) **und** Signalpfad in einem Bild — alles teilt sich dieselbe Masse:

```
   ESP32-POE2  (12/24-V-Jumper = 24 V)                 Festo SFAH (M8x1, NPN-Modus)
   ═══════════════════════════════════                 ════════════════════════════

   EXT1 Pin 1  VPP  (+24 V) ───────────── BN (braun) ──── Pin 1   +24 V
   EXT1 Pin 2  GND  ( 0 V ) ───────────── BU (blau)  ──── Pin 3   0 V
                                                          Pin 2   WH (weiß) → frei

   Signalpfad / Schutzbeschaltung an GPIO4 (verpflichtend):

        3,3 V
          │
       [1 kΩ]                    ← Pull-up: sichert ≥ 2 mA NPN-Last (Festo-Spec)
          │
          ├───────────────────── BK (schwarz) ────────── Pin 4   OutA / Volumenpuls
          │
       [1 kΩ]                    ← Vorwiderstand
          │
        GPIO4 ●  (ESP-Eingang)
          │
       [Z 3,3 V]                 ← Kathode → GPIO4, Anode → GND
          │
         GND  (= EXT1 Pin 2 / 0 V — gemeinsame Masse, keine Massescheife)
```

Der NPN-Open-Collector zieht im aktiven Zustand gegen 0 V. Der **1-kΩ-Pull-up** gegen 3,3 V
liefert ~3,3 mA Last (Festo fordert ≥ 2 mA); 1,5 kΩ (~2,2 mA) ginge auch. Der zweite 1 kΩ +
Z-Diode klemmen GPIO4 sicher auf ≤ 3,3 V. GPIO4 hat **keinen** Onboard-Pullup (Olimex UEXT-Pin 3
„RESISTOR = NO") und ist kein Strapping-Pin – der externe Pull-up ist daher unbedenklich.

> **Warnung:** Niemals PNP verwenden bzw. 24 V direkt an GPIO. Nur NPN-Modus zulässig.

---

## 4. Festo SFAH konfigurieren (EDIT-/SPEC-Menü)

Bedienung über die drei Tasten ([A], [Edit], [B]). [Edit] startet den EDIT-Modus.

1. **Ausgangsart NPN:** Spec-Menü → Parameter **`bin / Out`** → **`NPN`**.
2. **Pin 4 = Volumenpuls:** Spec-Menü → Parameter **`Pin4`** → **`VOL`**.  ⚠️ *nicht* `FLOW`!
   (`FLOW` = Schwellschalter, `VOL` = Volumenpuls, `MASS` = Massepuls.)
3. **Puls parametrieren** (EDIT → „Puls"):
   - **`SP`** = Normvolumen je Puls. **Exakt notieren** → geht 1:1 in `liter_per_pulse` ein.
     Dimensionierung: `SP ≥ Q_max[Nl/min] / 300` (Pulse dürfen bei 100 ms Breite nicht
     verschmelzen). Beispiel SFAH-50: `SP = 0,2 Nl`.
   - **`PULS`** = **100 ms**.
   - **`LOGC`** = **`NO`** (Schließer).
4. **Gas:** Spec-Menü → **`GAS`** → passend zum Gas der Anlage: **`Ar`** (Argon) oder
   **`N2`** (Stickstoff). Die Firmware ist gas-neutral — die Gaswahl am Sensor sorgt nur
   für die korrekte interne Umrechnung; die Zuordnung fürs Dashboard passiert dort.
5. **Normbedingung:** **`REF / Cond`** bewusst wählen (DIN 1343 = 0 °C / ISO = 15 °C / 20 °C) und
   **an allen Sensoren gleich** setzen. Korrekturfaktor bis +8,7 %!
6. EDIT-Modus verlassen — Werte werden gespeichert.

> **Tipp – Parameter replizieren:** Einen Sensor vollständig einstellen, dann via Festo-
> Funktion „Parameter replizieren" (Spec → `MASt`) baugleich auf die anderen Sensoren
> übertragen (IO-Link-Masterfunktion, nur baugleiche Varianten/Device-ID).
>
> **Aufwärmzeit:** Nach dem Einschalten ca. **10 Minuten** bis zur spezifizierten Genauigkeit.

---

## 5. ESP32 mit ESPHome flashen

Voraussetzungen, Setup, Erst-Flash (USB) und OTA-Updates: siehe **`firmware/README.md`**.

Kurz:
1. `pip install esphome`, `secrets.yaml` aus Vorlage anlegen.
2. Gerätedatei `firmware/devices/gas-flow-NN.yaml` anpassen: `liter_per_pulse` =
   notierter **SP**-Wert (jede Gerätedatei ist die Konfiguration ihrer Messstelle).
3. **PoE abziehen**, per USB-C: `esphome run devices/gas-flow-01.yaml`.
4. USB trennen, PoE anschließen — Betrieb startet, OTA ab jetzt über Ethernet.

> ⚠️ **USB und PoE niemals gleichzeitig** — Board/PC-Schaden (Board nicht isoliert).

---

## 6. MQTT-Schnittstelle

Topic-Präfix je Anlage: `iwb/gas/<machine_id>` (Bestandsgeräte mit alter Firmware:
`iwb/argon/<machine_id>` — das Backend versteht beide).

| Topic | Richtung | Inhalt |
|---|---|---|
| `.../status` | Publish (retained, LWT) | `online` / `offline` |
| `.../flow` | Publish | Durchfluss [Nl/min] |
| `.../total` | Publish | persistentes Gesamtvolumen [Nl] |
| `.../voltage` | Publish | Diagnose-Spannung [V] |
| `.../cmd` | Subscribe | `reset` → Gesamtvolumen = 0 |

(Volumen je Zeitfenster – Tag/Woche/Monat – werden im Dashboard/Backend gebildet, nicht im Gerät.)

---

## 7. Inbetriebnahme-Check

- [ ] Jumper auf **24 V**
- [ ] Festo: **NPN** / **Pin4 = VOL** / **LOGC = NO** / **PULS = 100 ms** / **SP** gesetzt & notiert
- [ ] Festo: **GAS = Ar bzw. N2** (passend zur Anlage), **REF/Cond** hallenweit einheitlich
- [ ] `liter_per_pulse` in `devices/gas-flow-NN.yaml` = notierter SP-Wert
- [ ] Schutzbeschaltung **inkl. 1 kΩ Pull-up** an GPIO4
- [ ] isolierte **PoE+**-Quelle, Switch-Leistungsbudget für 16× geprüft
- [ ] Ethernet kommt hoch (Firmware: clk GPIO0/CLK_OUT) → `status = online`
- [ ] MQTT-Broker erreichbar, Topics abonniert
- [ ] 10 min Aufwärmzeit vor Messbeginn

---

## 8. Hinweise & Grenzen

- **Auflösung/Live-Durchfluss:** Pulsweg ist für **Volumen** ideal; der Momentan-Durchfluss ist
  bei kleinem Flow grob/träge. Für flüssigen Live-Wert: Analog-/IO-Link-Auswertung (nicht vorgesehen).
- **Genauigkeit gasabhängig:** für Argon Nullpunkt ±2 % FS, Spanne ±4 % FS (verifiziert);
  Werte für Stickstoff der SFAH-Genauigkeitstabelle entnehmen. Einlaufstrecke nach Festo 6.1.1 beachten.
- **Schutzart IP40:** nur Innenraum/Schaltschrank; in rauer Halle Sensor/Elektronik schützen.
- **Persistenz:** Gesamtvolumen in der Firmware via `restore_value` gesichert (übersteht Reboot).
- **IO-Link-Alternative:** Direktzugriff auf kumulierten Messwert + Ferndiagnose über Pin 2 (C/Q)
  möglich, erfordert aber IO-Link-Master (z. B. MAX14819). Für reine Zählung ist der Pulsweg vorzuziehen.
