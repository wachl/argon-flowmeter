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

## 4. Festo SFAH konfigurieren (Klick-Anleitung)

Quelle: Festo-Bedienungsanleitung **8228457, 2025-02d** (Menüstruktur Fig. 15; liegt als
[`Festo_SFAH_Bedienungsanleitung_8228457_2025-02d.pdf`](Festo_SFAH_Bedienungsanleitung_8228457_2025-02d.pdf)
im Repo). Für die
ältere SFAH-Generation (Handbuch 8075046, 2017) gilt derselbe Ablauf, aber: im
`GAS`-Menü gibt es dort **nur `Air` und `N2`** — **kein `Ar`**. Fehlt `Ar` im Menü, ist es
ein Altgerät, das für Argon **nicht spezifiziert** ist (Betriebsmedium laut Datenblatt nur
Druckluft/Stickstoff) → für Argon-Messstellen die aktuelle Generation verwenden.

### Bedienlogik (drei Tasten)

| Taste | Wirkung |
|---|---|
| **[Edit]** kurz | EDIT-Modus starten; im Menü: blinkenden Wert **speichern** und zum nächsten Parameter |
| **[A]** / **[B]** | blinkenden Wert bzw. Menüpunkt wechseln |
| **[Edit]** 3 s halten | zurück in den RUN-Modus (geht auch von selbst per Timeout) |

Blinkt **`Lock`**: Sicherheitscode mit [A]/[B] eingeben, dann [Edit]. Änderungen an den
Ausgängen werden **sofort wirksam**.

### Schritt 1 — Spec-Menü (Geräteeinstellungen)

1. **[Edit]** drücken → `Edit` erscheint, `OutA` blinkt.
2. Mit **[A]/[B]** bis **`Spec`** blinkt → **[Edit]**.
3. Die Parameter kommen jetzt in **fester Reihenfolge**; jeweils mit [A]/[B] einstellen,
   mit [Edit] speichern/weiter (nicht benötigte einfach mit [Edit] überspringen):

| Nr. | Anzeige | Einstellung für uns | Hinweis |
|---|---|---|---|
| 1 | `Filt` | 64 ms lassen (Werk) | Tiefpassfilter |
| 2 | `FLOW / Unit` | **`L.Min`** | Anzeigeeinheit |
| 3 | `REF / Cond` | **`0 °C`** lassen (= DIN 1343, Werk) | **an allen Sensoren gleich!** 15 °C/20 °C skalieren die Werte um bis zu +8,7 % |
| 4 | `GAS` | **`Ar`** bzw. **`N2`** (je Anlage) | Werk: `Air`. Danach leuchtet `Option` im Display — normal |
| 5 | `FLOW / Path` | — | erscheint nur bei bidirektionalen Varianten |
| 6 | `Z.Adj` | `ON` | erlaubt späteren Nullpunktabgleich |
| 7 | `Sub.d` | `GAS` (empfohlen) | Unteranzeige im RUN-Modus zeigt dann dauerhaft das eingestellte Gas |
| 8 | `Eco` | `di.ON` lassen | Display-Abschaltung |
| 9 | `bin / Out` | **`NPN`** | Werk: `PNP` ⚠️ |
| 10 | `Pin4 / bin` | **`VOL/MASS`** | Werk: `FLOW` ⚠️ **Der entscheidende Schalter:** Pin 4 wird vom Schaltausgang zum Pulsausgang. Bei Einheit `L.Min` ist es der **Volumen**puls |
| 11 | `Pin2 / FLOW` | `bin` lassen | Pin 2 (WH) ist bei uns unbeschaltet |
| 12 | `Code / Lock` | `OFF` | optional Sicherheitscode |
| 13 | `MASt` | `OFF` | nur fürs Replizieren (s. u.) |

4. **[Edit]** → zurück im RUN-Modus. Oben im Display steht jetzt **`Puls`** (statt `OutA`)
   — daran erkennt man, dass Pin 4 als Pulsausgang läuft.

### Schritt 2 — Puls-Menü (erscheint erst nach Schritt 1!)

Das `Puls`-Menü ersetzt das `OutA`-Menü, sobald `Pin4 / bin` auf `VOL/MASS` steht.

1. **[Edit]** drücken → mit **[A]/[B]** **`Puls`** wählen → **[Edit]**.
2. **`SP`** blinkt (mit Volumeneinheit) = Normvolumen je Puls. Mit [A]/[B] einstellen und
   **exakt notieren** → geht 1:1 in `liter_per_pulse` der Gerätedatei ein.
   Dimensionierung: `SP ≥ Q_max[Nl/min] / 300` (Pulse dürfen bei 100 ms Breite nicht
   verschmelzen). Beispiel SFAH-50: `SP = 0,2 Nl`.
3. **[Edit]** → **`PULS`** = **100 ms** lassen (Werk; Bereich 20–995 ms — nicht unter
   60 ms, sonst greift der 30-ms-Störfilter der ESP32-Firmware nicht mehr sauber).
4. **[Edit]** → **`LOGC`** = **`NO`** (Schließer, Werk).
5. **[Edit]** → fertig, RUN-Modus.

### Schritt 3 — Kontrolle

- **SHOW-Modus** (nichts wird verändert): **[A] doppelklicken** → zeigt nacheinander
  `SP`, `PULS`, `LOGC`; mit [A] weiterblättern. [B]-Doppelklick zeigt entsprechend
  `REF/Cond`, `GAS`.
- Im RUN-Modus schaltet **[B]** die Anzeige auf das kumulierte Volumen, **[A]** zurück
  auf den Durchfluss.
- **Nullpunktabgleich** (optional, bei anstehendem Betriebsdruck **ohne** Durchfluss):
  **[A] + [B] + [Edit] gleichzeitig** drücken → `OK` = erfolgreich, `FAIL` = Voraussetzungen
  prüfen (Z.Adj = ON, Messwert nahe 0).

> **Tipp – Parameter replizieren (`MASt`):** Einen Sensor vollständig einstellen, dann auf
> baugleiche Sensoren übertragen (gleicher Messbereich = gleiche Device-ID!): beide
> Sensoren an 24 V/0 V, die **BK-Leitungen (Pin 4) miteinander verbinden**. Der
> Ziel-Sensor muss im **Werkszustand (PNP, ungeschaltet)** sein — also **erst
> replizieren, dann ggf. dort nichts mehr umstellen** (NPN usw. kommt mit). Am Master:
> Spec → `MASt` → `ON` → [Edit] → `REPL`/`REdY` → [A] oder [B] drücken = übertragen;
> für weitere Sensoren wiederholen, [Edit] beendet.
>
> **Werksreset:** [A] + [B] beim Einschalten gedrückt halten, dann zusätzlich [Edit] →
> `RSto PArM`.
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
- [ ] Festo: **NPN** / **Pin4 = VOL/MASS** / **LOGC = NO** / **PULS = 100 ms** / **SP** gesetzt & notiert (Display zeigt oben `Puls`)
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
- **Genauigkeit gasabhängig** (Bedienungsanleitung 2025-02d, Tab. 42): Nullpunkt
  Luft/N2 ±1 % FS, Argon ±2 % FS; Spanne Luft/N2 ±2 % FS, Argon ±4 % FS (ohne Nutzung
  des Durchfluss-Abgangs). Einlaufstrecke nach Festo 6.1.1 beachten.
- **Schutzart IP40:** nur Innenraum/Schaltschrank; in rauer Halle Sensor/Elektronik schützen.
- **Persistenz:** Gesamtvolumen in der Firmware via `restore_value` gesichert (übersteht Reboot).
- **IO-Link-Alternative:** Direktzugriff auf kumulierten Messwert + Ferndiagnose über Pin 2 (C/Q)
  möglich, erfordert aber IO-Link-Master (z. B. MAX14819). Für reine Zählung ist der Pulsweg vorzuziehen.
