/* Gas Monitoring – Frontend (vanilla, kein Build-Schritt).
   Redesign 2026-08 (Handoff "iwb Gas Monitoring Dashboard"): feste Sidebar,
   Bildschirme Übersicht / Abteilungen / Anlagen / Alarme / Berichte /
   Administration + TV-Modus (#/tv). Alle Daten kommen live aus dem Backend
   (GET /api/data, /api/alarms/history, /api/report/monthly) — keine Platzhalter.
   Zwei Ebenen: ohne Login komplett lesbar (inkl. Export), alle Änderungen
   (Sensoren, Einstellungen, Firmware, Quittieren/Auflösen, Neustart) hinter dem
   Login. Sprache DE/EN über die I18N-Tabelle; UI-Präferenzen in localStorage.
   Modals (Login, Export, ＋Gerät) leben in #modal-layer und überleben den Poll. */
(() => {
  "use strict";

  // ------------------------------------------------------------------- i18n
  const L = {
  de: {
    brandSub:'iwb · Produktionshalle',
    navOverview:'Übersicht', navDepts:'Abteilungen', navMachines:'Anlagen',
    navAlarms:'Alarme', navReports:'Berichte', navAdmin:'Administration',
    sideDepts:'ABTEILUNGEN · {0} / {1}', noDeptGroup:'Ohne Abteilung',
    brokerOk:'BROKER OK', brokerDown:'BROKER GETRENNT', tvOpen:'TV-Modus', tvExit:'TV-Modus beenden',
    roleAdmin:'angemeldet · admin', roleRead:'nur lesen — anmelden', roleOpen:'offen · kein Login gesetzt',
    btnLogin:'Anmelden', btnLogout:'Abmelden', logoutConfirm:'Abmelden? Das Dashboard ist dann nur noch lesbar.',
    pollError:'Backend nicht erreichbar — Anzeige zeigt den Stand von {0}.',
    waiting:'Warte auf Daten vom Backend …',
    unassigned1:'1 nicht zugeordneter Sensor', unassignedN:'{0} nicht zugeordnete Sensoren',
    unassignedGo:' — hier klicken und Gas/Abteilung zuweisen.', unassignedInfo:' — Zuordnung nach Anmeldung möglich.',
    noSensorsYet:'Noch keine Sensoren. Sobald ein Gerät publiziert, erscheint es hier automatisch (Inbetriebnahme: Administration → ＋ Gerät).',
    all:'Alle', r24:'24 h', r7:'7 Tage', r30:'30 Tage',
    rl24:'letzte 24 h', rl7:'letzte 7 Tage', rl30:'letzte 30 Tage',
    vs24:'vs. Vortag', vs7:'vs. Vorwoche', vs30:'vs. 15 Tage davor',
    exportCsv:'Export CSV',
    // Übersicht
    ovTitle:'Werksübersicht', ovSub:'Gas-Telemetrie Produktionshalle · {0}',
    kCons:'VERBRAUCH · {0}', kCost:'GAS-KOSTEN', kCostSub:'{0} m³ · {1}', allGases:'alle Gase',
    kLive:'LIVE-DURCHFLUSS', kLiveSub:'{0} von {1} Anlagen beziehen Gas',
    kAlarms:'AKTIVE ALARME', kAlarmsSub:'{0} kritisch · {1} Warnung · ', viewLink:'ansehen',
    trendTitle:'Verbrauchs-Trend', trendPerDay:'{0} pro Tag', trendPerHour:'{0} pro Stunde', allDeptsSub:'alle Abteilungen',
    alarmsCard:'Aktive Alarme', historyLink:'Historie →', noActiveAlarms:'Keine aktiven Alarme.',
    deptCardSub:'{0} Anlagen · {1} aktiv · {2}', days7:'7 Tage',
    machinesCard:'Anlagen', unitsOnline:'{0} Anlagen · {1} online', rowHint:'Zeile öffnet die Anlagen-Ansicht',
    thStatus:'Status', thMachine:'Anlage', thGas:'Gas', thDept:'Abteilung', thFlow:'Live Nl/min',
    thCons:'Verbrauch', thCost:'Kosten', thTrend:'Trend', th14d:'14 Tage',
    stAlert:'ALARM', stRun:'AKTIV', stIdle:'IDLE', stOff:'OFFLINE',
    okTag:'OK', alarmTag:'{0} ALARM', offlineTag:'{0} OFFLINE',
    // Abteilung
    deptShare:'ANTEIL AM WERK', deptShareSub:'des Gesamtverbrauchs · {0}',
    byMachine:'Verbrauch je Anlage', noMachines:'Keine Anlagen in dieser Abteilung.',
    // Anlage
    kToday:'HEUTE', kLast7:'LETZTE 7 TAGE', kTotalCtr:'ZÄHLERSTAND GESAMT',
    sinceReset:'seit Inbetriebnahme / letztem Reset', lastMsg:'letzte Meldung {0}',
    machineIdle:'Anlage im Leerlauf — sollte 0 sein',
    flowChart24:'Durchfluss — letzte 24 h', flowChartSub24:'Ø Nl/min · 1-h-Mittel',
    consChart:'Verbrauch — {0}', consChartSub:'{0} pro Tag',
    machAlarmHist:'Alarm-Historie — diese Anlage', noMachAlarms:'Keine Alarme aufgezeichnet.',
    machInfo:'Anlagen-Info', infoDept:'Abteilung', infoGas:'Gas', infoSensor:'Sensor-ID',
    infoTopic:'MQTT-Topic', infoDevice:'Gerät', infoFw:'Firmware', infoSp:'SP-Wert',
    thresholds:'Alarm-Schwellen', thrIdle:'Leerlauf/Leck', thrDt:'Downtime max.', thrDtOff:'Downtime-Überwachung aus',
    thrOffline:'Offline-Alarm nach', thrOver:'Mehrverbrauch', thrOverVal:'+15 % Warnung · +30 % kritisch',
    thrCustom:'individuelle Schwellen', thrDefault:'Standard-Schwellen', editLink:'Bearbeiten',
    noteCard:'Notiz', noteEmpty:'Keine Notiz.', noteSave:'Speichern', notePlaceholder:'z. B. „Flasche getauscht 26.08.“ — bleibt gespeichert',
    unknownMachine:'Unbekannte Anlage.', backOverview:'Zur Übersicht',
    // Alarm-Typen
    alOver:'Mehrverbrauch', alOverDetail:'+{0} % über Erwartungswert',
    alLeak:'Leerlauf / Leck', alLeakDetail:'Durchfluss während Stillstand',
    alDown:'Downtime-Verbrauch', alDownDetail:'Verbrauch im Stillstands-Fenster',
    alOffline:'Sensor offline', alOfflineDetail:'keine Daten vom Gerät',
    alLeakBanner:'Leerlauf-Durchfluss erkannt — mögliches Leck.', alLeakBanner2:'{0} Nl/min {1} seit {2}, obwohl die Anlage im Leerlauf sein sollte. Schwelle: {3} Nl/min.',
    alOfflineBanner:'Sensor offline.', alOfflineBanner2:'Keine Daten vom Gerät seit {0} ({1}).',
    alOverBanner:'Mehrverbrauch erkannt.', alOverBanner2:'+{0} % gegenüber dem Mittel der Vorwochen (seit {1}).',
    alDownBanner:'Verbrauch im Stillstands-Fenster.', alDownBanner2:'{0} im aktuellen Fenster (seit {1}).',
    btnAck:'Quittieren', btnResolve:'Auflösen', ackTip:'gesehen, Ursache besteht weiter', resolveTip:'erledigt — wandert in die Historie',
    // Alarme-Bildschirm
    alTitle:'Alarme', alSub:'{0} aktiv · {1} quittiert · Regeln je Anlage in der Administration',
    fAll:'Alle', fActive:'Aktiv', fAck:'Quittiert', fResolved:'Aufgelöst', exportLog:'Log exportieren',
    sevCrit:'KRITISCH', sevWarn:'WARNUNG',
    stateActive:'AKTIV', stateAck:'QUITTIERT', stateResolved:'AUFGELÖST', autoTag:'auto',
    thSeverity:'Stufe', thType:'Typ', thStarted:'Beginn', thDuration:'Dauer', thDetail:'Detail', thState:'Status', thActions:'Aktionen',
    noAlarmsFilter:'Keine Alarme in dieser Ansicht.',
    st30:'ALARME · LETZTE 30 TAGE', st30Sub:'{0} kritisch · {1} Warnung',
    mttr:'MITTLERE LÖSUNGSZEIT', mttrSub:'{0} auto-aufgelöst · {1} manuell',
    waste:'GESCH. VERLUST DURCH LECKS', wasteSub:'aus Leerlauf-/Leck-Alarmen · 30 Tage', wasteNone:'keine Leck-Alarme · 30 Tage',
    // Berichte
    repTitle:'Berichte', repSub:'Monatsverbrauch & Kosten aus den Stundendaten',
    ytd:'JAHR {0}', ytdSub:'{0} € gesamt', mavg:'MONATSMITTEL', mavgSub:'{0} € / Monat · volle Monate',
    gasSplitK:'GAS-ANTEIL · {0}', sinceStart:'SEIT AUFZEICHNUNG', sinceSub:'seit {0}',
    monthly:'Monatsübersicht', monthlySub:'CSV lädt den Tages-Export des Monats',
    thMonth:'Monat', thTotalM3:'Gesamt m³', thVsPrev:'vs. Vormonat', mtd:'(laufend)',
    costByDept:'Kosten je Abteilung · {0}', noReportData:'Noch keine Verbrauchsdaten aufgezeichnet.',
    exportCard:'Daten-Export (CSV)',
    // Export
    exScope:'Umfang', exTotal:'Gesamt (alle zugeordneten Anlagen)', exDept:'Abteilung: {0}', exSensor:'Anlage: {0}',
    exRes:'Auflösung', exDay:'Tag', exHour:'Stunde', exFrom:'Von', exTo:'Bis', exGo:'CSV herunterladen',
    exHint:'Semikolon-getrennt mit Dezimalkomma — öffnet direkt in (deutschem) Excel. Spalten: Zeit, Sensor, Gas, Abteilung, Nl, m³, €.',
    titleExport:'Historische Daten als CSV exportieren',
    // Administration
    adTitle:'Administration', adSub:'Sensoren, Schwellwerte, Preise, Broker · Änderungen nur mit Anmeldung',
    tabSensors:'Sensoren', tabDepts:'Abteilungen', tabPrices:'Preise & Schwellen', tabBroker:'MQTT-Broker', tabSystem:'Login & System',
    addSensor:'＋ Gerät hinzufügen',
    needLoginTitle:'Anmeldung erforderlich', needLoginText:'Die Administration ist ohne Anmeldung nur eingeschränkt sichtbar. Bitte zuerst anmelden.',
    adLoadFail:'Administrations-Daten nicht ladbar: ',
    thLeakFrom:'Leck ab', thLeakTo:'aktiv ab', edit:'Bearbeiten', online:'online', offline:'offline',
    notAssigned:'nicht zugeordnet', never:'nie',
    agoS:'vor {0} s', agoM:'vor {0} min', agoH:'vor {0} h', agoD:'vor {0} d',
    pickSensor:'Sensor in der Tabelle auswählen, um ihn zu konfigurieren.',
    device:'Gerät', spValue:'SP-Wert', deviceTip:'Geräte-Webinterface öffnen',
    devHint:'SP-Wert und Anlagen-ID werden im Geräte-Webinterface (Link oben) eingestellt.',
    otaBtn:'Firmware-Update (OTA)', otaIdle:'Gerät startet neu, Zähler bleibt erhalten', otaRunning:'läuft … {0}', otaStarted:'OTA gestartet …',
    otaDone:'OTA abgeschlossen ✓ — Gerät startet neu', otaFail:'OTA fehlgeschlagen (Log unter „＋ Gerät“)',
    otaConfirm:'Firmware-Update (OTA) auf „{0}“ ({1}) starten?\nDas Gerät startet neu; Zähler und Einstellungen bleiben erhalten.',
    total:'Gesamt', name:'Anzeigename', gasSel:'Gas', deptSel:'Abteilung', noGas:'— kein Gas (nicht zugeordnet) —', noDept:'— keine Abteilung —',
    note:'Notiz',
    leakCustom:'Leck-Schwellen individuell (Standard: {0}–{1} Nl/min)', leakFrom:'Leck ab', leakTo:'bis', leakUnit:'Nl/min (darüber gilt die Anlage als aktiv)',
    dtCustom:'Downtime-Regel individuell (sonst Standard aus „Preise & Schwellen“)', dtOn:'Überwachung aktiv', dtMax:'max. Verbrauch im Fenster',
    dtNoWin:'Keine Fenster definiert.', dtAddWin:'＋ Fenster hinzufügen', dtDelWin:'Fenster entfernen',
    dtHint:'Alarm, wenn der Verbrauch in einem Fenster das Maximum überschreitet. Zeiten HH:MM, Ende 24:00 = Mitternacht.',
    save:'Speichern', saved:'Gespeichert ✓', err:'Fehler: ', deleted:'Gelöscht ✓',
    resetCounter:'Zähler nullen', resetTip:'Kommando an das Gerät: Gesamtzähler nullen',
    resetConfirm:'Gesamtzähler von „{0}“ ({1}) wirklich auf 0 setzen?', resetSent:'Reset-Kommando gesendet ✓',
    delSensor:'Sensor löschen', delConfirm:'Sensor „{0}“ ({1}) aus der Registry löschen?\nHistorie bleibt erhalten; ein aktives Gerät registriert sich neu.',
    depts:'Abteilungen', noDepts:'Noch keine Abteilungen.', newDept:'Neue Abteilung …', deptMissing:'Name der Abteilung fehlt',
    deptDelTip:'Abteilung löschen', deptDelConfirm:'Abteilung löschen? Zugeordnete Sensoren verlieren nur die Zuordnung.',
    deptCreated:'Abteilung angelegt ✓', deptDeleted:'Abteilung gelöscht ✓', deptRenamed:'Abteilung umbenannt ✓',
    deptSensors:'{0} Sensoren', rename:'Umbenennen',
    // Einstellungen (Preise/Broker/System)
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
    titleDevice:'Neues Gerät flashen · Firmware bauen · MAC auslesen',
    serialHint:'USB-Flashen & MAC-Auslesen gehen nur in <b>Chrome/Edge</b> direkt am Dashboard-PC über <span class="mono">http://localhost:8000</span>. Alternative: <span class="mono">esphome run gas-flowmeter.yaml</span> im firmware/-Ordner.',
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
    flashOtaHint:'Updates verbundener Geräte: Sensor auswählen → „Firmware-Update (OTA)“.',
    macBox:'MAC-Adresse auslesen (für die IT-Freischaltung)', macBtn:'MAC-Adresse auslesen (USB)', macActive:'Konsole aktiv …', macStop:'Stopp',
    macHint:'Liest die USB-Konsole des geflashten Boards; die MAC steht später auch im Sensor-Manager.',
    macCopy:'kopieren', macCopied:'MAC kopiert ✓', macCopyFail:'Kopieren fehlgeschlagen: ', macSubmit:'→ diese Ethernet-MAC bei der IT zur Freischaltung einreichen',
    macWait:'— warte auf Ausgabe (Board wird resettet) —', serialErr:'Serielle Verbindung: ', serialLost:'[Verbindung getrennt: {0}]',
    jobBuild:'Build', jobOta:'OTA → {0}', buildRunningErr:'es läuft bereits ein Job',
    // Login
    titleLogin:'Anmelden', loginInfo:'Ohne Anmeldung ist das Dashboard nur lesbar.', loginBtn:'Anmelden', loginWrong:'Falsches Passwort',
    loginRequired:'Anmeldung erforderlich', loginFirst:'Bitte zuerst anmelden.',
    regLoadFail:'Sensor-Liste nicht ladbar: ', cfgLoadFail:'Konfiguration nicht ladbar: ', histLoadFail:'Historie nicht ladbar: ',
    // TV
    tvTitle:'GAS MONITORING · PRODUKTIONSHALLE', tvOnline:'{0}/{1} ONLINE', tvToday:'heute', tv7d:'7 T',
    tvFlow:'DURCHFLUSS · LETZTE 24 H', tvAlarms:'ALARME', tvNoAlarms:'KEINE AKTIVEN ALARME',
    tvDeptCons:'VERBRAUCH JE ABTEILUNG · 7 T', tvActive:'{0} AKTIV', tvLeak:'LECK?', tvOffline:'OFFLINE'
  },
  en: {
    brandSub:'iwb · Production hall',
    navOverview:'Overview', navDepts:'Departments', navMachines:'Machines',
    navAlarms:'Alarms', navReports:'Reports', navAdmin:'Administration',
    sideDepts:'DEPARTMENTS · {0} / {1}', noDeptGroup:'No department',
    brokerOk:'BROKER OK', brokerDown:'BROKER DOWN', tvOpen:'TV mode', tvExit:'Exit TV mode',
    roleAdmin:'signed in · admin', roleRead:'read-only — sign in', roleOpen:'open · no login set',
    btnLogin:'Sign in', btnLogout:'Sign out', logoutConfirm:'Sign out? The dashboard becomes read-only.',
    pollError:'Backend unreachable — showing data as of {0}.',
    waiting:'Waiting for data from the backend …',
    unassigned1:'1 unassigned sensor', unassignedN:'{0} unassigned sensors',
    unassignedGo:' — click here to assign gas/department.', unassignedInfo:' — sign in to assign.',
    noSensorsYet:'No sensors yet. As soon as a device publishes, it appears here automatically (setup: Administration → ＋ Device).',
    all:'All', r24:'24 h', r7:'7 days', r30:'30 days',
    rl24:'last 24 hours', rl7:'last 7 days', rl30:'last 30 days',
    vs24:'vs previous day', vs7:'vs previous week', vs30:'vs 15 days before',
    exportCsv:'Export CSV',
    ovTitle:'Plant overview', ovSub:'Shopfloor gas telemetry · {0}',
    kCons:'CONSUMPTION · {0}', kCost:'GAS COST', kCostSub:'{0} m³ · {1}', allGases:'all gases',
    kLive:'LIVE FLOW', kLiveSub:'{0} of {1} machines drawing gas',
    kAlarms:'ACTIVE ALARMS', kAlarmsSub:'{0} critical · {1} warning · ', viewLink:'view',
    trendTitle:'Consumption trend', trendPerDay:'{0} per day', trendPerHour:'{0} per hour', allDeptsSub:'all departments',
    alarmsCard:'Active alarms', historyLink:'History →', noActiveAlarms:'No active alarms.',
    deptCardSub:'{0} machines · {1} active · {2}', days7:'7 days',
    machinesCard:'Machines', unitsOnline:'{0} units · {1} online', rowHint:'Click a row to open the machine view',
    thStatus:'Status', thMachine:'Machine', thGas:'Gas', thDept:'Department', thFlow:'Live Nl/min',
    thCons:'Consumption', thCost:'Cost', thTrend:'Trend', th14d:'14-day',
    stAlert:'ALERT', stRun:'RUNNING', stIdle:'IDLE', stOff:'OFFLINE',
    okTag:'OK', alarmTag:'{0} ALARM', offlineTag:'{0} OFFLINE',
    deptShare:'SHARE OF PLANT', deptShareSub:'of total consumption · {0}',
    byMachine:'Consumption by machine', noMachines:'No machines in this department.',
    kToday:'TODAY', kLast7:'LAST 7 DAYS', kTotalCtr:'TOTAL COUNTER',
    sinceReset:'since commissioning / last reset', lastMsg:'last message {0}',
    machineIdle:'machine idle — should be 0',
    flowChart24:'Flow — last 24 h', flowChartSub24:'avg Nl/min · 1 h buckets',
    consChart:'Consumption — {0}', consChartSub:'{0} per day',
    machAlarmHist:'Alarm history — this machine', noMachAlarms:'No alarms recorded.',
    machInfo:'Machine info', infoDept:'Department', infoGas:'Gas', infoSensor:'Sensor ID',
    infoTopic:'MQTT topic', infoDevice:'Device', infoFw:'Firmware', infoSp:'SP value',
    thresholds:'Alarm thresholds', thrIdle:'Idle flow (leak)', thrDt:'Downtime max.', thrDtOff:'Downtime monitoring off',
    thrOffline:'Offline alarm after', thrOver:'Over-consumption', thrOverVal:'+15% warning · +30% critical',
    thrCustom:'custom thresholds', thrDefault:'default thresholds', editLink:'Edit',
    noteCard:'Note', noteEmpty:'No note.', noteSave:'Save', notePlaceholder:'e.g. “bottle swapped Aug 26” — stays saved',
    unknownMachine:'Unknown machine.', backOverview:'Back to overview',
    alOver:'Over-consumption', alOverDetail:'+{0}% above expectation',
    alLeak:'Idle flow / leak', alLeakDetail:'Flow while machine is idle',
    alDown:'Downtime consumption', alDownDetail:'Consumption inside downtime window',
    alOffline:'Sensor offline', alOfflineDetail:'no data from device',
    alLeakBanner:'Idle flow detected — possible leak.', alLeakBanner2:'{0} Nl/min {1} flowing since {2} while the machine should be idle. Threshold: {3} Nl/min.',
    alOfflineBanner:'Sensor offline.', alOfflineBanner2:'No data from the device since {0} ({1}).',
    alOverBanner:'Over-consumption detected.', alOverBanner2:'+{0}% vs the mean of previous weeks (since {1}).',
    alDownBanner:'Consumption inside downtime window.', alDownBanner2:'{0} in the current window (since {1}).',
    btnAck:'Acknowledge', btnResolve:'Resolve', ackTip:'seen, cause persists', resolveTip:'done — moves to history',
    alTitle:'Alarms', alSub:'{0} active · {1} acknowledged · rules configurable per machine in Administration',
    fAll:'All', fActive:'Active', fAck:'Acknowledged', fResolved:'Resolved', exportLog:'Export log',
    sevCrit:'CRITICAL', sevWarn:'WARNING',
    stateActive:'ACTIVE', stateAck:'ACK', stateResolved:'RESOLVED', autoTag:'auto',
    thSeverity:'Severity', thType:'Type', thStarted:'Started', thDuration:'Duration', thDetail:'Detail', thState:'State', thActions:'Actions',
    noAlarmsFilter:'No alarms in this view.',
    st30:'ALARMS · LAST 30 DAYS', st30Sub:'{0} critical · {1} warning',
    mttr:'MEAN TIME TO RESOLVE', mttrSub:'{0} auto-resolved · {1} manual',
    waste:'EST. GAS WASTE FROM LEAKS', wasteSub:'from idle-flow/leak alarms · 30 d', wasteNone:'no leak alarms · 30 d',
    repTitle:'Reports', repSub:'Monthly consumption & cost from the hourly data',
    ytd:'YEAR {0}', ytdSub:'{0} € total', mavg:'MONTHLY AVERAGE', mavgSub:'{0} € / month · complete months',
    gasSplitK:'GAS SPLIT · {0}', sinceStart:'SINCE RECORDING', sinceSub:'since {0}',
    monthly:'Monthly summary', monthlySub:'CSV downloads the daily export for that month',
    thMonth:'Month', thTotalM3:'Total m³', thVsPrev:'vs prev.', mtd:'(MTD)',
    costByDept:'Cost by department · {0}', noReportData:'No consumption data recorded yet.',
    exportCard:'Data export (CSV)',
    exScope:'Scope', exTotal:'Total (all assigned machines)', exDept:'Department: {0}', exSensor:'Machine: {0}',
    exRes:'Resolution', exDay:'Day', exHour:'Hour', exFrom:'From', exTo:'To', exGo:'Download CSV',
    exHint:'Semicolon-separated with decimal comma — opens directly in (German) Excel. Columns: time, sensor, gas, department, Nl, m³, €.',
    titleExport:'Export historical data as CSV',
    adTitle:'Administration', adSub:'Sensor configuration, thresholds, gas prices, broker · changes require sign-in',
    tabSensors:'Sensors', tabDepts:'Departments', tabPrices:'Prices & thresholds', tabBroker:'MQTT broker', tabSystem:'Login & system',
    addSensor:'＋ Add device',
    needLoginTitle:'Sign-in required', needLoginText:'Administration is limited without signing in. Please sign in first.',
    adLoadFail:'Administration data not loadable: ',
    thLeakFrom:'Leak from', thLeakTo:'active from', edit:'Edit', online:'online', offline:'offline',
    notAssigned:'unassigned', never:'never',
    agoS:'{0} s ago', agoM:'{0} min ago', agoH:'{0} h ago', agoD:'{0} d ago',
    pickSensor:'Select a sensor in the table to configure it.',
    device:'Device', spValue:'SP value', deviceTip:'Open device web UI',
    devHint:'SP value and machine ID are set in the device web UI (link above).',
    otaBtn:'Firmware update (OTA)', otaIdle:'device reboots, counter is kept', otaRunning:'running … {0}', otaStarted:'OTA started …',
    otaDone:'OTA finished ✓ — device is rebooting', otaFail:'OTA failed (log under “＋ Device”)',
    otaConfirm:'Start firmware update (OTA) on “{0}” ({1})?\nThe device reboots; counter and settings are kept.',
    total:'Total', name:'Display name', gasSel:'Gas', deptSel:'Department', noGas:'— no gas (unassigned) —', noDept:'— no department —',
    note:'Note',
    leakCustom:'Custom leak thresholds (default: {0}–{1} Nl/min)', leakFrom:'Leak from', leakTo:'to', leakUnit:'Nl/min (above = machine active)',
    dtCustom:'Custom downtime rule (else default from “Prices & thresholds”)', dtOn:'Monitoring active', dtMax:'max. consumption in window',
    dtNoWin:'No windows defined.', dtAddWin:'＋ Add window', dtDelWin:'Remove window',
    dtHint:'Alarm when consumption within a window exceeds the maximum. Times HH:MM, end 24:00 = midnight.',
    save:'Save', saved:'Saved ✓', err:'Error: ', deleted:'Deleted ✓',
    resetCounter:'Reset counter', resetTip:'Command to the device: zero the total counter',
    resetConfirm:'Really reset the total counter of “{0}” ({1}) to 0?', resetSent:'Reset command sent ✓',
    delSensor:'Delete sensor', delConfirm:'Delete sensor “{0}” ({1}) from the registry?\nHistory is kept; an active device re-registers.',
    depts:'Departments', noDepts:'No departments yet.', newDept:'New department …', deptMissing:'Department name missing',
    deptDelTip:'Delete department', deptDelConfirm:'Delete department? Assigned sensors only lose the assignment.',
    deptCreated:'Department created ✓', deptDeleted:'Department deleted ✓', deptRenamed:'Department renamed ✓',
    deptSensors:'{0} sensors', rename:'Rename',
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
    titleDevice:'Flash new device · build firmware · read MAC',
    serialHint:'USB flashing & MAC reading only work in <b>Chrome/Edge</b> directly on the dashboard PC via <span class="mono">http://localhost:8000</span>. Alternative: <span class="mono">esphome run gas-flowmeter.yaml</span> in the firmware/ folder.',
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
    flashOtaHint:'Updates for connected devices: select a sensor → “Firmware update (OTA)”.',
    macBox:'Read MAC address (for IT approval)', macBtn:'Read MAC address (USB)', macActive:'Console active …', macStop:'Stop',
    macHint:'Reads the USB console of the flashed board; the MAC also appears later in the sensor manager.',
    macCopy:'copy', macCopied:'MAC copied ✓', macCopyFail:'Copy failed: ', macSubmit:'→ submit this Ethernet MAC to IT for approval',
    macWait:'— waiting for output (board is being reset) —', serialErr:'Serial connection: ', serialLost:'[connection lost: {0}]',
    jobBuild:'Build', jobOta:'OTA → {0}', buildRunningErr:'a job is already running',
    titleLogin:'Sign in', loginInfo:'Without signing in the dashboard is read-only.', loginBtn:'Sign in', loginWrong:'Wrong password',
    loginRequired:'Sign-in required', loginFirst:'Please sign in first.',
    regLoadFail:'Sensor list not loadable: ', cfgLoadFail:'Configuration not loadable: ', histLoadFail:'History not loadable: ',
    tvTitle:'GAS MONITORING · PRODUCTION HALL', tvOnline:'{0}/{1} ONLINE', tvToday:'today', tv7d:'7 d',
    tvFlow:'FLOW · LAST 24 H', tvAlarms:'ALARMS', tvNoAlarms:'NO ACTIVE ALARMS',
    tvDeptCons:'CONSUMPTION BY DEPARTMENT · 7 D', tvActive:'{0} ACTIVE', tvLeak:'LEAK?', tvOffline:'OFFLINE'
  }};
  const t = (k, ...a) => {
    let s = (L[S.lang] && L[S.lang][k]) ?? L.de[k] ?? k;
    a.forEach((v, i) => { s = s.replaceAll('{' + i + '}', v); });
    return s;
  };

  // ------------------------------------------------------------------ state
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('gasUI') || '{}') || {}; } catch (e) {}
  const S = {
    range: saved.range || '7d', unit: saved.unit || 'm3', lang: saved.lang || 'de',
    gas: 'all',
    view: {name: 'overview', id: null, tab: 'sensors'},
    sortKey: 'cons', sortDir: 'desc', hover: -1,
    alarmFilter: 'all',
    now: Date.now(), pollError: false, lastOk: null
  };
  function persistUI(){ try{ localStorage.setItem('gasUI', JSON.stringify({range:S.range,unit:S.unit,lang:S.lang})); }catch(e){} }

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
  let HIST = null, HIST_TS = 0;     // Alarm-Historie (/api/alarms/history)
  let MONTHLY = null, MONTHLY_TS = 0; // Monats-Aggregate (/api/report/monthly)
  let M = null;                     // Modal-State (login/export/flasher)
  const ADM = {loaded:false, reg:null, cfg:null, sel:null, edit:null, msg:'', msgErr:false,
               showPw:false, restartHint:false, restartWait:false, fwWatch:false, cfgEdit:null};
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
  const refHours = () => (DATA && DATA.refHours24) || [];
  const alarms = () => (DATA && DATA.alarms) || [];
  const unassigned = () => (DATA && DATA.unassigned) || [];
  const priceOf = g => { const x = gasesList().find(z => z.id === g); return x ? x.pricePerM3 : 0; };
  const gasName = g => { const x = gasesList().find(z => z.id === g); return x ? x.name : (g || '—'); };
  const gasShort = g => g === 'nitrogen' ? 'N₂' : g === 'argon' ? 'Ar' : (g ? gasName(g) : '—');
  const deepCopy = o => JSON.parse(JSON.stringify(o));
  const numLocale = () => S.lang === 'de' ? 'de-DE' : 'en-GB';
  const DEPT_COLORS = ['#0065BD','#0e9aa7','#7c3aed','#b45309','#0f766e','#be185d','#4d7c0f','#9333ea'];
  const deptColor = id => { if(id==null) return '#93a1b4'; const i = depts().findIndex(d=>d.id===id); return DEPT_COLORS[(i>=0?i:0) % DEPT_COLORS.length]; };
  const deptNameOf = id => { const d = depts().find(x=>x.id===id); return d ? d.name : t('noDeptGroup'); };

  // Sichtbare Sensoren = Gas-Filter angewandt
  const sensors = () => S.gas === 'all' ? allSensors() : allSensors().filter(m => m.gas === S.gas);

  const fmtNum = (n,d) => (n==null||isNaN(n)) ? '—' : Number(n).toLocaleString(numLocale(),{minimumFractionDigits:d,maximumFractionDigits:d});
  const unitVal = (nl,gas) => S.unit==='m3' ? nl/1000 : nl/1000*priceOf(gas);
  const fmtUnitVal = v => { if(S.unit==='m3'){const d=v<10?2:v<100?1:0; return fmtNum(v,d)+' m³';} return fmtNum(Math.round(v),0)+' €'; };
  const fmtM3 = nl => { const v=nl/1000, d=v<10?2:v<100?1:0; return fmtNum(v,d)+' m³'; };
  const fmtEurNl = (nl,gas) => fmtNum(Math.round(nl/1000*priceOf(gas)),0)+' €';
  const axisFmt = v => { if(S.unit==='m3') return fmtNum(v, v<10?1:0); if(v>=1000) return fmtNum(v/1000, v>=10000?0:1)+'k'; return fmtNum(Math.round(v),0); };
  const ago = ts => { if(!ts) return t('never'); const s=Math.max(0,Math.round(Date.now()/1000-ts));
    if(s<60) return t('agoS',s); if(s<3600) return t('agoM',Math.round(s/60));
    if(s<86400) return t('agoH',Math.round(s/3600)); return t('agoD',Math.round(s/86400)); };
  const fmtDT = ts => ts ? new Date(ts*1000).toLocaleString(numLocale(),{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
  const fmtDur = sec => { if(sec<90) return Math.round(sec)+' s'; if(sec<7200) return fmtNum(sec/60,0)+' min';
    if(sec<172800) return fmtNum(sec/3600,1)+' h'; return fmtNum(sec/86400,1)+' d'; };

  const bucketsFor = m => S.range==='24h' ? (m.hourly24||m.hourly) : S.range==='7d' ? m.daily.slice(23) : m.daily;
  const rangeNl = m => bucketsFor(m).reduce((a,b)=>a+b,0);
  const rangeUnit = m => unitVal(rangeNl(m), m.gas);
  const WD = () => S.lang==='de' ? ['So','Mo','Di','Mi','Do','Fr','Sa'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const labelsFor = () => {
    if(S.range==='24h') return refHours().map(ms=>{const d=new Date(ms);return String(d.getHours()).padStart(2,'0')+':00';});
    const ds = refDates().map(ms=>new Date(ms));
    if(S.range==='7d') return ds.slice(23).map(d=>WD()[d.getDay()]);
    return ds.map(d=>d.getDate()+'.'+(d.getMonth()+1));
  };
  const rangeShort = () => S.range==='24h'?t('r24'):S.range==='7d'?t('r7'):t('r30');
  const rangeLong = () => S.range==='24h'?t('rl24'):S.range==='7d'?t('rl7'):t('rl30');
  const vsLabel = () => S.range==='24h'?t('vs24'):S.range==='7d'?t('vs7'):t('vs30');
  const curPrev = m => {
    const s=a=>a.reduce((x,y)=>x+y,0);
    if(S.range==='24h') return {cur:s(m.hourly24||m.hourly), prev:m.daily[28]||0};
    if(S.range==='7d') return {cur:s(m.daily.slice(23)), prev:s(m.daily.slice(16,23))};
    return {cur:s(m.daily.slice(15)), prev:s(m.daily.slice(0,15))};
  };
  const trendPct = ms => { let c=0,p=0; ms.forEach(m=>{const x=curPrev(m); c+=x.cur; p+=x.prev;}); return p<=0?0:(c-p)/p*100; };
  const machineCurrent = m => Math.max(0, m.flow||0);
  const levelColor = l => l==='critical'?'var(--danger)':'var(--warn)';
  const trendColor = tr => tr>15?'var(--danger)':tr>0.5?'var(--warn)':tr<-0.5?'var(--good)':'var(--mute)';
  const trendTxt = tr => (tr>=0?'▲ ':'▼ ')+Math.abs(tr).toFixed(0)+'%';
  const statusOf = m => {
    const an = m.anomaly;
    if(an) return {label:t('stAlert'), color:levelColor(an.level), anim:'blink 1.4s ease-in-out infinite'};
    if(machineCurrent(m)>0.3) return {label:t('stRun'), color:'var(--good)', anim:'pulse 2.2s ease-in-out infinite'};
    if(m.status==='online') return {label:t('stIdle'), color:'var(--mute)', anim:'none'};
    return {label:t('stOff'), color:'var(--danger)', anim:'blink 1.4s ease-in-out infinite'};
  };
  const ALERT_META = () => ({
    over:     {title:t('alOver'),    detail:v=>t('alOverDetail', Math.round(v*100)), val:v=>'+'+Math.round(v*100)+'%'},
    leak:     {title:t('alLeak'),    detail:_=>t('alLeakDetail'),                    val:v=>fmtNum(v,1)+' Nl/min'},
    downtime: {title:t('alDown'),    detail:_=>t('alDownDetail'),                    val:v=>fmtM3(v)},
    offline:  {title:t('alOffline'), detail:_=>t('alOfflineDetail'),                 val:v=>v>=120?fmtNum(v/60,1)+' h':fmtNum(v,0)+' min'}
  });
  const activeAlarmsOnly = () => alarms().filter(a=>a.state!=='ack');
  const gasAlarms = () => S.gas==='all' ? alarms() : alarms().filter(a=>a.gas===S.gas);

  // ---------------------------------------------------------------- routing
  function parseHash(){
    const h = (location.hash||'').replace(/^#\/?/,'');
    const p = h.split('/');
    const names = {'':'overview', overview:'overview', departments:'departments', machines:'machines',
                   alarms:'alarms', reports:'reports', admin:'admin', tv:'tv'};
    if(p[0]==='dept' && p[1]) return {name:'dept', id:decodeURIComponent(p[1]), tab:S.view.tab};
    if(p[0]==='machine' && p[1]) return {name:'machine', id:decodeURIComponent(p[1]), tab:S.view.tab};
    if(p[0]==='admin') return {name:'admin', id:null, tab:p[1]||ADM_TABS[0]};
    return {name:names[p[0]]||'overview', id:null, tab:S.view.tab};
  }
  function go(hash){ if(location.hash===hash){ onRoute(); } else location.hash = hash; }
  function onRoute(){
    S.view = parseHash();
    S.hover = -1;
    if(S.view.name==='alarms' || S.view.name==='machine') loadHist(true).then(render);
    if(S.view.name==='reports'){ loadHist(false); loadMonthly(true).then(render); }
    if(S.view.name==='admin') loadAdmin();
    render();
    window.scrollTo(0,0);
  }
  window.addEventListener('hashchange', onRoute);
  const ADM_TABS = ['sensors','depts','prices','broker','system'];

  // ------------------------------------------------------------------- charts
  const CW=880, CH=230, PL=46, PR=14, PT=12, PB=28;
  let CHART = null;   // aktueller Linien-Chart-Kontext {series:[{color,vals,name}], labels}
  function lineChartSVG(){
    if(!CHART) return '';
    const {series, labels} = CHART;
    const n = labels.length, iw=CW-PL-PR, ih=CH-PT-PB, base=PT+ih;
    let max = 0; series.forEach(s=>s.vals.forEach(v=>{ if(v>max) max=v; }));
    max = Math.max(max*1.15, 1e-6);
    const X=i=> n<=1 ? PL+iw/2 : PL + i*(iw/(n-1));
    const Y=v=> PT+ih - (v/max)*ih;
    let out=`<svg viewBox="0 0 ${CW} ${CH}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:visible">`;
    const rows=4;
    for(let r=0;r<=rows;r++){ const yy=PT+ih*(r/rows), val=max*(1-r/rows);
      out+=`<line x1="${PL}" y1="${yy}" x2="${CW-PR}" y2="${yy}" stroke="var(--grid)" stroke-width="1"/>`;
      out+=`<text x="${PL-8}" y="${yy+4}" text-anchor="end" font-size="11" fill="var(--mute)" font-family="var(--mono)">${esc(axisFmt(val))}</text>`;
    }
    const step=Math.max(1,Math.ceil(n/8));
    for(let i=0;i<n;i+=step) out+=`<text x="${X(i)}" y="${CH-8}" text-anchor="middle" font-size="10.5" fill="var(--mute)" font-family="var(--mono)">${esc(labels[i])}</text>`;
    series.forEach((s,si)=>{
      let line='';
      s.vals.forEach((v,i)=>{ line+=(i?'L':'M')+X(i).toFixed(1)+','+Y(v).toFixed(1)+' '; });
      if(si===0){
        let area=`M${X(0).toFixed(1)},${base} `;
        s.vals.forEach((v,i)=>{ area+='L'+X(i).toFixed(1)+','+Y(v).toFixed(1)+' '; });
        area+=`L${X(n-1).toFixed(1)},${base} Z`;
        out+=`<path d="${area}" fill="${s.color}" fill-opacity="0.08" stroke="none"/>`;
      }
      out+=`<path d="${line}" fill="none" stroke="${s.color}" stroke-width="${si===0?2.5:2}" stroke-linejoin="round" stroke-linecap="round"/>`;
    });
    if(series.length && series[0].vals.length){
      const s0=series[0], li=s0.vals.length-1;
      out+=`<circle cx="${X(li)}" cy="${Y(s0.vals[li])}" r="4.5" fill="${s0.color}" stroke="var(--panel)" stroke-width="2"/>`;
    }
    const hv=S.hover;
    if(hv>=0 && hv<n){
      const hx=X(hv);
      out+=`<line x1="${hx}" y1="${PT}" x2="${hx}" y2="${base}" stroke="var(--brand)" stroke-width="1" stroke-dasharray="3 3" opacity="0.55"/>`;
      series.forEach(s=>{ out+=`<circle cx="${hx}" cy="${Y(s.vals[hv])}" r="4" fill="${s.color}" stroke="var(--panel)" stroke-width="2"/>`; });
      const rowsN=series.length, tw=170, th=24+rowsN*17;
      let tx=hx+12; if(tx+tw>CW-PR) tx=hx-12-tw; if(tx<PL)tx=PL;
      const ty=PT+4;
      out+=`<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="7" fill="var(--panel)" stroke="var(--border)"/>`;
      out+=`<text x="${tx+12}" y="${ty+16}" font-size="11" fill="var(--mute)" font-family="var(--mono)">${esc(labels[hv])}</text>`;
      series.forEach((s,i)=>{
        out+=`<circle cx="${tx+16}" cy="${ty+27+i*17}" r="3.5" fill="${s.color}"/>`;
        out+=`<text x="${tx+26}" y="${ty+31+i*17}" font-size="11" fill="var(--dim)" font-family="var(--sans)">${esc(s.name)}</text>`;
        out+=`<text x="${tx+tw-10}" y="${ty+31+i*17}" text-anchor="end" font-size="11.5" font-weight="600" fill="var(--text)" font-family="var(--mono)">${esc(fmtUnitVal(s.vals[hv]))}</text>`;
      });
    }
    out+='</svg>';
    return out;
  }
  function paintChart(){ const host=document.getElementById('chart-host'); if(host) host.innerHTML=lineChartSVG(); }
  function chartIndexFromEvent(ev){
    const svg=ev.currentTarget.querySelector('svg'); if(!svg || !CHART) return -1;
    const r=svg.getBoundingClientRect(); const n=CHART.labels.length; const iw=CW-PL-PR;
    const vbx=(ev.clientX-r.left)/r.width*CW;
    let i=Math.round((vbx-PL)/(n<=1?iw:iw/(n-1)));
    return Math.max(0,Math.min(n-1,i));
  }
  function bindChartHover(){
    const host=document.getElementById('chart-host');
    if(!host) return;
    host.addEventListener('mousemove',ev=>{ const i=chartIndexFromEvent(ev); if(i!==S.hover){S.hover=i; paintChart();} });
    host.addEventListener('mouseleave',()=>{ if(S.hover!==-1){S.hover=-1; paintChart();} });
  }

  function sparkSVG(vals,color,W,H,sw){
    W=W||92; H=H||24; sw=sw||1.5;
    const p=3, n=Math.max(vals.length,2);
    const vs = vals.length>1?vals:[0,0];
    const max=Math.max.apply(null,vs), min=Math.min.apply(null,vs), rng=Math.max(1e-9,max-min);
    const X=i=>p+i*((W-2*p)/(n-1)), Y=v=>H-p-((v-min)/rng)*(H-2*p);
    let d='';
    vs.forEach((v,i)=>{ d+=(i?'L':'M')+X(i).toFixed(1)+','+Y(v).toFixed(1)+' '; });
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:inline-block;vertical-align:middle"><path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
  }

  // Stunden-/Tagesbalken (Anlagen-Detail, TV): flex-Reihe aus divs
  function barsHTML(vals, labels, color, height, titleFmt){
    const max=Math.max(1e-9, Math.max.apply(null, vals));
    const pale='color-mix(in srgb,'+color+' 18%,var(--divider))';
    const bars=vals.map((v,i)=>{
      const h=Math.max(3, Math.round(v/max*height));
      const c=v<=max*0.03 ? pale : color;
      return `<div title="${esc(labels[i]+' · '+titleFmt(v))}" style="flex:1;border-radius:3px 3px 0 0;background:${c};height:${h}px"></div>`;
    }).join('');
    const n=labels.length, li=[0, Math.round(n*0.25), Math.round(n*0.5), Math.round(n*0.75), n-1].filter((v,i,a)=>a.indexOf(v)===i);
    const axis=li.map(i=>`<span>${esc(labels[i])}</span>`).join('');
    return `<div style="display:flex;align-items:flex-end;gap:5px;height:${height}px">${bars}</div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--mute);margin-top:8px;font-family:var(--mono)">${axis}</div>`;
  }

  // ------------------------------------------------------------------ shell
  const NAV = () => [
    {id:'overview',  hash:'#/overview',    icon:'◱', label:t('navOverview')},
    {id:'departments',hash:'#/departments',icon:'▦', label:t('navDepts'), badge:String(depts().length), badgeMute:true},
    {id:'machines',  hash:'#/machines',    icon:'◉', label:t('navMachines'), badge:String(allSensors().length), badgeMute:true},
    {id:'alarms',    hash:'#/alarms',      icon:'⚠', label:t('navAlarms')},
    {id:'reports',   hash:'#/reports',     icon:'▤', label:t('navReports')},
    {id:'admin',     hash:'#/admin',       icon:'⚙', label:t('navAdmin')}
  ];
  function sidebarHTML(){
    const view=S.view.name;
    const activeOf = {overview:'overview', departments:'departments', dept:'departments',
                      machines:'machines', machine:'machines', alarms:'alarms',
                      reports:'reports', admin:'admin'}[view];
    const act=activeAlarmsOnly().length, ackN=alarms().length-act;
    const items = NAV().map(n=>{
      let badge='';
      if(n.id==='alarms'){
        if(act) badge=`<span style="margin-left:auto;font:600 10px var(--mono);background:var(--danger);color:#fff;padding:1px 6px;border-radius:8px">${act}</span>`;
        else if(ackN) badge=`<span style="margin-left:auto;font:600 10px var(--mono);background:var(--warn);color:#fff;padding:1px 6px;border-radius:8px">${ackN}</span>`;
      } else if(n.badge!=null){
        badge=`<span style="margin-left:auto;font:600 10px var(--mono);color:${activeOf===n.id?'inherit':'var(--mute)'}">${esc(n.badge)}</span>`;
      }
      return `<button class="nav-item${activeOf===n.id?' on':''}" data-action="nav" data-hash="${n.hash}">
        <span style="width:16px;text-align:center;flex:none">${n.icon}</span> ${esc(n.label)} ${badge}</button>`;
    }).join('');

    // Abteilungs-Miniliste (aktueller Bereich, gewählte Einheit)
    const flat=sensors();
    const deptAgg=depts().map(d=>({d, v:flat.filter(m=>m.deptId===d.id).reduce((a,m)=>a+rangeUnit(m),0)}));
    const maxDept=Math.max(1e-9,...deptAgg.map(x=>x.v));
    const deptRows=deptAgg.map(({d,v})=>`
      <button data-action="nav" data-hash="#/dept/${encodeURIComponent(d.id)}" style="display:block;width:100%;border:none;background:none;padding:0;cursor:pointer;text-align:left">
        <span style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
          <span style="font-size:11.5px;color:var(--dim)">${esc(d.name)}</span>
          <span style="font:600 11px var(--mono);color:var(--text)">${esc(fmtUnitVal(v))}</span></span>
        <span style="display:block;height:5px;border-radius:3px;background:var(--divider);overflow:hidden">
          <span style="display:block;height:100%;border-radius:3px;background:${deptColor(d.id)};width:${Math.round(v/maxDept*100)}%"></span></span>
      </button>`).join('');

    const assigned=allSensors(), onlineN=assigned.filter(m=>m.status==='online').length;
    const brk=DATA&&DATA.broker;
    const brokerOk=brk?brk.ingest_connected:onlineN>0;
    const role = AUTH.required ? (isAdmin()?t('roleAdmin'):t('roleRead')) : t('roleOpen');
    const avatar = isAdmin()&&AUTH.required ? 'A' : (AUTH.required?'○':'—');
    return `
    <aside id="sidebar" style="width:232px;flex:none;background:var(--panel);border-right:1px solid var(--border);display:flex;flex-direction:column;padding:18px 14px 16px;position:sticky;top:0;height:100vh;overflow-y:auto">
      <div style="display:flex;align-items:center;gap:11px;padding:0 6px 18px;border-bottom:1px solid var(--border)">
        <div style="width:38px;height:38px;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font:700 12px var(--sans);letter-spacing:.02em;flex:none">TUM</div>
        <div><div style="font-size:14px;font-weight:700;line-height:1.1">Gas Monitoring</div>
        <div style="font-size:10.5px;color:var(--mute);margin-top:2px">${esc(t('brandSub'))}</div></div>
      </div>
      <nav style="display:flex;flex-direction:column;gap:2px;padding:14px 0">${items}</nav>
      ${deptRows?`<div style="padding:12px 6px 8px;border-top:1px solid var(--border)">
        <div class="micro" style="margin-bottom:10px">${esc(t('sideDepts', S.unit==='m3'?'M³':'€', rangeShort().toUpperCase()))}</div>
        <div style="display:flex;flex-direction:column;gap:10px">${deptRows}</div>
      </div>`:''}
      <div style="margin-top:auto;padding:12px 6px 0;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:9px">
        <div style="display:flex;align-items:center;gap:7px;font:600 10px var(--mono);color:${brokerOk?'var(--good)':'var(--danger)'}">
          <span style="width:7px;height:7px;border-radius:50%;background:${brokerOk?'var(--good)':'var(--danger)'};${brokerOk?'animation:pulse 2.2s ease-in-out infinite':''}"></span>
          ${esc(brokerOk?t('brokerOk'):t('brokerDown'))} · ${onlineN}/${assigned.length}</div>
        <button data-action="user-chip" style="display:flex;align-items:center;gap:9px;border:none;background:none;padding:0;cursor:pointer;text-align:left" title="${esc(isAdmin()&&AUTH.required?t('btnLogout'):t('btnLogin'))}">
          <div style="width:26px;height:26px;border-radius:50%;background:${isAdmin()&&AUTH.required?'var(--brand-tint)':'var(--divider)'};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:${isAdmin()&&AUTH.required?'var(--brand)':'var(--dim)'};flex:none">${avatar}</div>
          <div style="font-size:11px;color:var(--dim)">${esc(role)}</div>
        </button>
        <div style="display:flex;gap:8px;align-items:center">
          <div class="seg" style="padding:2px">
            <button class="${S.lang==='de'?'on':''}" data-action="lang" data-val="de" style="padding:3px 8px;font-size:10.5px">DE</button>
            <button class="${S.lang==='en'?'on':''}" data-action="lang" data-val="en" style="padding:3px 8px;font-size:10.5px">EN</button>
          </div>
          <button class="btn-link gray" data-action="nav" data-hash="#/tv" style="font-size:10.5px">▷ ${esc(t('tvOpen'))}</button>
        </div>
      </div>
    </aside>`;
  }

  const segHTML = (items, action) => `<div class="seg">${items.map(it=>
    `<button class="${it.on?'on':''}" data-action="${action}" data-val="${esc(it.val)}" ${it.style?`style="${it.style}"`:''}>${esc(it.label)}</button>`).join('')}</div>`;
  const gasSeg = () => segHTML([{val:'all',label:t('all'),on:S.gas==='all'}].concat(gasesList().map(g=>({val:g.id,label:g.name,on:S.gas===g.id}))),'gas');
  const rangeSeg = () => segHTML([{val:'24h',label:'24 H',on:S.range==='24h'},{val:'7d',label:'7 D',on:S.range==='7d'},{val:'30d',label:'30 D',on:S.range==='30d'}],'range');
  const unitSeg = () => segHTML([{val:'m3',label:'m³',on:S.unit==='m3'},{val:'eur',label:'€',on:S.unit==='eur'}],'unit');
  const clockHTML = () => { const d=new Date(S.now);
    return `<div style="text-align:right;flex:none"><div id="clock" style="font:600 13px var(--mono)">${esc(d.toLocaleTimeString(numLocale()))}</div>
      <div id="clock-date" style="font-size:10.5px;color:var(--mute)">${esc(d.toLocaleDateString(numLocale(),{weekday:'short',day:'2-digit',month:'short',year:'numeric'}))}</div></div>`; };

  function headerHTML(titleHtml, subHtml, controlsHtml){
    return `<header style="display:flex;align-items:center;gap:16px;margin-bottom:18px;flex-wrap:wrap">
      <div style="min-width:0">${subHtml?`<div style="font-size:11.5px;color:var(--mute);margin-bottom:3px">${subHtml}</div>`:''}
        <div style="font-size:18px;font-weight:700;display:flex;align-items:center;gap:10px;flex-wrap:wrap">${titleHtml}</div></div>
      <div style="display:flex;gap:12px;margin-left:auto;align-items:center;flex-wrap:wrap">${controlsHtml||''}</div>
    </header>`;
  }
  const kpiCard = (label, value, sub, opts) => { opts=opts||{};
    return `<div class="card" ${opts.border?`style="border-color:${opts.border}"`:''}>
      <div class="kpi-label">${esc(label)}</div>
      <div class="kpi-value" ${opts.color?`style="color:${opts.color}"`:''}>${value}</div>
      <div class="kpi-sub">${sub}</div></div>`; };

  // Zeile der Alarm-Karte (Übersicht): getönte Box je Stufe
  function alarmRowHTML(a, admin){
    const AM=ALERT_META();
    const meta=AM[a.type]||{title:a.type,detail:_=>'',val:v=>String(v)};
    const crit=a.level==='critical';
    const bd=crit?'var(--danger-border)':'var(--warn-border)';
    const bg=crit?'var(--danger-bg2)':'var(--warn-bg2)';
    const c=crit?'var(--danger)':'var(--warn)';
    const ackTag=a.state==='ack'?` <span class="pill" style="color:var(--warn);background:var(--warn-bg)">${esc(t('stateAck'))}</span>`:'';
    return `<div style="border:1px solid ${bd};background:${bg};border-radius:9px;padding:9px 12px;${a.state==='ack'?'opacity:.75':''}">
      <button data-action="nav" data-hash="#/machine/${encodeURIComponent(a.sensor)}" style="display:block;width:100%;border:none;background:none;padding:0;cursor:pointer;text-align:left;color:inherit">
        <span style="display:flex;justify-content:space-between;gap:8px;align-items:center">
          <span style="font-size:12.5px;font-weight:600">${esc(meta.title)}${ackTag}</span>
          <span style="font:600 11.5px var(--mono);color:${c};flex:none">${esc(meta.val(a.value))}</span></span>
        <span style="display:block;font-size:11.5px;color:var(--dim);margin-top:2px">${esc(a.sensorName)} · ${esc(a.deptName)} · ${esc(gasShort(a.gas))}</span>
      </button></div>`;
  }

  // -------------------------------------------------------------- Übersicht
  function overviewHTML(){
    const admin=isAdmin();
    const flat=sensors();
    const totalNl=flat.reduce((a,m)=>a+rangeNl(m),0);
    const totalCost=flat.reduce((a,m)=>a+rangeNl(m)/1000*priceOf(m.gas),0);
    const facTrend=trendPct(flat);
    const liveFlow=flat.reduce((a,m)=>a+machineCurrent(m),0);
    const activeN=flat.filter(m=>machineCurrent(m)>0.3).length;
    const al=gasAlarms();
    const alAct=al.filter(a=>a.state!=='ack');
    const critN=alAct.filter(a=>a.level==='critical').length;
    const warnN=alAct.length-critN;

    // KPI-Zeile
    const consVal = S.unit==='m3'?fmtM3(totalNl):fmtNum(Math.round(totalCost),0)+' €';
    const costSplit = gasesList().map(g=>{
      const nl=flat.filter(m=>m.gas===g.id).reduce((a,m)=>a+rangeNl(m),0);
      return esc(g.name)+' '+esc(fmtNum(Math.round(nl/1000*priceOf(g.id)),0))+' €';
    }).join(' · ');
    const kpis =
      kpiCard(t('kCons',rangeShort()), esc(consVal),
        `<span style="color:${trendColor(facTrend)};font-weight:600">${esc(trendTxt(facTrend))}</span> ${esc(vsLabel())}`)
      + kpiCard(t('kCost'), esc(fmtNum(Math.round(totalCost),0)+' €'),
        costSplit || esc(t('kCostSub',(totalNl/1000).toFixed(0), S.gas==='all'?t('allGases'):gasName(S.gas))))
      + kpiCard(t('kLive'), esc(fmtNum(liveFlow,1))+' <span style="font-size:15px">Nl/min</span>',
        esc(t('kLiveSub',activeN,flat.length)), {color:'var(--brand)'})
      + kpiCard(t('kAlarms'), esc(String(alAct.length)),
        esc(t('kAlarmsSub',critN,warnN))+`<button class="btn-link" data-action="nav" data-hash="#/alarms">${esc(t('viewLink'))}</button>`,
        {color:alAct.length?'var(--danger)':'var(--good)'});

    // Trend-Chart: eine Serie je Abteilung (größte zuerst, Fläche unter der größten)
    const labels=labelsFor();
    const groups={};
    flat.forEach(m=>{ const k=m.deptId||'-'; (groups[k]=groups[k]||[]).push(m); });
    let series=Object.keys(groups).map(k=>{
      const ms=groups[k], vals=new Array(labels.length).fill(0);
      ms.forEach(m=>{ const b=bucketsFor(m); for(let i=0;i<labels.length;i++) vals[i]+=unitVal(b[i]||0,m.gas); });
      return {name:k==='-'?t('noDeptGroup'):deptNameOf(k), color:k==='-'?'#93a1b4':deptColor(k), vals,
              total:vals.reduce((a,b)=>a+b,0)};
    });
    series.sort((a,b)=>b.total-a.total);
    CHART={series, labels};
    const legend=series.map(s=>`<span style="white-space:nowrap"><span style="color:${s.color}">▬</span> ${esc(s.name)}</span>`).join('');
    const perLbl = S.range==='24h' ? t('trendPerHour', S.unit==='m3'?'m³':'€') : t('trendPerDay', S.unit==='m3'?'m³':'€');

    // Aktive Alarme (Karte rechts)
    const alRows = al.length ? al.map(a=>alarmRowHTML(a,admin)).join('')
      : `<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--good);padding:6px 2px"><span>✓</span> ${esc(t('noActiveAlarms'))}</div>`;

    // Abteilungs-Karten
    const deptCards = depts().map(d=>{
      const dm=flat.filter(m=>m.deptId===d.id);
      const nl=dm.reduce((a,m)=>a+rangeNl(m),0);
      const cost=dm.reduce((a,m)=>a+rangeNl(m)/1000*priceOf(m.gas),0);
      const act=dm.filter(m=>machineCurrent(m)>0.3).length;
      const gases=[...new Set(dm.map(m=>gasShort(m.gas)))].join('/')||'—';
      const dAl=alarms().filter(a=>dm.some(m=>m.id===a.sensor));
      const offN=dAl.filter(a=>a.type==='offline'&&a.state!=='ack').length;
      const alN=dAl.filter(a=>a.state!=='ack').length;
      let tag=`<span class="pill" style="color:var(--good);background:var(--good-bg)">${esc(t('okTag'))}</span>`, border='var(--border)';
      if(offN){ tag=`<span class="pill" style="color:var(--danger);background:var(--danger-bg)">${esc(t('offlineTag',offN))}</span>`; border='var(--danger-border2)'; }
      else if(alN){ tag=`<span class="pill" style="color:var(--warn);background:var(--warn-bg)">${esc(t('alarmTag',alN))}</span>`; border='var(--warn-border2)'; }
      const spark=new Array(14).fill(0);
      dm.forEach(m=>m.daily.slice(16).forEach((v,i)=>spark[i]+=v));
      const AM=ALERT_META();
      const worst=dAl.filter(a=>a.state!=='ack')[0];
      const note=worst?`<div style="font-size:11.5px;color:${levelColor(worst.level)};margin-top:10px;font-weight:600">${esc((AM[worst.type]||{title:worst.type}).title)}: ${esc(worst.sensorName)} · ${esc((AM[worst.type]||{val:v=>v}).val(worst.value))}</div>`:'';
      return `<div class="card click" data-action="nav" data-hash="#/dept/${encodeURIComponent(d.id)}" style="border-color:${border};cursor:pointer;padding:16px 20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px"><span style="font-size:14px;font-weight:700">${esc(d.name)}</span>${tag}</div>
        <div style="font-size:11.5px;color:var(--mute);margin-bottom:10px">${esc(t('deptCardSub',dm.length,act,gases))}</div>
        <div style="display:flex;align-items:flex-end;gap:22px">
          <div style="flex:none"><div style="font:600 26px var(--mono)">${esc(S.unit==='m3'?fmtM3(nl):fmtNum(Math.round(cost),0)+' €')}</div>
            <div style="font-size:11.5px;color:var(--dim);margin-top:3px">${esc(fmtNum(Math.round(cost),0))} € · ${esc(rangeShort())}</div></div>
          <div style="flex:1;min-width:0">${sparkSVG(spark, deptColor(d.id), 340, 44, 2)}</div>
        </div>${note}</div>`;
    }).join('');

    return `
      ${unassignedBanner()}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:16px;margin-bottom:18px">${kpis}</div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:18px">
        <div class="card card-chart" style="min-width:0">
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px;flex-wrap:wrap">
            <span style="font-size:14px;font-weight:700">${esc(t('trendTitle'))}</span>
            <span style="font-size:11.5px;color:var(--mute)">${esc(perLbl)} · ${esc(rangeLong())}</span>
            <span style="margin-left:auto;display:flex;gap:14px;font-size:11.5px;color:var(--dim);flex-wrap:wrap">${legend}</span></div>
          <div id="chart-host" style="min-width:0">${lineChartSVG()}</div>
        </div>
        <div class="card" style="display:flex;flex-direction:column;min-width:0">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:11px">
            <span class="card-title">${esc(t('alarmsCard'))}</span>
            <button class="btn-link" data-action="nav" data-hash="#/alarms">${esc(t('historyLink'))}</button></div>
          <div style="display:flex;flex-direction:column;gap:8px;overflow-y:auto">${alRows}</div>
        </div>
      </div>
      ${deptCards?`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px;margin-bottom:18px">${deptCards}</div>`:''}
      ${machinesTableHTML(flat, true)}`;
  }

  function unassignedBanner(){
    const naN=unassigned().length;
    if(!naN) return '';
    const txt=(naN>1?t('unassignedN',naN):t('unassigned1'))+(isAdmin()?t('unassignedGo'):t('unassignedInfo'));
    return isAdmin()
      ? `<button data-action="nav" data-hash="#/admin/sensors" style="display:block;width:100%;text-align:left;background:var(--warn-bg2);border:1px solid var(--warn-border);border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12.5px;color:var(--warn);cursor:pointer;font-weight:600">${esc(txt)}</button>`
      : `<div style="background:var(--warn-bg2);border:1px solid var(--warn-border);border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12.5px;color:var(--warn);font-weight:600">${esc(txt)}</div>`;
  }

  // Anlagen-Tabelle (Übersicht, Anlagen-Bildschirm, Abteilungs-Detail)
  function machinesTableHTML(list, withDept){
    const dir=S.sortDir==='asc'?1:-1;
    let rows=list.map(m=>{ const consNl=rangeNl(m), cur=machineCurrent(m), tr=trendPct([m]);
      return {m,consNl,cur,tr,st:statusOf(m)}; });
    rows.sort((a,b)=>{ let x,y; switch(S.sortKey){
      case'name':x=a.m.name;y=b.m.name;return x<y?-dir:x>y?dir:0;
      case'gas':x=a.m.gas||'';y=b.m.gas||'';return x<y?-dir:x>y?dir:0;
      case'dept':x=a.m.deptName;y=b.m.deptName;return x<y?-dir:x>y?dir:0;
      case'status':x=a.m.anomaly?2:(a.cur>0.3?1:0);y=b.m.anomaly?2:(b.cur>0.3?1:0);break;
      case'flow':x=a.cur;y=b.cur;break; case'trend':x=a.tr;y=b.tr;break;
      default:x=a.consNl;y=b.consNl; } return (x-y)*dir; });
    const onlineN=list.filter(m=>m.status==='online').length;
    const cols=[['status',t('thStatus'),''],['name',t('thMachine'),''],['gas',t('thGas'),'']]
      .concat(withDept?[['dept',t('thDept'),'']]:[])
      .concat([['flow',t('thFlow'),'r'],['cons',t('thCons'),'r'],['cost',t('thCost'),'r'],['trend',t('thTrend'),'r']]);
    const ths=cols.map(c=>{ const arrow=S.sortKey===c[0]?(S.sortDir==='asc'?' ↑':' ↓'):'';
      return `<th class="sort ${c[2]}" data-action="sort" data-key="${c[0]}">${esc(c[1])}${arrow}</th>`; }).join('')
      + `<th class="r">${esc(t('th14d'))}</th>`;
    const trs=rows.map(r=>{ const m=r.m;
      const noteIco=m.note?` <span title="${esc(m.note)}" style="cursor:help;font-size:11px">📝</span>`:'';
      return `<tr class="click" data-action="nav" data-hash="#/machine/${encodeURIComponent(m.id)}">
        <td style="white-space:nowrap"><span style="display:inline-flex;align-items:center;gap:7px;font:600 10.5px var(--mono);color:${r.st.color}"><span style="width:8px;height:8px;border-radius:50%;background:${r.st.color};animation:${r.st.anim}"></span>${esc(r.st.label)}</span></td>
        <td style="font-size:12.5px;font-weight:600;white-space:nowrap">${esc(m.name)}${noteIco}</td>
        <td style="font-size:11.5px;color:var(--dim)">${esc(gasShort(m.gas))}</td>
        ${withDept?`<td style="font-size:11.5px;color:var(--dim);white-space:nowrap">${esc(m.deptName)}</td>`:''}
        <td class="r mono" style="font-weight:500">${esc(fmtNum(r.cur,1))}</td>
        <td class="r mono" style="font-weight:600">${esc(fmtUnitVal(rangeUnit(m)))}</td>
        <td class="r mono" style="font-weight:500;color:var(--dim)">${esc(fmtEurNl(r.consNl,m.gas))}</td>
        <td class="r mono" style="font-weight:600;color:${trendColor(r.tr)};white-space:nowrap">${esc(trendTxt(r.tr))}</td>
        <td class="r" style="padding-top:6px;padding-bottom:6px">${sparkSVG(m.daily.slice(16),r.st.color)}</td></tr>`;
    }).join('');
    const empty=`<tr><td colspan="${cols.length+1}" style="padding:22px 20px;color:var(--mute);font-size:12.5px">${esc(t('noSensorsYet'))}</td></tr>`;
    return `<div class="card card-table">
      <div style="display:flex;align-items:baseline;gap:10px;padding:14px 20px 10px;flex-wrap:wrap">
        <span style="font-size:14px;font-weight:700">${esc(t('machinesCard'))}</span>
        <span style="font-size:11.5px;color:var(--mute)">${esc(t('unitsOnline',list.length,onlineN))}</span>
        <span style="margin-left:auto;font-size:11.5px;color:var(--mute)">${esc(t('rowHint'))}</span></div>
      <div style="overflow-x:auto"><table class="tbl" style="min-width:${withDept?820:720}px">
        <thead><tr>${ths}</tr></thead><tbody>${trs||empty}</tbody></table></div>
    </div>`;
  }

  // ------------------------------------------------------------ Abteilungen
  function departmentsHTML(){
    const flat=sensors();
    const cards = depts().map(d=>deptCardBig(d, flat.filter(m=>m.deptId===d.id))).join('');
    const orphans=flat.filter(m=>!m.deptId);
    const orphanCard = orphans.length?deptCardBig({id:'-',name:t('noDeptGroup')}, orphans):'';
    return `${unassignedBanner()}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px">${cards}${orphanCard}
      ${!cards&&!orphanCard?`<div class="card" style="color:var(--mute);font-size:12.5px">${esc(t('noSensorsYet'))}</div>`:''}</div>`;
  }
  function deptCardBig(d, dm){
    const nl=dm.reduce((a,m)=>a+rangeNl(m),0);
    const cost=dm.reduce((a,m)=>a+rangeNl(m)/1000*priceOf(m.gas),0);
    const act=dm.filter(m=>machineCurrent(m)>0.3).length;
    const gases=[...new Set(dm.map(m=>gasShort(m.gas)))].join('/')||'—';
    const dAl=alarms().filter(a=>dm.some(m=>m.id===a.sensor)&&a.state!=='ack');
    const offN=dAl.filter(a=>a.type==='offline').length;
    let tag=`<span class="pill" style="color:var(--good);background:var(--good-bg)">${esc(t('okTag'))}</span>`, border='var(--border)';
    if(offN){ tag=`<span class="pill" style="color:var(--danger);background:var(--danger-bg)">${esc(t('offlineTag',offN))}</span>`; border='var(--danger-border2)'; }
    else if(dAl.length){ tag=`<span class="pill" style="color:var(--warn);background:var(--warn-bg)">${esc(t('alarmTag',dAl.length))}</span>`; border='var(--warn-border2)'; }
    const spark=new Array(14).fill(0);
    dm.forEach(m=>m.daily.slice(16).forEach((v,i)=>spark[i]+=v));
    return `<div class="card click" data-action="nav" data-hash="#/dept/${encodeURIComponent(d.id)}" style="border-color:${border};cursor:pointer;padding:16px 20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px"><span style="font-size:14px;font-weight:700">${esc(d.name)}</span>${tag}</div>
      <div style="font-size:11.5px;color:var(--mute);margin-bottom:10px">${esc(t('deptCardSub',dm.length,act,gases))}</div>
      <div style="display:flex;align-items:flex-end;gap:22px">
        <div style="flex:none"><div style="font:600 26px var(--mono)">${esc(S.unit==='m3'?fmtM3(nl):fmtNum(Math.round(cost),0)+' €')}</div>
          <div style="font-size:11.5px;color:var(--dim);margin-top:3px">${esc(fmtNum(Math.round(cost),0))} € · ${esc(rangeShort())}</div></div>
        <div style="flex:1;min-width:0">${sparkSVG(spark, deptColor(d.id==='-'?null:d.id), 340, 44, 2)}</div>
      </div></div>`;
  }

  // ------------------------------------------------------- Abteilungs-Detail
  function deptDetailHTML(id){
    const isNone=id==='-';
    const d=isNone?{id:'-',name:t('noDeptGroup')}:depts().find(x=>x.id===id);
    if(!d) return `<div class="card" style="color:var(--mute)">${esc(t('unknownMachine'))}</div>`;
    const flat=sensors();
    const dm=flat.filter(m=>isNone?!m.deptId:m.deptId===id);
    const nl=dm.reduce((a,m)=>a+rangeNl(m),0);
    const cost=dm.reduce((a,m)=>a+rangeNl(m)/1000*priceOf(m.gas),0);
    const tr=trendPct(dm);
    const live=dm.reduce((a,m)=>a+machineCurrent(m),0);
    const act=dm.filter(m=>machineCurrent(m)>0.3).length;
    const totalAll=flat.reduce((a,m)=>a+rangeNl(m),0);
    const share=totalAll>0?Math.round(nl/totalAll*100):0;

    const kpis =
      kpiCard(t('kCons',rangeShort()), esc(S.unit==='m3'?fmtM3(nl):fmtNum(Math.round(cost),0)+' €'),
        `<span style="color:${trendColor(tr)};font-weight:600">${esc(trendTxt(tr))}</span> ${esc(vsLabel())}`)
      + kpiCard(t('kCost'), esc(fmtNum(Math.round(cost),0)+' €'), esc(t('kCostSub',(nl/1000).toFixed(0), S.gas==='all'?t('allGases'):gasName(S.gas))))
      + kpiCard(t('kLive'), esc(fmtNum(live,1))+' <span style="font-size:15px">Nl/min</span>', esc(t('kLiveSub',act,dm.length)), {color:'var(--brand)'})
      + kpiCard(t('deptShare'), esc(share+'%'), esc(t('deptShareSub',rangeShort())));

    const labels=labelsFor();
    const vals=new Array(labels.length).fill(0);
    dm.forEach(m=>{ const b=bucketsFor(m); for(let i=0;i<labels.length;i++) vals[i]+=unitVal(b[i]||0,m.gas); });
    CHART={series:[{name:d.name, color:deptColor(isNone?null:id), vals}], labels};
    const perLbl = S.range==='24h' ? t('trendPerHour', S.unit==='m3'?'m³':'€') : t('trendPerDay', S.unit==='m3'?'m³':'€');

    const byM=[...dm].sort((a,b)=>rangeNl(b)-rangeNl(a));
    const maxM=Math.max(1e-9,...byM.map(m=>rangeNl(m)));
    const bars=byM.map(m=>{
      const alertC = m.anomaly ? levelColor(m.anomaly.level) : deptColor(isNone?null:id);
      return `<div data-action="nav" data-hash="#/machine/${encodeURIComponent(m.id)}" style="display:flex;align-items:center;gap:10px;cursor:pointer">
        <span style="width:118px;font-size:11px;color:var(--dim);flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.name)}</span>
        <div style="flex:1;height:9px;border-radius:5px;background:var(--divider);overflow:hidden"><div style="height:100%;border-radius:5px;background:${alertC};width:${Math.round(rangeNl(m)/maxM*100)}%"></div></div>
        <span style="width:52px;text-align:right;font:600 11px var(--mono);flex:none">${esc(fmtUnitVal(rangeUnit(m)))}</span></div>`;
    }).join('');

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:16px;margin-bottom:18px">${kpis}</div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:18px">
        <div class="card card-chart" style="min-width:0">
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px"><span style="font-size:14px;font-weight:700">${esc(t('trendTitle'))}</span>
            <span style="font-size:11.5px;color:var(--mute)">${esc(perLbl)} · ${esc(d.name)}</span></div>
          <div id="chart-host" style="min-width:0">${lineChartSVG()}</div>
        </div>
        <div class="card" style="min-width:0">
          <div class="card-title" style="margin-bottom:12px">${esc(t('byMachine'))} <span style="font-size:11px;color:var(--mute);font-weight:400">· ${esc(rangeShort())}</span></div>
          <div style="display:flex;flex-direction:column;gap:8px">${bars||`<span style="font-size:12px;color:var(--mute)">${esc(t('noMachines'))}</span>`}</div>
        </div>
      </div>
      ${machinesTableHTML(dm, false)}`;
  }

  // ---------------------------------------------------------- Anlagen-Detail
  function machineBannerHTML(a, m){
    const admin=isAdmin();
    const crit=a.level==='critical';
    const bd=crit?'var(--danger-border)':'var(--warn-border)';
    const bg=crit?'var(--danger-bg2)':'var(--warn-bg2)';
    const tc=crit?'#7f1d1d':'#92600a';
    let head='', detail='';
    const since=fmtDT(a.raised_at);
    if(a.type==='leak'){ head=t('alLeakBanner'); detail=t('alLeakBanner2', fmtNum(a.value,1), gasName(m.gas), since, fmtNum((m.rules&&m.rules.leak&&m.rules.leak.min)||0,1)); }
    else if(a.type==='offline'){ head=t('alOfflineBanner'); detail=t('alOfflineBanner2', since, ago(m.lastSeen)); }
    else if(a.type==='over'){ head=t('alOverBanner'); detail=t('alOverBanner2', Math.round(a.value*100), since); }
    else { head=t('alDownBanner'); detail=t('alDownBanner2', fmtM3(a.value), since); }
    const ackTag=a.state==='ack'?` <span class="pill" style="color:var(--warn);background:var(--warn-bg)">${esc(t('stateAck'))}</span>`:'';
    const btns=admin?`
      ${a.state==='active'?`<button class="btn" data-action="alarm-ack" data-id="${a.id}" title="${esc(t('ackTip'))}" style="color:${tc}">${esc(t('btnAck'))}</button>`:''}
      <button class="btn-primary" data-action="alarm-resolve" data-id="${a.id}" title="${esc(t('resolveTip'))}">${esc(t('btnResolve'))}</button>`:'';
    return `<div style="display:flex;gap:12px;align-items:center;border:1px solid ${bd};background:${bg};border-radius:10px;padding:12px 16px;margin-bottom:16px;flex-wrap:wrap">
      <span style="font-size:16px">⚠</span>
      <div style="flex:1;min-width:220px"><span style="font-size:13px;font-weight:700;color:${tc}">${esc(head)}</span>${ackTag}
        <span style="font-size:12.5px;color:var(--dim)"> ${esc(detail)}</span></div>
      ${btns}</div>`;
  }

  function machineDetailHTML(id){
    const m=allSensors().find(x=>x.id===id);
    if(!m) return `<div class="card" style="font-size:12.5px;color:var(--mute)">${esc(t('unknownMachine'))}
      <button class="btn-link" data-action="nav" data-hash="#/overview" style="margin-left:8px">${esc(t('backOverview'))}</button></div>`;
    const admin=isAdmin();
    const mAlarms=alarms().filter(a=>a.sensor===id);
    const banners=mAlarms.map(a=>machineBannerHTML(a,m)).join('');
    const st=statusOf(m);

    // KPI-Zeile
    const todayNl=m.hourly.reduce((a,b)=>a+b,0);
    const d7=m.daily.slice(23).reduce((a,b)=>a+b,0);
    const d7tr=(()=>{ const prev=m.daily.slice(16,23).reduce((a,b)=>a+b,0); return prev>0?(d7-prev)/prev*100:0; })();
    const leakAl=mAlarms.find(a=>a.type==='leak');
    const liveColor=leakAl?'var(--warn)':(machineCurrent(m)>0.3?'var(--brand)':'var(--text)');
    const liveSub=leakAl?`<span style="color:var(--warn);font-weight:600">${esc(t('machineIdle'))}</span>`
      :`${esc(st.label)} · ${esc(t('lastMsg',ago(m.lastSeen)))}`;
    const kpis =
      kpiCard(t('kLive'), esc(fmtNum(machineCurrent(m),1))+' <span style="font-size:15px">Nl/min</span>', liveSub,
        {color:liveColor, border:leakAl?'var(--warn-border2)':null})
      + kpiCard(t('kToday'), esc(fmtM3(todayNl)), esc(fmtEurNl(todayNl,m.gas))+' · '+esc(gasName(m.gas)))
      + kpiCard(t('kLast7'), esc(fmtM3(d7)),
        esc(fmtEurNl(d7,m.gas))+` · <span style="color:${trendColor(d7tr)};font-weight:600">${esc(trendTxt(d7tr))}</span> ${esc(t('vs7'))}`)
      + kpiCard(t('kTotalCtr'), esc(fmtM3(m.total)), esc(t('sinceReset'))+' · '+esc(t('lastMsg',ago(m.lastSeen))));

    // Chart: 24h = Ø Nl/min je Stunde (Balken); 7d/30d = m³/Tag (Balken)
    const barColor=leakAl?'var(--warn)':'var(--brand)';
    let chartTitle, chartSub, chartHtml;
    if(S.range==='24h'){
      const vals=(m.hourly24||m.hourly).map(nl=>nl/60);      // Nl/h -> Ø Nl/min
      chartTitle=t('flowChart24'); chartSub=t('flowChartSub24');
      chartHtml=barsHTML(vals, labelsFor(), barColor, 170, v=>fmtNum(v,2)+' Nl/min');
    }else{
      const vals=bucketsFor(m).map(nl=>unitVal(nl,m.gas));
      chartTitle=t('consChart',rangeLong()); chartSub=t('consChartSub', S.unit==='m3'?'m³':'€');
      chartHtml=barsHTML(vals, labelsFor(), barColor, 170, v=>fmtUnitVal(v));
    }

    // Alarm-Historie dieser Anlage
    const AM=ALERT_META();
    const hist=(HIST||[]).filter(a=>a.sensor===id).slice(0,8);
    const histRows=hist.map(a=>{
      const meta=AM[a.type]||{title:a.type,val:v=>String(v)};
      const stateTxt=a.state==='resolved'?(a.auto_cleared?t('stateResolved')+' ('+t('autoTag')+')':t('stateResolved'))
        :a.state==='ack'?t('stateAck'):t('stateActive');
      const stateC=a.state==='resolved'?'var(--mute)':a.state==='ack'?'var(--warn)':'var(--danger)';
      return `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--divider)">
        <span style="width:8px;height:8px;border-radius:50%;background:${levelColor(a.level)};flex:none"></span>
        <span style="font-size:12.5px;font-weight:600;width:170px;flex:none">${esc(meta.title)}</span>
        <span style="font-size:12px;color:var(--dim);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(fmtDT(a.raised_at))} · <span style="color:${stateC};font-weight:600">${esc(stateTxt)}</span></span>
        <span style="font:600 12px var(--mono);color:${levelColor(a.level)};flex:none">${esc(meta.val(a.value))}</span></div>`;
    }).join('');

    // Info-Karten rechts
    const meta=m.meta||{};
    const infoRow=(k,v)=>`<div style="display:flex;justify-content:space-between;gap:12px"><span style="color:var(--mute)">${esc(k)}</span><span style="font-weight:600;text-align:right;min-width:0;overflow:hidden;text-overflow:ellipsis">${v}</span></div>`;
    const infoCard=`<div class="card">
      <div class="card-title" style="margin-bottom:12px">${esc(t('machInfo'))}</div>
      <div style="display:flex;flex-direction:column;gap:9px;font-size:12px">
        ${infoRow(t('infoDept'), `<button class="btn-link" data-action="nav" data-hash="#/dept/${encodeURIComponent(m.deptId||'-')}" style="font-size:12px">${esc(m.deptName)}</button>`)}
        ${infoRow(t('infoGas'), esc(gasName(m.gas))+' ('+esc(fmtNum(priceOf(m.gas),2))+' €/m³)')}
        ${infoRow(t('infoSensor'), `<span class="mono" style="font-size:11.5px">${esc(m.id)}</span>`)}
        ${infoRow(t('infoTopic'), `<span class="mono" style="font-size:11px">iwb/gas/${esc(m.id)}</span>`)}
        ${meta.ip?infoRow(t('infoDevice'), `<a href="http://${esc(meta.ip)}/" target="_blank" rel="noopener" class="mono" style="font-size:11.5px" title="${esc(t('deviceTip'))}">${esc(meta.ip)} ↗</a>`):''}
        ${meta.mac?infoRow('MAC', `<span class="mono" style="font-size:11px">${esc(meta.mac)}</span>`):''}
        ${meta.fw?infoRow(t('infoFw'), esc(meta.fw)):''}
        ${meta.sp!=null?infoRow(t('infoSp'), `<span class="mono" style="font-size:11.5px">${esc(fmtNum(meta.sp,3))} Nl/Puls</span>`):''}
        ${infoRow(t('thStatus'), `<span style="color:${st.color};font-weight:600">${esc(st.label)}</span>`)}
      </div></div>`;

    const rules=m.rules||{};
    const leak=rules.leak||{min:0,active:0};
    const dt=rules.downtime||{};
    const thrCard=`<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px">
        <span class="card-title">${esc(t('thresholds'))}</span>
        ${admin?`<button class="btn-link" data-action="admin-edit-sensor" data-id="${esc(m.id)}">${esc(t('editLink'))}</button>`:''}</div>
      <div style="display:flex;flex-direction:column;gap:9px;font-size:12px">
        <div style="display:flex;justify-content:space-between"><span style="color:var(--mute)">${esc(t('thrIdle'))}</span><span class="mono" style="font-weight:600;color:var(--warn)">${esc(fmtNum(leak.min,1))}–${esc(fmtNum(leak.active,1))} Nl/min</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--mute)">${esc(t('thrDt'))}</span><span class="mono" style="font-weight:600">${dt.enabled?esc(fmtNum(dt.max_nl,0))+' Nl':esc(t('thrDtOff'))}</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--mute)">${esc(t('thrOffline'))}</span><span class="mono" style="font-weight:600">${DATA.offlineAlarmMinutes?esc(fmtNum(DATA.offlineAlarmMinutes,0))+' min':'—'}</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--mute)">${esc(t('thrOver'))}</span><span class="mono" style="font-weight:600">${esc(t('thrOverVal'))}</span></div>
        <div style="border-top:1px solid var(--divider);padding-top:9px;color:var(--mute);font-size:11px">${esc((rules.leakCustom||rules.downtimeCustom)?t('thrCustom'):t('thrDefault'))}</div>
      </div></div>`;

    const noteCard=`<div class="card">
      <div class="card-title" style="margin-bottom:10px">${esc(t('noteCard'))} 📝</div>
      ${admin?`<textarea id="mach-note" rows="3" class="inp" placeholder="${esc(t('notePlaceholder'))}" style="resize:vertical">${esc(m.note||'')}</textarea>
        <div style="display:flex;gap:9px;align-items:center;margin-top:9px">
          <button class="btn" data-action="mach-note-save" data-id="${esc(m.id)}">${esc(t('noteSave'))}</button>
          <span id="mach-note-msg" style="font-size:11.5px;font-weight:600;color:var(--good)"></span></div>`
      : `<div style="font-size:12.5px;color:${m.note?'var(--text)':'var(--mute)'};white-space:pre-wrap">${esc(m.note||t('noteEmpty'))}</div>`}
    </div>`;

    return `${banners}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:16px;margin-bottom:18px">${kpis}</div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px">
        <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
          <div class="card card-chart">
            <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:14px;flex-wrap:wrap">
              <span style="font-size:14px;font-weight:700">${esc(chartTitle)}</span>
              <span style="font-size:11.5px;color:var(--mute)">${esc(chartSub)}</span></div>
            ${chartHtml}
          </div>
          <div class="card" style="padding:16px 20px">
            <div style="font-size:14px;font-weight:700;margin-bottom:10px">${esc(t('machAlarmHist'))}</div>
            <div style="display:flex;flex-direction:column">${histRows||`<span style="font-size:12px;color:var(--mute)">${esc(t('noMachAlarms'))}</span>`}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
          ${infoCard}${thrCard}${noteCard}
        </div>
      </div>`;
  }

  // ----------------------------------------------------------------- Alarme
  function alarmDetailText(a){
    const AM=ALERT_META();
    return (AM[a.type]||{detail:_=>''}).detail(a.value);
  }
  function alarmsScreenHTML(){
    const admin=isAdmin();
    const AM=ALERT_META();
    const act=alarms().filter(a=>a.state==='active');
    const ack=alarms().filter(a=>a.state==='ack');
    const hist=HIST||[];
    let rows;
    if(S.alarmFilter==='active') rows=hist.filter(a=>a.state==='active');
    else if(S.alarmFilter==='ack') rows=hist.filter(a=>a.state==='ack');
    else if(S.alarmFilter==='resolved') rows=hist.filter(a=>a.state==='resolved');
    else rows=hist;

    const sevPill=l=>l==='critical'
      ?`<span class="pill" style="color:var(--danger);background:var(--danger-bg)">${esc(t('sevCrit'))}</span>`
      :`<span class="pill" style="color:var(--warn);background:var(--warn-bg)">${esc(t('sevWarn'))}</span>`;
    const stateTxt=a=>{
      if(a.state==='resolved') return `<span class="mono" style="font-weight:600;font-size:10px;color:var(--mute)">${esc(t('stateResolved'))}${a.auto_cleared?' · '+esc(t('autoTag')):''}</span>`;
      if(a.state==='ack') return `<span class="mono" style="font-weight:600;font-size:10px;color:var(--warn)">${esc(t('stateAck'))}</span>`;
      return `<span class="mono" style="font-weight:600;font-size:10px;color:var(--danger)">${esc(t('stateActive'))}</span>`;
    };
    const nowS=Math.round(Date.now()/1000);
    const trs=rows.map(a=>{
      const meta=AM[a.type]||{title:a.type,val:v=>String(v)};
      const end=a.state==='resolved'?(a.resolved_at||a.ack_at||a.raised_at):nowS;
      const acts=admin&&a.state!=='resolved'
        ?`${a.state==='active'?`<button class="btn-link gray" data-action="alarm-ack" data-id="${a.id}" style="margin-right:12px">${esc(t('btnAck'))}</button>`:''}
          <button class="btn-link" data-action="alarm-resolve" data-id="${a.id}">${esc(t('btnResolve'))}</button>`:'';
      return `<tr>
        <td>${sevPill(a.level)}</td>
        <td style="font-size:12.5px;font-weight:600;white-space:nowrap">${esc(meta.title)}</td>
        <td style="white-space:nowrap"><button class="btn-link" data-action="nav" data-hash="#/machine/${encodeURIComponent(a.sensor)}" style="font-size:12px">${esc(a.sensorName)}</button></td>
        <td style="font-size:12px;color:var(--dim);white-space:nowrap">${esc(a.deptName)}</td>
        <td class="mono" style="font-size:11.5px;color:var(--dim);white-space:nowrap">${esc(fmtDT(a.raised_at))}</td>
        <td class="r mono" style="font-weight:600;font-size:11.5px">${esc(fmtDur(Math.max(0,end-a.raised_at)))}</td>
        <td style="font-size:12px;color:var(--dim)">${esc(alarmDetailText(a))} · <span class="mono">${esc(meta.val(a.value))}</span></td>
        <td>${stateTxt(a)}</td>
        <td class="r" style="white-space:nowrap">${acts}</td></tr>`;
    }).join('');
    const empty=`<tr><td colspan="9" style="padding:22px 20px;color:var(--mute);font-size:12.5px">${esc(t('noAlarmsFilter'))}</td></tr>`;

    // Fußzeilen-Statistiken (letzte 30 Tage, aus der Historie)
    const d30=nowS-30*86400;
    const h30=hist.filter(a=>a.raised_at>=d30);
    const crit30=h30.filter(a=>a.level==='critical').length;
    const res30=h30.filter(a=>a.state==='resolved'&&a.resolved_at);
    const auto30=res30.filter(a=>a.auto_cleared).length;
    const mttrS=res30.length?res30.reduce((s,a)=>s+Math.max(0,a.resolved_at-a.raised_at),0)/res30.length:null;
    const leak30=h30.filter(a=>a.type==='leak');
    let wasteEur=0;
    leak30.forEach(a=>{
      const end=a.state==='resolved'?(a.resolved_at||nowS):nowS;
      const mins=Math.max(0,end-a.raised_at)/60;
      wasteEur += (a.value||0)*mins/1000*priceOf(a.gas);   // Nl/min × min -> Nl -> m³ × €/m³
    });
    const stats=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:16px;margin-top:18px">
      ${kpiCard(t('st30'), esc(String(h30.length)), esc(t('st30Sub',crit30,h30.length-crit30)))}
      ${kpiCard(t('mttr'), esc(mttrS!=null?fmtDur(mttrS):'—'), esc(t('mttrSub',auto30,res30.length-auto30)))}
      ${kpiCard(t('waste'), esc(leak30.length?'≈ '+fmtNum(Math.round(wasteEur),0)+' €':'0 €'),
        esc(leak30.length?t('wasteSub'):t('wasteNone')), {color:leak30.length?'var(--warn)':undefined})}
    </div>`;

    return `<div class="card card-table">
      <div style="overflow-x:auto"><table class="tbl" style="min-width:900px">
        <thead><tr><th>${esc(t('thSeverity'))}</th><th>${esc(t('thType'))}</th><th>${esc(t('thMachine'))}</th><th>${esc(t('thDept'))}</th>
          <th>${esc(t('thStarted'))}</th><th class="r">${esc(t('thDuration'))}</th><th>${esc(t('thDetail'))}</th><th>${esc(t('thState'))}</th><th class="r">${esc(t('thActions'))}</th></tr></thead>
        <tbody>${trs||empty}</tbody></table></div>
      </div>${stats}`;
  }

  function exportAlarmLog(){
    const AM=ALERT_META();
    const rows=(HIST||[]).map(a=>{
      const meta=AM[a.type]||{title:a.type,val:v=>String(v)};
      const state=a.state==='resolved'?(a.auto_cleared?'resolved(auto)':'resolved'):a.state;
      return [fmtDT(a.raised_at), a.sensorName, a.deptName, gasShort(a.gas), meta.title,
              a.level, String(a.value).replace('.',','), state, a.resolved_at?fmtDT(a.resolved_at):''].map(v=>{
        v=String(v??''); return /[;"\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }).join(';');
    });
    const head='Beginn;Anlage;Abteilung;Gas;Typ;Stufe;Wert;Status;Aufgeloest';
    const blob=new Blob(['﻿'+[head].concat(rows).join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='alarm-log_'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  }

  // --------------------------------------------------------------- Berichte
  const monthLabel = ym => {
    const [y,mo]=ym.split('-').map(Number);
    return new Date(y,mo-1,1).toLocaleDateString(numLocale(),{month:'long',year:'numeric'});
  };
  const monthCost = m => Object.entries(m.per_gas).reduce((s,[g,nl])=>s+nl/1000*priceOf(g),0);
  function reportsHTML(){
    const months=(MONTHLY&&MONTHLY.months)||[];
    if(!months.length) return `<div class="card" style="font-size:12.5px;color:var(--mute)">${esc(t('noReportData'))}</div>`;
    const curYm=(()=>{const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');})();
    const year=curYm.slice(0,4);
    const ytdM=months.filter(m=>m.ym.startsWith(year));
    const ytdNl=ytdM.reduce((s,m)=>s+m.total_nl,0);
    const ytdCost=ytdM.reduce((s,m)=>s+monthCost(m),0);
    const fullM=ytdM.filter(m=>m.ym!==curYm);
    const avgBase=fullM.length?fullM:ytdM;
    const avgNl=avgBase.reduce((s,m)=>s+m.total_nl,0)/avgBase.length;
    const avgCost=avgBase.reduce((s,m)=>s+monthCost(m),0)/avgBase.length;
    const gasTotals={};
    ytdM.forEach(m=>Object.entries(m.per_gas).forEach(([g,nl])=>{ gasTotals[g]=(gasTotals[g]||0)+nl; }));
    const topGas=Object.entries(gasTotals).sort((a,b)=>b[1]-a[1])[0];
    const gasSplitVal=topGas&&ytdNl>0?gasShort(topGas[0])+' '+Math.round(topGas[1]/ytdNl*100)+'%':'—';
    const gasSplitSub=Object.entries(gasTotals).map(([g,nl])=>esc(gasName(g))+' '+esc(fmtNum(nl/1000,0))+' m³').join(' · ')||'—';
    const allNl=months.reduce((s,m)=>s+m.total_nl,0);
    const firstYm=months[months.length-1].ym;

    const kpis =
      kpiCard(t('ytd',year), esc(fmtNum(ytdNl/1000, ytdNl/1000<100?1:0)+' m³'), esc(t('ytdSub',fmtNum(Math.round(ytdCost),0))))
      + kpiCard(t('mavg'), esc(fmtNum(avgNl/1000, avgNl/1000<100?1:0)+' m³'), esc(t('mavgSub',fmtNum(Math.round(avgCost),0))))
      + kpiCard(t('gasSplitK',year), esc(gasSplitVal), gasSplitSub)
      + kpiCard(t('sinceStart'), esc(fmtNum(allNl/1000, allNl/1000<100?1:0)+' m³'), esc(t('sinceSub',monthLabel(firstYm))));

    const gases=gasesList();
    const gasThs=gases.map(g=>`<th class="r">${esc(gasShort(g.id))} m³</th>`).join('');
    const trs=months.map((m,i)=>{
      const prev=months[i+1];
      const isCur=m.ym===curYm;
      let delta='<span style="color:var(--mute)">—</span>';
      if(prev&&!isCur&&prev.total_nl>0){
        const p=(m.total_nl-prev.total_nl)/prev.total_nl*100;
        delta=`<span style="color:${trendColor(p)};font-weight:600">${esc(trendTxt(p))}</span>`;
      }
      const [y,mo]=m.ym.split('-').map(Number);
      const lastDay=new Date(y,mo,0).getDate();
      const csv=`api/export.csv?scope=total&res=day&start=${m.ym}-01&end=${m.ym}-${String(lastDay).padStart(2,'0')}`;
      const gasTds=gases.map(g=>`<td class="r mono" style="color:var(--dim)">${esc(fmtNum((m.per_gas[g.id]||0)/1000,1))}</td>`).join('');
      return `<tr>
        <td style="font-size:12.5px;font-weight:600;white-space:nowrap">${esc(monthLabel(m.ym))}${isCur?' <span style="color:var(--mute);font-weight:400">'+esc(t('mtd'))+'</span>':''}</td>
        <td class="r mono" style="font-weight:600">${esc(fmtNum(m.total_nl/1000,1))}</td>
        ${gasTds}
        <td class="r mono" style="font-weight:600">${esc(fmtNum(Math.round(monthCost(m)),0))} €</td>
        <td class="r mono">${delta}</td>
        <td class="r"><a href="${csv}" style="font-size:11.5px;font-weight:600">CSV</a></td></tr>`;
    }).join('');

    // Kosten je Abteilung (YTD)
    const deptCost={};
    ytdM.forEach(m=>Object.entries(m.per_dept_gas||{}).forEach(([d,gg])=>{
      Object.entries(gg).forEach(([g,nl])=>{ deptCost[d]=(deptCost[d]||0)+nl/1000*priceOf(g); });
    }));
    const maxDC=Math.max(1e-9,...Object.values(deptCost));
    const deptRows=Object.entries(deptCost).sort((a,b)=>b[1]-a[1]).map(([did,c])=>`
      <div><div style="display:flex;justify-content:space-between;margin-bottom:5px">
        <span style="font-weight:600;font-size:12px">${esc(did?deptNameOf(did):t('noDeptGroup'))}</span>
        <span class="mono" style="font-weight:600;font-size:12px">${esc(fmtNum(Math.round(c),0))} €</span></div>
      <div style="height:9px;border-radius:5px;background:var(--divider);overflow:hidden">
        <div style="height:100%;width:${Math.round(c/maxDC*100)}%;background:${deptColor(did||null)};border-radius:5px"></div></div></div>`).join('');

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:16px;margin-bottom:18px">${kpis}</div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px">
        <div class="card card-table" style="align-self:start">
          <div style="display:flex;align-items:baseline;gap:10px;padding:14px 20px 10px">
            <span style="font-size:14px;font-weight:700">${esc(t('monthly'))}</span>
            <span style="font-size:11.5px;color:var(--mute)">${esc(t('monthlySub'))}</span></div>
          <div style="overflow-x:auto"><table class="tbl" style="min-width:560px">
            <thead><tr><th>${esc(t('thMonth'))}</th><th class="r">${esc(t('thTotalM3'))}</th>${gasThs}<th class="r">${esc(t('thCost'))}</th><th class="r">${esc(t('thVsPrev'))}</th><th class="r">CSV</th></tr></thead>
            <tbody>${trs}</tbody></table></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card">
            <div class="card-title" style="margin-bottom:12px">${esc(t('costByDept',year))}</div>
            <div style="display:flex;flex-direction:column;gap:11px">${deptRows||`<span style="font-size:12px;color:var(--mute)">—</span>`}</div>
          </div>
          <div class="card">
            <div class="card-title" style="margin-bottom:12px">${esc(t('exportCard'))}</div>
            ${exportFormHTML('rep')}
          </div>
        </div>
      </div>`;
  }

  // --------------------------------------------------------------- TV-Modus
  const TV_COLORS=['#34e2a6','#46c6ff','#c792ff','#ffb547'];
  function tvHTML(){
    const flat=allSensors();
    const onlineN=flat.filter(m=>m.status==='online').length;
    const d=new Date(S.now);
    const gases=gasesList();
    const gasPanels=gases.map((g,gi)=>{
      const gm=flat.filter(m=>m.gas===g.id);
      const col=TV_COLORS[gi%TV_COLORS.length];
      const flow=gm.reduce((a,m)=>a+machineCurrent(m),0);
      const act=gm.filter(m=>machineCurrent(m)>0.3).length;
      const today=gm.reduce((a,m)=>a+m.hourly.reduce((x,y)=>x+y,0),0);
      const w7=gm.reduce((a,m)=>a+m.daily.slice(23).reduce((x,y)=>x+y,0),0);
      const bars=new Array(24).fill(0);
      gm.forEach(m=>(m.hourly24||m.hourly).forEach((v,i)=>bars[i]+=v));
      const maxB=Math.max(1e-9,...bars);
      const barDivs=bars.map((v,i)=>{
        const h=Math.max(4,Math.round(v/maxB*150));
        const c=i===23?col:(v<=maxB*0.03?'#141b2c':col+'99');
        return `<div style="flex:1;border-radius:3px 3px 0 0;background:${c};height:${h}px"></div>`;
      }).join('');
      const hl=refHours();
      const hLbl=i=>hl[i]?String(new Date(hl[i]).getHours()).padStart(2,'0')+':00':'';
      return `<div style="background:#0c111d;border:1px solid #1c2740;border-radius:14px;padding:26px 30px;display:flex;flex-direction:column;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:19px;font-weight:700;letter-spacing:.08em;color:#9db0cc">${esc(g.name.toUpperCase())}</span>
          <span style="font-size:15px;font-weight:600;color:${col};background:${col}22;padding:4px 14px;border-radius:8px">${esc(t('tvActive',act))}</span></div>
        <div style="display:flex;align-items:baseline;gap:14px;margin:18px 0 4px">
          <span style="font-size:96px;font-weight:800;line-height:1;color:${col}">${esc(fmtNum(flow,1))}</span>
          <span style="font-size:26px;color:#9db0cc">Nl/min</span></div>
        <div style="font-size:17px;color:#9db0cc;margin-bottom:22px">${esc(t('tvToday'))} <span style="color:#e9f0fb;font-weight:700">${esc(fmtM3(today))}</span> · ${esc(t('tv7d'))} <span style="color:#e9f0fb;font-weight:700">${esc(fmtM3(w7))}</span></div>
        <div style="margin-top:auto"><div style="font-size:13px;color:#677792;margin-bottom:10px">${esc(t('tvFlow'))}</div>
          <div style="display:flex;align-items:flex-end;gap:6px;height:150px">${barDivs}</div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:#677792;margin-top:8px"><span>${esc(hLbl(0))}</span><span>${esc(hLbl(8))}</span><span>${esc(hLbl(16))}</span><span>${esc(S.lang==='de'?'jetzt':'now')}</span></div></div>
      </div>`;
    }).join('');

    const AM=ALERT_META();
    const al=alarms();
    const alCards=al.length?al.map(a=>{
      const crit=a.level==='critical';
      const c=crit?'#ff5d72':'#ffb547';
      return `<div style="border-left:4px solid ${c};background:${c}14;border-radius:0 10px 10px 0;padding:12px 16px">
        <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700"><span>${esc((AM[a.type]||{title:a.type}).title.toUpperCase())}</span><span style="color:${c}">${esc((AM[a.type]||{val:v=>v}).val(a.value))}</span></div>
        <div style="font-size:13.5px;color:#9db0cc;margin-top:3px">${esc(a.sensorName)} · ${esc(a.deptName)}</div></div>`;
    }).join('')
      :`<div style="font-size:16px;font-weight:700;color:#34e2a6;padding:10px 0">✓ ${esc(t('tvNoAlarms'))}</div>`;

    const deptAgg=depts().map(d2=>({d:d2, nl:flat.filter(m=>m.deptId===d2.id).reduce((a,m)=>a+m.daily.slice(23).reduce((x,y)=>x+y,0),0)}));
    const maxD=Math.max(1e-9,...deptAgg.map(x=>x.nl));
    const deptBars=deptAgg.map(({d:d2,nl})=>`
      <div style="display:flex;align-items:center;gap:12px">
        <span style="width:110px;font-size:13px;color:#9db0cc;flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d2.name)}</span>
        <div style="flex:1;height:12px;border-radius:6px;background:#141b2c;overflow:hidden"><div style="height:100%;border-radius:6px;background:${deptColor(d2.id)};width:${Math.round(nl/maxD*100)}%"></div></div>
        <span style="width:76px;text-align:right;font-size:13px;font-weight:700;flex:none">${esc(fmtNum(nl/1000,0))} m³</span></div>`).join('');

    const ticker=flat.length?(()=>{
      const items=[...flat].sort((a,b)=>machineCurrent(b)-machineCurrent(a)).map(m=>{
        const an=m.anomaly;
        if(an&&an.type==='offline') return `<span style="font-size:15px;color:#ff5d72">● ${esc(m.name)} ${esc(t('tvOffline'))} ${esc(ago(m.lastSeen))}</span>`;
        if(an&&an.type==='leak') return `<span style="font-size:15px;color:#ffb547">● ${esc(m.name)} <b>${esc(fmtNum(machineCurrent(m),1))}</b> ${esc(t('tvLeak'))}</span>`;
        const dot=m.status!=='online'?'#677792':(machineCurrent(m)>0.3?'#34e2a6':'#677792');
        return `<span style="font-size:15px;color:#9db0cc"><span style="color:${dot}">●</span> ${esc(m.name)} <b style="color:#e9f0fb">${esc(fmtNum(machineCurrent(m),1))}</b> Nl/min</span>`;
      }).join('<span style="width:56px;flex:none"></span>');
      return `<div style="display:inline-flex;gap:56px;animation:tick 40s linear infinite;padding-left:40px">${items}<span style="width:56px;flex:none"></span>${items}</div>`;
    })():'';

    return `<div data-action="nav" data-hash="#/overview" title="${esc(t('tvExit'))}" style="position:fixed;inset:0;z-index:40;background:#070a10;color:#e9f0fb;font-family:'JetBrains Mono',monospace;display:flex;flex-direction:column;cursor:pointer;background-image:repeating-linear-gradient(0deg,rgba(70,198,255,.02) 0 1px,transparent 1px 40px),repeating-linear-gradient(90deg,rgba(70,198,255,.02) 0 1px,transparent 1px 40px)">
      <header style="display:flex;align-items:center;gap:22px;padding:18px 40px;border-bottom:1px solid #1c2740;flex:none">
        <div style="width:52px;height:52px;background:#0065BD;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px;flex:none">iwb</div>
        <div style="font-size:24px;font-weight:700;letter-spacing:.04em;white-space:nowrap">${esc(t('tvTitle'))}</div>
        <div style="display:flex;align-items:center;gap:10px;font-size:16px;font-weight:600;color:${onlineN?'#34e2a6':'#ff5d72'};margin-left:26px">
          <span style="width:12px;height:12px;border-radius:50%;background:${onlineN?'#34e2a6':'#ff5d72'};animation:pulse 2.2s ease-in-out infinite"></span>${esc(t('tvOnline',onlineN,flat.length))}</div>
        <div style="margin-left:auto;display:flex;align-items:baseline;gap:18px">
          <span id="tv-clock" style="font-size:42px;font-weight:700">${esc(d.toLocaleTimeString(numLocale(),{hour:'2-digit',minute:'2-digit'}))}</span>
          <span id="tv-date" style="font-size:18px;color:#9db0cc">${esc(d.toLocaleDateString(numLocale(),{weekday:'short',day:'2-digit',month:'short',year:'numeric'}))}</span></div>
      </header>
      <div style="flex:1;display:grid;grid-template-columns:${gases.length>1?'1.25fr 1.25fr 1fr':'1.6fr 1fr'};gap:26px;padding:26px 40px;min-height:0">
        ${gasPanels}
        <div style="display:flex;flex-direction:column;gap:26px;min-height:0">
          <div style="background:#0c111d;border:1px solid #1c2740;border-radius:14px;padding:24px 28px;flex:1;display:flex;flex-direction:column;min-height:0">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
              <span style="font-size:15px;font-weight:700;letter-spacing:.08em;color:#9db0cc">${esc(t('tvAlarms'))}</span>
              <span style="font-size:15px;font-weight:800;color:${al.length?'#ff5d72':'#34e2a6'};background:${al.length?'rgba(255,93,114,.14)':'rgba(52,226,166,.14)'};padding:3px 14px;border-radius:8px">${al.length}</span></div>
            <div style="display:flex;flex-direction:column;gap:12px;overflow:hidden">${alCards}</div>
            <div style="margin-top:auto;padding-top:14px">
              <div style="font-size:13px;color:#677792;margin-bottom:10px">${esc(t('tvDeptCons'))}</div>
              <div style="display:flex;flex-direction:column;gap:9px">${deptBars||''}</div>
            </div>
          </div>
        </div>
      </div>
      <footer style="border-top:1px solid #1c2740;padding:14px 0;overflow:hidden;white-space:nowrap;flex:none">${ticker}</footer>
    </div>`;
  }

  // ------------------------------------------------------------ API-Helfer
  async function api(path, opts){
    const o=Object.assign({headers:{'Content-Type':'application/json'}}, opts||{});
    if(TOKEN) o.headers['X-Auth']=TOKEN;
    const r=await fetch(path, o);
    let body=null; try{ body=await r.json(); }catch(e){}
    if(r.status===401){ AUTH.admin=false; throw new Error(t('loginRequired')); }
    if(!r.ok || (body && body.ok===false)) throw new Error((body&&body.error)||('HTTP '+r.status));
    return body;
  }
  function needLogin(){ if(isAdmin()) return false; openLogin(); return true; }

  function setAdmMsg(text, isErr){
    ADM.msg=text; ADM.msgErr=!!isErr;
    if(S.view.name==='admin') render();
    if(text && !isErr){ clearTimeout(ADM._msgT); ADM._msgT=setTimeout(()=>{ ADM.msg=''; if(S.view.name==='admin') render(); }, 2500); }
  }

  // ------------------------------------------------- Administration (Daten)
  async function loadAdmin(force){
    if(!isAdmin()){ ADM.loaded=false; render(); return; }
    if(ADM.loaded && !force){ render(); return; }
    try{
      const [reg,cfg]=await Promise.all([api('api/sensors'), api('api/config')]);
      ADM.reg=reg; ADM.cfg=cfg; ADM.loaded=true;
      ADM.cfgEdit={ stale_seconds:cfg.stale_seconds,
        offline_alarm_minutes:cfg.offline_alarm_minutes,
        backup:deepCopy(cfg.backup||{enabled:true,keep_days:30}),
        gases:deepCopy(cfg.gases||{}),
        defaults:deepCopy(cfg.defaults||{leak:{min:0.2,active:1.0},downtime:{enabled:false,max_nl:0,windows:[]}}),
        mqtt:deepCopy(cfg.mqtt||{}), adminpw:'' };
      if(!ADM.cfgEdit.defaults.downtime) ADM.cfgEdit.defaults.downtime={enabled:false,max_nl:0,windows:[]};
      if(!ADM.cfgEdit.defaults.leak) ADM.cfgEdit.defaults.leak={min:0.2,active:1.0};
      if(ADM.sel){ const s=reg.sensors.find(x=>x.id===ADM.sel); ADM.edit=s?makeEdit(s):null; if(!s) ADM.sel=null; }
    }catch(e){ ADM.loaded=false; if(S.view.name==='admin') setAdmMsg(t('adLoadFail')+e.message, true); }
    render();
  }
  async function refreshReg(){
    try{ ADM.reg=await api('api/sensors'); }catch(e){}
  }
  function makeEdit(s){
    const dfl=(ADM.reg&&ADM.reg.defaults)||{leak:{min:0.2,active:1.0},downtime:{enabled:false,max_nl:0,windows:[]}};
    return {
      id:s.id, name:s.name||s.id, gas:s.gas||'', dept:s.dept||'', note:s.note||'',
      leakOn:!!s.leak, leak:deepCopy(s.leak||dfl.leak),
      dtOn:!!s.downtime, downtime:deepCopy(s.downtime||dfl.downtime)
    };
  }

  // --- Downtime-Fenster-Editor (gemeinsam für Sensor-Override und Defaults) ----
  //   prefix 'f' -> ADM.edit.downtime (Sensor), 'c' -> ADM.cfgEdit.defaults.downtime
  const DAY_LBL=()=> S.lang==='de'?['Mo','Di','Mi','Do','Fr','Sa','So']:['Mo','Tu','We','Th','Fr','Sa','Su'];   // Index = Python-weekday (Mo=0)
  function dtObj(prefix){ return prefix==='f' ? ADM.edit.downtime : ADM.cfgEdit.defaults.downtime; }
  function dtEditorHTML(prefix, dt, disabled){
    const dis=disabled?'opacity:.45;pointer-events:none':'';
    const rows=dt.windows.map((w,i)=>{
      const days=DAY_LBL().map((lb,d)=>`<button data-action="dt-day" data-tgt="${prefix}" data-w="${i}" data-d="${d}" style="border:1px solid var(--border);border-radius:5px;padding:3px 0;width:30px;font:600 11px var(--mono);cursor:pointer;background:${w.days.includes(d)?'var(--brand)':'var(--panel)'};color:${w.days.includes(d)?'#fff':'var(--dim)'}">${lb}</button>`).join('');
      return `<div style="display:flex;flex-wrap:wrap;gap:7px;align-items:center;background:#f7f9fc;border:1px solid var(--border);border-radius:8px;padding:8px 9px">
        <div style="display:flex;gap:3px">${days}</div>
        <input id="${prefix}-dt-start-${i}" value="${esc(w.start)}" placeholder="22:00" class="inp mono" style="width:64px;text-align:center">
        <span style="color:var(--mute);font-size:12px">–</span>
        <input id="${prefix}-dt-end-${i}" value="${esc(w.end)}" placeholder="06:00" class="inp mono" style="width:64px;text-align:center">
        <button data-action="dt-del-window" data-tgt="${prefix}" data-w="${i}" title="${esc(t('dtDelWin'))}" class="btn" style="padding:4px 9px;color:var(--danger);margin-left:auto">✕</button>
      </div>`;
    }).join('');
    return `<div style="display:flex;flex-direction:column;gap:8px;${dis}">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label style="display:flex;gap:7px;align-items:center;font-size:12.5px;cursor:pointer">
          <input type="checkbox" id="${prefix}-dt-enabled" data-action="adm-redraw" ${dt.enabled?'checked':''} class="chk"> ${esc(t('dtOn'))}</label>
        <div style="display:flex;gap:7px;align-items:center;margin-left:auto">
          <span style="font-size:11.5px;color:var(--mute)">${esc(t('dtMax'))}</span>
          <input id="${prefix}-dt-max" type="number" min="0" step="1" value="${esc(dt.max_nl)}" class="inp mono" style="width:84px;text-align:right">
          <span style="font-size:11.5px;color:var(--mute)">Nl</span></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px;${dt.enabled?'':'opacity:.45'}">${rows||`<span style="font-size:12px;color:var(--mute)">${esc(t('dtNoWin'))}</span>`}</div>
      <button data-action="dt-add-window" data-tgt="${prefix}" class="btn" style="align-self:flex-start;${dt.enabled?'':'opacity:.45'}">${esc(t('dtAddWin'))}</button>
      <span style="font-size:11px;color:var(--mute)">${esc(t('dtHint'))}</span>
    </div>`;
  }
  function dtCollect(prefix){
    const dt=(prefix==='f'?(ADM.edit&&ADM.edit.downtime):(ADM.cfgEdit&&ADM.cfgEdit.defaults.downtime)); if(!dt) return;
    const en=document.getElementById(prefix+'-dt-enabled'); if(en) dt.enabled=en.checked;
    const mx=document.getElementById(prefix+'-dt-max'); if(mx) dt.max_nl=parseFloat(mx.value)||0;
    dt.windows.forEach((w,i)=>{
      const s=document.getElementById(prefix+'-dt-start-'+i); if(s) w.start=s.value.trim()||'00:00';
      const e=document.getElementById(prefix+'-dt-end-'+i); if(e) w.end=e.value.trim()||'24:00';
    });
  }

  // ------------------------------------------------ Administration (Ansicht)
  function adminHTML(){
    if(!isAdmin()){
      return `<div class="card" style="max-width:460px">
        <div class="card-title" style="margin-bottom:8px">${esc(t('needLoginTitle'))}</div>
        <div style="font-size:12.5px;color:var(--dim);margin-bottom:12px">${esc(t('needLoginText'))}</div>
        <button class="btn-primary" data-action="open-login">${esc(t('btnLogin'))}</button></div>`;
    }
    if(!ADM.loaded) return `<div class="card" style="color:var(--mute);font-size:12.5px">${esc(t('waiting'))}</div>`;
    const tab=S.view.tab||'sensors';
    const tabLbl={sensors:t('tabSensors'),depts:t('tabDepts'),prices:t('tabPrices'),broker:t('tabBroker'),system:t('tabSystem')};
    const tabs=`<div class="seg" style="margin-bottom:16px">${ADM_TABS.map(k=>
      `<button class="${tab===k?'on':''}" data-action="nav" data-hash="#/admin/${k}" style="font-family:var(--sans);font-size:12.5px;padding:6px 14px">${esc(tabLbl[k])}</button>`).join('')}</div>`;
    const msg=ADM.msg?`<span style="font-size:12px;font-weight:600;color:${ADM.msgErr?'var(--danger)':'var(--good)'};margin-left:10px">${esc(ADM.msg)}</span>`:'';
    const body= tab==='sensors'?admSensorsHTML()
      : tab==='depts'?admDeptsHTML()
      : tab==='prices'?admPricesHTML()
      : tab==='broker'?admBrokerHTML()
      : admSystemHTML();
    return `<div style="display:flex;align-items:center">${tabs}${msg}</div>${body}`;
  }

  function admSensorsHTML(){
    const reg=ADM.reg;
    const dname=id=>{ const d=(reg.departments||[]).find(x=>x.id===id); return d?d.name:'—'; };
    const dfl=reg.defaults||{leak:{min:0.2,active:1.0}};
    const list=[...reg.sensors].sort((a,b)=>{
      const ua=a.gas?1:0, ub=b.gas?1:0; if(ua!==ub) return ua-ub;   // nicht zugeordnete zuerst
      return String(a.name).localeCompare(String(b.name));
    });
    const trs=list.map(s=>{
      const leak=s.leak||dfl.leak;
      const sel=ADM.sel===s.id;
      const stC=s.online?'var(--good)':'var(--danger)';
      return `<tr class="click" data-action="adm-sel-sensor" data-id="${esc(s.id)}" ${sel?'style="background:var(--brand-tint)"':''}>
        <td style="font-size:12.5px;font-weight:600;white-space:nowrap">${esc(s.name)}${s.note?' 📝':''}</td>
        <td style="font-size:11.5px;color:var(--dim);white-space:nowrap">${esc(dname(s.dept))}</td>
        <td style="font-size:11.5px;${s.gas?'color:var(--dim)':'color:var(--warn);font-weight:600'}">${esc(s.gas?gasShort(s.gas):t('notAssigned'))}</td>
        <td class="mono" style="font-size:10.5px;color:var(--dim);white-space:nowrap">iwb/gas/${esc(s.id)}</td>
        <td class="r mono" style="font-weight:600;font-size:11.5px">${esc(fmtNum(leak.min,1))}${s.leak?'*':''}</td>
        <td class="r mono" style="font-weight:600;font-size:11.5px">${esc(fmtNum(leak.active,1))}${s.leak?'*':''}</td>
        <td><span style="display:inline-flex;align-items:center;gap:6px;font:600 10px var(--mono);color:${stC}"><span style="width:7px;height:7px;border-radius:50%;background:${stC}"></span>${esc((s.online?t('online'):t('offline')).toUpperCase())}</span></td>
        <td class="r"><span class="btn-link" style="font-size:11.5px">${esc(t('edit'))}</span></td></tr>`;
    }).join('');
    return `<div style="display:grid;grid-template-columns:1.6fr 1.1fr;gap:16px;align-items:start">
      <div class="card card-table">
        <div style="overflow-x:auto"><table class="tbl" style="min-width:640px">
          <thead><tr><th>${esc(t('thMachine'))}</th><th>${esc(t('thDept'))}</th><th>${esc(t('thGas'))}</th><th>${esc(t('infoTopic'))}</th>
          <th class="r">${esc(t('thLeakFrom'))}</th><th class="r">${esc(t('thLeakTo'))}</th><th>${esc(t('thStatus'))}</th><th></th></tr></thead>
          <tbody>${trs||`<tr><td colspan="8" style="padding:20px;color:var(--mute)">${esc(t('noSensorsYet'))}</td></tr>`}</tbody></table></div>
        <div style="padding:9px 20px;border-top:1px solid var(--divider);font-size:11px;color:var(--mute)">* = ${esc(t('thrCustom'))} · Nl/min</div>
      </div>
      <div class="card" style="min-width:0">${admSensorFormHTML()}</div>
    </div>`;
  }

  function admSensorFormHTML(){
    const e=ADM.edit;
    if(!e) return `<div style="display:flex;align-items:center;justify-content:center;min-height:180px;color:var(--mute);font-size:13px;text-align:center;padding:30px">${esc(t('pickSensor'))}</div>`;
    const reg=ADM.reg;
    const dfl=reg.defaults||{leak:{min:0.2,active:1.0}};
    const gasOpts=[`<option value="">${esc(t('noGas'))}</option>`]
      .concat(Object.entries(reg.gases||{}).map(([id,g])=>`<option value="${esc(id)}" ${e.gas===id?'selected':''}>${esc(g.name||id)}</option>`)).join('');
    const deptOpts=[`<option value="">${esc(t('noDept'))}</option>`]
      .concat((reg.departments||[]).map(d=>`<option value="${esc(d.id)}" ${e.dept===d.id?'selected':''}>${esc(d.name)}</option>`)).join('');
    const s=reg.sensors.find(x=>x.id===e.id)||{};
    const meta=s.meta||{};
    const devBox=(meta.ip||meta.sp!=null||meta.hostname)?`
      <div style="border:1px solid var(--border);border-radius:9px;padding:10px 13px;display:flex;flex-wrap:wrap;gap:5px 16px;align-items:baseline;font-size:12px;color:var(--dim)">
        <span style="font-size:12.5px;font-weight:700;color:var(--text)">${esc(t('device'))}</span>
        ${meta.ip?`<a href="http://${esc(meta.ip)}/" target="_blank" rel="noopener" title="${esc(t('deviceTip'))}" class="mono" style="font-weight:600">${esc(meta.ip)} ↗</a>`:''}
        ${meta.sp!=null?`<span>${esc(t('spValue'))} <b class="mono" style="color:var(--text)">${esc(fmtNum(meta.sp,3))} Nl/Puls</b></span>`:''}
        ${meta.hostname?`<span class="mono">${esc(meta.hostname)}</span>`:''}
        ${meta.mac?`<span class="mono">${esc(meta.mac)}</span>`:''}
        ${meta.fw?`<span>FW ${esc(meta.fw)}</span>`:''}
        <span style="flex-basis:100%;font-size:11px;color:var(--mute)">${esc(t('devHint'))}</span>
        ${meta.ip?`<span style="flex-basis:100%;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button data-action="ota-start" class="btn">${esc(t('otaBtn'))}</button>
          <span id="ota-status" style="font-size:11px;color:var(--mute)">${esc(t('otaIdle'))}</span></span>`:''}
      </div>`:'';
    return `<div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
        <span style="font-size:14px;font-weight:700">${esc(e.id)}</span>
        <span style="font-size:11.5px;color:${s.online?'var(--good)':'var(--mute)'};font-weight:600">${s.online?'● '+esc(t('online')):'○ '+esc(t('offline'))}</span>
        <span class="mono" style="font-size:11.5px;color:var(--dim)">${esc(t('total'))} ${esc(fmtNum(s.total,1))} Nl · Flow ${esc(fmtNum(s.flow,2))} Nl/min · ${esc(ago(s.lastSeen))}</span>
      </div>
      ${devBox}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="grid-column:1/-1"><span class="lbl">${esc(t('name'))}</span><input id="f-name" value="${esc(e.name)}" class="inp"></div>
        <div><span class="lbl">${esc(t('gasSel'))}</span><select id="f-gas" class="inp">${gasOpts}</select></div>
        <div><span class="lbl">${esc(t('deptSel'))}</span><select id="f-dept" class="inp">${deptOpts}</select></div>
        <div style="grid-column:1/-1"><span class="lbl">${esc(t('note'))}</span>
          <textarea id="f-note" rows="2" placeholder="${esc(t('notePlaceholder'))}" class="inp" style="resize:vertical">${esc(e.note)}</textarea></div>
      </div>
      <div style="border:1px solid var(--border);border-radius:9px;padding:12px 13px">
        <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;font-weight:600;cursor:pointer;margin-bottom:9px">
          <input type="checkbox" id="f-leak-on" data-action="adm-redraw" ${e.leakOn?'checked':''} class="chk">
          ${esc(t('leakCustom',dfl.leak.min,dfl.leak.active))}</label>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;${e.leakOn?'':'opacity:.45;pointer-events:none'}">
          <span style="font-size:11.5px;color:var(--mute)">${esc(t('leakFrom'))}</span>
          <input id="f-leak-min" type="number" step="0.1" min="0" value="${esc(e.leak.min)}" class="inp mono" style="width:76px;text-align:right">
          <span style="font-size:11.5px;color:var(--mute)">${esc(t('leakTo'))}</span>
          <input id="f-leak-active" type="number" step="0.1" min="0" value="${esc(e.leak.active)}" class="inp mono" style="width:76px;text-align:right">
          <span style="font-size:11.5px;color:var(--mute)">${esc(t('leakUnit'))}</span></div>
      </div>
      <div style="border:1px solid var(--border);border-radius:9px;padding:12px 13px">
        <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;font-weight:600;cursor:pointer;margin-bottom:9px">
          <input type="checkbox" id="f-dt-on" data-action="adm-redraw" ${e.dtOn?'checked':''} class="chk">
          ${esc(t('dtCustom'))}</label>
        ${dtEditorHTML('f', e.downtime, !e.dtOn)}
      </div>
      <div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">
        <button data-action="adm-save" class="btn-primary">${esc(t('save'))}</button>
        <button data-action="adm-reset-counter" class="btn" title="${esc(t('resetTip'))}">${esc(t('resetCounter'))}</button>
        <button data-action="adm-delete" class="btn-danger" style="margin-left:auto">${esc(t('delSensor'))}</button>
      </div>
    </div>`;
  }
  function collectSensorForm(){
    const e=ADM.edit; if(!e) return;
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
    const e=ADM.edit;
    const body={ name:(e.name||'').trim()||e.id, gas:e.gas||null, dept:e.dept||null,
      note:(e.note||'').trim(),
      leak: e.leakOn?{min:e.leak.min,active:e.leak.active}:null,
      downtime: e.dtOn?e.downtime:null };
    try{
      await api('api/sensors/'+encodeURIComponent(e.id), {method:'POST', body:JSON.stringify(body)});
      await refreshReg();
      const s=ADM.reg.sensors.find(x=>x.id===e.id); if(s) ADM.edit=makeEdit(s);
      setAdmMsg(t('saved')); poll();
    }catch(err){ setAdmMsg(t('err')+err.message, true); }
  }

  function admDeptsHTML(){
    const reg=ADM.reg;
    const rows=(reg.departments||[]).map(d=>{
      const n=reg.sensors.filter(s=>s.dept===d.id).length;
      return `<div style="display:flex;gap:10px;align-items:center;border:1px solid var(--border);border-radius:9px;padding:10px 12px;flex-wrap:wrap">
        <span style="width:10px;height:10px;border-radius:3px;background:${deptColor(d.id)};flex:none"></span>
        <input id="dept-name-${esc(d.id)}" value="${esc(d.name)}" class="inp" style="width:220px">
        <span class="mono" style="font-size:11px;color:var(--mute)">${esc(d.id)} · ${esc(t('deptSensors',n))}</span>
        <span style="margin-left:auto;display:flex;gap:8px">
          <button class="btn" data-action="dept-rename" data-id="${esc(d.id)}">${esc(t('rename'))}</button>
          <button class="btn-danger" data-action="dept-del" data-id="${esc(d.id)}" title="${esc(t('deptDelTip'))}">✕</button></span>
      </div>`;
    }).join('');
    return `<div class="card" style="max-width:640px">
      <div class="card-title" style="margin-bottom:12px">${esc(t('depts'))}</div>
      <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:14px">${rows||`<span style="font-size:12px;color:var(--mute)">${esc(t('noDepts'))}</span>`}</div>
      <div style="display:flex;gap:8px;max-width:340px"><input id="dept-new-name" placeholder="${esc(t('newDept'))}" class="inp">
        <button data-action="dept-create" class="btn" style="flex:none">＋</button></div>
    </div>`;
  }

  function admPricesHTML(){
    const e=ADM.cfgEdit;
    const priceRows=Object.entries(e.gases).map(([gid,g])=>`<div>
      <span class="lbl">${esc(t('priceOf',g.name||gid))}</span>
      <input id="c-price-${esc(gid)}" type="number" min="0" step="0.1" value="${esc(g.price_per_m3)}" class="inp mono" style="text-align:right"></div>`).join('');
    return `<div style="display:flex;flex-direction:column;gap:16px;max-width:760px">
      <div class="card">
        <div class="card-title" style="margin-bottom:12px">${esc(t('prices'))}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
          ${priceRows}
          <div><span class="lbl">${esc(t('staleAfter'))}</span>
          <input id="c-stale" type="number" min="10" step="10" value="${esc(e.stale_seconds)}" class="inp mono" style="text-align:right"></div>
          <div><span class="lbl">${esc(t('offlineAlarm'))}</span>
          <input id="c-offmin" type="number" min="0" step="5" value="${esc(e.offline_alarm_minutes)}" class="inp mono" style="text-align:right"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:12px">${esc(t('defaults'))}</div>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:13px;flex-wrap:wrap">
          <span style="font-size:11.5px;color:var(--mute)">${esc(t('leakFrom'))}</span>
          <input id="c-leak-min" type="number" step="0.1" min="0" value="${esc(e.defaults.leak.min)}" class="inp mono" style="width:80px;text-align:right">
          <span style="font-size:11.5px;color:var(--mute)">${esc(t('leakTo'))}</span>
          <input id="c-leak-active" type="number" step="0.1" min="0" value="${esc(e.defaults.leak.active)}" class="inp mono" style="width:80px;text-align:right">
          <span style="font-size:11.5px;color:var(--mute)">Nl/min</span></div>
        <span class="lbl">${esc(t('defaultDt'))}</span>
        ${dtEditorHTML('c', e.defaults.downtime, false)}
      </div>
      <div style="display:flex;gap:9px;align-items:center">
        <button data-action="cfg-save-prices" class="btn-primary">${esc(t('save'))}</button>
        <span style="font-size:11.5px;color:var(--mute)">${esc(t('saveHint'))}</span>
      </div>
    </div>`;
  }
  function collectPrices(){
    const e=ADM.cfgEdit; if(!e) return;
    const g=id=>document.getElementById(id);
    if(g('c-stale')) e.stale_seconds=parseInt(g('c-stale').value,10)||120;
    if(g('c-offmin')) e.offline_alarm_minutes=Math.max(0,parseInt(g('c-offmin').value,10)||0);
    Object.keys(e.gases).forEach(gid=>{ const el=g('c-price-'+gid); if(el) e.gases[gid].price_per_m3=parseFloat(el.value)||0; });
    if(g('c-leak-min')) e.defaults.leak.min=parseFloat(g('c-leak-min').value);
    if(g('c-leak-active')) e.defaults.leak.active=parseFloat(g('c-leak-active').value);
    dtCollect('c');
  }

  function admBrokerHTML(){
    const e=ADM.cfgEdit, m=e.mqtt, st=(ADM.cfg&&ADM.cfg.status)||{}, sec=(ADM.cfg&&ADM.cfg.secrets)||{};
    const chip=(ok,txtOk,txtBad)=>`<span class="pill" style="display:inline-flex;align-items:center;gap:6px;background:${ok?'var(--good-bg)':'var(--danger-bg)'};color:${ok?'var(--good)':'var(--danger)'}">● ${esc(ok?txtOk:txtBad)}</span>`;
    const secretsLine = !sec.exists
      ? `<span style="color:var(--warn)">${esc(t('secretsMissing'))}</span>`
      : (sec.user_match&&sec.password_match)
        ? `<span style="color:var(--good)">${esc(t('secretsOk'))}</span>`
        : `<span style="color:var(--warn)">${esc(t('secretsDiff'))}</span>`;
    const brokerLine = sec.exists&&sec.broker ? `<span>${esc(t('secretsBroker', sec.broker, sec.lan_ip||'?'))}</span>` : '';
    const pwType=ADM.showPw?'text':'password';
    return `<div style="display:flex;flex-direction:column;gap:16px;max-width:760px">
      ${ADM.restartHint?`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--warn-bg2);border:1px solid var(--warn-border);border-radius:9px;padding:9px 12px;font-size:12px;color:var(--warn);font-weight:600">${esc(t('restartNeeded'))}
        <button data-action="cfg-restart" class="btn" style="color:var(--warn);border-color:var(--warn)">${esc(t('restartBtn'))}</button></div>`:''}
      <div class="card">
        <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:11px">
          <span class="card-title">${esc(t('mqttBroker'))}</span>
          ${chip(st.embedded_running, t('chBrokerRun'), m.embedded?t('chBrokerStop'):t('chBrokerOff'))}
          ${chip(st.ingest_connected, t('chIngestOk'), t('chIngestNo'))}
          ${chip(st.auth, t('chAuthOn'), t('chAuthOff'))}
        </div>
        <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;cursor:pointer;margin-bottom:11px">
          <input type="checkbox" id="b-embedded" data-action="adm-redraw" ${m.embedded?'checked':''} class="chk">
          ${esc(t('embedded'))}</label>
        <div style="display:grid;grid-template-columns:1fr 110px;gap:12px">
          ${m.embedded
            ?`<div><span class="lbl">${esc(t('bind'))}</span><input id="b-bind" value="${esc(m.bind||'0.0.0.0')}" class="inp mono"></div>`
            :`<div><span class="lbl">${esc(t('extBroker'))}</span><input id="b-broker" value="${esc(m.broker||'')}" class="inp mono"></div>`}
          <div><span class="lbl">${esc(t('port'))}</span><input id="b-port" type="number" value="${esc(m.port||1883)}" class="inp mono" style="text-align:right"></div>
          <div><span class="lbl">${esc(t('user'))}</span><input id="b-user" value="${esc(m.username||'')}" class="inp"></div>
          <div style="grid-column:2"><span class="lbl">${esc(t('password'))}</span>
            <div style="display:flex;gap:6px;align-items:center">
              <input id="b-pass" type="${pwType}" value="${esc(m.password||'')}" class="inp mono">
              <button data-action="toggle-pw" title="${esc(ADM.showPw?t('hidePw'):t('showPw'))}" class="btn" style="padding:6px 9px;flex:none">${ADM.showPw?'🙈':'👁'}</button>
            </div></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--mute);margin-top:9px">
          <span>${esc(t('authHint'))}</span>
          ${secretsLine}
          ${brokerLine}
        </div>
      </div>
      <div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap">
        <button data-action="cfg-save-broker" class="btn-primary">${esc(t('save'))}</button>
        <button data-action="cfg-restart" class="btn" ${ADM.restartWait?'disabled':''}>${esc(t('restartBtn'))}</button>
        ${ADM.restartWait?`<span style="font-size:12px;color:var(--brand);font-weight:600">⏳ ${esc(t('restarting'))}</span>`:''}
        <span style="font-size:11.5px;color:var(--mute)">${esc(t('saveHint'))}</span>
      </div>
    </div>`;
  }
  function collectBroker(){
    const e=ADM.cfgEdit; if(!e) return;
    const g=id=>document.getElementById(id);
    const m=e.mqtt;
    if(g('b-embedded')) m.embedded=g('b-embedded').checked;
    if(g('b-bind')) m.bind=g('b-bind').value.trim();
    if(g('b-port')) m.port=parseInt(g('b-port').value,10)||1883;
    if(g('b-broker')) m.broker=g('b-broker').value.trim();
    if(g('b-user')) m.username=g('b-user').value.trim();
    if(g('b-pass')) m.password=g('b-pass').value;
  }

  function admSystemHTML(){
    const e=ADM.cfgEdit;
    const authReq=!!(ADM.cfg&&ADM.cfg.auth&&ADM.cfg.auth.required);
    return `<div style="display:flex;flex-direction:column;gap:16px;max-width:760px">
      <div class="card">
        <div class="card-title" style="margin-bottom:8px">${esc(t('loginBox'))}</div>
        <span style="display:block;font-size:11.5px;color:${authReq?'var(--mute)':'var(--warn)'};margin-bottom:10px">${esc(authReq?t('loginOnHint'):t('loginOffHint'))}</span>
        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
          <div style="width:220px"><span class="lbl">${esc(t('loginPw'))}</span>
            <input id="s-adminpw" type="password" placeholder="${esc(authReq?t('loginPwPh'):'')}" class="inp"></div>
          ${authReq?`<button data-action="login-disable" class="btn-danger">${esc(t('loginDisable'))}</button>`:''}
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:10px">Backup</div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;cursor:pointer">
            <input type="checkbox" id="s-bak-on" ${e.backup.enabled?'checked':''} class="chk"> ${esc(t('backupOn'))}</label>
          <span style="display:flex;gap:7px;align-items:center;font-size:11.5px;color:var(--mute)">${esc(t('backupKeep'))}
            <input id="s-bak-days" type="number" min="1" step="1" value="${esc(e.backup.keep_days)}" class="inp mono" style="width:70px;text-align:right"></span>
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:10px">${esc(t('backendBox'))}</div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <button data-action="cfg-restart" class="btn" ${ADM.restartWait?'disabled':''}>${esc(t('restartBtn'))}</button>
          ${ADM.restartWait?`<span style="font-size:12px;color:var(--brand);font-weight:600">⏳ ${esc(t('restarting'))}</span>`:''}
        </div>
      </div>
      <div style="display:flex;gap:9px;align-items:center">
        <button data-action="cfg-save-system" class="btn-primary">${esc(t('save'))}</button>
      </div>
    </div>`;
  }
  function collectSystem(){
    const e=ADM.cfgEdit; if(!e) return;
    const g=id=>document.getElementById(id);
    if(g('s-adminpw')) e.adminpw=g('s-adminpw').value;
    if(g('s-bak-on')) e.backup.enabled=g('s-bak-on').checked;
    if(g('s-bak-days')) e.backup.keep_days=Math.max(1,parseInt(g('s-bak-days').value,10)||30);
  }
  function collectAdminForms(){
    const tab=S.view.tab;
    if(tab==='sensors') collectSensorForm();
    else if(tab==='prices') collectPrices();
    else if(tab==='broker') collectBroker();
    else if(tab==='system') collectSystem();
  }

  async function saveCfg(part){
    collectAdminForms();
    const e=ADM.cfgEdit;
    const body={};
    if(part==='prices'){
      body.stale_seconds=e.stale_seconds; body.offline_alarm_minutes=e.offline_alarm_minutes;
      body.gases=e.gases; body.defaults={leak:e.defaults.leak, downtime:e.defaults.downtime};
    }else if(part==='broker'){
      body.mqtt={ embedded:e.mqtt.embedded, bind:e.mqtt.bind, port:e.mqtt.port,
                  broker:e.mqtt.broker, username:e.mqtt.username, password:e.mqtt.password||'' };
    }else if(part==='system'){
      body.backup=e.backup;
      if(e.adminpw) body.admin_password=e.adminpw;
    }
    try{
      const res=await api('api/config', {method:'POST', body:JSON.stringify(body)});
      if(res&&res.restart_required) ADM.restartHint=true;
      if(res && typeof res.token==='string'){ setToken(res.token); AUTH.required=!!e.adminpw; AUTH.admin=true; }
      e.adminpw='';
      try{ ADM.cfg=await api('api/config'); }catch(e2){}
      setAdmMsg(t('saved')); poll();
    }catch(err){ setAdmMsg(t('err')+err.message, true); }
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
        ADM.restartWait=false; ADM.restartHint=false;
        try{ ADM.cfg=await api('api/config'); }catch(e){}
        setAdmMsg(t('backOnline'));
        poll();
      }else if(Date.now()-t0>90000){
        clearInterval(_restartIv); _restartIv=null;
        ADM.restartWait=false; setAdmMsg(t('restartTimeout'), true);
      }
    }, 1500);
  }

  // ------------------------------------------------------------------ Export
  function isoDate(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function exportFormHTML(prefix, preset){
    const scope=preset||'total';
    const opts=[`<option value="total" ${scope==='total'?'selected':''}>${esc(t('exTotal'))}</option>`]
      .concat(depts().map(d=>`<option value="dept:${esc(d.id)}" ${scope==='dept:'+d.id?'selected':''}>${esc(t('exDept',d.name))}</option>`))
      .concat(allSensors().map(s=>`<option value="sensor:${esc(s.id)}" ${scope==='sensor:'+s.id?'selected':''}>${esc(t('exSensor',s.name))}</option>`))
      .join('');
    const from=isoDate(new Date(Date.now()-29*86400e3)), to=isoDate(new Date());
    return `<div style="display:flex;flex-direction:column;gap:13px">
      <div><span class="lbl">${esc(t('exScope'))}</span><select id="${prefix}-scope" class="inp">${opts}</select></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div><span class="lbl">${esc(t('exFrom'))}</span><input id="${prefix}-from" type="date" value="${from}" class="inp mono"></div>
        <div><span class="lbl">${esc(t('exTo'))}</span><input id="${prefix}-to" type="date" value="${to}" class="inp mono"></div>
        <div><span class="lbl">${esc(t('exRes'))}</span><select id="${prefix}-res" class="inp">
          <option value="day">${esc(t('exDay'))}</option><option value="hour">${esc(t('exHour'))}</option></select></div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button data-action="export-go" data-prefix="${prefix}" class="btn-primary">${esc(t('exGo'))}</button>
        <span style="font-size:11px;color:var(--mute)">${esc(t('exHint'))}</span>
      </div>
    </div>`;
  }
  function openExport(preset){ M={type:'export', preset:preset||'total'}; renderModal(); }
  function runExport(prefix){
    const g=id=>document.getElementById(prefix+'-'+id);
    const scope=g('scope')?g('scope').value:'total';
    const res=g('res')?g('res').value:'day';
    const from=g('from')?g('from').value:'', to=g('to')?g('to').value:'';
    const url='api/export.csv?scope='+encodeURIComponent(scope)+'&res='+encodeURIComponent(res)
      +'&start='+encodeURIComponent(from)+'&end='+encodeURIComponent(to);
    const a=document.createElement('a'); a.href=url; a.download=''; document.body.appendChild(a); a.click(); a.remove();
  }

  // ------------------------------------------------------------------- Login
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
      AUTH.admin=true; closeModal();
      if(S.view.name==='admin') loadAdmin(true); else render();
    }catch(e){ M.err=t('err')+e.message; renderModal(); }
  }
  function loginHTML(){
    return `<div style="display:flex;flex-direction:column;gap:13px">
      <span style="font-size:12.5px;color:var(--dim)">${esc(t('loginInfo'))}</span>
      <div><span class="lbl">${esc(t('password'))}</span>
        <input id="login-pw" type="password" class="inp mono"></div>
      ${M.err?`<span style="font-size:12px;color:var(--danger);font-weight:600">${esc(M.err)}</span>`:''}
      <button data-action="login-submit" class="btn-primary" style="align-self:flex-start">${esc(t('loginBtn'))}</button>
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
  function setModalMsg(text, isErr){
    if(!M) return; M.msg=text; M.msgErr=!!isErr; renderModal();
    if(text && !isErr){ clearTimeout(M._msgT); M._msgT=setTimeout(()=>{ if(M){M.msg='';renderModal();} }, 2500); }
  }

  // Firmware-Job (Build/OTA) alle 2,5 s nachladen, solange Modal oder OTA-Watch aktiv.
  setInterval(async ()=>{
    const watching=(M&&M.type==='flasher')||ADM.fwWatch;
    if(!watching) return;
    let fw; try{ fw=await api('api/firmware'); }catch(e){ return; }
    if(M&&M.type==='flasher'){
      M.fw=fw;
      const box=document.getElementById('fw-box'); if(box) box.innerHTML=fwBoxHTML();
      const log=document.getElementById('fw-log'); if(log) log.scrollTop=log.scrollHeight;
    }else if(ADM.fwWatch){
      const el=document.getElementById('ota-status');
      if(fw.job.running){ if(el) el.textContent=t('otaRunning', fw.job.log[fw.job.log.length-1]||''); }
      else{ ADM.fwWatch=false; collectSensorForm(); await refreshReg();
            setAdmMsg(fw.job.ok?t('otaDone'):t('otaFail'), !fw.job.ok); }
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
      ? `<span style="color:var(--brand)">${t('fwRunning',jobName)}</span>`
      : job.ok===true ? `<span style="color:var(--good)">${esc(t('fwOkJob',job.type||''))}</span>`
      : job.ok===false ? `<span style="color:var(--danger)">${esc(t('fwFailJob',job.type||''))}</span>` : '';
    const log=(job.log&&job.log.length)?`<pre id="fw-log" style="margin:8px 0 0;background:#f7f9fc;border:1px solid var(--border);border-radius:7px;padding:8px 10px;font-size:10.5px;line-height:1.45;color:var(--dim);max-height:150px;overflow:auto;white-space:pre-wrap;font-family:var(--mono)">${job.log.map(esc).join('\n')}</pre>`:'';
    return `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--dim)">
        <button data-action="fw-build" class="btn" ${job.running?'disabled':''}>${esc(t('fwBuild'))}</button>
        <span>${build}</span><span class="mono" style="font-size:11.5px">${jstate}</span>
      </div>${log}`;
  }

  function flasherHTML(){
    const step=(n,txt)=>`<div style="display:flex;gap:11px;align-items:flex-start">
      <span style="flex:none;width:22px;height:22px;border-radius:50%;background:var(--brand);color:#fff;display:inline-flex;align-items:center;justify-content:center;font:700 12px var(--mono)">${n}</span>
      <span style="font-size:12.5px;line-height:1.5">${txt}</span></div>`;
    const box='border:1px solid var(--border);border-radius:9px;padding:13px 14px';
    const serialHint = serialOk() ? '' :
      `<div style="background:var(--warn-bg2);border:1px solid var(--warn-border);border-radius:8px;padding:9px 12px;font-size:12px;color:var(--warn);font-weight:600;margin-bottom:10px">${t('serialHint')}</div>`;
    const manifest='api/firmware/manifest.json'+(TOKEN?('?auth='+encodeURIComponent(TOKEN)):'');
    const flashBtn = !serialOk() ? '' :
      EWT_STATE==='ready'
        ? `<esp-web-install-button manifest="${esc(manifest)}"><button slot="activate" class="btn-primary">${esc(t('flashBtn'))}</button></esp-web-install-button>`
        : EWT_STATE==='failed'
          ? `<span style="font-size:12px;color:var(--danger)">${esc(t('flashModFail'))}</span>`
          : `<span style="font-size:12px;color:var(--mute)">${esc(t('flashModLoad'))}</span>`;
    const macBig = M.mac ? `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:9px">
        <span class="mono" style="font-size:21px;font-weight:700;letter-spacing:.04em;color:var(--brand)">${esc(M.mac)}</span>
        <button data-action="mac-copy" class="btn">${esc(t('macCopy'))}</button>
        <span style="font-size:11.5px;color:var(--dim)">${esc(t('macSubmit'))}</span></div>` : '';
    const macLog = M.serialActive||M.macLog.length ? `<pre id="mac-log" style="margin:9px 0 0;background:#f7f9fc;border:1px solid var(--border);border-radius:7px;padding:8px 10px;font-size:10.5px;line-height:1.45;color:var(--dim);max-height:130px;overflow:auto;white-space:pre-wrap;font-family:var(--mono)">${M.macLog.map(esc).join('\n')||esc(t('macWait'))}</pre>` : '';
    return `<div style="display:flex;flex-direction:column;gap:15px">
      ${serialHint}
      <div style="${box}">
        <span style="font-size:13px;font-weight:700;display:block;margin-bottom:11px">${esc(t('howto'))}</span>
        <div style="display:flex;flex-direction:column;gap:9px">
          ${step(1,t('step1'))}${step(2,t('step2'))}${step(3,t('step3'))}${step(4,t('step4'))}${step(5,t('step5'))}${step(6,t('step6'))}${step(7,t('step7'))}
        </div>
      </div>
      <div style="${box}">
        <span style="font-size:13px;font-weight:700;display:block;margin-bottom:10px">${esc(t('fwBox'))}</span>
        <div id="fw-box">${fwBoxHTML()}</div>
      </div>
      <div style="${box}">
        <span style="font-size:13px;font-weight:700;display:block;margin-bottom:10px">${esc(t('flashBox'))}</span>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">${flashBtn}
          <span style="font-size:11.5px;color:var(--mute)">${esc(t('flashOtaHint'))}</span></div>
      </div>
      <div style="${box}">
        <span style="font-size:13px;font-weight:700;display:block;margin-bottom:10px">${esc(t('macBox'))}</span>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          ${serialOk()?`<button data-action="mac-console" class="btn" ${M.serialActive?'disabled':''}>${esc(M.serialActive?t('macActive'):t('macBtn'))}</button>`:''}
          ${M.serialActive?`<button data-action="mac-console-stop" class="btn">${esc(t('macStop'))}</button>`:''}
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
    catch(e){ setModalMsg(t('serialErr')+e.message, true); return; }
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

  // --- Modal-Rendering ------------------------------------------------------
  function closeModal(){ if(M&&M.type==='flasher') macConsoleStop(); M=null; renderModal(); }
  function renderModal(){
    if(!M){ modalEl.innerHTML=''; return; }
    const titles={flasher:t('titleDevice'), export:t('titleExport'), login:t('titleLogin')};
    const narrow=M.type==='login'||M.type==='export';
    const body=M.type==='flasher' ? `<div style="overflow-y:auto;min-height:0;flex:1;padding-right:4px">${flasherHTML()}</div>`
      : M.type==='export' ? exportFormHTML('x', M.preset)
      : loginHTML();
    modalEl.innerHTML=`
    <div id="modal-backdrop" style="position:fixed;inset:0;background:rgba(16,28,46,.45);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;font-family:var(--sans)">
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:12px;box-shadow:0 18px 60px rgba(16,28,46,.25);width:min(${narrow?'460px':'860px'},100%);max-height:92vh;display:flex;flex-direction:column;padding:17px 19px;color:var(--text)">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <span style="font-size:15px;font-weight:700">${esc(titles[M.type]||'')}</span>
          <span style="font-size:12px;font-weight:600;color:${M.msgErr?'var(--danger)':'var(--good)'}">${esc(M.msg||'')}</span>
          <button data-action="modal-close" class="btn" style="margin-left:auto;padding:5px 11px">✕</button>
        </div>
        ${body}
      </div>
    </div>`;
  }

  // ------------------------------------------------------------------ render
  const pillStatus = st => `<span style="display:inline-flex;align-items:center;gap:6px;font:600 10.5px var(--mono);color:${st.color};background:color-mix(in srgb, ${st.color} 12%, transparent);padding:3px 9px;border-radius:6px"><span style="width:7px;height:7px;border-radius:50%;background:${st.color};animation:${st.anim}"></span>${esc(st.label)}</span>`;
  const expBtn = scope => `<button class="btn" data-action="open-export" data-scope="${esc(scope)}">${esc(t('exportCsv'))}</button>`;
  function alarmFilterSeg(){
    const actN=alarms().filter(a=>a.state==='active').length;
    const ackN=alarms().filter(a=>a.state==='ack').length;
    const b=(val,label,color)=>`<button class="${S.alarmFilter===val?'on':''}" data-action="alfilter" data-val="${val}" style="font-family:var(--sans);${S.alarmFilter!==val&&color?('color:'+color):''}">${esc(label)}</button>`;
    return `<div class="seg">
      ${b('all',t('fAll'))}
      ${b('active',t('fActive')+' · '+actN, actN?'var(--danger)':null)}
      ${b('ack',t('fAck')+' · '+ackN, ackN?'var(--warn)':null)}
      ${b('resolved',t('fResolved'))}
    </div>`;
  }

  function render(){
    document.documentElement.lang=S.lang;
    if(!DATA){ appEl.innerHTML=`<div style="padding:40px;color:var(--mute);font-size:13px;font-family:var(--sans)">${esc(t('waiting'))}</div>`; return; }
    if(S.view.name==='tv'){ appEl.innerHTML=tvHTML(); return; }

    // Notiz-Entwurf auf der Anlagen-Seite über den Poll-Rerender retten
    let noteKeep=null;
    const noteEl=document.getElementById('mach-note');
    if(noteEl) noteKeep={val:noteEl.value, focus:document.activeElement===noteEl};

    const v=S.view;
    let hd={title:'',sub:'',controls:''}, content='';
    if(v.name==='overview'){
      hd={title:esc(t('ovTitle')), sub:esc(t('ovSub',rangeLong())),
          controls:gasSeg()+rangeSeg()+unitSeg()+expBtn('total')+clockHTML()};
      content=overviewHTML();
    }else if(v.name==='departments'){
      hd={title:esc(t('navDepts')), sub:esc(t('ovSub',rangeLong())),
          controls:gasSeg()+rangeSeg()+unitSeg()+clockHTML()};
      content=departmentsHTML();
    }else if(v.name==='dept'){
      const isNone=v.id==='-';
      const d=isNone?{name:t('noDeptGroup')}:depts().find(x=>x.id===v.id);
      const dm=sensors().filter(m=>isNone?!m.deptId:m.deptId===v.id);
      const dAl=alarms().filter(a=>dm.some(m=>m.id===a.sensor)&&a.state!=='ack');
      const pill=dAl.length?` <span class="pill" style="color:var(--warn);background:var(--warn-bg)">${esc(t('alarmTag',dAl.length))}</span>`:'';
      hd={title:esc(d?d.name:v.id)+pill,
          sub:`<button class="btn-link" data-action="nav" data-hash="#/departments" style="font-size:11.5px">${esc(t('navDepts'))}</button> / ${esc(d?d.name:v.id)}`,
          controls:rangeSeg()+unitSeg()+expBtn(isNone?'total':'dept:'+v.id)+clockHTML()};
      content=deptDetailHTML(v.id);
    }else if(v.name==='machines'){
      const flat=sensors(), onlineN=flat.filter(m=>m.status==='online').length;
      hd={title:esc(t('navMachines')), sub:esc(t('unitsOnline',flat.length,onlineN)),
          controls:gasSeg()+rangeSeg()+unitSeg()+expBtn('total')+clockHTML()};
      content=`${unassignedBanner()}${machinesTableHTML(flat, true)}`;
    }else if(v.name==='machine'){
      const m=allSensors().find(x=>x.id===v.id);
      const st=m?statusOf(m):null;
      hd={title:esc(m?m.name:v.id)+(st?' '+pillStatus(st):''),
          sub:m?`<button class="btn-link" data-action="nav" data-hash="#/machines" style="font-size:11.5px">${esc(t('navMachines'))}</button> / <button class="btn-link" data-action="nav" data-hash="#/dept/${encodeURIComponent(m.deptId||'-')}" style="font-size:11.5px">${esc(m.deptName)}</button> / ${esc(m.name)}`:'',
          controls:rangeSeg()+expBtn('sensor:'+v.id)+clockHTML()};
      content=machineDetailHTML(v.id);
    }else if(v.name==='alarms'){
      const actN=alarms().filter(a=>a.state==='active').length;
      const ackN=alarms().filter(a=>a.state==='ack').length;
      hd={title:esc(t('alTitle')), sub:esc(t('alSub',actN,ackN)),
          controls:alarmFilterSeg()+`<button class="btn" data-action="export-log">${esc(t('exportLog'))}</button>`+clockHTML()};
      content=alarmsScreenHTML();
    }else if(v.name==='reports'){
      hd={title:esc(t('repTitle')), sub:esc(t('repSub')),
          controls:expBtn('total')+clockHTML()};
      content=reportsHTML();
    }else if(v.name==='admin'){
      hd={title:esc(t('adTitle')), sub:esc(t('adSub')),
          controls:(isAdmin()?`<button class="btn-primary" data-action="open-flasher">${esc(t('addSensor'))}</button>`:'')+clockHTML()};
      content=adminHTML();
    }

    const pollBanner=S.pollError?`<div style="background:var(--danger-bg2);border:1px solid var(--danger-border);border-radius:10px;padding:9px 14px;margin-bottom:14px;font-size:12.5px;color:var(--danger);font-weight:600">${esc(t('pollError', S.lastOk?new Date(S.lastOk).toLocaleTimeString(numLocale()):'—'))}</div>`:'';

    appEl.innerHTML=`<div style="display:flex;align-items:stretch;min-height:100vh">
      ${sidebarHTML()}
      <main style="flex:1;min-width:0;padding:20px 28px 30px">
        ${headerHTML(hd.title, hd.sub, hd.controls)}
        ${pollBanner}
        ${content}
      </main>
    </div>`;
    bindChartHover();

    if(noteKeep && S.view.name==='machine'){
      const el2=document.getElementById('mach-note');
      const m2=allSensors().find(x=>x.id===S.view.id);
      if(el2 && noteKeep.val!==((m2&&m2.note)||'')){ el2.value=noteKeep.val; }
      if(el2 && noteKeep.focus) el2.focus();
    }
  }
  function maybeRender(){
    const v=S.view.name;
    if(v==='admin' || v==='reports'){
      const sb=document.getElementById('sidebar');           // Formulare nicht überschreiben
      if(sb && DATA){ sb.outerHTML=sidebarHTML(); }
      return;
    }
    render();
  }

  // ---------------------------------------------------------------- events
  root.addEventListener('click', async ev=>{
    const el=ev.target.closest('[data-action]'); if(!el) return;
    const act=el.getAttribute('data-action');

    // ---- Navigation & globale Filter
    if(act==='nav'){ ev.stopPropagation();
      if(S.view.name==='admin' && isAdmin() && ADM.loaded) collectAdminForms();   // Tab-Wechsel: Eingaben behalten
      go(el.getAttribute('data-hash')||'#/overview'); return; }
    else if(act==='range'){ S.range=el.getAttribute('data-val'); S.hover=-1; persistUI(); }
    else if(act==='unit'){ S.unit=el.getAttribute('data-val'); persistUI(); }
    else if(act==='lang'){ S.lang=el.getAttribute('data-val'); persistUI(); if(M) renderModal(); }
    else if(act==='gas'){ S.gas=el.getAttribute('data-val'); }
    else if(act==='sort'){ const k=el.getAttribute('data-key'); if(S.sortKey===k) S.sortDir=S.sortDir==='asc'?'desc':'asc'; else {S.sortKey=k;S.sortDir='desc';} }
    else if(act==='alfilter'){ S.alarmFilter=el.getAttribute('data-val'); }

    // ---- Alarm-Aktionen
    else if(act==='alarm-ack'||act==='alarm-resolve'){ ev.stopPropagation();
      if(needLogin()) return;
      const id=el.getAttribute('data-id');
      try{ await api('api/alarms/'+id+'/'+(act==='alarm-ack'?'ack':'resolve'),{method:'POST'});
        await loadHist(true); await poll(); }catch(e){}
      render(); return; }
    else if(act==='export-log'){ exportAlarmLog(); return; }

    // ---- Login/Logout
    else if(act==='open-login'){ openLogin(); return; }
    else if(act==='login-submit'){ await doLogin(); return; }
    else if(act==='user-chip'){
      if(AUTH.required && isAdmin()){
        if(confirm(t('logoutConfirm'))){ setToken(''); AUTH.admin=false; ADM.loaded=false; if(M) closeModal(); render(); }
      } else if(AUTH.required){ openLogin(); }
      else go('#/admin/system');
      return; }

    // ---- Modals
    else if(act==='open-export'){ openExport(el.getAttribute('data-scope')||'total'); return; }
    else if(act==='export-go'){ runExport(el.getAttribute('data-prefix')||'x'); return; }
    else if(act==='open-flasher'){ openFlasher(); return; }
    else if(act==='modal-close'){ closeModal(); return; }

    // ---- Anlagen-Seite
    else if(act==='mach-note-save'){
      if(needLogin()) return;
      const id=el.getAttribute('data-id');
      const ta=document.getElementById('mach-note'); const note=ta?ta.value.trim():'';
      try{ await api('api/sensors/'+encodeURIComponent(id),{method:'POST',body:JSON.stringify({note})});
        const msg=document.getElementById('mach-note-msg'); if(msg) msg.textContent=t('saved');
        poll(); }catch(e){ const msg=document.getElementById('mach-note-msg'); if(msg){msg.textContent=t('err')+e.message; msg.style.color='var(--danger)';} }
      return; }
    else if(act==='admin-edit-sensor'){
      if(needLogin()) return;
      const id=el.getAttribute('data-id');
      ADM.sel=id;
      if(ADM.loaded&&ADM.reg){ const s=ADM.reg.sensors.find(x=>x.id===id); ADM.edit=s?makeEdit(s):null; }
      go('#/admin/sensors'); return; }

    // ---- Firmware / Flasher
    else if(act==='fw-build'){
      try{ await api('api/firmware/build',{method:'POST'}); M.fw=await api('api/firmware'); renderModal(); }
      catch(err){ setModalMsg(t('err')+err.message,true); } return; }
    else if(act==='mac-console'){ macConsoleStart(); return; }
    else if(act==='mac-console-stop'){ macConsoleStop(); return; }
    else if(act==='mac-copy'){
      try{ await navigator.clipboard.writeText(M.mac||''); setModalMsg(t('macCopied')); }
      catch(err){ setModalMsg(t('macCopyFail')+err.message,true); } return; }
    else if(act==='ota-start'){ collectSensorForm();
      const sMeta=((ADM.reg.sensors.find(x=>x.id===ADM.edit.id)||{}).meta)||{};
      if(!confirm(t('otaConfirm', ADM.edit.name, sMeta.ip||'?'))) return;
      try{ await api('api/sensors/'+encodeURIComponent(ADM.edit.id)+'/ota',{method:'POST'});
        ADM.fwWatch=true; const st=document.getElementById('ota-status'); if(st) st.textContent=t('otaStarted'); }
      catch(err){ setAdmMsg(t('err')+err.message,true); } return; }

    // ---- Administration: Sensoren
    else if(act==='adm-sel-sensor'){ const id=el.getAttribute('data-id');
      const s=ADM.reg&&ADM.reg.sensors.find(x=>x.id===id);
      ADM.sel=id; ADM.edit=s?makeEdit(s):null; ADM.msg=''; render(); return; }
    else if(act==='adm-save'){ await saveSensor(); return; }
    else if(act==='adm-reset-counter'){ collectSensorForm();
      if(!confirm(t('resetConfirm', ADM.edit.name, ADM.edit.id))) return;
      try{ await api('api/sensors/'+encodeURIComponent(ADM.edit.id)+'/reset',{method:'POST'}); setAdmMsg(t('resetSent')); }
      catch(err){ setAdmMsg(t('err')+err.message,true); } return; }
    else if(act==='adm-delete'){
      if(!confirm(t('delConfirm', ADM.edit.name, ADM.edit.id))) return;
      try{ await api('api/sensors/'+encodeURIComponent(ADM.edit.id),{method:'DELETE'}); await refreshReg(); ADM.sel=null; ADM.edit=null; setAdmMsg(t('deleted')); poll(); }
      catch(err){ setAdmMsg(t('err')+err.message,true); } return; }

    // ---- Administration: Abteilungen
    else if(act==='dept-create'){
      const inp=document.getElementById('dept-new-name'); const name=(inp&&inp.value.trim())||'';
      if(!name){ setAdmMsg(t('deptMissing'),true); return; }
      try{ await api('api/departments',{method:'POST',body:JSON.stringify({name})});
        await refreshReg(); setAdmMsg(t('deptCreated')); poll(); }
      catch(err){ setAdmMsg(t('err')+err.message,true); } return; }
    else if(act==='dept-rename'){ const id=el.getAttribute('data-id');
      const inp=document.getElementById('dept-name-'+id); const name=(inp&&inp.value.trim())||'';
      if(!name){ setAdmMsg(t('deptMissing'),true); return; }
      try{ await api('api/departments',{method:'POST',body:JSON.stringify({id,name})});
        await refreshReg(); setAdmMsg(t('deptRenamed')); poll(); }
      catch(err){ setAdmMsg(t('err')+err.message,true); } return; }
    else if(act==='dept-del'){ const id=el.getAttribute('data-id');
      if(!confirm(t('deptDelConfirm'))) return;
      try{ await api('api/departments/'+encodeURIComponent(id),{method:'DELETE'});
        await refreshReg(); if(ADM.edit&&ADM.edit.dept===id) ADM.edit.dept=''; setAdmMsg(t('deptDeleted')); poll(); }
      catch(err){ setAdmMsg(t('err')+err.message,true); } return; }

    // ---- gemeinsame Formular-Interaktionen (Downtime-Editor etc.)
    else if(act==='adm-redraw'){ collectAdminForms(); render(); return; }
    else if(act==='dt-day'){ const p=el.getAttribute('data-tgt');
      collectAdminForms();
      const w=dtObj(p).windows[+el.getAttribute('data-w')]; const d=+el.getAttribute('data-d');
      const i=w.days.indexOf(d); if(i>=0) w.days.splice(i,1); else {w.days.push(d); w.days.sort();}
      render(); return; }
    else if(act==='dt-add-window'){ const p=el.getAttribute('data-tgt');
      collectAdminForms();
      dtObj(p).windows.push({days:[5,6],start:'00:00',end:'24:00'}); render(); return; }
    else if(act==='dt-del-window'){ const p=el.getAttribute('data-tgt');
      collectAdminForms();
      dtObj(p).windows.splice(+el.getAttribute('data-w'),1); render(); return; }

    // ---- Administration: Konfiguration
    else if(act==='cfg-save-prices'){ await saveCfg('prices'); return; }
    else if(act==='cfg-save-broker'){ await saveCfg('broker'); return; }
    else if(act==='cfg-save-system'){ await saveCfg('system'); return; }
    else if(act==='toggle-pw'){ collectAdminForms(); ADM.showPw=!ADM.showPw; render(); return; }
    else if(act==='login-disable'){ collectAdminForms();
      if(!confirm(t('loginDisableConfirm'))) return;
      try{ await api('api/config',{method:'POST',body:JSON.stringify({admin_password:''})});
        setToken(''); AUTH.required=false; AUTH.admin=true;
        try{ ADM.cfg=await api('api/config'); }catch(e2){}
        setAdmMsg(t('saved')); }
      catch(err){ setAdmMsg(t('err')+err.message,true); } return; }
    else if(act==='cfg-restart'){ collectAdminForms();
      if(!confirm(t('restartConfirm'))) return;
      try{ await api('api/restart',{method:'POST'}); ADM.restartWait=true; render(); watchRestart(); }
      catch(err){ setAdmMsg(t('err')+err.message,true); } return; }
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
  async function loadHist(force){
    if(!force && HIST && Date.now()-HIST_TS<10000) return;
    try{ const r=await api('api/alarms/history?limit=1000'); HIST=(r&&r.alarms)||[]; HIST_TS=Date.now(); }catch(e){}
  }
  async function loadMonthly(force){
    if(!force && MONTHLY && Date.now()-MONTHLY_TS<60000) return;
    try{ MONTHLY=await api('api/report/monthly'); MONTHLY_TS=Date.now(); }catch(e){}
  }
  async function poll(){
    try{
      const r=await fetch('api/data',{cache:'no-store'});
      if(r.ok){
        DATA=await r.json(); S.pollError=false; S.lastOk=Date.now();
        // Login-Pflicht kann sich serverseitig ändern -> Auth-Status nachziehen
        if(AUTH.known && !!DATA.authRequired!==AUTH.required){ await refreshAuth(); }
        if(S.view.name==='alarms'||S.view.name==='machine') await loadHist(false);
        maybeRender();
      }
      else if(!S.pollError){ S.pollError=true; maybeRender(); }
    }catch(e){ if(!S.pollError){ S.pollError=true; maybeRender(); } }
  }
  setInterval(poll, 5000);
  setInterval(()=>{ S.now=Date.now(); const d=new Date(S.now);
    const c=document.getElementById('clock'); if(c) c.textContent=d.toLocaleTimeString(numLocale());
    const cd=document.getElementById('clock-date'); if(cd) cd.textContent=d.toLocaleDateString(numLocale(),{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
    const tc=document.getElementById('tv-clock'); if(tc) tc.textContent=d.toLocaleTimeString(numLocale(),{hour:'2-digit',minute:'2-digit'});
    const td=document.getElementById('tv-date'); if(td) td.textContent=d.toLocaleDateString(numLocale(),{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
  }, 1000);

  // ------------------------------------------------------------------ start
  S.view=parseHash();
  render();
  refreshAuth().then(()=>{ poll().then(()=>{ onRoute(); }); });
})();
