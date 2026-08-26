/* Gas Monitoring – Frontend (vanilla, kein Build-Schritt).
   Daten live aus dem Backend (GET /api/data), gas-neutral (Argon + Stickstoff).
   Zwei Ebenen: ohne Login komplett lesbar (inkl. Export), alle Änderungen
   (Sensoren, Einstellungen, Firmware, Quittieren, Neustart) hinter dem Login.
   Sprache DE/EN über die I18N-Tabelle unten; UI-Präferenzen in localStorage.
   Modals leben in einer eigenen Ebene (#modal-layer) und überleben den 5-s-Poll. */
(() => {
  "use strict";

  const THEMES = {
    control:{'--bg':'#0a0e16','--bg2':'#0e1320','--panel':'#121826','--panel2':'#171f30','--border':'#26304a','--text':'#e9f0fb','--dim':'#9db0cc','--mute':'#677792','--accent':'#34e2a6','--accent2':'#46c6ff','--good':'#34e2a6','--warn':'#ffb547','--danger':'#ff5d72','--grid':'rgba(255,255,255,0.06)','--stroke':'#46c6ff','--onacc':'#04140d','--shadow':'0 1px 0 rgba(255,255,255,0.03)','--radius':'11px','--fontsans':"'IBM Plex Sans',system-ui,sans-serif",'--fontnum':"'IBM Plex Mono',monospace",'--bgimg':'radial-gradient(1100px 520px at 82% -8%, rgba(70,198,255,0.07), transparent 60%)'},
    analytics:{'--bg':'#eef1f6','--bg2':'#f6f8fb','--panel':'#ffffff','--panel2':'#f5f8fc','--border':'#e3e8f0','--text':'#101c2e','--dim':'#4a586b','--mute':'#93a1b4','--accent':'#2563eb','--accent2':'#0e9aa7','--good':'#15a34a','--warn':'#d97706','--danger':'#dc2626','--grid':'rgba(16,28,46,0.07)','--stroke':'#2563eb','--onacc':'#ffffff','--shadow':'0 1px 2px rgba(16,28,46,0.06),0 1px 3px rgba(16,28,46,0.05)','--radius':'12px','--fontsans':"'IBM Plex Sans',system-ui,sans-serif",'--fontnum':"'IBM Plex Mono',monospace",'--bgimg':'none'},
    technical:{'--bg':'#0b0e0c','--bg2':'#0f130f','--panel':'#0e120f','--panel2':'#121712','--border':'#26302a','--text':'#d7e3da','--dim':'#88a092','--mute':'#5d7165','--accent':'#7dffab','--accent2':'#ffc56b','--good':'#7dffab','--warn':'#ffc56b','--danger':'#ff8472','--grid':'rgba(125,255,171,0.09)','--stroke':'#7dffab','--onacc':'#04140b','--shadow':'none','--radius':'3px','--fontsans':"'JetBrains Mono',monospace",'--fontnum':"'JetBrains Mono',monospace",'--bgimg':'repeating-linear-gradient(0deg, rgba(125,255,171,0.022) 0 1px, transparent 1px 27px), repeating-linear-gradient(90deg, rgba(125,255,171,0.022) 0 1px, transparent 1px 27px)'}
  };

  // ------------------------------------------------------------------- i18n
  const L = {
  de: {
    subtitle:'iwb · TUM — Gasverbrauch Produktionshalle',
    lblGas:'GAS', lblRange:'ZEITRAUM', lblUnit:'EINHEIT', lblTheme:'THEME', lblLang:'SPRACHE',
    all:'Alle', themeLight:'Hell',
    btnSensors:'Sensoren', btnDevice:'＋ Gerät', btnExport:'Export', btnLogin:'Anmelden', btnLogout:'Abmelden',
    titleSensors:'Sensoren verwalten', titleDevice:'Neues Gerät flashen · Firmware bauen · MAC auslesen', titleSettings:'Einstellungen', titleExport:'Historische Daten als CSV exportieren',
    brokerOk:'BROKER OK', brokerDown:'BROKER GETRENNT', mqttOnline:'MQTT ONLINE', noData:'KEINE DATEN',
    pollError:'Backend nicht erreichbar — Anzeige zeigt den Stand von {0}.',
    unassigned1:'1 nicht zugeordneter Sensor', unassignedN:'{0} nicht zugeordnete Sensoren',
    unassignedGo:' — hier klicken und Gas/Abteilung zuweisen.', unassignedInfo:' — Zuordnung nach Anmeldung möglich.',
    r24:'24 h', r7:'7 Tage', r30:'30 Tage',
    rl24:'letzte 24 h', rl7:'letzte 7 Tage', rl30:'letzte 30 Tage',
    kCons:'Verbrauch · {0}', kConsSub:'{0} € gesamt', kCost:'Gas-Kosten', kCostSub:'{0} m³ · {1}', allGases:'alle Gase',
    kLive:'Live-Durchfluss', kLiveSub:'{0} von {1} aktiv', kAlarms:'Aktive Alarme', kAlarmsSub:'{0} kritisch · {1} Warnung',
    trend:'Verbrauchs-Trend', allDepts:'Alle Abteilungen', plantWide:'Werksweit', nSensors:'{0} Sensoren',
    alarmsPanel:'Aktive Alarme', alarmsNone:'Keine aktiven Alarme.', history:'Historie', ackTip:'quittieren',
    byDept:'Nach Abteilung',
    alOver:'Mehrverbrauch', alOverDetail:'+{0}% über Erwartungswert',
    alLeak:'Leerlauf / Leck', alLeakDetail:'Durchfluss während Stillstand',
    alDown:'Downtime-Verbrauch', alDownDetail:'Verbrauch im Stillstands-Fenster',
    alOffline:'Sensor offline', alOfflineDetail:'keine Daten vom Gerät',
    thStatus:'Status', thSensor:'Sensor', thGas:'Gas', thDept:'Abteilung', thFlow:'Live Nl/min', thCons:'Verbrauch', thCost:'Kosten', thTrend:'Trend', th14d:'14 Tage',
    stAlert:'ALARM', stRun:'AKTIV', stIdle:'IDLE', stOff:'OFFLINE',
    sensorsUnits:'{0} Anlagen', tableHintAdmin:'Zeile klicken fokussiert den Chart · ✎ öffnet die Konfiguration', tableHint:'Zeile klicken fokussiert den Chart',
    never:'nie', agoS:'vor {0} s', agoM:'vor {0} min', agoH:'vor {0} h', agoD:'vor {0} d',
    online:'online', offline:'offline', notAssigned:'nicht zugeordnet',
    noSensorsYet:'Noch keine Sensoren. Sobald ein Gerät publiziert, erscheint es hier automatisch.',
    depts:'Abteilungen', noDepts:'Noch keine Abteilungen.', newDept:'Neue Abteilung …', deptMissing:'Name der Abteilung fehlt',
    deptDelTip:'Abteilung löschen', deptDelConfirm:'Abteilung löschen? Zugeordnete Sensoren verlieren nur die Zuordnung.',
    deptCreated:'Abteilung angelegt ✓', deptDeleted:'Abteilung gelöscht ✓',
    pickSensor:'Sensor links auswählen,<br>um ihn zu konfigurieren.',
    device:'Gerät', spValue:'SP-Wert', deviceTip:'Geräte-Webinterface öffnen',
    devHint:'SP-Wert und Anlagen-ID werden im Geräte-Webinterface (Link oben) eingestellt.',
    otaBtn:'Firmware-Update (OTA)', otaIdle:'Gerät startet neu, Zähler bleibt erhalten', otaRunning:'läuft … {0}', otaStarted:'OTA gestartet …',
    otaDone:'OTA abgeschlossen ✓ — Gerät startet neu', otaFail:'OTA fehlgeschlagen (Log unter „＋ Gerät“)',
    otaConfirm:'Firmware-Update (OTA) auf „{0}“ ({1}) starten?\nDas Gerät startet neu; Zähler und Einstellungen bleiben erhalten.',
    total:'Gesamt', name:'Anzeigename', gasSel:'Gas', deptSel:'Abteilung', noGas:'— kein Gas (nicht zugeordnet) —', noDept:'— keine Abteilung —',
    note:'Notiz', notePlaceholder:'z. B. „Flasche getauscht 26.08.“ — bleibt gespeichert',
    leakCustom:'Leck-Schwellen individuell (Standard: {0}–{1} Nl/min)', leakFrom:'Leck ab', leakTo:'bis', leakUnit:'Nl/min (darüber gilt die Anlage als aktiv)',
    dtCustom:'Downtime-Regel individuell (sonst Standard aus ⚙)', dtOn:'Überwachung aktiv', dtMax:'max. Verbrauch im Fenster',
    dtNoWin:'Keine Fenster definiert.', dtAddWin:'＋ Fenster hinzufügen', dtDelWin:'Fenster entfernen',
    dtHint:'Alarm, wenn der Verbrauch in einem Fenster das Maximum überschreitet. Zeiten HH:MM, Ende 24:00 = Mitternacht.',
    save:'Speichern', saved:'Gespeichert ✓', err:'Fehler: ', deleted:'Gelöscht ✓',
    resetCounter:'Zähler nullen', resetTip:'Kommando an das Gerät: Gesamtzähler nullen',
    resetConfirm:'Gesamtzähler von „{0}“ ({1}) wirklich auf 0 setzen?', resetSent:'Reset-Kommando gesendet ✓',
    delSensor:'Sensor löschen', delConfirm:'Sensor „{0}“ ({1}) aus der Registry löschen?\nHistorie bleibt erhalten; ein aktives Gerät registriert sich neu.',
    // Einstellungen
    restartNeeded:'Broker-Änderungen gespeichert — sie greifen erst nach einem Backend-Neustart.',
    mqttBroker:'MQTT-Broker', chBrokerRun:'Broker läuft', chBrokerStop:'Broker gestoppt', chBrokerOff:'Broker aus',
    chIngestOk:'Ingest verbunden', chIngestNo:'Ingest getrennt', chAuthOn:'Geräte-Login aktiv', chAuthOff:'offen (kein Passwort)',
    embedded:'Eingebetteten Broker verwenden (Geräte verbinden sich mit der LAN-IP dieses PCs)',
    bind:'Bind-Adresse', port:'Port', user:'Benutzer', password:'Passwort', extBroker:'Externer Broker (Host/IP)',
    authHint:'Benutzer + Passwort gesetzt = Geräte müssen sich anmelden · leer = offen.',
    secretsOk:'✓ firmware/secrets.yaml stimmt überein — Builds erhalten diese Zugangsdaten.',
    secretsDiff:'⚠ firmware/secrets.yaml weicht ab — wird beim Speichern automatisch angeglichen.',
    secretsMissing:'⚠ firmware/secrets.yaml fehlt — vor dem ersten Firmware-Build anlegen (Vorlage: secrets.yaml.example).',
    secretsBroker:'Broker-IP in den Geräten (secrets.yaml): {0} · LAN-IP dieses PCs: {1}',
    showPw:'Passwort anzeigen', hidePw:'Passwort verbergen',
    prices:'Preise & Allgemein', priceOf:'{0} · €/m³', staleAfter:'Offline nach (s ohne Daten)', offlineAlarm:'Offline-Alarm nach (min · 0 = aus)',
    backupOn:'Tägliches Backup (DB + Konfiguration)', backupKeep:'aufbewahren (Tage)',
    defaults:'Standard-Schwellwerte (gelten, wenn ein Sensor keine eigenen hat)', defaultDt:'Standard-Downtime',
    loginBox:'Dashboard-Login', loginOffHint:'Kein Login-Passwort gesetzt — jeder kann alles ändern. Passwort setzen schaltet den Nur-Lesen-Modus für Unangemeldete ein.',
    loginOnHint:'Login aktiv: ohne Anmeldung ist das Dashboard nur lesbar.',
    loginPw:'Login-Passwort', loginPwPh:'••• (unverändert)', loginDisable:'Login deaktivieren',
    loginDisableConfirm:'Login wirklich deaktivieren? Danach kann jeder im Netz alles ändern.',
    backendBox:'Backend', restartBtn:'Backend neu starten',
    restartConfirm:'Backend jetzt neu starten? Das Dashboard ist für ca. 10 s nicht erreichbar.',
    restarting:'Backend startet neu …', backOnline:'Backend wieder erreichbar ✓', restartTimeout:'Backend meldet sich nicht zurück — Konsole am Dashboard-PC prüfen.',
    saveHint:'Preise/Schwellen greifen sofort · Broker-Änderungen nach Neustart',
    // Flasher
    serialHint:'USB-Flashen & MAC-Auslesen gehen nur in <b>Chrome/Edge</b> direkt am Dashboard-PC über <span style="font-family:var(--fontnum)">http://localhost:8000</span>. Alternative: <span style="font-family:var(--fontnum)">esphome run gas-flowmeter.yaml</span> im firmware/-Ordner.',
    howto:'So kommt ein neues Gerät in die Messung',
    step1:'Unten prüfen, ob ein aktueller <b>Firmware-Build</b> vorhanden ist — sonst „Firmware bauen“ (einmal pro Firmware-Stand).',
    step2:'ESP32-POE2 per <b>USB-C an diesen PC</b> anschließen. <b style="color:var(--danger)">⚠ Niemals USB und PoE gleichzeitig</b> — das Board ist nicht galvanisch isoliert!',
    step3:'„<b>Firmware flashen (USB)</b>“ klicken → seriellen Port wählen → Installation abwarten. Bei einem fabrikneuen Board „Erase device“ mitwählen.',
    step4:'„<b>MAC-Adresse auslesen</b>“ klicken (gleiche USB-Verbindung): das Board zeigt seine <b>Ethernet-MAC</b> — kopieren.',
    step5:'MAC bei der <b>IT zur Netzwerk-Freischaltung</b> einreichen (<b>⏱ bis zu 2 Arbeitstage</b>; die Firmware zeigt die MAC jederzeit wieder an).',
    step6:'Nach der Freischaltung: USB trennen, Gerät per <b>PoE</b> anschließen → es erscheint unter „Sensoren“ als <b>„nicht zugeordnet“</b>. Dort Name/Gas/Abteilung zuweisen; im Geräte-Webinterface (IP-Link) den <b>SP-Wert</b> und optional eine Anlagen-ID setzen.',
    step7:'Festo-Sensor gemäß Anleitung (§3 Verdrahtung, §4 Parametrierung) anschließen — SP am Sensor und SP-Wert im Gerät müssen exakt übereinstimmen.',
    fwBox:'Firmware-Build (gilt für alle Geräte)', fwBuild:'Firmware bauen',
    fwFrom:'Build vom <b style="color:var(--text)">{0}</b> · {1} KB', fwNone:'<b style="color:var(--warn)">noch kein Build vorhanden</b> — erst „Firmware bauen“ klicken',
    fwRunning:'⏳ {0} läuft …', fwOkJob:'✓ letzter Job ({0}) erfolgreich', fwFailJob:'✗ letzter Job ({0}) fehlgeschlagen',
    fwNoApi:'Firmware-Status nicht ladbar — läuft das Backend auf dem Dashboard-PC?',
    flashBox:'Erstflash per USB', flashBtn:'Firmware flashen (USB)', flashModFail:'Flash-Modul (vendor/esp-web-tools) nicht ladbar.', flashModLoad:'Flash-Modul lädt …',
    flashOtaHint:'Updates verbundener Geräte: „Sensoren“ → Gerät → „Firmware-Update (OTA)“.',
    macBox:'MAC-Adresse auslesen (für die IT-Freischaltung)', macBtn:'MAC-Adresse auslesen (USB)', macActive:'Konsole aktiv …', macStop:'Stopp',
    macHint:'Liest die USB-Konsole des geflashten Boards; die MAC steht später auch im Sensor-Manager.',
    macCopy:'kopieren', macCopied:'MAC kopiert ✓', macCopyFail:'Kopieren fehlgeschlagen: ', macSubmit:'→ diese Ethernet-MAC bei der IT zur Freischaltung einreichen',
    macWait:'— warte auf Ausgabe (Board wird resettet) —', serialErr:'Serielle Verbindung: ', serialLost:'[Verbindung getrennt: {0}]',
    jobBuild:'Build', jobOta:'OTA → {0}', buildRunningErr:'es läuft bereits ein Job',
    // Export
    exScope:'Umfang', exTotal:'Gesamt (alle zugeordneten Anlagen)', exDept:'Abteilung: {0}', exSensor:'Anlage: {0}',
    exRes:'Auflösung', exDay:'Tag', exHour:'Stunde', exFrom:'Von', exTo:'Bis', exGo:'CSV herunterladen',
    exHint:'Semikolon-getrennt mit Dezimalkomma — öffnet direkt in (deutschem) Excel. Spalten: Zeit, Sensor, Gas, Abteilung, Nl, m³, €.',
    // Alarm-Historie
    titleHist:'Alarm-Historie', histRaised:'Aufgetreten', histType:'Typ', histLevel:'Stufe', histValue:'Wert', histState:'Status',
    histActive:'aktiv', histAck:'quittiert {0}', histAuto:'auto aufgelöst {0}', histNone:'Keine Alarme aufgezeichnet.',
    lvWarn:'Warnung', lvCrit:'kritisch',
    // Login
    titleLogin:'Anmelden', loginInfo:'Ohne Anmeldung ist das Dashboard nur lesbar.', loginBtn:'Anmelden', loginWrong:'Falsches Passwort',
    loginRequired:'Anmeldung erforderlich', loginFirst:'Bitte zuerst anmelden.',
    regLoadFail:'Sensor-Liste nicht ladbar: ', cfgLoadFail:'Konfiguration nicht ladbar: ', histLoadFail:'Historie nicht ladbar: ',
    waiting:'Warte auf Daten vom Backend …'
  },
  en: {
    subtitle:'iwb · TUM — Shopfloor Gas Telemetry',
    lblGas:'GAS', lblRange:'RANGE', lblUnit:'UNIT', lblTheme:'THEME', lblLang:'LANGUAGE',
    all:'All', themeLight:'Light',
    btnSensors:'Sensors', btnDevice:'＋ Device', btnExport:'Export', btnLogin:'Sign in', btnLogout:'Sign out',
    titleSensors:'Manage sensors', titleDevice:'Flash new device · build firmware · read MAC', titleSettings:'Settings', titleExport:'Export historical data as CSV',
    brokerOk:'BROKER OK', brokerDown:'BROKER DOWN', mqttOnline:'MQTT ONLINE', noData:'NO DATA',
    pollError:'Backend unreachable — showing data as of {0}.',
    unassigned1:'1 unassigned sensor', unassignedN:'{0} unassigned sensors',
    unassignedGo:' — click here to assign gas/department.', unassignedInfo:' — sign in to assign.',
    r24:'24 h', r7:'7 days', r30:'30 days',
    rl24:'last 24 hours', rl7:'last 7 days', rl30:'last 30 days',
    kCons:'Consumption · {0}', kConsSub:'{0} € total', kCost:'Gas cost', kCostSub:'{0} m³ · {1}', allGases:'all gases',
    kLive:'Live flow', kLiveSub:'{0} of {1} active', kAlarms:'Active alarms', kAlarmsSub:'{0} critical · {1} warning',
    trend:'Consumption trend', allDepts:'All departments', plantWide:'Plant-wide', nSensors:'{0} sensors',
    alarmsPanel:'Active alarms', alarmsNone:'No active alarms.', history:'History', ackTip:'acknowledge',
    byDept:'By department',
    alOver:'Over-consumption', alOverDetail:'+{0}% above expectation',
    alLeak:'Idle flow / leak', alLeakDetail:'Flow while machine is idle',
    alDown:'Downtime consumption', alDownDetail:'Consumption inside downtime window',
    alOffline:'Sensor offline', alOfflineDetail:'no data from device',
    thStatus:'Status', thSensor:'Sensor', thGas:'Gas', thDept:'Department', thFlow:'Live Nl/min', thCons:'Consumption', thCost:'Cost', thTrend:'Trend', th14d:'14-day',
    stAlert:'ALERT', stRun:'RUNNING', stIdle:'IDLE', stOff:'OFFLINE',
    sensorsUnits:'{0} units', tableHintAdmin:'Click a row to focus the chart · ✎ opens configuration', tableHint:'Click a row to focus the chart',
    never:'never', agoS:'{0} s ago', agoM:'{0} min ago', agoH:'{0} h ago', agoD:'{0} d ago',
    online:'online', offline:'offline', notAssigned:'unassigned',
    noSensorsYet:'No sensors yet. As soon as a device publishes, it appears here automatically.',
    depts:'Departments', noDepts:'No departments yet.', newDept:'New department …', deptMissing:'Department name missing',
    deptDelTip:'Delete department', deptDelConfirm:'Delete department? Assigned sensors only lose the assignment.',
    deptCreated:'Department created ✓', deptDeleted:'Department deleted ✓',
    pickSensor:'Select a sensor on the left<br>to configure it.',
    device:'Device', spValue:'SP value', deviceTip:'Open device web UI',
    devHint:'SP value and machine ID are set in the device web UI (link above).',
    otaBtn:'Firmware update (OTA)', otaIdle:'device reboots, counter is kept', otaRunning:'running … {0}', otaStarted:'OTA started …',
    otaDone:'OTA finished ✓ — device is rebooting', otaFail:'OTA failed (log under “＋ Device”)',
    otaConfirm:'Start firmware update (OTA) on “{0}” ({1})?\nThe device reboots; counter and settings are kept.',
    total:'Total', name:'Display name', gasSel:'Gas', deptSel:'Department', noGas:'— no gas (unassigned) —', noDept:'— no department —',
    note:'Note', notePlaceholder:'e.g. “bottle swapped Aug 26” — stays saved',
    leakCustom:'Custom leak thresholds (default: {0}–{1} Nl/min)', leakFrom:'Leak from', leakTo:'to', leakUnit:'Nl/min (above = machine active)',
    dtCustom:'Custom downtime rule (else default from ⚙)', dtOn:'Monitoring active', dtMax:'max. consumption in window',
    dtNoWin:'No windows defined.', dtAddWin:'＋ Add window', dtDelWin:'Remove window',
    dtHint:'Alarm when consumption within a window exceeds the maximum. Times HH:MM, end 24:00 = midnight.',
    save:'Save', saved:'Saved ✓', err:'Error: ', deleted:'Deleted ✓',
    resetCounter:'Reset counter', resetTip:'Command to the device: zero the total counter',
    resetConfirm:'Really reset the total counter of “{0}” ({1}) to 0?', resetSent:'Reset command sent ✓',
    delSensor:'Delete sensor', delConfirm:'Delete sensor “{0}” ({1}) from the registry?\nHistory is kept; an active device re-registers.',
    restartNeeded:'Broker changes saved — they take effect after a backend restart.',
    mqttBroker:'MQTT broker', chBrokerRun:'Broker running', chBrokerStop:'Broker stopped', chBrokerOff:'Broker off',
    chIngestOk:'Ingest connected', chIngestNo:'Ingest disconnected', chAuthOn:'Device auth on', chAuthOff:'open (no password)',
    embedded:'Use embedded broker (devices connect to this PC’s LAN IP)',
    bind:'Bind address', port:'Port', user:'User', password:'Password', extBroker:'External broker (host/IP)',
    authHint:'User + password set = devices must log in · empty = open.',
    secretsOk:'✓ firmware/secrets.yaml matches — builds get these credentials.',
    secretsDiff:'⚠ firmware/secrets.yaml differs — it will be updated automatically on save.',
    secretsMissing:'⚠ firmware/secrets.yaml missing — create it before the first firmware build (template: secrets.yaml.example).',
    secretsBroker:'Broker IP inside the devices (secrets.yaml): {0} · LAN IP of this PC: {1}',
    showPw:'Show password', hidePw:'Hide password',
    prices:'Prices & general', priceOf:'{0} · €/m³', staleAfter:'Offline after (s without data)', offlineAlarm:'Offline alarm after (min · 0 = off)',
    backupOn:'Daily backup (DB + configuration)', backupKeep:'keep (days)',
    defaults:'Default thresholds (apply unless a sensor overrides them)', defaultDt:'Default downtime',
    loginBox:'Dashboard login', loginOffHint:'No login password set — anyone can change anything. Setting one makes the dashboard read-only for signed-out users.',
    loginOnHint:'Login active: without signing in the dashboard is read-only.',
    loginPw:'Login password', loginPwPh:'••• (unchanged)', loginDisable:'Disable login',
    loginDisableConfirm:'Really disable login? Anyone on the network can then change anything.',
    backendBox:'Backend', restartBtn:'Restart backend',
    restartConfirm:'Restart the backend now? The dashboard will be unavailable for ~10 s.',
    restarting:'Backend restarting …', backOnline:'Backend back online ✓', restartTimeout:'Backend did not come back — check the console on the dashboard PC.',
    saveHint:'Prices/thresholds apply immediately · broker changes after restart',
    serialHint:'USB flashing & MAC reading only work in <b>Chrome/Edge</b> directly on the dashboard PC via <span style="font-family:var(--fontnum)">http://localhost:8000</span>. Alternative: <span style="font-family:var(--fontnum)">esphome run gas-flowmeter.yaml</span> in the firmware/ folder.',
    howto:'How a new device joins the measurement',
    step1:'Check below that a current <b>firmware build</b> exists — otherwise click “Build firmware” (once per firmware revision).',
    step2:'Connect the ESP32-POE2 via <b>USB-C to this PC</b>. <b style="color:var(--danger)">⚠ Never USB and PoE at the same time</b> — the board is not galvanically isolated!',
    step3:'Click “<b>Flash firmware (USB)</b>” → choose the serial port → wait for the installation. For a brand-new board also select “Erase device”.',
    step4:'Click “<b>Read MAC address</b>” (same USB connection): the board prints its <b>Ethernet MAC</b> — copy it.',
    step5:'Submit the MAC to <b>IT for network approval</b> (<b>⏱ up to 2 working days</b>; the firmware shows the MAC again at any time).',
    step6:'After approval: disconnect USB, connect the device via <b>PoE</b> → it appears under “Sensors” as <b>“unassigned”</b>. Assign name/gas/department there; set the <b>SP value</b> and optionally a machine ID in the device web UI (IP link).',
    step7:'Wire the Festo sensor per the manual (§3 wiring, §4 parameters) — the SP on the sensor and the SP value in the device must match exactly.',
    fwBox:'Firmware build (shared by all devices)', fwBuild:'Build firmware',
    fwFrom:'Build from <b style="color:var(--text)">{0}</b> · {1} KB', fwNone:'<b style="color:var(--warn)">no build yet</b> — click “Build firmware” first',
    fwRunning:'⏳ {0} running …', fwOkJob:'✓ last job ({0}) succeeded', fwFailJob:'✗ last job ({0}) failed',
    fwNoApi:'Firmware status not available — is the backend running on the dashboard PC?',
    flashBox:'First flash via USB', flashBtn:'Flash firmware (USB)', flashModFail:'Flash module (vendor/esp-web-tools) failed to load.', flashModLoad:'Flash module loading …',
    flashOtaHint:'Updates for connected devices: “Sensors” → device → “Firmware update (OTA)”.',
    macBox:'Read MAC address (for IT approval)', macBtn:'Read MAC address (USB)', macActive:'Console active …', macStop:'Stop',
    macHint:'Reads the USB console of the flashed board; the MAC also appears later in the sensor manager.',
    macCopy:'copy', macCopied:'MAC copied ✓', macCopyFail:'Copy failed: ', macSubmit:'→ submit this Ethernet MAC to IT for approval',
    macWait:'— waiting for output (board is being reset) —', serialErr:'Serial connection: ', serialLost:'[connection lost: {0}]',
    jobBuild:'Build', jobOta:'OTA → {0}', buildRunningErr:'a job is already running',
    exScope:'Scope', exTotal:'Total (all assigned machines)', exDept:'Department: {0}', exSensor:'Machine: {0}',
    exRes:'Resolution', exDay:'Day', exHour:'Hour', exFrom:'From', exTo:'To', exGo:'Download CSV',
    exHint:'Semicolon-separated with decimal comma — opens directly in (German) Excel. Columns: time, sensor, gas, department, Nl, m³, €.',
    titleHist:'Alarm history', histRaised:'Raised', histType:'Type', histLevel:'Level', histValue:'Value', histState:'Status',
    histActive:'active', histAck:'acknowledged {0}', histAuto:'auto-cleared {0}', histNone:'No alarms recorded.',
    lvWarn:'warning', lvCrit:'critical',
    titleLogin:'Sign in', loginInfo:'Without signing in the dashboard is read-only.', loginBtn:'Sign in', loginWrong:'Wrong password',
    loginRequired:'Sign-in required', loginFirst:'Please sign in first.',
    regLoadFail:'Sensor list not loadable: ', cfgLoadFail:'Configuration not loadable: ', histLoadFail:'History not loadable: ',
    waiting:'Waiting for data from the backend …'
  }};
  const t = (k, ...a) => {
    let s = (L[S.lang] && L[S.lang][k]) ?? L.de[k] ?? k;
    a.forEach((v, i) => { s = s.replace('{' + i + '}', v); });
    return s;
  };

  // ------------------------------------------------------------------ state
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('gasUI') || '{}') || {}; } catch (e) {}
  const S = {
    range: saved.range || '7d', unit: saved.unit || 'm3', theme: saved.theme || 'control',
    lang: saved.lang || 'de', gas: 'all',
    scope: {type: 'total'}, sortKey: 'cons', sortDir: 'desc', hover: -1, now: Date.now(),
    pollError: false, lastOk: null
  };
  function persistUI(){ try{ localStorage.setItem('gasUI', JSON.stringify({range:S.range,unit:S.unit,theme:S.theme,lang:S.lang})); }catch(e){} }

  let TOKEN = '';
  try { TOKEN = localStorage.getItem('gasToken') || ''; } catch (e) {}
  const AUTH = {required: false, admin: true, known: false};
  const isAdmin = () => AUTH.admin;
  function setToken(tok){ TOKEN = tok || ''; try{ tok ? localStorage.setItem('gasToken', tok) : localStorage.removeItem('gasToken'); }catch(e){} }
  async function refreshAuth(){
    try{
      const r = await fetch('api/auth', {headers: TOKEN ? {'X-Auth': TOKEN} : {}, cache:'no-store'});
      if(r.ok){ const j = await r.json(); AUTH.required = !!j.required; AUTH.admin = !!j.admin; AUTH.known = true; }
    }catch(e){}
  }

  let DATA = null;                  // letzte Backend-Antwort (/api/data)
  let M = null;                     // Modal-State
  const root = document.getElementById('root');
  root.innerHTML = '<div id="app"></div><div id="modal-layer"></div>';
  const appEl = document.getElementById('app');
  const modalEl = document.getElementById('modal-layer');

  // ----------------------------------------------------------------- helpers
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const allSensors = () => (DATA && DATA.sensors) || [];
  const gasesList = () => (DATA && DATA.gases) || [];
  const depts = () => (DATA && DATA.departments) || [];
  const refDates = () => (DATA && DATA.refDates) || [];
  const alarms = () => (DATA && DATA.alarms) || [];
  const unassigned = () => (DATA && DATA.unassigned) || [];
  const priceOf = g => { const x = gasesList().find(z => z.id === g); return x ? x.pricePerM3 : 0; };
  const gasName = g => { const x = gasesList().find(z => z.id === g); return x ? x.name : (g || '—'); };
  const gasShort = g => g === 'nitrogen' ? 'N₂' : g === 'argon' ? 'Ar' : (gasName(g));
  const deepCopy = o => JSON.parse(JSON.stringify(o));
  const numLocale = () => S.lang === 'de' ? 'de-DE' : 'en-GB';

  // Sichtbare Sensoren = Gas-Filter angewandt
  const sensors = () => S.gas === 'all' ? allSensors() : allSensors().filter(m => m.gas === S.gas);

  const fmtNum = (n,d) => (n==null||isNaN(n)) ? '—' : Number(n).toLocaleString(numLocale(),{minimumFractionDigits:d,maximumFractionDigits:d});
  // Wert in gewählter Einheit für ein Sensor-Gas: Nl -> m³ oder €
  const unitVal = (nl,gas) => S.unit==='m3' ? nl/1000 : nl/1000*priceOf(gas);
  // formatiert einen bereits in der Einheit vorliegenden Wert
  const fmtUnitVal = v => { if(S.unit==='m3'){const d=v<10?2:v<100?1:0; return fmtNum(v,d)+' m³';} return fmtNum(Math.round(v),0)+' €'; };
  const fmtM3 = nl => { const v=nl/1000, d=v<10?2:v<100?1:0; return fmtNum(v,d)+' m³'; };
  const fmtEurNl = (nl,gas) => fmtNum(Math.round(nl/1000*priceOf(gas)),0)+' €';
  const axisFmt = v => { if(S.unit==='m3') return fmtNum(v, v<10?1:0); if(v>=1000) return fmtNum(v/1000, v>=10000?0:1)+'k'; return fmtNum(Math.round(v),0); };
  const ago = ts => { if(!ts) return t('never'); const s=Math.max(0,Math.round(Date.now()/1000-ts));
    if(s<60) return t('agoS',s); if(s<3600) return t('agoM',Math.round(s/60));
    if(s<86400) return t('agoH',Math.round(s/3600)); return t('agoD',Math.round(s/86400)); };
  const fmtDT = ts => ts ? new Date(ts*1000).toLocaleString(numLocale(),{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';

  const bucketsFor = m => S.range==='24h' ? m.hourly : S.range==='7d' ? m.daily.slice(23) : m.daily;
  const rangeNl = m => bucketsFor(m).reduce((a,b)=>a+b,0);
  const rangeUnit = m => unitVal(rangeNl(m), m.gas);
  const WD = () => S.lang==='de' ? ['So','Mo','Di','Mi','Do','Fr','Sa'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const labelsFor = () => {
    if(S.range==='24h') return Array.from({length:24},(_,i)=>String(i).padStart(2,'0')+':00');
    const ds = refDates().map(ms=>new Date(ms));
    if(S.range==='7d') return ds.slice(23).map(d=>WD()[d.getDay()]);
    return ds.map(d=>d.getDate()+'.'+(d.getMonth()+1));
  };
  const scopeMachines = () => {
    const s=S.scope, ms=sensors();
    if(s.type==='dept') return ms.filter(m=>m.deptId===s.id);
    if(s.type==='machine'){ const m=ms.find(x=>x.id===s.id); return m?[m]:ms; }
    return ms;
  };
  // Chart-Serie direkt in der gewählten Einheit (gasabhängig aufsummiert)
  const seriesForScope = () => {
    const ms=scopeMachines(), labels=labelsFor(), n=labels.length, vals=new Array(n).fill(0), nl=new Array(n).fill(0);
    ms.forEach(m=>{ const b=bucketsFor(m); for(let i=0;i<n;i++){ vals[i]+=unitVal(b[i]||0, m.gas); nl[i]+=(b[i]||0); } });
    return {vals,nl,labels};
  };
  const curPrev = m => {
    const s=a=>a.reduce((x,y)=>x+y,0);
    if(S.range==='24h') return {cur:s(m.hourly), prev:m.daily[28]||0};
    if(S.range==='7d') return {cur:s(m.daily.slice(23)), prev:s(m.daily.slice(16,23))};
    return {cur:s(m.daily.slice(15)), prev:s(m.daily.slice(0,15))};
  };
  const trendPct = ms => { let c=0,p=0; ms.forEach(m=>{const x=curPrev(m); c+=x.cur; p+=x.prev;}); return p<=0?0:(c-p)/p*100; };
  const machineCurrent = m => Math.max(0, m.flow||0);
  const levelColor = l => l==='critical'?'var(--danger)':'var(--warn)';

  // ------------------------------------------------------------------- chart
  const CW=900, CH=300, PL=58, PR=18, PT=16, PB=38;
  function chartSVG(){
    const s=seriesForScope(); const vals=s.vals; const n=vals.length;
    const iw=CW-PL-PR, ih=CH-PT-PB;
    const max=Math.max(1, Math.max.apply(null, vals))*1.18;
    const X=i=> n<=1 ? PL+iw/2 : PL + i*(iw/(n-1));
    const Y=v=> PT+ih - (v/max)*ih; const base=PT+ih;
    let out=`<svg viewBox="0 0 ${CW} ${CH}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:visible">`;
    const rows=4;
    for(let r=0;r<=rows;r++){ const yy=PT+ih*(r/rows), val=max*(1-r/rows);
      out+=`<line x1="${PL}" y1="${yy}" x2="${CW-PR}" y2="${yy}" stroke="var(--grid)" stroke-width="1"/>`;
      out+=`<text x="${PL-10}" y="${yy+4}" text-anchor="end" font-size="11.5" fill="var(--mute)" font-family="var(--fontnum)">${esc(axisFmt(val))}</text>`;
    }
    const step=Math.max(1,Math.ceil(n/7));
    for(let i=0;i<n;i+=step) out+=`<text x="${X(i)}" y="${CH-12}" text-anchor="middle" font-size="10.5" fill="var(--mute)" font-family="var(--fontnum)">${esc(s.labels[i])}</text>`;
    let line='', area=`M${X(0).toFixed(1)},${base} `;
    vals.forEach((v,i)=>{ line+=(i?'L':'M')+X(i).toFixed(1)+','+Y(v).toFixed(1)+' '; area+='L'+X(i).toFixed(1)+','+Y(v).toFixed(1)+' '; });
    area+=`L${X(n-1).toFixed(1)},${base} Z`;
    out+=`<path d="${area}" fill="var(--stroke)" fill-opacity="0.13" stroke="none"/>`;
    out+=`<path d="${line}" fill="none" stroke="var(--stroke)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    const hv=S.hover;
    if(hv>=0 && hv<n){ const hx=X(hv), hy=Y(vals[hv]);
      out+=`<line x1="${hx}" y1="${PT}" x2="${hx}" y2="${base}" stroke="var(--stroke)" stroke-width="1" stroke-dasharray="3 3" opacity="0.55"/>`;
      out+=`<circle cx="${hx}" cy="${hy}" r="5" fill="var(--stroke)" stroke="var(--panel)" stroke-width="2"/>`;
      const tw=148,th=46; let tx=hx+12; if(tx+tw>CW-PR) tx=hx-12-tw; if(tx<PL)tx=PL; const ty=Math.max(PT,hy-th-8);
      out+=`<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="6" fill="var(--panel2)" stroke="var(--border)"/>`;
      out+=`<text x="${tx+12}" y="${ty+18}" font-size="11" fill="var(--mute)" font-family="var(--fontnum)">${esc(s.labels[hv])}</text>`;
      out+=`<text x="${tx+12}" y="${ty+36}" font-size="15" fill="var(--text)" font-family="var(--fontnum)" font-weight="600">${esc(fmtUnitVal(vals[hv]))}</text>`;
    }
    out+='</svg>';
    return out;
  }
  function paintChart(){ const host=document.getElementById('chart-host'); if(host) host.innerHTML=chartSVG(); }
  function chartIndexFromEvent(ev){
    const svg=ev.currentTarget.querySelector('svg'); if(!svg) return -1;
    const r=svg.getBoundingClientRect(); const n=labelsFor().length; const iw=CW-PL-PR;
    const vbx=(ev.clientX-r.left)/r.width*CW;
    let i=Math.round((vbx-PL)/(n<=1?iw:iw/(n-1)));
    return Math.max(0,Math.min(n-1,i));
  }

  function sparkSVG(vals,color){
    const W=104,H=30,p=3,n=vals.length;
    const max=Math.max.apply(null,vals), min=Math.min.apply(null,vals), rng=Math.max(1,max-min);
    const X=i=>p+i*((W-2*p)/(n-1)), Y=v=>H-p-((v-min)/rng)*(H-2*p);
    let d='', a=`M${p},${H-p} `;
    vals.forEach((v,i)=>{ d+=(i?'L':'M')+X(i).toFixed(1)+','+Y(v).toFixed(1)+' '; a+='L'+X(i).toFixed(1)+','+Y(v).toFixed(1)+' '; });
    a+=`L${W-p},${H-p} Z`;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:inline-block;vertical-align:middle"><path d="${a}" fill="${color}" fill-opacity="0.13"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }

  // -------------------------------------------------------------------- view
  const seg = (active,val,act,label) =>
    `<button data-action="${act}" data-val="${val}" style="padding:6px 13px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:none;font-family:var(--fontnum);background:${active?'var(--accent)':'transparent'};color:${active?'var(--onacc)':'var(--dim)'}">${esc(label)}</button>`;

  const ALERT_META = () => ({
    over:     {title:t('alOver'),    detail:v=>t('alOverDetail', Math.round(v*100)), val:v=>'+'+Math.round(v*100)+'%'},
    leak:     {title:t('alLeak'),    detail:_=>t('alLeakDetail'),                    val:v=>fmtNum(v,1)+' Nl/min'},
    downtime: {title:t('alDown'),    detail:_=>t('alDownDetail'),                    val:v=>fmtM3(v)},
    offline:  {title:t('alOffline'), detail:_=>t('alOfflineDetail'),                 val:v=>v>=120?fmtNum(v/60,1)+' h':fmtNum(v,0)+' min'}
  });

  function render(){
    if(!DATA){ appEl.innerHTML=`<div style="padding:40px;font-family:sans-serif;color:#9db0cc">${esc(t('waiting'))}</div>`; return; }
    const admin = isAdmin();
    const flat=sensors();

    const totalNl=flat.reduce((a,m)=>a+rangeNl(m),0);
    const totalM3=totalNl/1000;
    const totalCost=flat.reduce((a,m)=>a+rangeNl(m)/1000*priceOf(m.gas),0);
    const facTrend=trendPct(flat);
    const liveFlow=flat.reduce((a,m)=>a+machineCurrent(m),0);
    const activeN=flat.filter(m=>machineCurrent(m)>0.3).length;
    const onlineN=flat.filter(m=>m.status==='online').length;
    const al=S.gas==='all'?alarms():alarms().filter(a=>a.gas===S.gas);
    const critN=al.filter(a=>a.level==='critical').length;
    const warnN=al.length-critN;

    const delChip=tr=>{ const c=tr>0.5?'var(--danger)':tr<-0.5?'var(--good)':'var(--mute)'; return {delta:(tr>=0?'+':'')+tr.toFixed(0)+'%',deltaColor:c,deltaBg:`color-mix(in srgb,${c} 15%,transparent)`}; };
    const cc=delChip(facTrend);
    const rl = S.range==='24h'?t('r24'):S.range==='7d'?t('r7'):t('r30');
    const rangeLabel = S.range==='24h'?t('rl24'):S.range==='7d'?t('rl7'):t('rl30');

    const kpis=[
      Object.assign({label:t('kCons',rl),value:fmtM3(totalNl),sub:t('kConsSub',fmtNum(Math.round(totalCost),0)),valueColor:'var(--text)'},cc),
      Object.assign({label:t('kCost'),value:fmtNum(Math.round(totalCost),0)+' €',sub:t('kCostSub',totalM3.toFixed(0),S.gas==='all'?t('allGases'):gasName(S.gas)),valueColor:'var(--text)'},cc),
      {label:t('kLive'),value:fmtNum(liveFlow,1)+' Nl/min',sub:t('kLiveSub',activeN,flat.length),valueColor:'var(--accent2)',delta:'LIVE',deltaColor:'var(--good)',deltaBg:'color-mix(in srgb,var(--good) 15%,transparent)'},
      {label:t('kAlarms'),value:String(al.length),sub:t('kAlarmsSub',critN,warnN),valueColor:al.length?'var(--danger)':'var(--good)',delta:al.length?'ATTN':'OK',deltaColor:al.length?'var(--danger)':'var(--good)',deltaBg:`color-mix(in srgb,${al.length?'var(--danger)':'var(--good)'} 15%,transparent)`}
    ];

    const scopeSeries=seriesForScope(); const scopeTotalUnit=scopeSeries.vals.reduce((a,b)=>a+b,0);
    const sc=delChip(trendPct(scopeMachines()));
    let scopeLabel=t('allDepts'), scopeSub=t('plantWide');
    if(S.scope.type==='dept'){ const d=depts().find(x=>x.id===S.scope.id); if(d){scopeLabel=d.name; scopeSub=t('nSensors',flat.filter(m=>m.deptId===d.id).length);} }
    if(S.scope.type==='machine'){ const m=flat.find(x=>x.id===S.scope.id); if(m){scopeLabel=m.name; scopeSub=m.deptName+' · '+gasName(m.gas);} }

    const deptAgg=depts().map(d=>({d, nl:flat.filter(m=>m.deptId===d.id).reduce((a,m)=>a+rangeUnit(m),0)}));
    const maxDept=Math.max(1,...deptAgg.map(x=>x.nl));
    const deptRows=deptAgg.map(({d,nl})=>{
      const dm=flat.filter(m=>m.deptId===d.id); if(!dm.length) return '';
      const active=S.scope.type==='dept'&&S.scope.id===d.id; const hasAl=dm.some(m=>m.anomaly);
      return `<button data-action="scope-dept" data-id="${esc(d.id)}" style="text-align:left;border:none;background:${active?'var(--panel2)':'transparent'};border-radius:7px;padding:6px 8px;margin:-6px -8px;cursor:pointer;width:calc(100% + 16px)">
        <span style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px">
          <span style="font-size:12.5px;font-weight:600;color:${active?'var(--accent)':'var(--text)'}">${esc(d.name)}</span>
          <span style="font-size:12px;font-family:var(--fontnum);font-weight:600;color:var(--text)">${esc(fmtUnitVal(nl))}</span></span>
        <span style="display:block;height:7px;border-radius:4px;background:var(--panel2);overflow:hidden"><span style="display:block;height:100%;border-radius:4px;background:${hasAl?'var(--warn)':'var(--accent)'};width:${Math.round(nl/maxDept*100)}%"></span></span></button>`;
    }).join('');

    const AM=ALERT_META();
    const alertRows = al.length ? al.map(a=>{
      const meta=AM[a.type]||{title:a.type,detail:_=>'',val:v=>String(v)};
      const color=levelColor(a.level);
      return `<div style="display:flex;gap:11px;align-items:stretch;background:var(--panel2);border:1px solid var(--border);border-radius:9px;padding:10px 11px">
        <span style="width:3px;border-radius:3px;background:${color};flex:none"></span>
        <button data-action="scope-machine" data-id="${esc(a.sensor)}" style="flex:1;min-width:0;text-align:left;background:none;border:none;cursor:pointer;padding:0;color:inherit">
          <span style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span style="font-size:12.5px;font-weight:600;color:var(--text)">${esc(meta.title)}</span>
            <span style="font-size:11px;font-family:var(--fontnum);font-weight:600;color:${color};flex:none">${esc(meta.val(a.value))}</span></span>
          <span style="display:block;font-size:11.5px;color:var(--dim);font-family:var(--fontnum);margin-top:2px">${esc(a.sensorName+' · '+a.deptName+' · '+gasShort(a.gas))}</span>
          <span style="display:block;font-size:11px;color:var(--mute);margin-top:3px">${esc(meta.detail(a.value))}</span></button>
        ${admin?`<button data-action="ack" data-id="${a.id}" title="${esc(t('ackTip'))}" style="flex:none;align-self:center;border:1px solid var(--border);background:var(--panel);color:var(--dim);border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer">✓</button>`:''}</div>`;
    }).join('') : `<div style="font-size:12px;color:var(--mute);padding:6px 2px">${esc(t('alarmsNone'))}</div>`;

    // --- Sensor-Tabelle
    const dir=S.sortDir==='asc'?1:-1;
    let rows=flat.map(m=>{ const consNl=rangeNl(m), cur=machineCurrent(m), tr=trendPct([m]), an=!!m.anomaly;
      const statusLabel=an?t('stAlert'):(cur>0.3?t('stRun'):(m.status==='online'?t('stIdle'):t('stOff')));
      const statusColor=an?levelColor(m.anomaly.level):(cur>0.3?'var(--good)':'var(--mute)');
      return {m,consNl,cur,tr,an,statusLabel,statusColor}; });
    rows.sort((a,b)=>{ let x,y; switch(S.sortKey){
      case'name':x=a.m.name;y=b.m.name;return x<y?-dir:x>y?dir:0;
      case'gas':x=a.m.gas||'';y=b.m.gas||'';return x<y?-dir:x>y?dir:0;
      case'dept':x=a.m.deptName;y=b.m.deptName;return x<y?-dir:x>y?dir:0;
      case'status':x=a.an?2:(a.cur>0.3?1:0);y=b.an?2:(b.cur>0.3?1:0);break;
      case'flow':x=a.cur;y=b.cur;break; case'trend':x=a.tr;y=b.tr;break;
      default:x=a.consNl;y=b.consNl; } return (x-y)*dir; });
    const colDefs=[['status',t('thStatus'),'left'],['name',t('thSensor'),'left'],['gas',t('thGas'),'left'],['dept',t('thDept'),'left'],['flow',t('thFlow'),'right'],['cons',t('thCons'),'right'],['cost',t('thCost'),'right'],['trend',t('thTrend'),'right']];
    const ths=colDefs.map(c=>{ const arrow=S.sortKey===c[0]?(S.sortDir==='asc'?' ↑':' ↓'):''; return `<th data-action="sort" data-key="${c[0]}" style="text-align:${c[2]};padding:7px 12px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);font-weight:600;border-bottom:1px solid var(--border);cursor:pointer;white-space:nowrap;user-select:none">${esc(c[1])}${arrow}</th>`; }).join('')
      + `<th style="text-align:right;padding:7px 12px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);font-weight:600;border-bottom:1px solid var(--border)">${esc(t('th14d'))}</th>`
      + (admin?`<th style="padding:7px 6px;border-bottom:1px solid var(--border)"></th>`:'');
    const trs=rows.map(r=>{ const m=r.m; const active=S.scope.type==='machine'&&S.scope.id===m.id;
      const anim=r.an?'argblink 1.4s ease-in-out infinite':(r.cur>0.3?'argpulse 2.2s ease-in-out infinite':'none');
      const noteIco=m.note?` <span title="${esc(m.note)}" style="cursor:help;font-size:12px">📝</span>`:'';
      return `<tr data-action="scope-machine" data-id="${esc(m.id)}" style="cursor:pointer;background:${active?'var(--panel2)':'transparent'};border-bottom:1px solid var(--border)">
        <td style="padding:11px 12px;white-space:nowrap"><span style="display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:600;font-family:var(--fontnum);color:${r.statusColor}"><span style="width:8px;height:8px;border-radius:50%;background:${r.statusColor};animation:${anim}"></span>${esc(r.statusLabel)}</span></td>
        <td style="padding:11px 12px;font-size:13px;font-weight:600;color:var(--text);white-space:nowrap">${esc(m.name)}${noteIco}</td>
        <td style="padding:11px 12px;font-size:12px;color:var(--dim);white-space:nowrap">${esc(gasShort(m.gas))}</td>
        <td style="padding:11px 12px;font-size:12px;color:var(--dim);white-space:nowrap">${esc(m.deptName)}</td>
        <td style="padding:11px 12px;text-align:right;font-family:var(--fontnum);font-size:12.5px;color:var(--text);white-space:nowrap">${esc(fmtNum(r.cur,1))}</td>
        <td style="padding:11px 12px;text-align:right;font-family:var(--fontnum);font-size:12.5px;font-weight:600;color:var(--text);white-space:nowrap">${esc(fmtUnitVal(rangeUnit(m)))}</td>
        <td style="padding:11px 12px;text-align:right;font-family:var(--fontnum);font-size:12.5px;color:var(--dim);white-space:nowrap">${esc(fmtEurNl(r.consNl,m.gas))}</td>
        <td style="padding:11px 12px;text-align:right;font-family:var(--fontnum);font-size:12.5px;font-weight:600;color:${r.tr>0.5?'var(--danger)':r.tr<-0.5?'var(--good)':'var(--mute)'};white-space:nowrap">${r.tr>=0?'▲ ':'▼ '}${esc(Math.abs(r.tr).toFixed(0))}%</td>
        <td style="padding:9px 12px;text-align:right">${sparkSVG(m.daily.slice(16),r.statusColor)}</td>
        ${admin?`<td style="padding:9px 6px;text-align:center"><button data-action="open-sensors" data-id="${esc(m.id)}" title="${esc(t('titleSensors'))}" style="border:1px solid var(--border);background:var(--panel2);color:var(--dim);border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer">✎</button></td>`:''}</tr>`;
    }).join('');

    const d=new Date(S.now);
    const clock=d.toLocaleTimeString(numLocale())+' · '+d.toLocaleDateString(numLocale(),{day:'2-digit',month:'short'});
    const brk=DATA.broker||null;
    const mqttOk=brk?brk.ingest_connected:onlineN>0;
    const brokerLabel=brk?(brk.ingest_connected?t('brokerOk'):t('brokerDown')):(onlineN>0?t('mqttOnline'):t('noData'));
    const gasSegs = seg(S.gas==='all','all','gas',t('all')) + gasesList().map(g=>seg(S.gas===g.id,g.id,'gas',g.name)).join('');
    const naN=unassigned().length;
    const toolBtn='border:1px solid var(--border);background:var(--panel);color:var(--dim);border-radius:9px;padding:8px 13px;font-size:12.5px;font-weight:600;cursor:pointer';

    const adminBtns = admin ? `
            <button data-action="open-sensors" style="${toolBtn}">${esc(t('btnSensors'))}${naN?` <span style="color:var(--warn)">(${naN})</span>`:''}</button>
            <button data-action="open-flasher" style="${toolBtn}" title="${esc(t('titleDevice'))}">${esc(t('btnDevice'))}</button>
            <button data-action="open-export" style="${toolBtn}">${esc(t('btnExport'))}</button>
            <button data-action="open-settings" style="${toolBtn};font-size:15px;padding:6px 11px" title="${esc(t('titleSettings'))}">⚙</button>
            ${AUTH.required?`<button data-action="logout" style="${toolBtn};font-size:11.5px;padding:8px 10px" title="${esc(t('btnLogout'))}">⎋</button>`:''}`
      : `
            <button data-action="open-export" style="${toolBtn}">${esc(t('btnExport'))}</button>
            <button data-action="open-login" style="${toolBtn};color:var(--accent)">${esc(t('btnLogin'))}</button>`;

    appEl.innerHTML = `
    <div style="min-height:100vh;background:var(--bg);background-image:var(--bgimg);color:var(--text);font-family:var(--fontsans);padding:18px 22px 30px">
      <header style="display:flex;flex-wrap:wrap;gap:18px;align-items:center;justify-content:space-between;margin-bottom:18px">
        <div style="display:flex;align-items:center;gap:13px">
          <div style="width:40px;height:40px;border-radius:10px;background:var(--accent);color:var(--onacc);display:flex;align-items:center;justify-content:center;font-family:var(--fontnum);font-weight:600;font-size:15px">Gas</div>
          <div><div style="font-size:17px;font-weight:600;line-height:1.1">Gas Monitoring</div>
          <div style="font-size:12px;color:var(--dim);margin-top:2px">${esc(t('subtitle'))}</div></div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center">
          <div style="display:flex;flex-direction:column;gap:5px"><span style="font-size:9.5px;letter-spacing:.14em;color:var(--mute);font-weight:600">${esc(t('lblGas'))}</span>
            <div style="display:inline-flex;background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:3px;gap:2px">${gasSegs}</div></div>
          <div style="display:flex;flex-direction:column;gap:5px"><span style="font-size:9.5px;letter-spacing:.14em;color:var(--mute);font-weight:600">${esc(t('lblRange'))}</span>
            <div style="display:inline-flex;background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:3px;gap:2px">${seg(S.range==='24h','24h','range','24 H')}${seg(S.range==='7d','7d','range','7 D')}${seg(S.range==='30d','30d','range','30 D')}</div></div>
          <div style="display:flex;flex-direction:column;gap:5px"><span style="font-size:9.5px;letter-spacing:.14em;color:var(--mute);font-weight:600">${esc(t('lblUnit'))}</span>
            <div style="display:inline-flex;background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:3px;gap:2px">${seg(S.unit==='m3','m3','unit','m³')}${seg(S.unit==='eur','eur','unit','€')}</div></div>
          <div style="display:flex;flex-direction:column;gap:5px"><span style="font-size:9.5px;letter-spacing:.14em;color:var(--mute);font-weight:600">${esc(t('lblTheme'))}</span>
            <div style="display:inline-flex;background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:3px;gap:2px">${seg(S.theme==='control','control','theme','Control')}${seg(S.theme==='analytics','analytics','theme',t('themeLight'))}${seg(S.theme==='technical','technical','theme','Mono')}</div></div>
          <div style="display:flex;flex-direction:column;gap:5px"><span style="font-size:9.5px;letter-spacing:.14em;color:var(--mute);font-weight:600">${esc(t('lblLang'))}</span>
            <div style="display:inline-flex;background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:3px;gap:2px">${seg(S.lang==='de','de','lang','DE')}${seg(S.lang==='en','en','lang','EN')}</div></div>
          <div style="display:flex;gap:8px;align-items:flex-end">${adminBtns}
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
            <div style="display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--dim);font-weight:600"><span style="width:8px;height:8px;border-radius:50%;background:${mqttOk?'var(--good)':'var(--danger)'};animation:argpulse 1.8s ease-in-out infinite"></span>${esc(brokerLabel)} · ${onlineN}/${flat.length}</div>
            <div id="clock" style="font-family:var(--fontnum);font-size:13px;color:var(--text)">${esc(clock)}</div></div>
        </div>
      </header>

      ${S.pollError?`<div style="background:color-mix(in srgb,var(--danger) 14%,transparent);border:1px solid var(--danger);border-radius:var(--radius);padding:9px 14px;margin-bottom:14px;font-size:12.5px;color:var(--danger);font-weight:600">${esc(t('pollError', S.lastOk?new Date(S.lastOk).toLocaleTimeString(numLocale()):'—'))}</div>`:''}
      ${naN?(admin
        ?`<button data-action="open-sensors" style="display:block;width:100%;text-align:left;background:color-mix(in srgb,var(--warn) 12%,transparent);border:1px solid var(--border);border-radius:var(--radius);padding:9px 14px;margin-bottom:14px;font-size:12.5px;color:var(--warn);cursor:pointer;font-family:inherit">${esc((naN>1?t('unassignedN',naN):t('unassigned1'))+t('unassignedGo'))}</button>`
        :`<div style="background:color-mix(in srgb,var(--warn) 12%,transparent);border:1px solid var(--border);border-radius:var(--radius);padding:9px 14px;margin-bottom:14px;font-size:12.5px;color:var(--warn)">${esc((naN>1?t('unassignedN',naN):t('unassigned1'))+t('unassignedInfo'))}</div>`):''}

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(216px,1fr));gap:14px;margin-bottom:14px">
        ${kpis.map(k=>`<div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:15px 17px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:11px;letter-spacing:.04em;color:var(--mute);font-weight:600;text-transform:uppercase">${esc(k.label)}</span>
            <span style="font-size:11px;font-weight:600;font-family:var(--fontnum);padding:2px 7px;border-radius:5px;background:${k.deltaBg};color:${k.deltaColor}">${esc(k.delta)}</span></div>
          <div style="font-family:var(--fontnum);font-size:30px;font-weight:600;letter-spacing:-.02em;margin-top:11px;line-height:1;color:${k.valueColor}">${esc(k.value)}</div>
          <div style="font-size:12px;color:var(--dim);margin-top:7px">${esc(k.sub)}</div></div>`).join('')}
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:14px">
        <div style="flex:2 1 480px;background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px 18px;display:flex;flex-direction:column;min-width:0">
          <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;justify-content:space-between">
            <div>
              <div style="display:flex;align-items:center;gap:9px">
                <span style="font-size:13px;color:var(--dim);font-weight:600">${esc(t('trend'))}</span>
                <span style="font-size:11px;font-family:var(--fontnum);color:var(--mute)">· ${esc(rangeLabel)}</span>
                ${S.scope.type!=='total'?`<button data-action="reset-scope" style="font-size:11px;font-family:var(--fontnum);border:1px solid var(--border);background:var(--panel2);color:var(--dim);border-radius:20px;padding:3px 10px;cursor:pointer">✕ ${esc(scopeLabel)}</button>`:''}
              </div>
              <div style="display:flex;align-items:baseline;gap:11px;margin-top:8px">
                <span style="font-family:var(--fontnum);font-size:32px;font-weight:600;letter-spacing:-.02em;color:var(--text)">${esc(fmtUnitVal(scopeTotalUnit))}</span>
                <span style="font-size:13px;font-weight:600;font-family:var(--fontnum);color:${sc.deltaColor}">${esc(sc.delta)}</span></div>
              <div style="font-size:12px;color:var(--mute);margin-top:3px">${esc(scopeSub)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--dim);font-family:var(--fontnum)"><span style="width:18px;height:3px;border-radius:2px;background:var(--stroke)"></span>${esc(scopeLabel)}</div>
          </div>
          <div id="chart-host" style="height:300px;margin-top:10px;min-width:0">${chartSVG()}</div>
        </div>

        <div style="flex:1 1 320px;display:flex;flex-direction:column;gap:14px;min-width:0">
          <div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:15px 17px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
              <span style="font-size:13px;font-weight:600;color:var(--text)">${esc(t('alarmsPanel'))}</span>
              <span style="display:flex;gap:8px;align-items:center">
                <button data-action="open-alhist" style="border:1px solid var(--border);background:var(--panel2);color:var(--dim);border-radius:6px;padding:3px 9px;font-size:11px;cursor:pointer">${esc(t('history'))}</button>
                <span style="font-size:11px;font-family:var(--fontnum);font-weight:600;color:var(--danger);background:color-mix(in srgb,var(--danger) 15%,transparent);padding:2px 9px;border-radius:20px">${al.length}</span></span></div>
            <div style="display:flex;flex-direction:column;gap:9px">${alertRows}</div>
          </div>
          <div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:15px 17px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:13px">
              <span style="font-size:13px;font-weight:600;color:var(--text)">${esc(t('byDept'))}</span>
              <span style="font-size:11px;font-family:var(--fontnum);color:var(--mute)">${S.unit==='m3'?'m³':'€'} · ${esc(rangeLabel)}</span></div>
            <div style="display:flex;flex-direction:column;gap:11px">${deptRows}</div>
          </div>
        </div>
      </div>

      <div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px 18px">
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px"><span style="font-size:13px;font-weight:600;color:var(--text)">${esc(t('btnSensors'))}</span>
            <span style="font-size:11px;font-family:var(--fontnum);color:var(--mute)">${esc(t('sensorsUnits',flat.length))}</span></div>
          <span style="font-size:11px;font-family:var(--fontnum);color:var(--mute)">${esc(admin?t('tableHintAdmin'):t('tableHint'))}</span></div>
        <div style="overflow-x:auto;margin:0 -4px">
          <table style="width:100%;border-collapse:collapse;min-width:800px">
            <thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
        </div>
      </div>
    </div>`;

    applyTheme();
    document.documentElement.lang = S.lang;
    const host=document.getElementById('chart-host');
    if(host){
      host.addEventListener('mousemove',ev=>{ const i=chartIndexFromEvent(ev); if(i!==S.hover){S.hover=i; paintChart();} });
      host.addEventListener('mouseleave',()=>{ if(S.hover!==-1){S.hover=-1; paintChart();} });
    }
  }

  function applyTheme(){ const v=THEMES[S.theme]||THEMES.control; for(const k in v) root.style.setProperty(k,v[k]); document.body.style.background=v['--bg']; }

  // ================================================================== modals
  // Stil-Bausteine für Formulare (Theme via CSS-Variablen)
  const INP='background:var(--panel2);border:1px solid var(--border);border-radius:7px;color:var(--text);padding:7px 9px;font-size:12.5px;width:100%;font-family:var(--fontsans);box-sizing:border-box';
  const LBL='display:block;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);font-weight:600;margin-bottom:5px';
  const BTN='border:1px solid var(--border);background:var(--panel2);color:var(--text);border-radius:7px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer';
  const BTNACC='border:none;background:var(--accent);color:var(--onacc);border-radius:7px;padding:8px 16px;font-size:12.5px;font-weight:700;cursor:pointer';
  const BTNDGR='border:1px solid var(--danger);background:transparent;color:var(--danger);border-radius:7px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer';
  const CHK='width:15px;height:15px;accent-color:var(--accent);cursor:pointer';
  const DAY_LBL=()=> S.lang==='de'?['Mo','Di','Mi','Do','Fr','Sa','So']:['Mo','Tu','We','Th','Fr','Sa','Su'];   // Index = Python-weekday (Mo=0)

  async function api(path, opts){
    const o=Object.assign({headers:{'Content-Type':'application/json'}}, opts||{});
    if(TOKEN) o.headers['X-Auth']=TOKEN;
    const r=await fetch(path, o);
    let body=null; try{ body=await r.json(); }catch(e){}
    if(r.status===401){ AUTH.admin=false; throw new Error(t('loginRequired')); }
    if(!r.ok || (body && body.ok===false)) throw new Error((body&&body.error)||('HTTP '+r.status));
    return body;
  }

  function setMsg(text, isErr){
    if(!M) return; M.msg=text; M.msgErr=!!isErr; renderModal();
    if(text && !isErr){ clearTimeout(M._msgT); M._msgT=setTimeout(()=>{ if(M){M.msg='';renderModal();} }, 2500); }
  }

  function closeModal(){ if(M&&M.type==='flasher') macConsoleStop(); M=null; renderModal(); poll(); }
  function needLogin(){ if(isAdmin()) return false; openLogin(); return true; }

  // --- Downtime-Fenster-Editor (gemeinsam für Sensor-Override und Defaults) ----
  //   prefix 'f' -> M.edit.downtime (Sensor), 'c' -> M.edit.defaults.downtime (Settings)
  function dtObj(prefix){ return prefix==='f' ? M.edit.downtime : M.edit.defaults.downtime; }
  function dtEditorHTML(prefix, dt, disabled){
    const dis=disabled?'opacity:.45;pointer-events:none':'';
    const rows=dt.windows.map((w,i)=>{
      const days=DAY_LBL().map((lb,d)=>`<button data-action="dt-day" data-tgt="${prefix}" data-w="${i}" data-d="${d}" style="border:1px solid var(--border);border-radius:5px;padding:3px 0;width:30px;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--fontnum);background:${w.days.includes(d)?'var(--accent)':'var(--panel2)'};color:${w.days.includes(d)?'var(--onacc)':'var(--dim)'}">${lb}</button>`).join('');
      return `<div style="display:flex;flex-wrap:wrap;gap:7px;align-items:center;background:var(--panel2);border:1px solid var(--border);border-radius:8px;padding:8px 9px">
        <div style="display:flex;gap:3px">${days}</div>
        <input id="${prefix}-dt-start-${i}" value="${esc(w.start)}" placeholder="22:00" style="${INP};width:64px;text-align:center;font-family:var(--fontnum)">
        <span style="color:var(--mute);font-size:12px">–</span>
        <input id="${prefix}-dt-end-${i}" value="${esc(w.end)}" placeholder="06:00" style="${INP};width:64px;text-align:center;font-family:var(--fontnum)">
        <button data-action="dt-del-window" data-tgt="${prefix}" data-w="${i}" title="${esc(t('dtDelWin'))}" style="${BTN};padding:4px 9px;color:var(--danger);margin-left:auto">✕</button>
      </div>`;
    }).join('');
    return `<div style="display:flex;flex-direction:column;gap:8px;${dis}">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label style="display:flex;gap:7px;align-items:center;font-size:12.5px;color:var(--text);cursor:pointer">
          <input type="checkbox" id="${prefix}-dt-enabled" data-action="modal-redraw" ${dt.enabled?'checked':''} style="${CHK}"> ${esc(t('dtOn'))}</label>
        <div style="display:flex;gap:7px;align-items:center;margin-left:auto">
          <span style="font-size:11.5px;color:var(--mute)">${esc(t('dtMax'))}</span>
          <input id="${prefix}-dt-max" type="number" min="0" step="1" value="${esc(dt.max_nl)}" style="${INP};width:84px;text-align:right;font-family:var(--fontnum)">
          <span style="font-size:11.5px;color:var(--mute)">Nl</span></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px;${dt.enabled?'':'opacity:.45'}">${rows||`<span style="font-size:12px;color:var(--mute)">${esc(t('dtNoWin'))}</span>`}</div>
      <button data-action="dt-add-window" data-tgt="${prefix}" style="${BTN};align-self:flex-start;${dt.enabled?'':'opacity:.45'}">${esc(t('dtAddWin'))}</button>
      <span style="font-size:11px;color:var(--mute)">${esc(t('dtHint'))}</span>
    </div>`;
  }
  function dtCollect(prefix){
    const dt=dtObj(prefix); if(!dt) return;
    const en=document.getElementById(prefix+'-dt-enabled'); if(en) dt.enabled=en.checked;
    const mx=document.getElementById(prefix+'-dt-max'); if(mx) dt.max_nl=parseFloat(mx.value)||0;
    dt.windows.forEach((w,i)=>{
      const s=document.getElementById(prefix+'-dt-start-'+i); if(s) w.start=s.value.trim()||'00:00';
      const e=document.getElementById(prefix+'-dt-end-'+i); if(e) w.end=e.value.trim()||'24:00';
    });
  }

  // --- Sensor-Manager -----------------------------------------------------
  async function openSensorManager(sel){
    if(needLogin()) return;
    try{
      const reg=await api('api/sensors');
      M={type:'sensors', reg, sel:sel||null, edit:null, msg:'', msgErr:false, newDept:false};
      if(sel){ const s=reg.sensors.find(x=>x.id===sel); if(s) M.edit=makeEdit(s); else M.sel=null; }
      renderModal();
    }catch(e){ if(M&&M.type==='login') return; alert(t('regLoadFail')+e.message); }
  }
  function makeEdit(s){
    const dfl=M.reg.defaults||{leak:{min:0.2,active:1.0},downtime:{enabled:false,max_nl:0,windows:[]}};
    return {
      id:s.id, name:s.name||s.id, gas:s.gas||'', dept:s.dept||'', note:s.note||'',
      leakOn:!!s.leak, leak:deepCopy(s.leak||dfl.leak),
      dtOn:!!s.downtime, downtime:deepCopy(s.downtime||dfl.downtime)
    };
  }
  async function refreshReg(){
    if(!M||M.type!=='sensors') return;
    try{ M.reg=await api('api/sensors'); }catch(e){}
  }
  function collectSensorForm(){
    const e=M&&M.edit; if(!e) return;
    const g=id=>document.getElementById(id);
    if(g('f-name')) e.name=g('f-name').value;
    if(g('f-note')) e.note=g('f-note').value;
    if(g('f-gas')) e.gas=g('f-gas').value;
    if(g('f-dept')) e.dept=g('f-dept').value;
    if(g('f-leak-on')) e.leakOn=g('f-leak-on').checked;
    if(g('f-leak-min')) e.leak.min=parseFloat(g('f-leak-min').value);
    if(g('f-leak-active')) e.leak.active=parseFloat(g('f-leak-active').value);
    if(g('f-dt-on')) e.dtOn=g('f-dt-on').checked;
    dtCollect('f');
  }
  async function saveSensor(){
    collectSensorForm();
    const e=M.edit;
    const body={ name:(e.name||'').trim()||e.id, gas:e.gas||null, dept:e.dept||null,
      note:(e.note||'').trim(),
      leak: e.leakOn?{min:e.leak.min,active:e.leak.active}:null,
      downtime: e.dtOn?e.downtime:null };
    try{
      await api('api/sensors/'+encodeURIComponent(e.id), {method:'POST', body:JSON.stringify(body)});
      await refreshReg();
      const s=M.reg.sensors.find(x=>x.id===e.id); if(s) M.edit=makeEdit(s);
      setMsg(t('saved')); poll();
    }catch(err){ setMsg(t('err')+err.message, true); }
  }
  function sensorListHTML(){
    const reg=M.reg;
    const dname=id=>{ const d=(reg.departments||[]).find(x=>x.id===id); return d?d.name:'—'; };
    const list=[...reg.sensors].sort((a,b)=>{
      const ua=a.gas?1:0, ub=b.gas?1:0; if(ua!==ub) return ua-ub;   // nicht zugeordnete zuerst
      return String(a.name).localeCompare(String(b.name));
    });
    const items=list.map(s=>{
      const active=M.sel===s.id;
      const dot=s.online?'var(--good)':'var(--mute)';
      const tag=s.gas?`${gasShort(s.gas)} · ${esc(dname(s.dept))}`:`<span style="color:var(--warn);font-weight:600">${esc(t('notAssigned'))}</span>`;
      return `<button data-action="sel-sensor" data-id="${esc(s.id)}" style="display:block;width:100%;text-align:left;border:1px solid ${active?'var(--accent)':'var(--border)'};background:${active?'var(--panel2)':'transparent'};border-radius:8px;padding:9px 11px;cursor:pointer;color:inherit;font-family:inherit">
        <span style="display:flex;align-items:center;gap:8px">
          <span style="width:8px;height:8px;border-radius:50%;background:${dot};flex:none;${s.online?'animation:argpulse 2.2s ease-in-out infinite':''}"></span>
          <span style="font-size:12.5px;font-weight:600;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.name)}${s.note?' 📝':''}</span>
          <span style="font-size:10.5px;font-family:var(--fontnum);color:var(--mute);flex:none">${esc(s.id)}</span></span>
        <span style="display:block;font-size:11px;color:var(--dim);margin-top:3px">${tag} · ${esc(s.online?t('online'):t('offline'))} · ${esc(ago(s.lastSeen))}${s.meta&&s.meta.ip?` · <span style="font-family:var(--fontnum)">${esc(s.meta.ip)}</span>`:''}</span>
      </button>`;
    }).join('');
    const deptChips=(reg.departments||[]).map(d=>`<span style="display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);background:var(--panel2);border-radius:20px;padding:4px 6px 4px 11px;font-size:11.5px;color:var(--text)">${esc(d.name)}
      <button data-action="dept-del" data-id="${esc(d.id)}" title="${esc(t('deptDelTip'))}" style="border:none;background:none;color:var(--mute);cursor:pointer;font-size:12px;padding:0 3px">✕</button></span>`).join(' ');
    return `<div style="display:flex;flex-direction:column;gap:8px;height:100%;min-height:0">
      <div style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:7px;padding-right:4px;min-height:120px">${items||`<span style="font-size:12px;color:var(--mute)">${esc(t('noSensorsYet'))}</span>`}</div>
      <div style="border-top:1px solid var(--border);padding-top:10px">
        <span style="${LBL}">${esc(t('depts'))}</span>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">${deptChips||`<span style="font-size:11.5px;color:var(--mute)">${esc(t('noDepts'))}</span>`}</div>
        <div style="display:flex;gap:7px"><input id="dept-new-name" placeholder="${esc(t('newDept'))}" style="${INP};flex:1">
        <button data-action="dept-create" style="${BTN};flex:none">＋</button></div>
      </div>
    </div>`;
  }
  function sensorFormHTML(){
    const e=M.edit;
    if(!e) return `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--mute);font-size:13px;text-align:center;padding:30px">${t('pickSensor')}</div>`;
    const reg=M.reg;
    const dfl=reg.defaults||{leak:{min:0.2,active:1.0}};
    const gasOpts=[`<option value="">${esc(t('noGas'))}</option>`]
      .concat(Object.entries(reg.gases||{}).map(([id,g])=>`<option value="${esc(id)}" ${e.gas===id?'selected':''}>${esc(g.name||id)}</option>`)).join('');
    const deptOpts=[`<option value="">${esc(t('noDept'))}</option>`]
      .concat((reg.departments||[]).map(d=>`<option value="${esc(d.id)}" ${e.dept===d.id?'selected':''}>${esc(d.name)}</option>`)).join('');
    const s=reg.sensors.find(x=>x.id===e.id)||{};
    const meta=s.meta||{};
    // Geräte-Infos aus dem meta-Topic der Einheits-Firmware (Bestands-Firmware: leer)
    const devBox=(meta.ip||meta.sp!=null||meta.hostname)?`
      <div style="border:1px solid var(--border);border-radius:9px;padding:10px 13px;display:flex;flex-wrap:wrap;gap:5px 16px;align-items:baseline;font-size:12px;color:var(--dim)">
        <span style="font-size:12.5px;font-weight:700;color:var(--text)">${esc(t('device'))}</span>
        ${meta.ip?`<a href="http://${esc(meta.ip)}/" target="_blank" rel="noopener" title="${esc(t('deviceTip'))}" style="color:var(--accent2);font-family:var(--fontnum);font-weight:600;text-decoration:none">${esc(meta.ip)} ↗</a>`:''}
        ${meta.sp!=null?`<span>${esc(t('spValue'))} <b style="color:var(--text);font-family:var(--fontnum)">${esc(fmtNum(meta.sp,3))} Nl/Puls</b></span>`:''}
        ${meta.hostname?`<span style="font-family:var(--fontnum)">${esc(meta.hostname)}</span>`:''}
        ${meta.mac?`<span style="font-family:var(--fontnum)">${esc(meta.mac)}</span>`:''}
        ${meta.fw?`<span>FW ${esc(meta.fw)}</span>`:''}
        <span style="flex-basis:100%;font-size:11px;color:var(--mute)">${esc(t('devHint'))}</span>
        ${meta.ip?`<span style="flex-basis:100%;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button data-action="ota-start" style="${BTN}">${esc(t('otaBtn'))}</button>
          <span id="ota-status" style="font-size:11px;color:var(--mute)">${esc(t('otaIdle'))}</span></span>`:''}
      </div>`:'';
    return `<div style="display:flex;flex-direction:column;gap:15px">
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
        <span style="font-size:14px;font-weight:700;color:var(--text)">${esc(e.id)}</span>
        <span style="font-size:11.5px;color:${s.online?'var(--good)':'var(--mute)'};font-weight:600">${s.online?'● '+esc(t('online')):'○ '+esc(t('offline'))}</span>
        <span style="font-size:11.5px;font-family:var(--fontnum);color:var(--dim)">${esc(t('total'))} ${esc(fmtNum(s.total,1))} Nl · Flow ${esc(fmtNum(s.flow,2))} Nl/min · ${esc(ago(s.lastSeen))}</span>
      </div>
      ${devBox}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="grid-column:1/-1"><span style="${LBL}">${esc(t('name'))}</span><input id="f-name" value="${esc(e.name)}" style="${INP}"></div>
        <div><span style="${LBL}">${esc(t('gasSel'))}</span><select id="f-gas" style="${INP}">${gasOpts}</select></div>
        <div><span style="${LBL}">${esc(t('deptSel'))}</span><select id="f-dept" style="${INP}">${deptOpts}</select></div>
        <div style="grid-column:1/-1"><span style="${LBL}">${esc(t('note'))}</span>
          <textarea id="f-note" rows="2" placeholder="${esc(t('notePlaceholder'))}" style="${INP};resize:vertical;font-family:var(--fontsans)">${esc(e.note)}</textarea></div>
      </div>

      <div style="border:1px solid var(--border);border-radius:9px;padding:12px 13px">
        <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;font-weight:600;color:var(--text);cursor:pointer;margin-bottom:9px">
          <input type="checkbox" id="f-leak-on" data-action="modal-redraw" ${e.leakOn?'checked':''} style="${CHK}">
          ${esc(t('leakCustom',dfl.leak.min,dfl.leak.active))}</label>
        <div style="display:flex;gap:12px;align-items:center;${e.leakOn?'':'opacity:.45;pointer-events:none'}">
          <span style="font-size:11.5px;color:var(--mute)">${esc(t('leakFrom'))}</span>
          <input id="f-leak-min" type="number" step="0.1" min="0" value="${esc(e.leak.min)}" style="${INP};width:80px;text-align:right;font-family:var(--fontnum)">
          <span style="font-size:11.5px;color:var(--mute)">${esc(t('leakTo'))}</span>
          <input id="f-leak-active" type="number" step="0.1" min="0" value="${esc(e.leak.active)}" style="${INP};width:80px;text-align:right;font-family:var(--fontnum)">
          <span style="font-size:11.5px;color:var(--mute)">${esc(t('leakUnit'))}</span></div>
      </div>

      <div style="border:1px solid var(--border);border-radius:9px;padding:12px 13px">
        <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;font-weight:600;color:var(--text);cursor:pointer;margin-bottom:9px">
          <input type="checkbox" id="f-dt-on" data-action="modal-redraw" ${e.dtOn?'checked':''} style="${CHK}">
          ${esc(t('dtCustom'))}</label>
        ${dtEditorHTML('f', e.downtime, !e.dtOn)}
      </div>

      <div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">
        <button data-action="edit-save" style="${BTNACC}">${esc(t('save'))}</button>
        <button data-action="edit-reset-counter" style="${BTN}" title="${esc(t('resetTip'))}">${esc(t('resetCounter'))}</button>
        <button data-action="edit-delete" style="${BTNDGR};margin-left:auto">${esc(t('delSensor'))}</button>
      </div>
    </div>`;
  }

  // --- Einstellungen (⚙) ----------------------------------------------------
  async function openSettings(){
    if(needLogin()) return;
    try{
      const cfg=await api('api/config');
      M={type:'settings', msg:'', msgErr:false, restartHint:false, restartWait:false, showPw:false,
         edit:{ stale_seconds:cfg.stale_seconds,
                offline_alarm_minutes:cfg.offline_alarm_minutes,
                backup:deepCopy(cfg.backup||{enabled:true,keep_days:30}),
                gases:deepCopy(cfg.gases||{}),
                defaults:deepCopy(cfg.defaults||{leak:{min:0.2,active:1.0},downtime:{enabled:false,max_nl:0,windows:[]}}),
                mqtt:deepCopy(cfg.mqtt||{}), adminpw:'' },
         authRequired:!!(cfg.auth&&cfg.auth.required),
         secrets:cfg.secrets||{}, status:cfg.status||{}};
      if(!M.edit.defaults.downtime) M.edit.defaults.downtime={enabled:false,max_nl:0,windows:[]};
      if(!M.edit.defaults.leak) M.edit.defaults.leak={min:0.2,active:1.0};
      renderModal();
    }catch(e){ if(M&&M.type==='login') return; alert(t('cfgLoadFail')+e.message); }
  }
  function collectSettingsForm(){
    const e=M&&M.edit; if(!e) return;
    const g=id=>document.getElementById(id);
    if(g('c-stale')) e.stale_seconds=parseInt(g('c-stale').value,10)||120;
    if(g('c-offmin')) e.offline_alarm_minutes=Math.max(0,parseInt(g('c-offmin').value,10)||0);
    if(g('c-bak-on')) e.backup.enabled=g('c-bak-on').checked;
    if(g('c-bak-days')) e.backup.keep_days=Math.max(1,parseInt(g('c-bak-days').value,10)||30);
    Object.keys(e.gases).forEach(gid=>{ const el=g('c-price-'+gid); if(el) e.gases[gid].price_per_m3=parseFloat(el.value)||0; });
    if(g('c-leak-min')) e.defaults.leak.min=parseFloat(g('c-leak-min').value);
    if(g('c-leak-active')) e.defaults.leak.active=parseFloat(g('c-leak-active').value);
    dtCollect('c');
    const m=e.mqtt;
    if(g('c-embedded')) m.embedded=g('c-embedded').checked;
    if(g('c-bind')) m.bind=g('c-bind').value.trim();
    if(g('c-port')) m.port=parseInt(g('c-port').value,10)||1883;
    if(g('c-broker')) m.broker=g('c-broker').value.trim();
    if(g('c-user')) m.username=g('c-user').value.trim();
    if(g('c-pass')) m.password=g('c-pass').value;
    if(g('c-adminpw')) e.adminpw=g('c-adminpw').value;
  }
  async function saveSettings(){
    collectSettingsForm();
    const e=M.edit;
    const body={ stale_seconds:e.stale_seconds, offline_alarm_minutes:e.offline_alarm_minutes,
      backup:e.backup, gases:e.gases,
      defaults:{leak:e.defaults.leak, downtime:e.defaults.downtime},
      mqtt:{ embedded:e.mqtt.embedded, bind:e.mqtt.bind, port:e.mqtt.port,
             broker:e.mqtt.broker, username:e.mqtt.username, password:e.mqtt.password||'' } };
    if(e.adminpw) body.admin_password=e.adminpw;
    try{
      const res=await api('api/config', {method:'POST', body:JSON.stringify(body)});
      M.restartHint=!!(res&&res.restart_required);
      if(res && typeof res.token==='string'){ setToken(res.token); AUTH.required=!!e.adminpw; AUTH.admin=true; }
      e.adminpw='';
      // Frischen Stand (Secrets-Abgleich, Auth) nachladen, Formularwerte behalten
      try{ const cfg=await api('api/config'); M.secrets=cfg.secrets||{}; M.status=cfg.status||{}; M.authRequired=!!(cfg.auth&&cfg.auth.required); }catch(e2){}
      setMsg(t('saved')); poll();
    }catch(err){ setMsg(t('err')+err.message, true); }
  }
  function settingsHTML(){
    const e=M.edit, m=e.mqtt, st=M.status||{}, sec=M.secrets||{};
    const chip=(ok,txtOk,txtBad)=>`<span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;font-family:var(--fontnum);padding:3px 10px;border-radius:20px;background:color-mix(in srgb,${ok?'var(--good)':'var(--danger)'} 14%,transparent);color:${ok?'var(--good)':'var(--danger)'}">● ${esc(ok?txtOk:txtBad)}</span>`;
    const priceRows=Object.entries(e.gases).map(([gid,g])=>`<div>
      <span style="${LBL}">${esc(t('priceOf',g.name||gid))}</span>
      <input id="c-price-${esc(gid)}" type="number" min="0" step="1" value="${esc(g.price_per_m3)}" style="${INP};text-align:right;font-family:var(--fontnum)"></div>`).join('');
    const secretsLine = !sec.exists
      ? `<span style="color:var(--warn)">${esc(t('secretsMissing'))}</span>`
      : (sec.user_match&&sec.password_match)
        ? `<span style="color:var(--good)">${esc(t('secretsOk'))}</span>`
        : `<span style="color:var(--warn)">${esc(t('secretsDiff'))}</span>`;
    const brokerLine = sec.exists&&sec.broker ? `<span>${esc(t('secretsBroker', sec.broker, sec.lan_ip||'?'))}</span>` : '';
    const pwType=M.showPw?'text':'password';
    return `<div style="display:flex;flex-direction:column;gap:16px">
      ${M.restartHint?`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:color-mix(in srgb,var(--warn) 14%,transparent);border:1px solid var(--warn);border-radius:8px;padding:9px 12px;font-size:12px;color:var(--warn);font-weight:600">${esc(t('restartNeeded'))}
        <button data-action="cfg-restart" style="${BTN};color:var(--warn);border-color:var(--warn)">${esc(t('restartBtn'))}</button></div>`:''}

      <div style="border:1px solid var(--border);border-radius:9px;padding:13px 14px">
        <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:11px">
          <span style="font-size:13px;font-weight:700;color:var(--text)">${esc(t('mqttBroker'))}</span>
          ${chip(st.embedded_running, t('chBrokerRun'), m.embedded?t('chBrokerStop'):t('chBrokerOff'))}
          ${chip(st.ingest_connected, t('chIngestOk'), t('chIngestNo'))}
          ${chip(st.auth, t('chAuthOn'), t('chAuthOff'))}
        </div>
        <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--text);cursor:pointer;margin-bottom:11px">
          <input type="checkbox" id="c-embedded" data-action="modal-redraw" ${m.embedded?'checked':''} style="${CHK}">
          ${esc(t('embedded'))}</label>
        <div style="display:grid;grid-template-columns:1fr 110px;gap:12px">
          ${m.embedded
            ?`<div><span style="${LBL}">${esc(t('bind'))}</span><input id="c-bind" value="${esc(m.bind||'0.0.0.0')}" style="${INP};font-family:var(--fontnum)"></div>`
            :`<div><span style="${LBL}">${esc(t('extBroker'))}</span><input id="c-broker" value="${esc(m.broker||'')}" style="${INP};font-family:var(--fontnum)"></div>`}
          <div><span style="${LBL}">${esc(t('port'))}</span><input id="c-port" type="number" value="${esc(m.port||1883)}" style="${INP};text-align:right;font-family:var(--fontnum)"></div>
          <div><span style="${LBL}">${esc(t('user'))}</span><input id="c-user" value="${esc(m.username||'')}" style="${INP}"></div>
          <div style="grid-column:2"><span style="${LBL}">${esc(t('password'))}</span>
            <div style="display:flex;gap:6px;align-items:center">
              <input id="c-pass" type="${pwType}" value="${esc(m.password||'')}" style="${INP};font-family:var(--fontnum)">
              <button data-action="toggle-pw" title="${esc(M.showPw?t('hidePw'):t('showPw'))}" style="${BTN};padding:6px 9px;flex:none">${M.showPw?'🙈':'👁'}</button>
            </div></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--mute);margin-top:9px">
          <span>${esc(t('authHint'))}</span>
          ${secretsLine}
          ${brokerLine}
        </div>
      </div>

      <div style="border:1px solid var(--border);border-radius:9px;padding:13px 14px">
        <span style="font-size:13px;font-weight:700;color:var(--text);display:block;margin-bottom:11px">${esc(t('prices'))}</span>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
          ${priceRows}
          <div><span style="${LBL}">${esc(t('staleAfter'))}</span>
          <input id="c-stale" type="number" min="10" step="10" value="${esc(e.stale_seconds)}" style="${INP};text-align:right;font-family:var(--fontnum)"></div>
          <div><span style="${LBL}">${esc(t('offlineAlarm'))}</span>
          <input id="c-offmin" type="number" min="0" step="5" value="${esc(e.offline_alarm_minutes)}" style="${INP};text-align:right;font-family:var(--fontnum)"></div>
        </div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:12px">
          <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--text);cursor:pointer">
            <input type="checkbox" id="c-bak-on" ${e.backup.enabled?'checked':''} style="${CHK}"> ${esc(t('backupOn'))}</label>
          <span style="display:flex;gap:7px;align-items:center;font-size:11.5px;color:var(--mute)">${esc(t('backupKeep'))}
            <input id="c-bak-days" type="number" min="1" step="1" value="${esc(e.backup.keep_days)}" style="${INP};width:70px;text-align:right;font-family:var(--fontnum)"></span>
        </div>
      </div>

      <div style="border:1px solid var(--border);border-radius:9px;padding:13px 14px">
        <span style="font-size:13px;font-weight:700;color:var(--text);display:block;margin-bottom:11px">${esc(t('defaults'))}</span>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:13px;flex-wrap:wrap">
          <span style="font-size:11.5px;color:var(--mute)">${esc(t('leakFrom'))}</span>
          <input id="c-leak-min" type="number" step="0.1" min="0" value="${esc(e.defaults.leak.min)}" style="${INP};width:80px;text-align:right;font-family:var(--fontnum)">
          <span style="font-size:11.5px;color:var(--mute)">${esc(t('leakTo'))}</span>
          <input id="c-leak-active" type="number" step="0.1" min="0" value="${esc(e.defaults.leak.active)}" style="${INP};width:80px;text-align:right;font-family:var(--fontnum)">
          <span style="font-size:11.5px;color:var(--mute)">Nl/min</span></div>
        <span style="${LBL}">${esc(t('defaultDt'))}</span>
        ${dtEditorHTML('c', e.defaults.downtime, false)}
      </div>

      <div style="border:1px solid var(--border);border-radius:9px;padding:13px 14px">
        <span style="font-size:13px;font-weight:700;color:var(--text);display:block;margin-bottom:8px">${esc(t('loginBox'))}</span>
        <span style="display:block;font-size:11.5px;color:${M.authRequired?'var(--mute)':'var(--warn)'};margin-bottom:10px">${esc(M.authRequired?t('loginOnHint'):t('loginOffHint'))}</span>
        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
          <div style="width:220px"><span style="${LBL}">${esc(t('loginPw'))}</span>
            <input id="c-adminpw" type="password" placeholder="${esc(M.authRequired?t('loginPwPh'):'')}" style="${INP}"></div>
          ${M.authRequired?`<button data-action="login-disable" style="${BTNDGR}">${esc(t('loginDisable'))}</button>`:''}
        </div>
      </div>

      <div style="border:1px solid var(--border);border-radius:9px;padding:13px 14px">
        <span style="font-size:13px;font-weight:700;color:var(--text);display:block;margin-bottom:10px">${esc(t('backendBox'))}</span>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <button data-action="cfg-restart" style="${BTN}" ${M.restartWait?'disabled':''}>${esc(t('restartBtn'))}</button>
          ${M.restartWait?`<span style="font-size:12px;color:var(--accent2);font-weight:600">⏳ ${esc(t('restarting'))}</span>`:''}
        </div>
      </div>

      <div style="display:flex;gap:9px;align-items:center">
        <button data-action="cfg-save" style="${BTNACC}">${esc(t('save'))}</button>
        <span style="font-size:11.5px;color:var(--mute)">${esc(t('saveHint'))}</span>
      </div>
    </div>`;
  }

  // --- CSV-Export -----------------------------------------------------------
  function isoDate(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function openExport(){
    let scope='total';
    if(S.scope.type==='dept') scope='dept:'+S.scope.id;
    if(S.scope.type==='machine') scope='sensor:'+S.scope.id;
    M={type:'export', scope, res:'day',
       from:isoDate(new Date(Date.now()-29*86400e3)), to:isoDate(new Date())};
    renderModal();
  }
  function collectExportForm(){
    const g=id=>document.getElementById(id);
    if(g('x-scope')) M.scope=g('x-scope').value;
    if(g('x-res')) M.res=g('x-res').value;
    if(g('x-from')) M.from=g('x-from').value;
    if(g('x-to')) M.to=g('x-to').value;
  }
  function exportHTML(){
    const opts=[`<option value="total" ${M.scope==='total'?'selected':''}>${esc(t('exTotal'))}</option>`]
      .concat(depts().map(d=>`<option value="dept:${esc(d.id)}" ${M.scope==='dept:'+d.id?'selected':''}>${esc(t('exDept',d.name))}</option>`))
      .concat(allSensors().map(s=>`<option value="sensor:${esc(s.id)}" ${M.scope==='sensor:'+s.id?'selected':''}>${esc(t('exSensor',s.name))}</option>`))
      .join('');
    return `<div style="display:flex;flex-direction:column;gap:14px">
      <div><span style="${LBL}">${esc(t('exScope'))}</span><select id="x-scope" style="${INP}">${opts}</select></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div><span style="${LBL}">${esc(t('exFrom'))}</span><input id="x-from" type="date" value="${esc(M.from)}" style="${INP};font-family:var(--fontnum)"></div>
        <div><span style="${LBL}">${esc(t('exTo'))}</span><input id="x-to" type="date" value="${esc(M.to)}" style="${INP};font-family:var(--fontnum)"></div>
        <div><span style="${LBL}">${esc(t('exRes'))}</span><select id="x-res" style="${INP}">
          <option value="day" ${M.res==='day'?'selected':''}>${esc(t('exDay'))}</option>
          <option value="hour" ${M.res==='hour'?'selected':''}>${esc(t('exHour'))}</option></select></div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button data-action="export-go" style="${BTNACC}">${esc(t('exGo'))}</button>
        <span style="font-size:11px;color:var(--mute)">${esc(t('exHint'))}</span>
      </div>
    </div>`;
  }

  // --- Alarm-Historie -------------------------------------------------------
  async function openAlarmHistory(){
    try{
      const res=await api('api/alarms/history?limit=200');
      M={type:'alhist', rows:(res&&res.alarms)||[]};
      renderModal();
    }catch(e){ alert(t('histLoadFail')+e.message); }
  }
  function alhistHTML(){
    const AM=ALERT_META();
    if(!M.rows.length) return `<div style="font-size:12.5px;color:var(--mute);padding:10px 2px">${esc(t('histNone'))}</div>`;
    const th=s=>`<th style="text-align:left;padding:7px 10px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);font-weight:600;border-bottom:1px solid var(--border);white-space:nowrap">${esc(s)}</th>`;
    const rows=M.rows.map(a=>{
      const meta=AM[a.type]||{title:a.type,val:v=>String(v)};
      const state=!a.acknowledged?`<span style="color:var(--danger);font-weight:600">${esc(t('histActive'))}</span>`
        : a.auto_cleared?esc(t('histAuto',fmtDT(a.ack_at))):esc(t('histAck',fmtDT(a.ack_at)));
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:8px 10px;font-family:var(--fontnum);font-size:12px;color:var(--dim);white-space:nowrap">${esc(fmtDT(a.raised_at))}</td>
        <td style="padding:8px 10px;font-size:12.5px;color:var(--text);white-space:nowrap">${esc(a.sensorName)}<span style="color:var(--mute);font-size:11px"> · ${esc(a.deptName)}</span></td>
        <td style="padding:8px 10px;font-size:12px;color:var(--dim);white-space:nowrap">${esc(meta.title)}</td>
        <td style="padding:8px 10px;font-size:11px;font-weight:600;font-family:var(--fontnum);color:${levelColor(a.level)};white-space:nowrap">${esc(a.level==='critical'?t('lvCrit'):t('lvWarn'))}</td>
        <td style="padding:8px 10px;font-family:var(--fontnum);font-size:12px;color:var(--text);white-space:nowrap">${esc(meta.val(a.value))}</td>
        <td style="padding:8px 10px;font-size:11.5px;color:var(--dim);white-space:nowrap">${state}</td></tr>`;
    }).join('');
    return `<div style="overflow:auto;min-height:0;flex:1"><table style="width:100%;border-collapse:collapse;min-width:640px">
      <thead><tr>${th(t('histRaised'))}${th(t('thSensor'))}${th(t('histType'))}${th(t('histLevel'))}${th(t('histValue'))}${th(t('histState'))}</tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  // --- Login ----------------------------------------------------------------
  function openLogin(){ M={type:'login', err:''}; renderModal();
    setTimeout(()=>{ const el=document.getElementById('login-pw'); if(el) el.focus(); },50); }
  async function doLogin(){
    const el=document.getElementById('login-pw'); const pw=el?el.value:'';
    try{
      const res=await fetch('api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})});
      const body=await res.json().catch(()=>null);
      if(!res.ok||!body||body.ok===false){ M.err=t('loginWrong'); renderModal();
        setTimeout(()=>{ const e2=document.getElementById('login-pw'); if(e2){e2.value='';e2.focus();} },30); return; }
      if(body.token) setToken(body.token);
      AUTH.admin=true; closeModal(); render();
    }catch(e){ M.err=t('err')+e.message; renderModal(); }
  }
  function loginHTML(){
    return `<div style="display:flex;flex-direction:column;gap:13px">
      <span style="font-size:12.5px;color:var(--dim)">${esc(t('loginInfo'))}</span>
      <div><span style="${LBL}">${esc(t('password'))}</span>
        <input id="login-pw" type="password" style="${INP};font-family:var(--fontnum)"></div>
      ${M.err?`<span style="font-size:12px;color:var(--danger);font-weight:600">${esc(M.err)}</span>`:''}
      <button data-action="login-submit" style="${BTNACC};align-self:flex-start">${esc(t('loginBtn'))}</button>
    </div>`;
  }

  // --- „＋ Gerät“: Erstflash (USB/Web Serial), Firmware-Build, MAC-Auslesen --
  //   Web Serial braucht Chrome/Edge UND Secure Context -> funktioniert über
  //   http://localhost:8000 am Dashboard-PC, nicht über die LAN-IP (plain HTTP).
  let EWT_STATE = 'idle';                 // idle | loading | ready | failed
  const SERIAL = {port:null, reader:null, run:false};
  const serialOk = () => ('serial' in navigator) && window.isSecureContext;

  async function ensureEwt(){
    if(EWT_STATE==='ready'||EWT_STATE==='loading') return;
    EWT_STATE='loading';
    try{ await import('./vendor/esp-web-tools/install-button.js'); EWT_STATE='ready'; }
    catch(e){ EWT_STATE='failed'; }
    if(M&&M.type==='flasher') renderModal();
  }

  async function openFlasher(){
    if(needLogin()) return;
    let fw=null; try{ fw=await api('api/firmware'); }catch(e){ if(M&&M.type==='login') return; }
    M={type:'flasher', fw, macLog:[], mac:null, serialActive:false, msg:'', msgErr:false};
    renderModal();
    if(serialOk()) ensureEwt();
  }

  // Firmware-Job (Build/OTA) alle 2,5 s nachladen, solange ein Modal ihn anzeigt.
  // Im Sensor-Manager nur gezielte DOM-Updates (kein renderModal — würde die
  // ungespeicherten Formularfelder überschreiben).
  setInterval(async ()=>{
    if(!M) return;
    const watching = M.type==='flasher' || (M.type==='sensors' && M.fwWatch);
    if(!watching) return;
    let fw; try{ fw=await api('api/firmware'); }catch(e){ return; }
    if(!M) return;
    M.fw=fw;
    if(M.type==='flasher'){
      const box=document.getElementById('fw-box'); if(box) box.innerHTML=fwBoxHTML();
      const log=document.getElementById('fw-log'); if(log) log.scrollTop=log.scrollHeight;
    }else if(M.type==='sensors'){
      const el=document.getElementById('ota-status');
      if(fw.job.running){ if(el) el.textContent=t('otaRunning', fw.job.log[fw.job.log.length-1]||''); }
      else{ M.fwWatch=false; collectSensorForm(); await refreshReg();
            setMsg(fw.job.ok?t('otaDone'):t('otaFail'), !fw.job.ok); }
    }
  }, 2500);

  function fwBoxHTML(){
    const fw=M.fw, job=fw&&fw.job;
    if(!fw) return `<span style="font-size:12px;color:var(--danger)">${esc(t('fwNoApi'))}</span>`;
    const dt=ts=>new Date(ts*1000).toLocaleString(numLocale(),{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
    const build=fw.factory
      ? t('fwFrom', esc(dt(fw.factory.mtime)), (fw.factory.size/1024).toFixed(0))
      : t('fwNone');
    const jobName=job.type==='build'?t('jobBuild'):t('jobOta',esc(job.target||''));
    const jstate=job.running
      ? `<span style="color:var(--accent2)">${t('fwRunning',jobName)}</span>`
      : job.ok===true ? `<span style="color:var(--good)">${esc(t('fwOkJob',job.type||''))}</span>`
      : job.ok===false ? `<span style="color:var(--danger)">${esc(t('fwFailJob',job.type||''))}</span>` : '';
    const log=(job.log&&job.log.length)?`<pre id="fw-log" style="margin:8px 0 0;background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:8px 10px;font-size:10.5px;line-height:1.45;color:var(--dim);max-height:150px;overflow:auto;white-space:pre-wrap;font-family:var(--fontnum)">${job.log.map(esc).join('\n')}</pre>`:'';
    return `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--dim)">
        <button data-action="fw-build" style="${BTN}" ${job.running?'disabled':''}>${esc(t('fwBuild'))}</button>
        <span>${build}</span><span style="font-size:11.5px;font-family:var(--fontnum)">${jstate}</span>
      </div>${log}`;
  }

  function flasherHTML(){
    const step=(n,txt)=>`<div style="display:flex;gap:11px;align-items:flex-start">
      <span style="flex:none;width:22px;height:22px;border-radius:50%;background:var(--accent);color:var(--onacc);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-family:var(--fontnum)">${n}</span>
      <span style="font-size:12.5px;color:var(--text);line-height:1.5">${txt}</span></div>`;
    const box='border:1px solid var(--border);border-radius:9px;padding:13px 14px';
    const serialHint = serialOk() ? '' :
      `<div style="background:color-mix(in srgb,var(--warn) 13%,transparent);border:1px solid var(--warn);border-radius:8px;padding:9px 12px;font-size:12px;color:var(--warn);font-weight:600;margin-bottom:10px">${t('serialHint')}</div>`;
    const manifest='api/firmware/manifest.json'+(TOKEN?('?auth='+encodeURIComponent(TOKEN)):'');
    const flashBtn = !serialOk() ? '' :
      EWT_STATE==='ready'
        ? `<esp-web-install-button manifest="${esc(manifest)}"><button slot="activate" style="${BTNACC}">${esc(t('flashBtn'))}</button></esp-web-install-button>`
        : EWT_STATE==='failed'
          ? `<span style="font-size:12px;color:var(--danger)">${esc(t('flashModFail'))}</span>`
          : `<span style="font-size:12px;color:var(--mute)">${esc(t('flashModLoad'))}</span>`;
    const macBig = M.mac ? `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:9px">
        <span style="font-family:var(--fontnum);font-size:21px;font-weight:700;letter-spacing:.04em;color:var(--accent)">${esc(M.mac)}</span>
        <button data-action="mac-copy" style="${BTN}">${esc(t('macCopy'))}</button>
        <span style="font-size:11.5px;color:var(--dim)">${esc(t('macSubmit'))}</span></div>` : '';
    const macLog = M.serialActive||M.macLog.length ? `<pre id="mac-log" style="margin:9px 0 0;background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:8px 10px;font-size:10.5px;line-height:1.45;color:var(--dim);max-height:130px;overflow:auto;white-space:pre-wrap;font-family:var(--fontnum)">${M.macLog.map(esc).join('\n')||esc(t('macWait'))}</pre>` : '';
    return `<div style="display:flex;flex-direction:column;gap:15px">
      ${serialHint}
      <div style="${box}">
        <span style="font-size:13px;font-weight:700;color:var(--text);display:block;margin-bottom:11px">${esc(t('howto'))}</span>
        <div style="display:flex;flex-direction:column;gap:9px">
          ${step(1,t('step1'))}${step(2,t('step2'))}${step(3,t('step3'))}${step(4,t('step4'))}${step(5,t('step5'))}${step(6,t('step6'))}${step(7,t('step7'))}
        </div>
      </div>
      <div style="${box}">
        <span style="font-size:13px;font-weight:700;color:var(--text);display:block;margin-bottom:10px">${esc(t('fwBox'))}</span>
        <div id="fw-box">${fwBoxHTML()}</div>
      </div>
      <div style="${box}">
        <span style="font-size:13px;font-weight:700;color:var(--text);display:block;margin-bottom:10px">${esc(t('flashBox'))}</span>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">${flashBtn}
          <span style="font-size:11.5px;color:var(--mute)">${esc(t('flashOtaHint'))}</span></div>
      </div>
      <div style="${box}">
        <span style="font-size:13px;font-weight:700;color:var(--text);display:block;margin-bottom:10px">${esc(t('macBox'))}</span>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          ${serialOk()?`<button data-action="mac-console" style="${BTN}" ${M.serialActive?'disabled':''}>${esc(M.serialActive?t('macActive'):t('macBtn'))}</button>`:''}
          ${M.serialActive?`<button data-action="mac-console-stop" style="${BTN}">${esc(t('macStop'))}</button>`:''}
          <span style="font-size:11.5px;color:var(--mute)">${esc(t('macHint'))}</span>
        </div>
        ${macBig}${macLog}
      </div>
    </div>`;
  }

  let _macRedraw=null;
  function macConsoleLine(line){
    if(!M||M.type!=='flasher') return;
    M.macLog.push(line); if(M.macLog.length>150) M.macLog.shift();
    const m=line.match(/Ethernet-MAC[^0-9A-Fa-f]*([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})/);
    if(m) M.mac=m[1].toUpperCase();
    if(_macRedraw) return;                       // Renders drosseln (Zeilen kommen im Schwall)
    _macRedraw=setTimeout(()=>{ _macRedraw=null;
      if(M&&M.type==='flasher'){ renderModal();
        const log=document.getElementById('mac-log'); if(log) log.scrollTop=log.scrollHeight; } }, 200);
  }

  async function macConsoleStart(){
    if(!serialOk()||SERIAL.run) return;
    let port;
    try{ port=await navigator.serial.requestPort(); await port.open({baudRate:115200}); }
    catch(e){ setMsg(t('serialErr')+e.message, true); return; }
    SERIAL.port=port; SERIAL.run=true;
    M.macLog=[]; M.mac=null; M.serialActive=true; renderModal();
    // Board über RTS→EN resetten, damit das Boot-Log (mit MAC-Block) sofort kommt
    try{
      await port.setSignals({dataTerminalReady:false, requestToSend:true});
      await new Promise(r=>setTimeout(r,200));
      await port.setSignals({dataTerminalReady:false, requestToSend:false});
    }catch(e){}
    const dec=new TextDecoder(); let buf='';
    try{
      while(SERIAL.run && port.readable){
        SERIAL.reader=port.readable.getReader();
        try{
          for(;;){
            const {value,done}=await SERIAL.reader.read(); if(done) break;
            buf+=dec.decode(value,{stream:true});
            let i; while((i=buf.indexOf('\n'))>=0){
              const line=buf.slice(0,i).replace(/\x1b\[[0-9;]*m/g,'').trimEnd();
              buf=buf.slice(i+1); if(line) macConsoleLine(line);
            }
          }
        }finally{ try{SERIAL.reader.releaseLock();}catch(e){} }
      }
    }catch(e){ if(SERIAL.run) macConsoleLine(t('serialLost',e.message)); }
    macConsoleStop();
  }

  function macConsoleStop(){
    SERIAL.run=false;
    try{ if(SERIAL.reader) SERIAL.reader.cancel(); }catch(e){}
    const p=SERIAL.port; SERIAL.port=null; SERIAL.reader=null;
    if(p) setTimeout(()=>{ try{ p.close(); }catch(e){} }, 150);
    if(M&&M.type==='flasher'&&M.serialActive){ M.serialActive=false; renderModal(); }
  }

  // --- Backend-Neustart überwachen -----------------------------------------
  let _restartIv=null;
  function watchRestart(){
    if(_restartIv) clearInterval(_restartIv);
    const t0=Date.now();
    _restartIv=setInterval(async ()=>{
      let ok=false;
      try{ const r=await fetch('api/health',{cache:'no-store'}); ok=r.ok; }catch(e){}
      if(ok && Date.now()-t0>2500){
        clearInterval(_restartIv); _restartIv=null;
        if(M&&M.type==='settings'){ M.restartWait=false; M.restartHint=false;
          try{ const cfg=await api('api/config'); M.status=cfg.status||{}; M.secrets=cfg.secrets||{}; }catch(e){}
          setMsg(t('backOnline')); }
        poll();
      }else if(Date.now()-t0>90000){
        clearInterval(_restartIv); _restartIv=null;
        if(M&&M.type==='settings'){ M.restartWait=false; setMsg(t('restartTimeout'), true); }
      }
    }, 1500);
  }

  // --- Modal-Rendering ------------------------------------------------------
  function renderModal(){
    if(!M){ modalEl.innerHTML=''; return; }
    const titles={sensors:t('titleSensors'), flasher:t('titleDevice'), settings:t('titleSettings'),
                  export:t('titleExport'), alhist:t('titleHist'), login:t('titleLogin')};
    const title=titles[M.type]||'';
    const narrow=M.type==='login'||M.type==='export';
    const body=M.type==='sensors'
      ? `<div style="display:flex;gap:16px;min-height:0;flex:1">
           <div style="flex:0 0 285px;min-width:0;min-height:0">${sensorListHTML()}</div>
           <div style="flex:1;min-width:0;overflow-y:auto;padding-right:4px">${sensorFormHTML()}</div>
         </div>`
      : M.type==='flasher' ? `<div style="overflow-y:auto;min-height:0;flex:1;padding-right:4px">${flasherHTML()}</div>`
      : M.type==='settings' ? `<div style="overflow-y:auto;min-height:0;flex:1;padding-right:4px">${settingsHTML()}</div>`
      : M.type==='export' ? exportHTML()
      : M.type==='alhist' ? alhistHTML()
      : loginHTML();
    modalEl.innerHTML=`
    <div id="modal-backdrop" style="position:fixed;inset:0;background:rgba(4,7,12,.62);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;font-family:var(--fontsans)">
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 18px 60px rgba(0,0,0,.45);width:min(${narrow?'440px':'920px'},100%);max-height:92vh;display:flex;flex-direction:column;padding:17px 19px;color:var(--text)">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <span style="font-size:15px;font-weight:700">${esc(title)}</span>
          <span id="modal-msg" style="font-size:12px;font-weight:600;color:${M.msgErr?'var(--danger)':'var(--good)'}">${esc(M.msg||'')}</span>
          <button data-action="modal-close" style="margin-left:auto;border:1px solid var(--border);background:var(--panel2);color:var(--dim);border-radius:7px;padding:5px 11px;font-size:13px;cursor:pointer">✕</button>
        </div>
        ${body}
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- events
  root.addEventListener('click', async ev=>{
    const el=ev.target.closest('[data-action]'); if(!el) return;
    const act=el.getAttribute('data-action');

    // ---- Dashboard-Aktionen
    if(act==='range'){ S.range=el.getAttribute('data-val'); S.hover=-1; persistUI(); }
    else if(act==='unit'){ S.unit=el.getAttribute('data-val'); persistUI(); }
    else if(act==='theme'){ S.theme=el.getAttribute('data-val'); persistUI(); }
    else if(act==='lang'){ S.lang=el.getAttribute('data-val'); persistUI(); if(M) renderModal(); }
    else if(act==='gas'){ S.gas=el.getAttribute('data-val'); S.scope={type:'total'}; }
    else if(act==='reset-scope'){ S.scope={type:'total'}; }
    else if(act==='sort'){ const k=el.getAttribute('data-key'); if(S.sortKey===k) S.sortDir=S.sortDir==='asc'?'desc':'asc'; else {S.sortKey=k;S.sortDir='desc';} }
    else if(act==='scope-dept'){ const id=el.getAttribute('data-id'); S.scope=(S.scope.type==='dept'&&S.scope.id===id)?{type:'total'}:{type:'dept',id}; }
    else if(act==='scope-machine'){ const id=el.getAttribute('data-id'); S.scope=(S.scope.type==='machine'&&S.scope.id===id)?{type:'total'}:{type:'machine',id}; }
    else if(act==='ack'){ ev.stopPropagation(); const id=el.getAttribute('data-id'); try{ await api('api/alarms/'+id+'/ack',{method:'POST'}); await poll(); }catch(e){} return; }

    // ---- Login/Logout
    else if(act==='open-login'){ openLogin(); return; }
    else if(act==='login-submit'){ await doLogin(); return; }
    else if(act==='logout'){ setToken(''); AUTH.admin=!AUTH.required; if(M) closeModal(); render(); return; }

    // ---- Modals öffnen/schließen
    else if(act==='open-sensors'){ ev.stopPropagation(); openSensorManager(el.getAttribute('data-id')||null); return; }
    else if(act==='open-settings'){ openSettings(); return; }
    else if(act==='open-flasher'){ openFlasher(); return; }
    else if(act==='open-export'){ openExport(); return; }
    else if(act==='open-alhist'){ openAlarmHistory(); return; }
    else if(act==='modal-close'){ closeModal(); return; }

    // ---- Export
    else if(act==='export-go'){ collectExportForm();
      const url='api/export.csv?scope='+encodeURIComponent(M.scope)+'&res='+encodeURIComponent(M.res)
        +'&start='+encodeURIComponent(M.from)+'&end='+encodeURIComponent(M.to);
      const a=document.createElement('a'); a.href=url; a.download=''; document.body.appendChild(a); a.click(); a.remove(); return; }

    // ---- „＋ Gerät“ / Firmware
    else if(act==='fw-build'){
      try{ await api('api/firmware/build',{method:'POST'}); M.fw=await api('api/firmware'); renderModal(); }
      catch(err){ setMsg(t('err')+err.message,true); } return; }
    else if(act==='mac-console'){ macConsoleStart(); return; }
    else if(act==='mac-console-stop'){ macConsoleStop(); return; }
    else if(act==='mac-copy'){
      try{ await navigator.clipboard.writeText(M.mac||''); setMsg(t('macCopied')); }
      catch(err){ setMsg(t('macCopyFail')+err.message,true); } return; }
    else if(act==='ota-start'){ collectSensorForm();
      const sMeta=((M.reg.sensors.find(x=>x.id===M.edit.id)||{}).meta)||{};
      if(!confirm(t('otaConfirm', M.edit.name, sMeta.ip||'?'))) return;
      try{ await api('api/sensors/'+encodeURIComponent(M.edit.id)+'/ota',{method:'POST'});
        M.fwWatch=true; const st=document.getElementById('ota-status'); if(st) st.textContent=t('otaStarted'); }
      catch(err){ setMsg(t('err')+err.message,true); } return; }

    // ---- Sensor-Manager
    else if(act==='sel-sensor'){ const id=el.getAttribute('data-id'); const s=M.reg.sensors.find(x=>x.id===id);
      M.sel=id; M.edit=s?makeEdit(s):null; M.msg=''; renderModal(); return; }
    else if(act==='edit-save'){ await saveSensor(); return; }
    else if(act==='edit-reset-counter'){ collectSensorForm();
      if(!confirm(t('resetConfirm', M.edit.name, M.edit.id))) return;
      try{ await api('api/sensors/'+encodeURIComponent(M.edit.id)+'/reset',{method:'POST'}); setMsg(t('resetSent')); }
      catch(err){ setMsg(t('err')+err.message,true); } return; }
    else if(act==='edit-delete'){
      if(!confirm(t('delConfirm', M.edit.name, M.edit.id))) return;
      try{ await api('api/sensors/'+encodeURIComponent(M.edit.id),{method:'DELETE'}); await refreshReg(); M.sel=null; M.edit=null; setMsg(t('deleted')); poll(); }
      catch(err){ setMsg(t('err')+err.message,true); } return; }
    else if(act==='dept-create'){ collectSensorForm();
      const inp=document.getElementById('dept-new-name'); const name=(inp&&inp.value.trim())||'';
      if(!name){ setMsg(t('deptMissing'),true); return; }
      try{ const res=await api('api/departments',{method:'POST',body:JSON.stringify({name})});
        await refreshReg(); if(M.edit&&!M.edit.dept) M.edit.dept=res.id; setMsg(t('deptCreated')); }
      catch(err){ setMsg(t('err')+err.message,true); } return; }
    else if(act==='dept-del'){ collectSensorForm(); const id=el.getAttribute('data-id');
      if(!confirm(t('deptDelConfirm'))) return;
      try{ await api('api/departments/'+encodeURIComponent(id),{method:'DELETE'});
        await refreshReg(); if(M.edit&&M.edit.dept===id) M.edit.dept=''; setMsg(t('deptDeleted')); poll(); }
      catch(err){ setMsg(t('err')+err.message,true); } return; }

    // ---- gemeinsame Formular-Interaktionen (Sensor + Settings)
    else if(act==='modal-redraw'){ if(M.type==='sensors') collectSensorForm(); else collectSettingsForm(); renderModal(); return; }
    else if(act==='dt-day'){ const p=el.getAttribute('data-tgt');
      if(M.type==='sensors') collectSensorForm(); else collectSettingsForm();
      const w=dtObj(p).windows[+el.getAttribute('data-w')]; const d=+el.getAttribute('data-d');
      const i=w.days.indexOf(d); if(i>=0) w.days.splice(i,1); else {w.days.push(d); w.days.sort();}
      renderModal(); return; }
    else if(act==='dt-add-window'){ const p=el.getAttribute('data-tgt');
      if(M.type==='sensors') collectSensorForm(); else collectSettingsForm();
      dtObj(p).windows.push({days:[5,6],start:'00:00',end:'24:00'}); renderModal(); return; }
    else if(act==='dt-del-window'){ const p=el.getAttribute('data-tgt');
      if(M.type==='sensors') collectSensorForm(); else collectSettingsForm();
      dtObj(p).windows.splice(+el.getAttribute('data-w'),1); renderModal(); return; }

    // ---- Einstellungen
    else if(act==='cfg-save'){ await saveSettings(); return; }
    else if(act==='toggle-pw'){ collectSettingsForm(); M.showPw=!M.showPw; renderModal(); return; }
    else if(act==='login-disable'){ collectSettingsForm();
      if(!confirm(t('loginDisableConfirm'))) return;
      try{ await api('api/config',{method:'POST',body:JSON.stringify({admin_password:''})});
        setToken(''); AUTH.required=false; AUTH.admin=true; M.authRequired=false; setMsg(t('saved')); render(); renderModal(); }
      catch(err){ setMsg(t('err')+err.message,true); } return; }
    else if(act==='cfg-restart'){ collectSettingsForm();
      if(!confirm(t('restartConfirm'))) return;
      try{ await api('api/restart',{method:'POST'}); M.restartWait=true; renderModal(); watchRestart(); }
      catch(err){ setMsg(t('err')+err.message,true); } return; }
    else return;
    render();
  });
  // Backdrop-Klick schließt (nur wenn direkt auf den Backdrop geklickt wurde)
  modalEl.addEventListener('mousedown', ev=>{ if(ev.target && ev.target.id==='modal-backdrop') closeModal(); });
  document.addEventListener('keydown', ev=>{
    if(ev.key==='Escape' && M) closeModal();
    else if((ev.key==='Enter'||ev.key==='Return') && M && M.type==='login'){ ev.preventDefault(); doLogin(); }
  });

  // ------------------------------------------------------------------ data
  async function poll(){
    try{
      const r=await fetch('api/data',{cache:'no-store'});
      if(r.ok){
        DATA=await r.json(); S.pollError=false; S.lastOk=Date.now();
        // Login-Pflicht kann sich serverseitig ändern -> Auth-Status nachziehen
        if(AUTH.known && !!DATA.authRequired!==AUTH.required){ await refreshAuth(); }
        render();
      }
      else if(!S.pollError){ S.pollError=true; render(); }
    }catch(e){ if(!S.pollError){ S.pollError=true; render(); } }
  }
  setInterval(poll, 5000);
  setInterval(()=>{ S.now=Date.now(); const c=document.getElementById('clock'); if(c){ const d=new Date(S.now); c.textContent=d.toLocaleTimeString(numLocale())+' · '+d.toLocaleDateString(numLocale(),{day:'2-digit',month:'short'}); } }, 1000);
  applyTheme();
  refreshAuth().then(()=>{ if(DATA) render(); });
  poll();
})();
