/* Gas Monitoring – Frontend (vanilla, kein Build-Schritt).
   Daten live aus dem Backend (GET /api/data), gas-neutral (Argon + Stickstoff).
   Konfiguration komplett im Dashboard: Sensor-Manager (Zuordnung, Schwellwerte,
   Zähler-Reset) + ⚙-Einstellungen (Broker, Preise, Standard-Schwellen).
   Modals leben in einer eigenen Ebene (#modal-layer) und überleben den 5-s-Poll. */
(() => {
  "use strict";

  const THEMES = {
    control:{'--bg':'#0a0e16','--bg2':'#0e1320','--panel':'#121826','--panel2':'#171f30','--border':'#26304a','--text':'#e9f0fb','--dim':'#9db0cc','--mute':'#677792','--accent':'#34e2a6','--accent2':'#46c6ff','--good':'#34e2a6','--warn':'#ffb547','--danger':'#ff5d72','--grid':'rgba(255,255,255,0.06)','--stroke':'#46c6ff','--onacc':'#04140d','--shadow':'0 1px 0 rgba(255,255,255,0.03)','--radius':'11px','--fontsans':"'IBM Plex Sans',system-ui,sans-serif",'--fontnum':"'IBM Plex Mono',monospace",'--bgimg':'radial-gradient(1100px 520px at 82% -8%, rgba(70,198,255,0.07), transparent 60%)'},
    analytics:{'--bg':'#eef1f6','--bg2':'#f6f8fb','--panel':'#ffffff','--panel2':'#f5f8fc','--border':'#e3e8f0','--text':'#101c2e','--dim':'#4a586b','--mute':'#93a1b4','--accent':'#2563eb','--accent2':'#0e9aa7','--good':'#15a34a','--warn':'#d97706','--danger':'#dc2626','--grid':'rgba(16,28,46,0.07)','--stroke':'#2563eb','--onacc':'#ffffff','--shadow':'0 1px 2px rgba(16,28,46,0.06),0 1px 3px rgba(16,28,46,0.05)','--radius':'12px','--fontsans':"'IBM Plex Sans',system-ui,sans-serif",'--fontnum':"'IBM Plex Mono',monospace",'--bgimg':'none'},
    technical:{'--bg':'#0b0e0c','--bg2':'#0f130f','--panel':'#0e120f','--panel2':'#121712','--border':'#26302a','--text':'#d7e3da','--dim':'#88a092','--mute':'#5d7165','--accent':'#7dffab','--accent2':'#ffc56b','--good':'#7dffab','--warn':'#ffc56b','--danger':'#ff8472','--grid':'rgba(125,255,171,0.09)','--stroke':'#7dffab','--onacc':'#04140b','--shadow':'none','--radius':'3px','--fontsans':"'JetBrains Mono',monospace",'--fontnum':"'JetBrains Mono',monospace",'--bgimg':'repeating-linear-gradient(0deg, rgba(125,255,171,0.022) 0 1px, transparent 1px 27px), repeating-linear-gradient(90deg, rgba(125,255,171,0.022) 0 1px, transparent 1px 27px)'}
  };

  const S = {                       // UI-State
    range:'7d', unit:'m3', theme:'control', gas:'all',
    scope:{type:'total'}, sortKey:'cons', sortDir:'desc', hover:-1, now:Date.now(),
    pollError:false, lastOk:null
  };
  let DATA = null;                  // letzte Backend-Antwort (/api/data)
  let M = null;                     // Modal-State (null | {type:'sensors'|'settings', ...})
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

  // Sichtbare Sensoren = Gas-Filter angewandt
  const sensors = () => S.gas === 'all' ? allSensors() : allSensors().filter(m => m.gas === S.gas);

  const fmtNum = (n,d) => (n==null||isNaN(n)) ? '—' : Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
  // Wert in gewählter Einheit für ein Sensor-Gas: Nl -> m³ oder €
  const unitVal = (nl,gas) => S.unit==='m3' ? nl/1000 : nl/1000*priceOf(gas);
  // formatiert einen bereits in der Einheit vorliegenden Wert
  const fmtUnitVal = v => { if(S.unit==='m3'){const d=v<10?2:v<100?1:0; return fmtNum(v,d)+' m³';} return fmtNum(Math.round(v),0)+' €'; };
  const fmtM3 = nl => { const v=nl/1000, d=v<10?2:v<100?1:0; return fmtNum(v,d)+' m³'; };
  const fmtEurNl = (nl,gas) => fmtNum(Math.round(nl/1000*priceOf(gas)),0)+' €';
  const axisFmt = v => { if(S.unit==='m3') return fmtNum(v, v<10?1:0); if(v>=1000) return fmtNum(v/1000, v>=10000?0:1)+'k'; return fmtNum(Math.round(v),0); };
  const ago = ts => { if(!ts) return 'nie'; const s=Math.max(0,Math.round(Date.now()/1000-ts));
    if(s<60) return 'vor '+s+' s'; if(s<3600) return 'vor '+Math.round(s/60)+' min';
    if(s<86400) return 'vor '+Math.round(s/3600)+' h'; return 'vor '+Math.round(s/86400)+' d'; };

  const bucketsFor = m => S.range==='24h' ? m.hourly : S.range==='7d' ? m.daily.slice(23) : m.daily;
  const rangeNl = m => bucketsFor(m).reduce((a,b)=>a+b,0);
  const rangeUnit = m => unitVal(rangeNl(m), m.gas);
  const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const labelsFor = () => {
    if(S.range==='24h') return Array.from({length:24},(_,i)=>String(i).padStart(2,'0')+':00');
    const ds = refDates().map(ms=>new Date(ms));
    if(S.range==='7d') return ds.slice(23).map(d=>WD[d.getDay()]);
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

  const ALERT_META = {
    over:     {title:'Over-consumption',  detail:v=>'+'+Math.round(v*100)+'% über Erwartungswert', val:v=>'+'+Math.round(v*100)+'%'},
    leak:     {title:'Idle-flow / leak',  detail:_=>'Fluss während Stillstand',                    val:v=>fmtNum(v,1)+' Nl/min'},
    downtime: {title:'Downtime-Verbrauch',detail:_=>'Verbrauch im Downtime-Fenster',              val:v=>fmtM3(v)}
  };

  function render(){
    if(!DATA){ appEl.innerHTML=`<div style="padding:40px;font-family:sans-serif;color:#9db0cc">Warte auf Daten vom Backend …</div>`; return; }
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

    const delChip=t=>{ const c=t>0.5?'var(--danger)':t<-0.5?'var(--good)':'var(--mute)'; return {delta:(t>=0?'+':'')+t.toFixed(0)+'%',deltaColor:c,deltaBg:`color-mix(in srgb,${c} 15%,transparent)`}; };
    const cc=delChip(facTrend);
    const rl = S.range==='24h'?'24 h':S.range==='7d'?'7 days':'30 days';
    const rangeLabel = S.range==='24h'?'last 24 hours':S.range==='7d'?'last 7 days':'last 30 days';

    const kpis=[
      Object.assign({label:'Consumption · '+rl,value:fmtM3(totalNl),sub:fmtNum(Math.round(totalCost),0)+' € gesamt',valueColor:'var(--text)'},cc),
      Object.assign({label:'Gas-Kosten',value:fmtNum(Math.round(totalCost),0)+' €',sub:totalM3.toFixed(0)+' m³ · '+(S.gas==='all'?'alle Gase':gasName(S.gas)),valueColor:'var(--text)'},cc),
      {label:'Live Flow',value:fmtNum(liveFlow,1)+' Nl/min',sub:activeN+' von '+flat.length+' aktiv',valueColor:'var(--accent2)',delta:'LIVE',deltaColor:'var(--good)',deltaBg:'color-mix(in srgb,var(--good) 15%,transparent)'},
      {label:'Aktive Alarme',value:String(al.length),sub:critN+' kritisch · '+warnN+' Warnung',valueColor:al.length?'var(--danger)':'var(--good)',delta:al.length?'ATTN':'OK',deltaColor:al.length?'var(--danger)':'var(--good)',deltaBg:`color-mix(in srgb,${al.length?'var(--danger)':'var(--good)'} 15%,transparent)`}
    ];

    const scopeSeries=seriesForScope(); const scopeTotalUnit=scopeSeries.vals.reduce((a,b)=>a+b,0);
    const sc=delChip(trendPct(scopeMachines()));
    let scopeLabel='Alle Abteilungen', scopeSub='Werksweit';
    if(S.scope.type==='dept'){ const d=depts().find(x=>x.id===S.scope.id); if(d){scopeLabel=d.name; scopeSub=flat.filter(m=>m.deptId===d.id).length+' Sensoren';} }
    if(S.scope.type==='machine'){ const m=flat.find(x=>x.id===S.scope.id); if(m){scopeLabel=m.name; scopeSub=m.deptName+' · '+gasName(m.gas);} }

    const deptAgg=depts().map(d=>({d, nl:flat.filter(m=>m.deptId===d.id).reduce((a,m)=>a+rangeUnit(m),0)}));
    const maxDept=Math.max(1,...deptAgg.map(x=>x.nl));
    const deptRows=deptAgg.map(({d,nl})=>{
      const dm=flat.filter(m=>m.deptId===d.id); if(!dm.length) return '';
      const active=S.scope.type==='dept'&&S.scope.id===d.id; const hasAl=dm.some(m=>m.anomaly);
      return `<button data-action="scope-dept" data-id="${d.id}" style="text-align:left;border:none;background:${active?'var(--panel2)':'transparent'};border-radius:7px;padding:6px 8px;margin:-6px -8px;cursor:pointer;width:calc(100% + 16px)">
        <span style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px">
          <span style="font-size:12.5px;font-weight:600;color:${active?'var(--accent)':'var(--text)'}">${esc(d.name)}</span>
          <span style="font-size:12px;font-family:var(--fontnum);font-weight:600;color:var(--text)">${esc(fmtUnitVal(nl))}</span></span>
        <span style="display:block;height:7px;border-radius:4px;background:var(--panel2);overflow:hidden"><span style="display:block;height:100%;border-radius:4px;background:${hasAl?'var(--warn)':'var(--accent)'};width:${Math.round(nl/maxDept*100)}%"></span></span></button>`;
    }).join('');

    const alertRows = al.length ? al.map(a=>{
      const meta=ALERT_META[a.type]||{title:a.type,detail:_=>'',val:v=>String(v)};
      const color=levelColor(a.level);
      return `<div style="display:flex;gap:11px;align-items:stretch;background:var(--panel2);border:1px solid var(--border);border-radius:9px;padding:10px 11px">
        <span style="width:3px;border-radius:3px;background:${color};flex:none"></span>
        <button data-action="scope-machine" data-id="${a.sensor}" style="flex:1;min-width:0;text-align:left;background:none;border:none;cursor:pointer;padding:0;color:inherit">
          <span style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span style="font-size:12.5px;font-weight:600;color:var(--text)">${esc(meta.title)}</span>
            <span style="font-size:11px;font-family:var(--fontnum);font-weight:600;color:${color};flex:none">${esc(meta.val(a.value))}</span></span>
          <span style="display:block;font-size:11.5px;color:var(--dim);font-family:var(--fontnum);margin-top:2px">${esc(a.sensorName+' · '+a.deptName+' · '+gasShort(a.gas))}</span>
          <span style="display:block;font-size:11px;color:var(--mute);margin-top:3px">${esc(meta.detail(a.value))}</span></button>
        <button data-action="ack" data-id="${a.id}" title="quittieren" style="flex:none;align-self:center;border:1px solid var(--border);background:var(--panel);color:var(--dim);border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer">✓</button></div>`;
    }).join('') : `<div style="font-size:12px;color:var(--mute);padding:6px 2px">Keine aktiven Alarme.</div>`;

    // --- Sensor-Tabelle
    const dir=S.sortDir==='asc'?1:-1;
    let rows=flat.map(m=>{ const consNl=rangeNl(m), cur=machineCurrent(m), tr=trendPct([m]), an=!!m.anomaly;
      const statusLabel=an?'ALERT':(cur>0.3?'RUNNING':(m.status==='online'?'IDLE':'OFFLINE'));
      const statusColor=an?levelColor(m.anomaly.level):(cur>0.3?'var(--good)':'var(--mute)');
      return {m,consNl,cur,tr,an,statusLabel,statusColor}; });
    rows.sort((a,b)=>{ let x,y; switch(S.sortKey){
      case'name':x=a.m.name;y=b.m.name;return x<y?-dir:x>y?dir:0;
      case'gas':x=a.m.gas||'';y=b.m.gas||'';return x<y?-dir:x>y?dir:0;
      case'dept':x=a.m.deptName;y=b.m.deptName;return x<y?-dir:x>y?dir:0;
      case'status':x=a.an?2:(a.cur>0.3?1:0);y=b.an?2:(b.cur>0.3?1:0);break;
      case'flow':x=a.cur;y=b.cur;break; case'trend':x=a.tr;y=b.tr;break;
      default:x=a.consNl;y=b.consNl; } return (x-y)*dir; });
    const colDefs=[['status','Status','left'],['name','Sensor','left'],['gas','Gas','left'],['dept','Abteilung','left'],['flow','Live Nl/min','right'],['cons','Verbrauch','right'],['cost','Kosten','right'],['trend','Trend','right']];
    const ths=colDefs.map(c=>{ const arrow=S.sortKey===c[0]?(S.sortDir==='asc'?' ↑':' ↓'):''; return `<th data-action="sort" data-key="${c[0]}" style="text-align:${c[2]};padding:7px 12px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);font-weight:600;border-bottom:1px solid var(--border);cursor:pointer;white-space:nowrap;user-select:none">${esc(c[1])}${arrow}</th>`; }).join('')
      + `<th style="text-align:right;padding:7px 12px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);font-weight:600;border-bottom:1px solid var(--border)">14-day</th>`
      + `<th style="padding:7px 6px;border-bottom:1px solid var(--border)"></th>`;
    const trs=rows.map(r=>{ const m=r.m; const active=S.scope.type==='machine'&&S.scope.id===m.id;
      const anim=r.an?'argblink 1.4s ease-in-out infinite':(r.cur>0.3?'argpulse 2.2s ease-in-out infinite':'none');
      return `<tr data-action="scope-machine" data-id="${m.id}" style="cursor:pointer;background:${active?'var(--panel2)':'transparent'};border-bottom:1px solid var(--border)">
        <td style="padding:11px 12px;white-space:nowrap"><span style="display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:600;font-family:var(--fontnum);color:${r.statusColor}"><span style="width:8px;height:8px;border-radius:50%;background:${r.statusColor};animation:${anim}"></span>${esc(r.statusLabel)}</span></td>
        <td style="padding:11px 12px;font-size:13px;font-weight:600;color:var(--text);white-space:nowrap">${esc(m.name)}</td>
        <td style="padding:11px 12px;font-size:12px;color:var(--dim);white-space:nowrap">${esc(gasShort(m.gas))}</td>
        <td style="padding:11px 12px;font-size:12px;color:var(--dim);white-space:nowrap">${esc(m.deptName)}</td>
        <td style="padding:11px 12px;text-align:right;font-family:var(--fontnum);font-size:12.5px;color:var(--text);white-space:nowrap">${esc(fmtNum(r.cur,1))}</td>
        <td style="padding:11px 12px;text-align:right;font-family:var(--fontnum);font-size:12.5px;font-weight:600;color:var(--text);white-space:nowrap">${esc(fmtUnitVal(rangeUnit(m)))}</td>
        <td style="padding:11px 12px;text-align:right;font-family:var(--fontnum);font-size:12.5px;color:var(--dim);white-space:nowrap">${esc(fmtEurNl(r.consNl,m.gas))}</td>
        <td style="padding:11px 12px;text-align:right;font-family:var(--fontnum);font-size:12.5px;font-weight:600;color:${r.tr>0.5?'var(--danger)':r.tr<-0.5?'var(--good)':'var(--mute)'};white-space:nowrap">${r.tr>=0?'▲ ':'▼ '}${esc(Math.abs(r.tr).toFixed(0))}%</td>
        <td style="padding:9px 12px;text-align:right">${sparkSVG(m.daily.slice(16),r.statusColor)}</td>
        <td style="padding:9px 6px;text-align:center"><button data-action="open-sensors" data-id="${m.id}" title="Sensor konfigurieren" style="border:1px solid var(--border);background:var(--panel2);color:var(--dim);border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer">✎</button></td></tr>`;
    }).join('');

    const d=new Date(S.now);
    const clock=d.toLocaleTimeString('en-GB')+' · '+d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
    const brk=DATA.broker||null;
    const mqttOk=brk?brk.ingest_connected:onlineN>0;
    const brokerLabel=brk?(brk.ingest_connected?'BROKER OK':'BROKER GETRENNT'):(onlineN>0?'MQTT ONLINE':'NO DATA');
    const gasSegs = seg(S.gas==='all','all','gas','Alle') + gasesList().map(g=>seg(S.gas===g.id,g.id,'gas',g.name)).join('');
    const naN=unassigned().length;
    const toolBtn='border:1px solid var(--border);background:var(--panel);color:var(--dim);border-radius:9px;padding:8px 13px;font-size:12.5px;font-weight:600;cursor:pointer';

    appEl.innerHTML = `
    <div style="min-height:100vh;background:var(--bg);background-image:var(--bgimg);color:var(--text);font-family:var(--fontsans);padding:18px 22px 30px">
      <header style="display:flex;flex-wrap:wrap;gap:18px;align-items:center;justify-content:space-between;margin-bottom:18px">
        <div style="display:flex;align-items:center;gap:13px">
          <div style="width:40px;height:40px;border-radius:10px;background:var(--accent);color:var(--onacc);display:flex;align-items:center;justify-content:center;font-family:var(--fontnum);font-weight:600;font-size:15px">Gas</div>
          <div><div style="font-size:17px;font-weight:600;line-height:1.1">Gas Monitoring</div>
          <div style="font-size:12px;color:var(--dim);margin-top:2px">iwb · TUM — Shopfloor Gas Telemetry</div></div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center">
          <div style="display:flex;flex-direction:column;gap:5px"><span style="font-size:9.5px;letter-spacing:.14em;color:var(--mute);font-weight:600">GAS</span>
            <div style="display:inline-flex;background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:3px;gap:2px">${gasSegs}</div></div>
          <div style="display:flex;flex-direction:column;gap:5px"><span style="font-size:9.5px;letter-spacing:.14em;color:var(--mute);font-weight:600">RANGE</span>
            <div style="display:inline-flex;background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:3px;gap:2px">${seg(S.range==='24h','24h','range','24 H')}${seg(S.range==='7d','7d','range','7 D')}${seg(S.range==='30d','30d','range','30 D')}</div></div>
          <div style="display:flex;flex-direction:column;gap:5px"><span style="font-size:9.5px;letter-spacing:.14em;color:var(--mute);font-weight:600">UNIT</span>
            <div style="display:inline-flex;background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:3px;gap:2px">${seg(S.unit==='m3','m3','unit','m³')}${seg(S.unit==='eur','eur','unit','€')}</div></div>
          <div style="display:flex;flex-direction:column;gap:5px"><span style="font-size:9.5px;letter-spacing:.14em;color:var(--mute);font-weight:600">THEME</span>
            <div style="display:inline-flex;background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:3px;gap:2px">${seg(S.theme==='control','control','theme','Control')}${seg(S.theme==='analytics','analytics','theme','Light')}${seg(S.theme==='technical','technical','theme','Mono')}</div></div>
          <div style="display:flex;gap:8px;align-items:flex-end">
            <button data-action="open-sensors" style="${toolBtn}" title="Sensoren verwalten">Sensoren${naN?` <span style="color:var(--warn)">(${naN} neu)</span>`:''}</button>
            <button data-action="open-settings" style="${toolBtn};font-size:15px;padding:6px 11px" title="Einstellungen">⚙</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
            <div style="display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--dim);font-weight:600"><span style="width:8px;height:8px;border-radius:50%;background:${mqttOk?'var(--good)':'var(--danger)'};animation:argpulse 1.8s ease-in-out infinite"></span>${esc(brokerLabel)} · ${onlineN}/${flat.length}</div>
            <div id="clock" style="font-family:var(--fontnum);font-size:13px;color:var(--text)">${esc(clock)}</div></div>
        </div>
      </header>

      ${S.pollError?`<div style="background:color-mix(in srgb,var(--danger) 14%,transparent);border:1px solid var(--danger);border-radius:var(--radius);padding:9px 14px;margin-bottom:14px;font-size:12.5px;color:var(--danger);font-weight:600">Backend nicht erreichbar — Anzeige zeigt den Stand von ${S.lastOk?new Date(S.lastOk).toLocaleTimeString('de-DE'):'—'}.</div>`:''}
      ${naN?`<button data-action="open-sensors" style="display:block;width:100%;text-align:left;background:color-mix(in srgb,var(--warn) 12%,transparent);border:1px solid var(--border);border-radius:var(--radius);padding:9px 14px;margin-bottom:14px;font-size:12.5px;color:var(--warn);cursor:pointer;font-family:inherit">${naN} nicht zugeordnete${naN>1?' Sensoren':'r Sensor'} — hier klicken und Gas/Abteilung zuweisen.</button>`:''}

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
                <span style="font-size:13px;color:var(--dim);font-weight:600">Verbrauchs-Trend</span>
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
              <span style="font-size:13px;font-weight:600;color:var(--text)">Aktive Alarme</span>
              <span style="font-size:11px;font-family:var(--fontnum);font-weight:600;color:var(--danger);background:color-mix(in srgb,var(--danger) 15%,transparent);padding:2px 9px;border-radius:20px">${al.length}</span></div>
            <div style="display:flex;flex-direction:column;gap:9px">${alertRows}</div>
          </div>
          <div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:15px 17px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:13px">
              <span style="font-size:13px;font-weight:600;color:var(--text)">Nach Abteilung</span>
              <span style="font-size:11px;font-family:var(--fontnum);color:var(--mute)">${S.unit==='m3'?'m³':'€'} · ${esc(rangeLabel)}</span></div>
            <div style="display:flex;flex-direction:column;gap:11px">${deptRows}</div>
          </div>
        </div>
      </div>

      <div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px 18px">
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px"><span style="font-size:13px;font-weight:600;color:var(--text)">Sensoren</span>
            <span style="font-size:11px;font-family:var(--fontnum);color:var(--mute)">${flat.length} units</span></div>
          <span style="font-size:11px;font-family:var(--fontnum);color:var(--mute)">Verbrauch &amp; Kosten · ${esc(rangeLabel)} · Zeile klicken fokussiert den Chart · ✎ öffnet die Konfiguration</span></div>
        <div style="overflow-x:auto;margin:0 -4px">
          <table style="width:100%;border-collapse:collapse;min-width:800px">
            <thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
        </div>
      </div>
    </div>`;

    applyTheme();
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
  const DAY_LBL=['Mo','Di','Mi','Do','Fr','Sa','So'];   // Index = Python-weekday (Mo=0)

  async function api(path, opts){
    const r=await fetch(path, Object.assign({headers:{'Content-Type':'application/json'}}, opts||{}));
    let body=null; try{ body=await r.json(); }catch(e){}
    if(!r.ok || (body && body.ok===false)) throw new Error((body&&body.error)||('HTTP '+r.status));
    return body;
  }

  function setMsg(text, isErr){
    if(!M) return; M.msg=text; M.msgErr=!!isErr; renderModal();
    if(text && !isErr){ clearTimeout(M._msgT); M._msgT=setTimeout(()=>{ if(M){M.msg='';renderModal();} }, 2500); }
  }

  function closeModal(){ M=null; renderModal(); poll(); }

  // --- Downtime-Fenster-Editor (gemeinsam für Sensor-Override und Defaults) ----
  //   prefix 'f' -> M.edit.downtime (Sensor), 'c' -> M.edit.defaults.downtime (Settings)
  function dtObj(prefix){ return prefix==='f' ? M.edit.downtime : M.edit.defaults.downtime; }
  function dtEditorHTML(prefix, dt, disabled){
    const dis=disabled?'opacity:.45;pointer-events:none':'';
    const rows=dt.windows.map((w,i)=>{
      const days=DAY_LBL.map((lb,d)=>`<button data-action="dt-day" data-tgt="${prefix}" data-w="${i}" data-d="${d}" style="border:1px solid var(--border);border-radius:5px;padding:3px 0;width:30px;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--fontnum);background:${w.days.includes(d)?'var(--accent)':'var(--panel2)'};color:${w.days.includes(d)?'var(--onacc)':'var(--dim)'}">${lb}</button>`).join('');
      return `<div style="display:flex;flex-wrap:wrap;gap:7px;align-items:center;background:var(--panel2);border:1px solid var(--border);border-radius:8px;padding:8px 9px">
        <div style="display:flex;gap:3px">${days}</div>
        <input id="${prefix}-dt-start-${i}" value="${esc(w.start)}" placeholder="22:00" style="${INP};width:64px;text-align:center;font-family:var(--fontnum)">
        <span style="color:var(--mute);font-size:12px">–</span>
        <input id="${prefix}-dt-end-${i}" value="${esc(w.end)}" placeholder="06:00" style="${INP};width:64px;text-align:center;font-family:var(--fontnum)">
        <button data-action="dt-del-window" data-tgt="${prefix}" data-w="${i}" title="Fenster entfernen" style="${BTN};padding:4px 9px;color:var(--danger);margin-left:auto">✕</button>
      </div>`;
    }).join('');
    return `<div style="display:flex;flex-direction:column;gap:8px;${dis}">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label style="display:flex;gap:7px;align-items:center;font-size:12.5px;color:var(--text);cursor:pointer">
          <input type="checkbox" id="${prefix}-dt-enabled" data-action="modal-redraw" ${dt.enabled?'checked':''} style="${CHK}"> Überwachung aktiv</label>
        <div style="display:flex;gap:7px;align-items:center;margin-left:auto">
          <span style="font-size:11.5px;color:var(--mute)">max. Verbrauch im Fenster</span>
          <input id="${prefix}-dt-max" type="number" min="0" step="1" value="${esc(dt.max_nl)}" style="${INP};width:84px;text-align:right;font-family:var(--fontnum)">
          <span style="font-size:11.5px;color:var(--mute)">Nl</span></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px;${dt.enabled?'':'opacity:.45'}">${rows||'<span style="font-size:12px;color:var(--mute)">Keine Fenster definiert.</span>'}</div>
      <button data-action="dt-add-window" data-tgt="${prefix}" style="${BTN};align-self:flex-start;${dt.enabled?'':'opacity:.45'}">＋ Fenster hinzufügen</button>
      <span style="font-size:11px;color:var(--mute)">Alarm, wenn der Verbrauch innerhalb eines Fensters (z. B. Nacht/Wochenende) das Maximum überschreitet. Zeiten als HH:MM, Ende 24:00 = Mitternacht.</span>
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
    try{
      const reg=await api('api/sensors');
      M={type:'sensors', reg, sel:sel||null, edit:null, msg:'', msgErr:false, newDept:false};
      if(sel){ const s=reg.sensors.find(x=>x.id===sel); if(s) M.edit=makeEdit(s); else M.sel=null; }
      renderModal();
    }catch(e){ alert('Sensor-Liste nicht ladbar: '+e.message); }
  }
  function makeEdit(s){
    const dfl=M.reg.defaults||{leak:{min:0.2,active:1.0},downtime:{enabled:false,max_nl:0,windows:[]}};
    return {
      id:s.id, name:s.name||s.id, gas:s.gas||'', dept:s.dept||'',
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
      leak: e.leakOn?{min:e.leak.min,active:e.leak.active}:null,
      downtime: e.dtOn?e.downtime:null };
    try{
      const res=await api('api/sensors/'+encodeURIComponent(e.id), {method:'POST', body:JSON.stringify(body)});
      await refreshReg();
      const s=M.reg.sensors.find(x=>x.id===e.id); if(s) M.edit=makeEdit(s);
      setMsg('Gespeichert ✓'); poll();
    }catch(err){ setMsg('Fehler: '+err.message, true); }
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
      const tag=s.gas?`${gasShort(s.gas)} · ${esc(dname(s.dept))}`:'<span style="color:var(--warn);font-weight:600">nicht zugeordnet</span>';
      return `<button data-action="sel-sensor" data-id="${esc(s.id)}" style="display:block;width:100%;text-align:left;border:1px solid ${active?'var(--accent)':'var(--border)'};background:${active?'var(--panel2)':'transparent'};border-radius:8px;padding:9px 11px;cursor:pointer;color:inherit;font-family:inherit">
        <span style="display:flex;align-items:center;gap:8px">
          <span style="width:8px;height:8px;border-radius:50%;background:${dot};flex:none;${s.online?'animation:argpulse 2.2s ease-in-out infinite':''}"></span>
          <span style="font-size:12.5px;font-weight:600;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.name)}</span>
          <span style="font-size:10.5px;font-family:var(--fontnum);color:var(--mute);flex:none">${esc(s.id)}</span></span>
        <span style="display:block;font-size:11px;color:var(--dim);margin-top:3px">${tag} · ${s.online?'online':'offline'} · ${esc(ago(s.lastSeen))}</span>
      </button>`;
    }).join('');
    const deptChips=(reg.departments||[]).map(d=>`<span style="display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);background:var(--panel2);border-radius:20px;padding:4px 6px 4px 11px;font-size:11.5px;color:var(--text)">${esc(d.name)}
      <button data-action="dept-del" data-id="${esc(d.id)}" title="Abteilung löschen" style="border:none;background:none;color:var(--mute);cursor:pointer;font-size:12px;padding:0 3px">✕</button></span>`).join(' ');
    return `<div style="display:flex;flex-direction:column;gap:8px;height:100%;min-height:0">
      <div style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:7px;padding-right:4px;min-height:120px">${items||'<span style="font-size:12px;color:var(--mute)">Noch keine Sensoren. Sobald ein Gerät publiziert, erscheint es hier automatisch.</span>'}</div>
      <div style="border-top:1px solid var(--border);padding-top:10px">
        <span style="${LBL}">Abteilungen</span>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">${deptChips||'<span style="font-size:11.5px;color:var(--mute)">Noch keine Abteilungen.</span>'}</div>
        <div style="display:flex;gap:7px"><input id="dept-new-name" placeholder="Neue Abteilung …" style="${INP};flex:1">
        <button data-action="dept-create" style="${BTN};flex:none">＋</button></div>
      </div>
    </div>`;
  }
  function sensorFormHTML(){
    const e=M.edit;
    if(!e) return `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--mute);font-size:13px;text-align:center;padding:30px">Sensor links auswählen,<br>um ihn zu konfigurieren.</div>`;
    const reg=M.reg;
    const dfl=reg.defaults||{leak:{min:0.2,active:1.0}};
    const gasOpts=['<option value="">— kein Gas (nicht zugeordnet) —</option>']
      .concat(Object.entries(reg.gases||{}).map(([id,g])=>`<option value="${esc(id)}" ${e.gas===id?'selected':''}>${esc(g.name||id)}</option>`)).join('');
    const deptOpts=['<option value="">— keine Abteilung —</option>']
      .concat((reg.departments||[]).map(d=>`<option value="${esc(d.id)}" ${e.dept===d.id?'selected':''}>${esc(d.name)}</option>`)).join('');
    const s=reg.sensors.find(x=>x.id===e.id)||{};
    return `<div style="display:flex;flex-direction:column;gap:15px">
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
        <span style="font-size:14px;font-weight:700;color:var(--text)">${esc(e.id)}</span>
        <span style="font-size:11.5px;color:${s.online?'var(--good)':'var(--mute)'};font-weight:600">${s.online?'● online':'○ offline'}</span>
        <span style="font-size:11.5px;font-family:var(--fontnum);color:var(--dim)">Total ${esc(fmtNum(s.total,1))} Nl · Flow ${esc(fmtNum(s.flow,2))} Nl/min · ${esc(ago(s.lastSeen))}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="grid-column:1/-1"><span style="${LBL}">Anzeigename</span><input id="f-name" value="${esc(e.name)}" style="${INP}"></div>
        <div><span style="${LBL}">Gas</span><select id="f-gas" style="${INP}">${gasOpts}</select></div>
        <div><span style="${LBL}">Abteilung</span><select id="f-dept" style="${INP}">${deptOpts}</select></div>
      </div>

      <div style="border:1px solid var(--border);border-radius:9px;padding:12px 13px">
        <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;font-weight:600;color:var(--text);cursor:pointer;margin-bottom:9px">
          <input type="checkbox" id="f-leak-on" data-action="modal-redraw" ${e.leakOn?'checked':''} style="${CHK}">
          Leck-Schwellen individuell (sonst Standard: ${esc(dfl.leak.min)}–${esc(dfl.leak.active)} Nl/min)</label>
        <div style="display:flex;gap:12px;align-items:center;${e.leakOn?'':'opacity:.45;pointer-events:none'}">
          <span style="font-size:11.5px;color:var(--mute)">Leck ab</span>
          <input id="f-leak-min" type="number" step="0.1" min="0" value="${esc(e.leak.min)}" style="${INP};width:80px;text-align:right;font-family:var(--fontnum)">
          <span style="font-size:11.5px;color:var(--mute)">bis</span>
          <input id="f-leak-active" type="number" step="0.1" min="0" value="${esc(e.leak.active)}" style="${INP};width:80px;text-align:right;font-family:var(--fontnum)">
          <span style="font-size:11.5px;color:var(--mute)">Nl/min (darüber gilt die Anlage als aktiv)</span></div>
      </div>

      <div style="border:1px solid var(--border);border-radius:9px;padding:12px 13px">
        <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;font-weight:600;color:var(--text);cursor:pointer;margin-bottom:9px">
          <input type="checkbox" id="f-dt-on" data-action="modal-redraw" ${e.dtOn?'checked':''} style="${CHK}">
          Downtime-Regel individuell (sonst Standard aus ⚙)</label>
        ${dtEditorHTML('f', e.downtime, !e.dtOn)}
      </div>

      <div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">
        <button data-action="edit-save" style="${BTNACC}">Speichern</button>
        <button data-action="edit-reset-counter" style="${BTN}" title="Kommando an das Gerät: Gesamtzähler nullen">Zähler nullen</button>
        <button data-action="edit-delete" style="${BTNDGR};margin-left:auto">Sensor löschen</button>
      </div>
      <span style="font-size:11px;color:var(--mute)">„Zähler nullen“ sendet ein Reset-Kommando an das Gerät (MQTT). „Sensor löschen“ entfernt nur den Registry-Eintrag — ein Gerät, das weiter publiziert, erscheint erneut als „nicht zugeordnet“.</span>
    </div>`;
  }

  // --- Einstellungen (⚙) ----------------------------------------------------
  async function openSettings(){
    try{
      const cfg=await api('api/config');
      M={type:'settings', msg:'', msgErr:false, restartHint:false,
         edit:{ stale_seconds:cfg.stale_seconds,
                gases:deepCopy(cfg.gases||{}),
                defaults:deepCopy(cfg.defaults||{leak:{min:0.2,active:1.0},downtime:{enabled:false,max_nl:0,windows:[]}}),
                mqtt:deepCopy(cfg.mqtt||{}) },
         status:cfg.status||{}};
      if(!M.edit.defaults.downtime) M.edit.defaults.downtime={enabled:false,max_nl:0,windows:[]};
      if(!M.edit.defaults.leak) M.edit.defaults.leak={min:0.2,active:1.0};
      renderModal();
    }catch(e){ alert('Konfiguration nicht ladbar: '+e.message); }
  }
  function collectSettingsForm(){
    const e=M&&M.edit; if(!e) return;
    const g=id=>document.getElementById(id);
    if(g('c-stale')) e.stale_seconds=parseInt(g('c-stale').value,10)||120;
    Object.keys(e.gases).forEach(gid=>{ const el=g('c-price-'+gid); if(el) e.gases[gid].price_per_m3=parseFloat(el.value)||0; });
    if(g('c-leak-min')) e.defaults.leak.min=parseFloat(g('c-leak-min').value);
    if(g('c-leak-active')) e.defaults.leak.active=parseFloat(g('c-leak-active').value);
    dtCollect('c');
    const m=e.mqtt;
    if(g('c-embedded')) m.embedded=g('c-embedded').checked;
    if(g('c-anon')) m.allow_anonymous=g('c-anon').checked;
    if(g('c-bind')) m.bind=g('c-bind').value.trim();
    if(g('c-port')) m.port=parseInt(g('c-port').value,10)||1883;
    if(g('c-broker')) m.broker=g('c-broker').value.trim();
    if(g('c-user')) m.username=g('c-user').value.trim();
    if(g('c-pass')) m._newpass=g('c-pass').value;
  }
  async function saveSettings(){
    collectSettingsForm();
    const e=M.edit;
    const body={ stale_seconds:e.stale_seconds, gases:e.gases,
      defaults:{leak:e.defaults.leak, downtime:e.defaults.downtime},
      mqtt:{ embedded:e.mqtt.embedded, bind:e.mqtt.bind, port:e.mqtt.port,
             allow_anonymous:e.mqtt.allow_anonymous, broker:e.mqtt.broker,
             username:e.mqtt.username } };
    if(e.mqtt._newpass) body.mqtt.password=e.mqtt._newpass;
    try{
      const res=await api('api/config', {method:'POST', body:JSON.stringify(body)});
      M.restartHint=!!(res&&res.restart_required);
      if(e.mqtt._newpass){ e.mqtt.has_password=true; e.mqtt._newpass=''; const p=document.getElementById('c-pass'); if(p) p.value=''; }
      setMsg('Gespeichert ✓'); poll();
    }catch(err){ setMsg('Fehler: '+err.message, true); }
  }
  function settingsHTML(){
    const e=M.edit, m=e.mqtt, st=M.status||{};
    const chip=(ok,txtOk,txtBad)=>`<span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;font-family:var(--fontnum);padding:3px 10px;border-radius:20px;background:color-mix(in srgb,${ok?'var(--good)':'var(--danger)'} 14%,transparent);color:${ok?'var(--good)':'var(--danger)'}">● ${ok?txtOk:txtBad}</span>`;
    const priceRows=Object.entries(e.gases).map(([gid,g])=>`<div>
      <span style="${LBL}">${esc(g.name||gid)} · €/m³</span>
      <input id="c-price-${esc(gid)}" type="number" min="0" step="1" value="${esc(g.price_per_m3)}" style="${INP};text-align:right;font-family:var(--fontnum)"></div>`).join('');
    return `<div style="display:flex;flex-direction:column;gap:16px">
      ${M.restartHint?`<div style="background:color-mix(in srgb,var(--warn) 14%,transparent);border:1px solid var(--warn);border-radius:8px;padding:9px 12px;font-size:12px;color:var(--warn);font-weight:600">Broker-Änderungen gespeichert — sie greifen erst nach einem Neustart des Backends (python app.py).</div>`:''}

      <div style="border:1px solid var(--border);border-radius:9px;padding:13px 14px">
        <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:11px">
          <span style="font-size:13px;font-weight:700;color:var(--text)">MQTT-Broker</span>
          ${chip(st.embedded_running, 'Eingebetteter Broker läuft', m.embedded?'Eingebetteter Broker gestoppt':'Eingebetteter Broker aus')}
          ${chip(st.ingest_connected, 'Ingest verbunden', 'Ingest getrennt')}
        </div>
        <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--text);cursor:pointer;margin-bottom:11px">
          <input type="checkbox" id="c-embedded" data-action="modal-redraw" ${m.embedded?'checked':''} style="${CHK}">
          Eingebetteten Broker verwenden (Geräte verbinden sich mit der LAN-IP dieses PCs)</label>
        ${m.embedded?`
        <div style="display:grid;grid-template-columns:1fr 110px;gap:12px">
          <div><span style="${LBL}">Bind-Adresse</span><input id="c-bind" value="${esc(m.bind||'0.0.0.0')}" style="${INP};font-family:var(--fontnum)"></div>
          <div><span style="${LBL}">Port</span><input id="c-port" type="number" value="${esc(m.port||1883)}" style="${INP};text-align:right;font-family:var(--fontnum)"></div>
        </div>
        <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--text);cursor:pointer;margin-top:11px">
          <input type="checkbox" id="c-anon" ${m.allow_anonymous?'checked':''} style="${CHK}"> Anonyme Clients zulassen</label>`
        :`
        <div style="display:grid;grid-template-columns:1fr 110px;gap:12px">
          <div><span style="${LBL}">Externer Broker (Host/IP)</span><input id="c-broker" value="${esc(m.broker||'')}" style="${INP};font-family:var(--fontnum)"></div>
          <div><span style="${LBL}">Port</span><input id="c-port" type="number" value="${esc(m.port||1883)}" style="${INP};text-align:right;font-family:var(--fontnum)"></div>
          <div><span style="${LBL}">Benutzer</span><input id="c-user" value="${esc(m.username||'')}" style="${INP}"></div>
          <div><span style="${LBL}">Passwort</span><input id="c-pass" type="password" placeholder="${m.has_password?'••• (unverändert)':''}" style="${INP}"></div>
        </div>`}
      </div>

      <div style="border:1px solid var(--border);border-radius:9px;padding:13px 14px">
        <span style="font-size:13px;font-weight:700;color:var(--text);display:block;margin-bottom:11px">Preise &amp; Allgemein</span>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
          ${priceRows}
          <div><span style="${LBL}">Offline nach (s ohne Daten)</span>
          <input id="c-stale" type="number" min="10" step="10" value="${esc(e.stale_seconds)}" style="${INP};text-align:right;font-family:var(--fontnum)"></div>
        </div>
      </div>

      <div style="border:1px solid var(--border);border-radius:9px;padding:13px 14px">
        <span style="font-size:13px;font-weight:700;color:var(--text);display:block;margin-bottom:11px">Standard-Schwellwerte (gelten, wenn ein Sensor keine eigenen hat)</span>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:13px;flex-wrap:wrap">
          <span style="font-size:11.5px;color:var(--mute)">Leck ab</span>
          <input id="c-leak-min" type="number" step="0.1" min="0" value="${esc(e.defaults.leak.min)}" style="${INP};width:80px;text-align:right;font-family:var(--fontnum)">
          <span style="font-size:11.5px;color:var(--mute)">bis</span>
          <input id="c-leak-active" type="number" step="0.1" min="0" value="${esc(e.defaults.leak.active)}" style="${INP};width:80px;text-align:right;font-family:var(--fontnum)">
          <span style="font-size:11.5px;color:var(--mute)">Nl/min</span></div>
        <span style="${LBL}">Standard-Downtime</span>
        ${dtEditorHTML('c', e.defaults.downtime, false)}
      </div>

      <div style="display:flex;gap:9px;align-items:center">
        <button data-action="cfg-save" style="${BTNACC}">Speichern</button>
        <span style="font-size:11.5px;color:var(--mute)">Preise/Schwellen greifen sofort · Broker-Änderungen nach Backend-Neustart</span>
      </div>
    </div>`;
  }

  // --- Modal-Rendering ------------------------------------------------------
  function renderModal(){
    if(!M){ modalEl.innerHTML=''; return; }
    const title=M.type==='sensors'?'Sensoren verwalten':'Einstellungen';
    const body=M.type==='sensors'
      ? `<div style="display:flex;gap:16px;min-height:0;flex:1">
           <div style="flex:0 0 285px;min-width:0;min-height:0">${sensorListHTML()}</div>
           <div style="flex:1;min-width:0;overflow-y:auto;padding-right:4px">${sensorFormHTML()}</div>
         </div>`
      : `<div style="overflow-y:auto;min-height:0;flex:1;padding-right:4px">${settingsHTML()}</div>`;
    modalEl.innerHTML=`
    <div id="modal-backdrop" style="position:fixed;inset:0;background:rgba(4,7,12,.62);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;font-family:var(--fontsans)">
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 18px 60px rgba(0,0,0,.45);width:min(920px,100%);max-height:92vh;display:flex;flex-direction:column;padding:17px 19px;color:var(--text)">
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
    if(act==='range'){ S.range=el.getAttribute('data-val'); S.hover=-1; }
    else if(act==='unit'){ S.unit=el.getAttribute('data-val'); }
    else if(act==='theme'){ S.theme=el.getAttribute('data-val'); }
    else if(act==='gas'){ S.gas=el.getAttribute('data-val'); S.scope={type:'total'}; }
    else if(act==='reset-scope'){ S.scope={type:'total'}; }
    else if(act==='sort'){ const k=el.getAttribute('data-key'); if(S.sortKey===k) S.sortDir=S.sortDir==='asc'?'desc':'asc'; else {S.sortKey=k;S.sortDir='desc';} }
    else if(act==='scope-dept'){ const id=el.getAttribute('data-id'); S.scope=(S.scope.type==='dept'&&S.scope.id===id)?{type:'total'}:{type:'dept',id}; }
    else if(act==='scope-machine'){ const id=el.getAttribute('data-id'); S.scope=(S.scope.type==='machine'&&S.scope.id===id)?{type:'total'}:{type:'machine',id}; }
    else if(act==='ack'){ ev.stopPropagation(); const id=el.getAttribute('data-id'); try{ await fetch('api/alarms/'+id+'/ack',{method:'POST'}); await poll(); }catch(e){} return; }

    // ---- Modals öffnen/schließen
    else if(act==='open-sensors'){ ev.stopPropagation(); openSensorManager(el.getAttribute('data-id')||null); return; }
    else if(act==='open-settings'){ openSettings(); return; }
    else if(act==='modal-close'){ closeModal(); return; }

    // ---- Sensor-Manager
    else if(act==='sel-sensor'){ const id=el.getAttribute('data-id'); const s=M.reg.sensors.find(x=>x.id===id);
      M.sel=id; M.edit=s?makeEdit(s):null; M.msg=''; renderModal(); return; }
    else if(act==='edit-save'){ await saveSensor(); return; }
    else if(act==='edit-reset-counter'){ collectSensorForm();
      if(!confirm(`Gesamtzähler von „${M.edit.name}“ (${M.edit.id}) wirklich auf 0 setzen?\nDas Kommando wird an das Gerät gesendet.`)) return;
      try{ await api('api/sensors/'+encodeURIComponent(M.edit.id)+'/reset',{method:'POST'}); setMsg('Reset-Kommando gesendet ✓'); }
      catch(err){ setMsg('Fehler: '+err.message,true); } return; }
    else if(act==='edit-delete'){
      if(!confirm(`Sensor „${M.edit.name}“ (${M.edit.id}) aus der Registry löschen?\nHistorische Daten bleiben in der DB; ein aktives Gerät registriert sich neu.`)) return;
      try{ await api('api/sensors/'+encodeURIComponent(M.edit.id),{method:'DELETE'}); await refreshReg(); M.sel=null; M.edit=null; setMsg('Gelöscht ✓'); poll(); }
      catch(err){ setMsg('Fehler: '+err.message,true); } return; }
    else if(act==='dept-create'){ collectSensorForm();
      const inp=document.getElementById('dept-new-name'); const name=(inp&&inp.value.trim())||'';
      if(!name){ setMsg('Name der Abteilung fehlt',true); return; }
      try{ const res=await api('api/departments',{method:'POST',body:JSON.stringify({name})});
        await refreshReg(); if(M.edit&&!M.edit.dept) M.edit.dept=res.id; setMsg('Abteilung angelegt ✓'); }
      catch(err){ setMsg('Fehler: '+err.message,true); } return; }
    else if(act==='dept-del'){ collectSensorForm(); const id=el.getAttribute('data-id');
      if(!confirm('Abteilung löschen? Zugeordnete Sensoren verlieren nur die Zuordnung.')) return;
      try{ await api('api/departments/'+encodeURIComponent(id),{method:'DELETE'});
        await refreshReg(); if(M.edit&&M.edit.dept===id) M.edit.dept=''; setMsg('Abteilung gelöscht ✓'); poll(); }
      catch(err){ setMsg('Fehler: '+err.message,true); } return; }

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
    else return;
    render();
  });
  // Backdrop-Klick schließt (nur wenn direkt auf den Backdrop geklickt wurde)
  modalEl.addEventListener('mousedown', ev=>{ if(ev.target && ev.target.id==='modal-backdrop') closeModal(); });
  document.addEventListener('keydown', ev=>{ if(ev.key==='Escape' && M) closeModal(); });

  // ------------------------------------------------------------------ data
  async function poll(){
    try{
      const r=await fetch('api/data',{cache:'no-store'});
      if(r.ok){ DATA=await r.json(); S.pollError=false; S.lastOk=Date.now(); render(); }
      else if(!S.pollError){ S.pollError=true; render(); }
    }catch(e){ if(!S.pollError){ S.pollError=true; render(); } }
  }
  setInterval(poll, 5000);
  setInterval(()=>{ S.now=Date.now(); const c=document.getElementById('clock'); if(c){ const d=new Date(S.now); c.textContent=d.toLocaleTimeString('en-GB')+' · '+d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}); } }, 1000);
  applyTheme();
  poll();
})();
