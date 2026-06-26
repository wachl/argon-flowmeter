# Prüfbericht – Aufbauanleitung Argon-Durchflussmesser

**Geprüft gegen:** Festo SFAH Betriebsanleitung 2025‑02d (8228458) · Olimex ESP32‑POE2
User Manual Rev. 2.7 (10/2025) + offizielle Olimex‑Beispiele (ESPHome/Arduino).
**Bewertete Anleitung:** `Anleitung_Argon_Durchflussmesser.md` · **Stückzahl:** 16 Einheiten.

> Kurzfazit: Das Konzept (Single‑Source‑PoE, Volumenpuls → ESP32 → MQTT) ist **richtig und
> tragfähig**. Verdrahtung und Boardwahl stimmen. Es gibt aber **einen kritischen
> Konfigurationsfehler** (Pin 4) und mehrere Punkte, die bei 16 Produktiv‑Einheiten zu
> Ausfällen oder Fehlmessungen führen würden. Der referenzierte ESP‑Sketch lag dem Ordner
> **nicht** bei – die Firmware wurde als ESPHome neu erstellt (`firmware/`).

## Findings auf einen Blick

| # | Schwere | Thema | Kern |
|---|---|---|---|
| 1 | 🔴 Kritisch | Festo Pin 4 = **VOL** statt „Flow" | „Flow" macht Pin 4 zum Durchfluss‑Schwellschalter – **kein** Volumenpuls. Misst nichts Brauchbares. |
| 2 | 🔴 Kritisch | Ethernet‑Takt **GPIO0** | POE2 ist WROVER: Takt liegt auf GPIO0 (CLK_OUT), nicht GPIO17. Mit GPIO17 kommt Ethernet nie hoch. |
| 3 | 🟠 Wichtig | NPN‑**Mindestlaststrom 2 mA** | Interner Pullup (~73 µA) zu schwach → unsichere Flanken. Externer Pull‑up nötig. |
| 4 | 🟠 Wichtig | **Normbedingung** REF/Cond | DIN 1343 vs. ISO 2533/6358 → Korrekturfaktor bis **+8,7 %**. Hallenweit einheitlich setzen. |
| 5 | 🟠 Wichtig | **SP‑/Pulsfrequenz‑Dimensionierung** | PULS=100 ms begrenzt die Pulsrate. Zu kleines SP → Pulse verschmelzen → Unterzählung. |
| 6 | 🟡 Mittel | **Persistenz** des Zählers | In ESPHome überlebt `pulse_meter total` keinen Stromausfall ohne `restore_value`. (in Firmware gelöst) |
| 7 | 🟡 Mittel | **PoE‑Budget / isolierter Switch** | 802.3at zwingend; Switch reserviert ~30 W/Port → 16×; Board nicht isoliert → Ground‑Loops. |
| 8 | 🔵 Info | **Argon direkt wählbar** | GAS‑Menü hat `Ar` direkt – der „Normierungsfaktor‑Workaround" der Anleitung ist unnötig. |
| 9 | 🔵 Info | Live‑Durchfluss grob | Pulsweg ist für **Volumen** ideal, für **Momentan‑Durchfluss** bei kleinem Flow grob/träge. |

---

## 1 🔴 Festo Pin 4 muss auf `VOL` (Volumenpuls), nicht `Flow`

Die Anleitung schreibt in Schritt 4:
> „Pin 4 als Pulsausgang: Parameter `bin / Pin4` → **`Flow`**."

Das ist falsch. Laut Festo‑Menüstruktur (Abb. 15) und Tab. 3 hat der Parameter **Pin4** die
Werte **`FLOW` / `VOL` / `MASS`**:

- `FLOW` = Pin 4 wird **binärer Schaltausgang** (OutA, schaltet bei Durchfluss‑Schwellwert).
  → liefert **keinen** volumenproportionalen Pulszug, sondern nur an/aus.
- `VOL` = Pin 4 gibt den **Volumenpuls** aus (ein Puls je kumuliertem Normvolumen `SP`).
  ← **das ist der gewünschte Modus.**
- `MASS` = analog für Masse.

Bestätigt durch Abschnitt 4.2.3.3 (Tab. 9): „Bei der kumulierten Volumenmessung … gibt der
Sensor am Puls‑Ausgang … einen Schaltimpuls aus. Mit jedem Schaltimpuls startet die
Volumenmessung erneut." Mit `Flow` zählt der ESP nur Schaltflanken eines Schwellschalters –
das Gesamtvolumen wäre praktisch unbrauchbar.

**Korrektur:** Spec‑Menü → Parameter **Pin4** auf **`VOL`** stellen. Anschließend im
„Puls"‑Zweig `SP` (Volumen/Puls), `PULS` (Pulsbreite) und `LOGC` (NO/NC) setzen.

## 2 🔴 Ethernet‑Takt liegt beim POE2 auf GPIO0

Der ESP32‑POE2 nutzt ein **WROVER‑E**‑Modul; GPIO16/17 sind durch das PSRAM belegt. Olimex
mappt den Ethernet‑Takt deshalb auf **GPIO0** (Handbuch S. 9/16: „GPIO17 → GPIO0, this is the
Ethernet clock source"). Die offiziellen Olimex‑Beispiele bestätigen:

- ESPHome `SOFTWARE/ESPHOME/esp32-poe2.yaml`: `clk: { pin: GPIO0, mode: CLK_OUT }`
- Arduino `LAN8720-POE2.ino`: `#define ETH_CLK_MODE ETH_CLOCK_GPIO0_OUT`

Vollständig (so in der Firmware umgesetzt): `LAN8720`, `mdc GPIO23`, `mdio GPIO18`,
`clk GPIO0 / CLK_OUT`, `phy_addr 0`, `power_pin GPIO12`. Mit der „alten" POE‑Belegung
(GPIO17) bleibt das Netzwerk auf allen 16 Geräten tot.

## 3 🟠 NPN‑Ausgang braucht ≥ 2 mA Last → externer Pull‑up

Festo Tab. 43: *„Pull‑up‑Widerstand NPN: nicht integriert, Laststrom von mindestens 2 mA
erforderlich."* Der interne ESP‑Pullup (~45 kΩ → bei 3,3 V nur ~73 µA) liegt weit darunter →
träge/unsaubere Flanken, Fehlzählungen möglich. Die UEXT‑Tabelle bestätigt: GPIO4 hat
**keinen** Onboard‑Pullup.

**Empfehlung (verbesserte Schutzbeschaltung):**

```
                3,3 V
                  │
               [1 kΩ]        ← Pull-up sichert ≥ 2 mA NPN-Last
                  │
Festo Pin4 ──┬────┴────[1 kΩ]──┬── GPIO4
 (OutA/Puls, │                 │
  NPN)       │              [Z 3,3 V]   (Kathode→GPIO4, Anode→GND)
             │                 │
            (Sensor-0V)        GND
```

Der Pull‑up an die **Sensorseite** (vor den 1‑kΩ‑Vorwiderstand) – dann fließen beim
Durchschalten ~3,3 mA durch den NPN (1,5 kΩ → ~2,2 mA ginge auch). Der 1‑kΩ‑Vorwiderstand +
Z‑Diode klemmen GPIO4 weiter sicher auf ≤ 3,3 V. GPIO4 hat **keinen** Onboard‑Pullup (Olimex
UEXT‑Pin 3 „RESISTOR = NO"; die 2,2 kΩ R47 im Schaltplan sitzen auf der I2C‑SCL‑Leitung/GPIO33)
und ist kein Strapping‑Pin. In ESPHome zusätzlich `pullup: true` (schadet nicht, der externe dominiert).

## 4 🟠 Normbedingung (REF/Cond) bewusst und einheitlich wählen

Der SFAH normiert das Volumen auf eine Bezugs‑Norm (Festo Tab. 10):

| REF/Cond | Norm | T_ref | Korrekturfaktor |
|---|---|---|---|
| Off | DIN 1343 | 0 °C | 1,000 |
| 15 °C | ISO 2533 | 15 °C | 1,055 |
| 20 °C | ISO 6358 | 20 °C | 1,087 |

Werkseitig DIN 1343 (0 °C). Wird umgeschaltet, ändert sich der angezeigte/ausgegebene Wert um
bis zu **+8,7 %**. Für 16 Geräte: **eine** Norm festlegen, an allen Sensoren gleich setzen, und
sicherstellen, dass die Auswertung/Abrechnung dieselbe Bezugsnorm meint. Sonst entstehen
systematische 5–9 %‑Abweichungen zwischen Anlagen.

## 5 🟠 SP so wählen, dass die Pulse nicht verschmelzen

Die Pulsbreite `PULS` (Standard 100 ms) begrenzt die maximale Pulsfrequenz. Bei zu kleinem `SP`
und hohem Durchfluss überlappen die Pulse → der ESP zählt zu wenig. Faustregel: bei
Max‑Durchfluss soll die Pulsperiode ≥ ~2 × PULS (≈ 200 ms, also ≤ 5 Pulse/s = 300 Pulse/min)
sein:

```
SP_min [Nl/Puls]  ≈  Q_max [Nl/min] / 300
```

**Beispiel SFAH‑50** (0…50 Nl/min): SP ≥ 50/300 ≈ 0,17 → praktisch **SP = 0,2 Nl/Puls**.
Mit SP = 0,1 (wie im Anleitungs‑Beispiel angedeutet) würden bei 50 Nl/min 500 Pulse/min
≈ 8,3 Hz entstehen – die Pulse (je 100 ms) überlappen, es wird unterzählt.

Trade‑off: kleineres SP = feinere Volumenauflösung, aber höhere Frequenz; größeres SP =
robuster, aber gröber. SP, Q_max und gewählte SFAH‑Variante daher **pro Anlage** festlegen
und exakt in `liter_per_pulse` der Firmware übernehmen.

## 6 🟡 Persistenz des Gesamtzählers

Die Anleitung verlangt (richtig) NVS‑Persistenz. In ESPHome sichert das `pulse_meter total`
seinen Wert **nicht** automatisch über einen Stromausfall. Gelöst in der Firmware über
`globals: restore_value: true` (lebenslanges `vol_total`, periodisch ins Flash gesichert), das
flüchtige Sitzungs‑Total dient nur als Delta‑Quelle.

## 7 🟡 PoE‑Versorgung & Erdung für 16 Einheiten

- Board zieht 12,95–25,5 W; Switch **reserviert i. d. R. ~30 W pro Port** → bei 16 Geräten
  **PoE‑Leistungsbudget des Switches prüfen** (16 × 30 W = 480 W reserviert, auch wenn real
  weniger fließt). Ggf. auf mehrere Switches verteilen.
- **802.3at (PoE+) zwingend** (Class 4). 802.3af reicht nicht.
- Das Board ist **nicht galvanisch isoliert** und „susceptible to ground loops" → **isolierten
  PoE‑Switch** verwenden. Der ISO‑Bruder (ESP32‑POE‑ISO) liefert **kein 24 V** und scheidet für
  die 24‑V‑Sensorversorgung aus → POE2 ist hier die richtige Wahl, Erdung dafür sauber planen.
- Versorgung muss **PELV** sein (Festo‑Warnung, IEC 60204‑1). PoE erfüllt das.

## 8 🔵 Argon ist direkt wählbar

Anleitung Schritt 8 ist übervorsichtig: Das `GAS`‑Menü bietet **`Air / N2 / Ar`** direkt – also
**`Ar` wählen**, kein manueller Normierungsfaktor nötig. Betriebsmedium Argon ist auch in den
technischen Daten ausdrücklich freigegeben (Genauigkeit Argon: Nullpunkt ±2 % FS, Spanne ±4 % FS).

## 9 🔵 Pulsweg ist für Volumen ideal, für Live‑Durchfluss grob

Der Momentan‑Durchfluss wird aus dem Pulsabstand berechnet. Bei kleinem Durchfluss/grobem SP
kommen Pulse selten → die l/min‑Anzeige ist quantisiert und träge (Update erst beim nächsten
Puls; nach `flow_timeout` zeigt sie 0). Für **Verbrauch (kumuliertes Volumen)** – das eigentliche
Ziel – ist das unkritisch. Wer zusätzlich einen flüssigen Live‑Durchfluss braucht, könnte den
**Analogausgang** (0–10 V / 4–20 mA) oder **IO‑Link** auswerten (zusätzliche Beschaltung; aktuell
nicht vorgesehen).

---

## Bestätigt korrekt (keine Änderung nötig)

- **M8‑Verdrahtung** (Festo Tab. 13): Pin 1 BN = +24 V, Pin 3 BU = 0 V, Pin 4 BK = OutA/Puls,
  Pin 2 WH frei. ✔
- **Board‑seitig:** 24 V aus **EXT1 Pin 1 (VPP)** – Jumper auf 24 V! –, GND z. B. EXT1 Pin 2;
  Pulssignal **GPIO4 = UEXT Pin 3 = EXT1 Pin 19** (nur einen der beiden Header nutzen). ✔
- **NPN‑Logik:** OutA schaltet gegen 0 V, mit Pull‑up am ESP saubere 3,3‑V‑Logik. ✔
- **PULS = 100 ms, LOGC = NO** sinnvoll; Entprellung 5 ms (Arduino) bzw. `internal_filter 30ms`
  (ESPHome) passend zur Pulsbreite. ✔
- **10 min Aufwärmzeit**, **USB+PoE nie gleichzeitig**, **Jumper 24 V** – alles korrekt vermerkt. ✔
- **IP40** – nur Innenraum/Schaltschrank; in staubiger/feuchter Halle Sensor entsprechend schützen.

## Offene Punkte / benötigte Angaben pro Anlage

1. SFAH‑Variante (Messbereich, z. B. ‑5/‑50/‑100) und erwarteter **Max‑Durchfluss** → SP.
2. Gewählte **Normbedingung** (DIN 1343 / 15 °C / 20 °C) – einheitlich.
3. **MQTT‑Broker‑IP** und Namens-/Topic‑Schema der 16 Anlagen.
