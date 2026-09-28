/* Portföy Defteri — düzen: 4 ana bölüm, alt menüler, enstrüman sekmeleri, arama, uyarılar, sade mod, açılır bölümler */
"use strict";
const SECTIONS={
  ozet:{label:'Özet',icon:'M3 12l9-8 9 8M5 10v10h14V10'},
  portfoy:{label:'Portföyüm',icon:'M4 7h16v12H4zM8 7V5h8v2',subs:[['pozisyon','Pozisyonlar'],['defter','Günlük · plan · vergi']]},
  piyasa:{label:'Piyasa',icon:'M4 19V9M10 19V5M16 19v-7M22 19H2',subs:[['enstruman','Enstrümanlar'],['haber','Haberler'],['takvim','Takvim']]},
  teknik:{label:'Teknik',icon:'M7 4v16M7 8h-2v6h2M17 4v16M17 7h-2v8h2M12 9v11M12 12h-2v4h2',subs:[['grafik','Grafik paneli'],['karsilastir','Karşılaştır · oran'],['test','Sinyal testi'],['tarama','Teknik tarama']]},
  analiz:{label:'Analiz',icon:'M4 20l5-6 4 3 7-9',subs:[['getiri','Reel getiri'],['risk','Risk'],['makro','Makro'],['beklenti','Vade beklentisi'],['senaryo','Senaryo'],['dengeleme','Dengeleme'],['simulator','Eklesem ne olur?'],['haftalik','Haftalık rapor']]}
};
const LEGACY={pozisyon:['portfoy','pozisyon'],defter:['portfoy','defter'],enstruman:['piyasa','enstruman'],haber:['piyasa','haber'],takvim:['piyasa','takvim'],haftalik:['analiz','haftalik']};
const ITABS=[['genel','Genel bakış'],['plan','Plan ve beklenti'],['teknik','Teknik'],['temel','Temel'],['haber','Haberler'],['iceriden','İçeriden işlemler']];
function route2(){
  const h=location.hash.replace(/^#\/?/,'')||'ozet';const parts=h.split('/').map(decodeURIComponent);
  if(parts[0]==='t')return {r:'t',t:(parts[1]||'').toUpperCase(),sub:parts[2]||'genel'};
  if(LEGACY[parts[0]])return {r:LEGACY[parts[0]][0],sub:LEGACY[parts[0]][1]};
  if(parts[0]==='piyasa'&&parts[1]==='tarama')return {r:'teknik',sub:'tarama'};
  if(parts[0]==='teknik')return {r:'teknik',sub:parts[1]||'grafik',t:(parts[2]||'').toUpperCase()};
  if(parts[0]==='piyasa'&&parts[1]==='karsilastir')return {r:'teknik',sub:'karsilastir'};
  const r=SECTIONS[parts[0]]?parts[0]:'ozet';const subs=SECTIONS[r].subs;return {r,sub:parts[1]||(subs?subs[0][0]:null)};
}
function navHTML(){return Object.entries(SECTIONS).map(([k,v])=>`<a href="#/${k}" data-r="${k}">${v.label}</a>`).join('')}
function bottomNavHTML(){return Object.entries(SECTIONS).map(([k,v])=>`<a href="#/${k}" data-r="${k}"><svg viewBox="0 0 24 24" width="21" height="21"><path d="${v.icon}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${v.label}</span></a>`).join('')+`<a href="#" data-search="1"><svg viewBox="0 0 24 24" width="21" height="21"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span>Ara</span></a>`}
function subnav(r,sub){const S_=SECTIONS[r];if(!S_||!S_.subs)return '';return `<nav class="subnav">${S_.subs.map(([k,l])=>`<a href="#/${r}/${k}" class="${k===sub?'on':''}">${l}</a>`).join('')}</nav>`}
function markNav(r){$$('#tabs a,#bnav a').forEach(a=>a.classList.toggle('on',a.dataset.r===r||(r==='t'&&a.dataset.r==='piyasa')))}

/* ---------- Analiz alt sayfaları ---------- */
function analizPart(part){
  if(part==='makro')return viewMakro();
  if(part==='simulator')return viewSim();if(part==='haftalik')return viewHaftalik();if(part==='beklenti')return viewPortExpect()+viewInstExpectTable();
  const tmp=document.createElement('div');tmp.innerHTML=viewAnaliz();const root=tmp.firstElementChild||tmp;const kids=Array.from(root.children);
  const map={getiri:'Reel getiri',risk:'Risk paneli',senaryo:'Senaryo testi',dengeleme:'Dengeleme hesaplayıcı'};const want=map[part]||map.getiri;
  let on=false;const keep=[];for(const el of kids){const h2=el.classList.contains('sec-t')?el.querySelector('h2'):null;if(h2){on=h2.textContent.trim()===want}if(on)keep.push(el.outerHTML)}
  keep.forEach((x,i)=>{if(i===0)keep[0]=x.replace('class="sec-t"','class="sec-t" style="margin-top:0"')});
  return `<div class="fade">${keep.join('')}</div>`;
}
function viewInstExpectTable(){
  const ts=allTickers().filter(t=>series(t).length>60);const rows=ts.map(t=>({t,E:expectation(t)})).filter(r=>r.E&&r.E.mc);
  return `<div class="sec-t"><div><h2>Enstrüman bazında 30 gün</h2><p>Her enstrümanın 30 günlük olası sonuçları ve teknik plana göre hedef/stop olasılığı · satıra tıkla, detay açılır</p></div></div>
  <section class="card"><div class="tscroll"><table class="tbl"><thead><tr><th>Enstrüman</th><th class="r">Fiyat</th><th class="r">30G medyan</th><th class="r">%50 aralık</th><th class="r">Yükselme olasılığı</th><th class="r">Önce TP1</th><th class="r">Önce stop</th><th class="r">Yıllık oynaklık</th></tr></thead><tbody>
  ${rows.map(({t,E})=>{const h=E.mc.h[30];const px=E.px;return `<tr style="cursor:pointer" onclick="location.hash='#/t/${t}/plan'"><td><div class="sym">${logo(t)}<b>${esc(dispT(t))}</b></div></td><td class="r num">${pxf(t,px)}</td><td class="r num ${cls(h.p50-px)}">${pct((h.p50/px-1)*100,1)}</td><td class="r num" style="font-size:12.5px">${pct((h.p25/px-1)*100,1)} / ${pct((h.p75/px-1)*100,1)}</td><td class="r num">%${nf(h.up,0)}</td><td class="r num up">${E.plan?'%'+nf(h.tpFirst,0):'—'}</td><td class="r num down">${E.plan?'%'+nf(h.slFirst,0):'—'}</td><td class="r num">%${nf(E.mc.annVol,0)}</td></tr>`}).join('')}
  </tbody></table></div><p class="muted" style="font-size:12px;margin:10px 0 0">Mod: ${S.mcMode==='hist'?'son 1 yılın eğilimi':'nötr eğilim'} (yukarıdaki düğmeden değiştirilebilir).</p></section>`;
}

/* ---------- Piyasa: teknik tarama + plan sütunları ---------- */
function viewTarama(){
  let h=viewScreener();if(!h)return '<div class="empty">Veri yok</div>';
  h=h.replace('<th class="r">Hacim</th></tr>','<th class="r">Hacim</th><th class="r">Alım bölgesi</th><th class="r">Stop</th><th class="r">TP1</th><th class="r">R/R</th></tr>');
  h=h.replace(/<tr onclick="location.hash='#\/teknik\/grafik\/([^']+)'"([\s\S]*?)<\/tr>/g,(m,t,body)=>`<tr onclick="location.hash='#/teknik/grafik/${t}'"${body}${planCells(t)}</tr>`);
  return h.replace('class="sec-t"','class="sec-t" style="margin-top:0"');
}

/* ---------- enstrüman sayfası: sekmeler ---------- */
function viewInstTabs(t,tab){
  const i=inst(t);if(!i)return `<div class="empty"><b>${esc(t)} bulunamadı</b><a href="#/piyasa">Piyasaya dön</a></div>`;
  const full=viewInst(t);const tmp=document.createElement('div');tmp.innerHTML=full;const root=tmp.firstElementChild;const kids=Array.from(root.children);
  // viewInst sırası: back, ihead, ana ızgara, teknik, temel göstergeler, değerlendirme, güçlü/zayıf, varlıklar, bilançolar, içeriden, haberler
  const pick=pred=>kids.filter(pred).map(e=>e.outerHTML).join('');
  const txt=e=>(e.querySelector('h3')||{}).textContent||'';
  const isHead=e=>e.classList.contains('back')||e.classList.contains('ihead');
  const isMain=e=>e.classList.contains('g-main')&&!!e.querySelector('#cInst');
  const isTech=e=>/Teknik analiz/.test(txt(e));
  const isMetrics=e=>/Temel göstergeler/.test(txt(e));
  const isSummary=e=>/Değerlendirme/.test(txt(e));
  const isSW=e=>/Güçlü yanlar/.test(txt(e));
  const isHold=e=>/En büyük varlıklar|Yapı|Segmentler/.test(e.textContent.slice(0,200));
  const isEarn=e=>!!e.querySelector('.ec');
  const isIns=e=>/Şirket içi ve Kongre/.test(txt(e));
  const isNews=e=>/İlgili haberler/.test(txt(e));
  const hasIns=kids.some(isIns);
  const tabs=ITABS.filter(([k])=>k!=='iceriden'||hasIns);
  let body='';
  if(tab==='plan')body=planCard(t)+`<div class="sec">${psCard(t)}</div>`+expectSection(t)+btSection(t);
  else if(tab==='teknik')body=pick(isTech)+levelsSection(t);
  else if(tab==='temel')body=pick(isMetrics)+pick(isSW)+pick(isHold)+pick(isEarn);
  else if(tab==='haber')body=pick(isNews);
  else if(tab==='iceriden')body=pick(isIns);
  else body=pick(isMain)+planCard(t)+pick(isSummary);
  return `<div class="fade">${pick(isHead)}<nav class="subnav itabs">${tabs.map(([k,l])=>`<a href="#/t/${encodeURIComponent(t)}/${k}" class="${k===tab?'on':''}">${l}</a>`).join('')}</nav>${body}</div>`;
}
function afterInstTabs(t,tab){
  if(tab==='genel'){const s=sliceRange(series(t),S.range.inst);const c=s.length>1&&s[s.length-1][1]>=s[0][1]?'#2fe39a':'#ff5d7a';const el=$('#cInst');if(el)lineChart(el,[{name:t,color:c,pts:s}],{area:true,fmt:(v,ax)=>(isTRY(t)?'₺':'$')+nf(v,ax?0:2)})}
  if(tab==='teknik'){afterTech(t);afterLevels(t)}
  if(tab==='plan'){afterExpect(t);afterPs(t);afterBt()}
}

/* ---------- uyarılar ---------- */
function alerts(){
  const out=[];const P=positions();const held=new Set(P.list.filter(m=>m.qty>0).map(m=>m.t));const scope=held.size?Array.from(held):tickers();
  journalDue().forEach(l=>out.push({lvl:2,ic:'📓',txt:`${dispT(l.t)} alışının tezini gözden geçirme zamanı`,href:'#/portfoy/defter'}));
  planDue().forEach(x=>out.push({lvl:2,ic:'🗓️',txt:`${dispT(x.p.t)} alım planı ${x.i+1}/${x.p.n} taksiti zamanı`,href:'#/portfoy/defter'}));
  const soon=(S.data.events||[]).filter(e=>{const d=new Date(e.date)-Date.now();return d>-3600e3&&d<48*3600e3});
  soon.forEach(e=>out.push({lvl:e.importance>=3?2:1,ic:'⏰',txt:`${e.title} · ${new Date(e.date).toLocaleString('tr-TR',{weekday:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'})}`,href:'#/piyasa/takvim'}));
  scope.forEach(t=>{const s=typeof techSignals==='function'?techSignals(t):null;const q=quote(t);
    if(isNum(q.pct)&&Math.abs(q.pct)>=3)out.push({lvl:1,ic:q.pct>0?'🚀':'📉',txt:`${dispT(t)} günü ${pct(q.pct,1)} kapattı`,href:`#/t/${t}`});
    if(!s)return;
    if(s.rsi>=75)out.push({lvl:1,ic:'🔥',txt:`${dispT(t)} aşırı alımda (RSI ${nf(s.rsi,0)})`,href:`#/t/${t}/teknik`});
    if(s.rsi<=30)out.push({lvl:1,ic:'🧊',txt:`${dispT(t)} aşırı satımda (RSI ${nf(s.rsi,0)})`,href:`#/t/${t}/teknik`});
    if(s.ichi.lastCross&&s.ichi.lastCross.ago<=3)out.push({lvl:1,ic:'☁',txt:`${dispT(t)}: Tenkan–Kijun ${s.ichi.lastCross.up?'yukarı':'aşağı'} kesişimi (${s.ichi.lastCross.ago?s.ichi.lastCross.ago+' gün önce':'bugün'})`,href:`#/t/${t}/teknik`});
    if(s.boll.squeeze)out.push({lvl:1,ic:'⚡',txt:`${dispT(t)}: Bollinger sıkışması, sert hareket öncesi olabilir`,href:`#/t/${t}/teknik`});
    const pl=typeof tradePlan==='function'?tradePlan(t):null;if(pl){if(pl.state==='Fiyat alım bölgesinde')out.push({lvl:2,ic:'🎯',txt:`${dispT(t)} teknik alım bölgesinde (${pxf(t,pl.zone.lo)}–${pxf(t,pl.zone.hi)})`,href:`#/t/${t}/plan`});
      if(pl.state==='Destek kırıldı'&&held.has(t))out.push({lvl:3,ic:'⛔',txt:`${dispT(t)} stop seviyesinin altında (${pxf(t,pl.stop)})`,href:`#/t/${t}/plan`})}
  });
  return out.sort((a,b)=>b.lvl-a.lvl);
}
function alertsCard(){const A=alerts();if(!A.length)return '';const show=A.slice(0,S.alAll?50:6);
  return `<section class="card alerts"><h3>Dikkat edilecekler <span class="r">${'Notification' in window?`<button class="lnk2" id="nfBtn" style="margin:0 10px 0 0">${notifOn()?'🔔 Bildirimler açık':'🔕 Bildirimleri aç'}</button>`:''}<span class="muted">${A.length}</span></span></h3><div class="al">${show.map(a=>`<a class="ali l${a.lvl}" href="${a.href}"><span class="ic">${a.ic}</span><span>${esc(a.txt)}</span><i>→</i></a>`).join('')}</div>${A.length>6?`<button class="lnk2" id="alMore">${S.alAll?'Daha az göster':'Tümünü göster ('+A.length+')'}</button>`:''}</section>`}

/* ---------- arama ---------- */
function searchItems(){
  const it=allTickers().map(t=>({k:dispT(t),d:(inst(t)||{}).name||'',href:`#/t/${t}`,tag:(inst(t)||{}).watchlist?'İzleme':'Enstrüman'}));
  Object.entries(SECTIONS).forEach(([r,v])=>{it.push({k:v.label,d:'Bölüm',href:`#/${r}`,tag:'Sayfa'});(v.subs||[]).forEach(([s,l])=>it.push({k:l,d:v.label,href:`#/${r}/${s}`,tag:'Sayfa'}))});
  return it;
}
function openSearch(){const m=$('#search');m.hidden=false;const i=$('#sq');i.value='';drawSearch('');setTimeout(()=>i.focus(),30)}
function closeSearch(){$('#search').hidden=true}
function drawSearch(q){const Q=q.trim().toLocaleLowerCase('tr');const L=searchItems().filter(x=>!Q||(x.k+' '+x.d).toLocaleLowerCase('tr').includes(Q)).slice(0,12);S.sIdx=0;
  $('#sres').innerHTML=L.map((x,i)=>`<a href="${x.href}" class="${i===0?'on':''}"><b>${esc(x.k)}</b><span>${esc(x.d)}</span><em>${esc(x.tag)}</em></a>`).join('')||'<div class="muted" style="padding:14px">Sonuç yok</div>'}

/* ---------- açılır bölümler ve sade mod ---------- */
function colKey(h){return 'c:'+h.textContent.trim().slice(0,40)}
function applyCollapse(){const C=lsJSON('pd_col',{});$$('.sec-t h2').forEach(h=>{const n=h.closest('.sec-t').nextElementSibling;if(!n)return;h.classList.add('colh');const c=!!C[colKey(h)];h.classList.toggle('closed',c);n.classList.toggle('collapsed',c)})}
function setupChrome(){
  $('#tabs').innerHTML=navHTML();$('#bnav').innerHTML=bottomNavHTML();
  document.body.classList.toggle('sade',lsGet('pd_sade')==='1');
  $('#sade').onclick=()=>{const on=!document.body.classList.contains('sade');document.body.classList.toggle('sade',on);lsSet('pd_sade',on?'1':'0');toast(on?'Sade görünüm: sadece ana rakamlar':'Detaylı görünüm')};
  $('#srch').onclick=openSearch;$('#search').onclick=e=>{if(e.target.id==='search')closeSearch()};
  $('#bnav').addEventListener('click',e=>{const a=e.target.closest('[data-search]');if(a){e.preventDefault();openSearch()}});
  $('#sq').oninput=e=>drawSearch(e.target.value);
  $('#sq').onkeydown=e=>{const L=$$('#sres a');if(e.key==='Escape')closeSearch();if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();S.sIdx=Math.max(0,Math.min(L.length-1,S.sIdx+(e.key==='ArrowDown'?1:-1)));L.forEach((a,i)=>a.classList.toggle('on',i===S.sIdx))}if(e.key==='Enter'&&L[S.sIdx]){location.hash=L[S.sIdx].getAttribute('href');closeSearch()}};
  $('#sres').addEventListener('click',()=>setTimeout(closeSearch,10));
  document.addEventListener('keydown',e=>{if(e.key==='/'&&!/input|textarea|select/i.test(document.activeElement.tagName)){e.preventDefault();openSearch()}});
  $('#view').addEventListener('click',e=>{const h=e.target.closest('.sec-t h2');if(h){const C=lsJSON('pd_col',{});const k=colKey(h);C[k]=!C[k];lsSet('pd_col',JSON.stringify(C));applyCollapse()}
    if(e.target.id==='alMore'){S.alAll=!S.alAll;render(false)}
    if(e.target.id==='nfBtn'){if(notifOn()){lsSet('pd_notif','0');toast('Bildirimler kapatıldı');render(false)}else notifEnable()}});
  S.tf=lsGet('pd_tf')||'D';
}

/* ---------- Teknik: tam ekran grafik paneli ---------- */
function techTickers(){return allTickers().filter(t=>S.ohlc&&(S.ohlc[t]||[]).length>=30)}
function techPick(t){const L=techTickers();if(t&&L.includes(t)){lsSet('pd_tt',t);return t}const m=lsGet('pd_tt');return L.includes(m)?m:L[0]}
function viewTeknikPanel(t0){
  const L=techTickers();if(!L.length)return '<div class="empty">OHLC verisi yok</div>';const t=techPick(t0);S.techBig=true;
  const i=inst(t)||{};const q=quote(t);const idx=L.indexOf(t);const prev=L[(idx-1+L.length)%L.length],next=L[(idx+1)%L.length];
  const chips=L.map(x=>{const s=techSignals(x);const qq=quote(x);return `<a href="#/teknik/grafik/${encodeURIComponent(x)}" class="tpk ${x===t?'on':''}"><i class="dot ${s?s.ichi.cls:''}"></i><b>${esc(dispT(x))}</b><span class="${cls(qq.pct)}">${pct(qq.pct,1)}</span></a>`}).join('');
  const html=`<div class="fade"><div class="tpick">${chips}</div>
  <div class="thead2"><div class="sym">${logo(t)}<div><b style="font-size:20px">${esc(dispT(t))}</b><div class="muted" style="font-size:13px">${esc(i.name||'')}</div></div></div>
    <div class="px2"><b class="num">${pxf(t,q.price)}</b> ${chip(q.pct)}</div>
    <div class="tnav"><a class="btn ghost sm" href="#/teknik/grafik/${encodeURIComponent(prev)}" title="Önceki (←)">←</a><a class="btn ghost sm" href="#/teknik/grafik/${encodeURIComponent(next)}" title="Sonraki (→)">→</a><a class="btn ghost sm" href="#/t/${encodeURIComponent(t)}/plan">Plan ve beklenti</a><a class="btn ghost sm" href="#/t/${encodeURIComponent(t)}">Enstrüman sayfası</a></div></div>
  ${techSection(t)}
  <div class="grid g2 sec" style="align-items:start">${planCard(t,true)}<div class="grid" style="align-content:start">${summaryCard(t)}${psCard(t)}</div></div>
  ${btSection(t)}
  ${levelsSection(t)}</div>`;
  S.techBig=false;return {html,t};
}
function summaryCard(t){const s=techSignals(t);if(!s)return '';const x=tech(t);const P=tradePlan(t);
  const votes=[['Ichimoku',s.ichi.score>=2?1:s.ichi.score<=-2?-1:0],['Trend (50/200)',x?(x.tc==='up'?1:x.tc==='down'?-1:0):0],['MACD',s.macd.h>0?1:-1],['RSI',s.rsi>=70?-1:s.rsi<=30?1:s.rsi>50?1:-1],['Stokastik',s.stoch.k>=80?-1:s.stoch.k<=20?1:0],['Bollinger %B',s.boll.pb>1?-1:s.boll.pb<0?1:0]];
  const sc=votes.reduce((a,v)=>a+v[1],0);const lab=sc>=3?'Güçlü al bölgesi sinyalleri':sc>=1?'Olumlu':sc<=-3?'Zayıf':sc<=-1?'Olumsuz':'Kararsız';const c=sc>0?'up':sc<0?'down':'';
  return `<section class="card"><h3>Gösterge oylaması <span class="r ${c}">${sc>0?'+':''}${sc} / 6</span></h3><div class="vote-h ${c}">${lab}</div>
  <div class="votes">${votes.map(([k,v])=>`<div><span>${k}</span><b class="${v>0?'up':v<0?'down':'muted'}">${v>0?'▲ olumlu':v<0?'▼ olumsuz':'■ nötr'}</b></div>`).join('')}</div>
  ${P?`<p class="muted" style="font-size:13px;margin:12px 0 0;line-height:1.5">Plan durumu: <b class="${P.stc==='up'?'up':P.stc==='down'?'down':''}">${esc(P.state)}</b>. ${esc(P.msg)}</p>`:''}
  <p class="muted" style="font-size:12px;margin:8px 0 0">Oylama kısa vadeli teknik görünümü özetler; temel analiz ve haberleri içermez.</p></section>`}
function afterTeknikPanel(t){S.techBig=true;try{afterTech(t);afterLevels(t)}finally{S.techBig=false}afterPs(t);afterBt();
  const L=techTickers();document.onkeydown=e=>{if(route2().r!=='teknik'||/input|textarea|select/i.test(document.activeElement.tagName))return;const i=L.indexOf(t);if(e.key==='ArrowRight')location.hash='#/teknik/grafik/'+L[(i+1)%L.length];if(e.key==='ArrowLeft')location.hash='#/teknik/grafik/'+L[(i-1+L.length)%L.length]};
  const on=$('.tpk.on'),bx=$('.tpick');if(on&&bx)bx.scrollLeft=on.offsetLeft-bx.clientWidth/2+on.clientWidth/2}
