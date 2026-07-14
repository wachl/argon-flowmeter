/* Gas Monitoring – Frontend (vanilla, kein Build-Schritt).
   Daten live aus dem Backend (GET /api/data), gas-neutral (Argon + Stickstoff).
   Preise pro Gas -> die €/m³-Umschaltung ist gasabhängig. */
(() => {
  "use strict";

  const THEMES = {
    control:{'--bg':'#0a0e16','--bg2':'#0e1320','--panel':'#121826','--panel2':'#171f30','--border':'#26304a','--text':'#e9f0fb','--dim':'#9db0cc','--mute':'#677792','--accent':'#34e2a6','--accent2':'#46c6ff','--good':'#34e2a6','--warn':'#ffb547','--danger':'#ff5d72','--grid':'rgba(255,255,255,0.06)','--stroke':'#46c6ff','--onacc':'#04140d','--shadow':'0 1px 0 rgba(255,255,255,0.03)','--radius':'11px','--fontsans':"'IBM Plex Sans',system-ui,sans-serif",'--fontnum':"'IBM Plex Mono',monospace",'--bgimg':'radial-gradient(1100px 520px at 82% -8%, rgba(70,198,255,0.07), transparent 60%)'},
    analytics:{'--bg':'#eef1f6','--bg2':'#f6f8fb','--panel':'#ffffff','--panel2':'#f5f8fc','--border':'#e3e8f0','--text':'#101c2e','--dim':'#4a586b','--mute':'#93a1b4','--accent':'#2563eb','--accent2':'#0e9aa7','--good':'#15a34a','--warn':'#d97706','--danger':'#dc2626','--grid':'rgba(16,28,46,0.07)','--stroke':'#2563eb','--onacc':'#ffffff','--shadow':'0 1px 2px rgba(16,28,46,0.06),0 1px 3px rgba(16,28,46,0.05)','--radius':'12px','--fontsans':"'IBM Plex Sans',system-ui,sans-serif",'--fontnum':"'IBM Plex Mono',monospace",'--bgimg':'none'},
    technical:{'--bg':'#0b0e0c','--bg2':'#0f130f','--panel':'#0e120f','--panel2':'#121712','--border':'#26302a','--text':'#d7e3da','--dim':'#88a092','--mute':'#5d7165','--accent':'#7dffab','--accent2':'#ffc56b','--good':'#7dffab','--warn':'#ffc56b','--danger':'#ff8472','--grid':'rgba(125,255,171,0.09)','--stroke':'#7dffab','--onacc':'#04140b','--shadow':'none','--radius':'3px','--fontsans':"'JetBrains Mono',monospace",'--fontnum':"'JetBrains Mono',monospace",'--bgimg':'repeating-linear-gradient(0deg, rgba(125,255,171,0.022) 0 1px, transparent 1px 27px), repeating-linear-gradient(90deg, rgba(125,255,171,0.022) 0 1px, transparent 1px 27px)'}
  };

  const S = {                       // UI-State
    range:'7d', unit:'m3', theme:'control', gas:'all',
    scope:{type:'total'}, sortKey:'cons', sortDir:'desc', hover:-1, now:Date.now()
  };
  let DATA = null;                  // letzte Backend-Antwort
  const root = document.getElementById('root');

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
    if(!DATA){ root.innerHTML=`<div style="padding:40px;font-family:sans-serif;color:#9db0cc">Warte auf Daten vom Backend …</div>`; return; }
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
      + `<th style="text-align:right;padding:7px 12px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);font-weight:600;border-bottom:1px solid var(--border)">14-day</th>`;
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
        <td style="padding:9px 12px;text-align:right">${sparkSVG(m.daily.slice(16),r.statusColor)}</td></tr>`;
    }).join('');

    const d=new Date(S.now);
    const clock=d.toLocaleTimeString('en-GB')+' · '+d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
    const mqttOk=onlineN>0;
    const gasSegs = seg(S.gas==='all','all','gas','Alle') + gasesList().map(g=>seg(S.gas===g.id,g.id,'gas',g.name)).join('');
    const naN=unassigned().length;

    root.innerHTML = `
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
          <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
            <div style="display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--dim);font-weight:600"><span style="width:8px;height:8px;border-radius:50%;background:${mqttOk?'var(--good)':'var(--danger)'};animation:argpulse 1.8s ease-in-out infinite"></span>${mqttOk?'MQTT ONLINE':'NO DATA'} · ${onlineN}/${flat.length}</div>
            <div id="clock" style="font-family:var(--fontnum);font-size:13px;color:var(--text)">${esc(clock)}</div></div>
        </div>
      </header>

      ${naN?`<div style="background:color-mix(in srgb,var(--warn) 12%,transparent);border:1px solid var(--border);border-radius:var(--radius);padding:9px 14px;margin-bottom:14px;font-size:12.5px;color:var(--warn)">${naN} nicht zugeordnete${naN>1?' Sensoren':'r Sensor'} — Gas/Abteilung in sensors.json zuweisen.</div>`:''}

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
          <span style="font-size:11px;font-family:var(--fontnum);color:var(--mute)">Verbrauch &amp; Kosten · ${esc(rangeLabel)} · Zeile klicken fokussiert den Chart</span></div>
        <div style="overflow-x:auto;margin:0 -4px">
          <table style="width:100%;border-collapse:collapse;min-width:760px">
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

  function applyTheme(){ const v=THEMES[S.theme]||THEMES.control; const el=root.firstElementChild; if(el) for(const k in v) el.style.setProperty(k,v[k]); document.body.style.setProperty('--border',v['--border']); document.body.style.background=v['--bg']; }

  // ---------------------------------------------------------------- events
  root.addEventListener('click', async ev=>{
    const el=ev.target.closest('[data-action]'); if(!el) return;
    const act=el.getAttribute('data-action');
    if(act==='range'){ S.range=el.getAttribute('data-val'); S.hover=-1; }
    else if(act==='unit'){ S.unit=el.getAttribute('data-val'); }
    else if(act==='theme'){ S.theme=el.getAttribute('data-val'); }
    else if(act==='gas'){ S.gas=el.getAttribute('data-val'); S.scope={type:'total'}; }
    else if(act==='reset-scope'){ S.scope={type:'total'}; }
    else if(act==='sort'){ const k=el.getAttribute('data-key'); if(S.sortKey===k) S.sortDir=S.sortDir==='asc'?'desc':'asc'; else {S.sortKey=k;S.sortDir='desc';} }
    else if(act==='scope-dept'){ const id=el.getAttribute('data-id'); S.scope=(S.scope.type==='dept'&&S.scope.id===id)?{type:'total'}:{type:'dept',id}; }
    else if(act==='scope-machine'){ const id=el.getAttribute('data-id'); S.scope=(S.scope.type==='machine'&&S.scope.id===id)?{type:'total'}:{type:'machine',id}; }
    else if(act==='ack'){ ev.stopPropagation(); const id=el.getAttribute('data-id'); try{ await fetch('api/alarms/'+id+'/ack',{method:'POST'}); await poll(); }catch(e){} return; }
    else return;
    render();
  });

  // ------------------------------------------------------------------ data
  async function poll(){
    try{
      const r=await fetch('api/data',{cache:'no-store'});
      if(r.ok){ DATA=await r.json(); render(); }
    }catch(e){ /* Backend evtl. noch nicht da */ }
  }
  setInterval(poll, 5000);
  setInterval(()=>{ S.now=Date.now(); const c=document.getElementById('clock'); if(c){ const d=new Date(S.now); c.textContent=d.toLocaleTimeString('en-GB')+' · '+d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}); } }, 1000);
  poll();
})();
