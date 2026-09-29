/* Portföy Defteri — ORION araştırma motoru: istek formu (6 mod), otomatik kırmızı bayrak tarayıcı, rapor görüntüleyici.
   İstek: data/r/<id>.json → zamanlanmış görev 5-P çerçevesiyle raporu yazar → data/research/<id>.json + data/research/index.json */
"use strict";
const ORION_MODES=[
  ['snapshot','Hızlı özet','Kısa hisse brifingi: tez, değerleme, teknik, riskler'],
  ['deep','Derin analiz','14 bölümlük tam rapor: 5-P, senaryolar, ayı tezi önce'],
  ['discovery','Fırsat taraması','Temeli fiyattan hızlı iyileşen, gözden kaçan hisseler'],
  ['compare','Karşılaştır','2-5 şirketi büyüme, marj, FCF, değerleme ile yan yana'],
  ['earnings','Bilanço','Bilanço öncesi beklenti farkı ya da sonrası değerlendirme'],
  ['trade','Swing işlem','1-6 ay: katalizör, giriş/stop/hedef, risk/getiri']];
const ORION_SECT=[['summary','Yönetici özeti'],['market','Piyasa bağlamı'],['quality','İş kalitesi'],['thesis','Piyasanın mevcut tezi'],['gap','Konsensüs nerede yanılıyor olabilir'],['valuation','Değerleme'],['catalysts','Katalizörler'],['technical','Teknik / pozisyonlanma'],['bull','Boğa tezi'],['bear','Ayı tezi'],['scenarios','Senaryo analizi'],['change','Tezi ne değiştirir'],['metrics','İzlenecek metrikler'],['verdict','Araştırma kararı']];
const STANCE_C={'olumlu':'up','nötr':'n','temkinli':'warnc','olumsuz':'down'};
function orionIdx(){return ((S.research&&S.research.items)||[]).slice().sort((a,b)=>String(b.answeredAt||'').localeCompare(String(a.answeredAt||'')))}
function orionPend(){const I=orionIdx();return (S.settings.orionPending||[]).filter(p=>!I.some(r=>r.id===p.id))}
function modeName(m){const x=ORION_MODES.find(z=>z[0]===m);return x?x[1]:m}
function stanceChip(s){return s?`<span class="chip ${STANCE_C[s]||'n'}">${esc(s)}</span>`:''}

/* ---------- otomatik kırmızı bayrak tarayıcı (yerel veriden) ---------- */
function redFlagsAuto(t){const F=fundOf(t),out=[];const q=(F&&F.q)||[];const add=(k,label,st,note)=>out.push({k,label,st,note});
  const sum=(a,k)=>a.every(x=>isNum(x[k]))?a.reduce((s,x)=>s+x[k],0):null;
  const cur=q.slice(-4),prv=q.length>=8?q.slice(-8,-4):null;
  if(q.length>=5){const r1=sum(cur,'rev'),r0=prv?sum(prv,'rev'):null;const g=r0?(r1/r0-1)*100:(q[q.length-5].rev?(q[q.length-1].rev/q[q.length-5].rev-1)*100:null);
    add('rev','Gelir düşüşü / durgunluk',!isNum(g)?'na':g<0?'bad':g<3?'watch':'ok',isNum(g)?'yıllık '+pct(g,1):'veri yok');
    if(prv){const m1=sum(cur,'op')/r1*100,m0=sum(prv,'op')/r0*100;add('margin','Faaliyet marjı daralması',!isNum(m1)||!isNum(m0)?'na':m1<m0-3?'bad':m1<m0-1?'watch':'ok',isNum(m1)&&isNum(m0)?`%${nf(m0,1)} → %${nf(m1,1)}`:'veri yok');
      const f1=sum(cur,'fcf'),f0=sum(prv,'fcf');add('fcf','Serbest nakit akışı bozulması',!isNum(f1)?'na':f1<0?'bad':isNum(f0)&&f0>0&&f1<f0*.8?'watch':'ok',isNum(f1)?(isNum(f0)?`${bigN(f0)} → ${bigN(f1)}`:bigN(f1)):'veri yok')}
    const s1=q[q.length-1].shares,s0=q[q.length-5].shares;if(isNum(s1)&&isNum(s0)&&s0){const d=(s1/s0-1)*100;add('dil','Hisse sulanması',d>4?'bad':d>1.5?'watch':'ok','yıllık '+pct(d,1)+' hisse adedi')}
    const L=q[q.length-1],P=q[q.length-5];if(isNum(L.debt)&&isNum(P.debt)){const op=sum(cur,'op');const lev=op>0?L.debt/op:null;const up=P.debt?(L.debt/P.debt-1)*100:0;
      add('lev','Artan kaldıraç',(lev!=null&&lev>3)||(up>25&&(L.cash||0)<L.debt)?'bad':up>10&&(L.cash||0)<L.debt?'watch':'ok',`borç ${bigN(L.debt)}${lev!=null?' · borç/FVÖK '+nf(lev,1)+'x':''}${P.debt?' · yıllık '+pct(up,0):''}`)}}
  else add('fund','Temel veri','na','bilanço verisi henüz yok (temel veri görevi dolduracak)');
  const I=(((S.insider||{}).tickers||{})[t]||{}).insider;if(I){const net=(I.buyValue||0)-(I.sellValue||0);add('ins','İçeriden satış',I.sellCount>=5&&net<-5e6?'watch':'ok',`90g: ${I.buyCount||0} alım / ${I.sellCount||0} satış · net ${bigN(net)}`)}
  const u=uniOf(t);if(isNum(u.pe)){const ps=(typeof peerSet==='function'?peerSet(t):[]).map(x=>uniOf(x).pe).filter(v=>isNum(v)&&v>0).sort((a,b)=>a-b);
    const med=ps.length>=3?ps[Math.floor(ps.length/2)]:null;add('val','Sürdürülemez değerleme',u.pe<0?'watch':med&&u.pe>med*2?'bad':med&&u.pe>med*1.4?'watch':u.pe>60?'watch':'ok',`F/K ${nf(u.pe,1)}${med?' · rakip medyanı '+nf(med,1):''}`)}
  return out}
function bigN(v){if(!isNum(v))return '—';const a=Math.abs(v),s=v<0?'−':'';return s+'$'+(a>=1e12?nf(a/1e12,2)+' tn':a>=1e9?nf(a/1e9,1)+' mr':a>=1e6?nf(a/1e6,0)+' mn':nf(a,0))}
const FLAG_I={bad:'🔴',watch:'🟡',ok:'🟢',na:'⚪'};
function flagScanCard(){const L=(typeof stockList==='function'?stockList():[]);if(!L.length)return '';
  const rows=L.map(t=>{const f=redFlagsAuto(t);const bad=f.filter(x=>x.st==='bad').length,w=f.filter(x=>x.st==='watch').length;return {t,f,bad,w}}).sort((a,b)=>b.bad-a.bad||b.w-a.w);
  return `<section class="card sec"><h3>🚩 Kırmızı bayrak tarayıcı <span class="r muted" style="font-size:12px">bilanço, içeriden işlem ve değerleme verisinden otomatik</span></h3>
  ${rows.map(r=>`<details class="qa"><summary class="qq"><b>${esc(dispT(r.t))}</b> <span class="muted">${r.bad?`${r.bad} kırmızı`:''}${r.bad&&r.w?' · ':''}${r.w?`${r.w} izle`:''}${!r.bad&&!r.w?'belirgin bayrak yok':''}</span> <span class="r">${r.f.map(x=>FLAG_I[x.st]).join('')}</span></summary>
    <table class="tbl"><tbody>${r.f.map(x=>`<tr><td>${FLAG_I[x.st]} ${esc(x.label)}</td><td class="muted num">${esc(x.note)}</td></tr>`).join('')}</tbody></table>
    <button class="btn ghost sm" data-orq="deep" data-ort="${esc(r.t)}">ORION derin analiz iste →</button></details>`).join('')}
  <p class="muted" style="font-size:11.5px;margin:6px 0 0">Müşteri yoğunlaşması, muhasebe/denetçi sorunları, agresif non-GAAP, stok/alacak şişmesi ve satın almalarla gizlenen organik zayıflık yerel veriden ölçülemez; bunlar ORION raporunda kontrol edilir.</p></section>`}

/* ---------- istek formu ---------- */
function orionForm(t,mode){const m=mode||S.orionMode||(t?'snapshot':'deep');
  return `<section class="card sec orion"><h3>🔭 ORION araştırma iste <span class="r muted" style="font-size:12px">rapor en geç ~1 saat içinde · telefona bildirim</span></h3>
  <form class="orf"><div class="seg orseg ormodes">${ORION_MODES.map(x=>`<button type="button" class="${x[0]===m?'on':''}" data-m="${x[0]}" title="${esc(x[2])}">${esc(x[1])}</button>`).join('')}</div>
  <p class="muted ormdesc" style="font-size:12.5px;margin:6px 0">${esc((ORION_MODES.find(x=>x[0]===m)||[])[2]||'')}</p>
  <input type="hidden" name="mode" value="${m}">
  <div class="orrow"><input name="tk" placeholder="${m==='discovery'?'isteğe bağlı: sektör/tema (ör. yarı iletken ekipman)':m==='compare'?'ör. GOOGL, META, MSFT':'ör. NVDA'}" value="${esc(t?dispT(t):'')}" autocomplete="off" autocapitalize="characters">
  <button class="btn" type="submit">Gönder</button></div>
  <textarea name="note" rows="2" maxlength="500" placeholder="İsteğe bağlı not: tez, soru, zaman ufku (ör. 3 aylık işlem olarak bak; bilanço öncesi beklenti farkı)"></textarea></form>
  <p class="muted" style="font-size:11.5px;margin:6px 0 0">İstekler ve raporlar sitenin herkese açık deposunda saklanır; tutar yazma. Raporlar araştırmadır, yatırım tavsiyesi değildir.</p></section>`}
async function orionSubmit(mode,tk,note,btn){
  if(!(S.settings.ghToken||'').trim()){toast('Önce Ayarlar\'a GitHub anahtarını gir');return false}
  const tickers=(tk||'').toUpperCase().split(/[\s,;/]+/).map(x=>x.trim()).filter(x=>/^[A-Z][A-Z0-9.\-]{0,9}$/.test(x)).slice(0,5);
  if(mode!=='discovery'&&!tickers.length){toast('En az bir sembol yaz');return false}
  if(mode==='compare'&&tickers.length<2){toast('Karşılaştırma için en az iki sembol yaz');return false}
  const id=Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  const obj={id,mode,tickers,topic:mode==='discovery'&&!tickers.length?(tk||'').trim():'',note:(note||'').trim(),createdAt:new Date().toISOString()};
  if(btn){btn.disabled=true;btn.textContent='Gönderiliyor…'}
  let ok=false;try{ok=await ghPutJSON('data/r/'+id+'.json',obj,'ORION isteği (site)')}catch(e){}
  if(btn){btn.disabled=false;btn.textContent='Gönder'}
  if(!ok){toast('Gönderilemedi; GitHub anahtarını kontrol et');return false}
  S.settings.orionPending=(S.settings.orionPending||[]).concat(obj).slice(-20);try{await saveSettings()}catch(e){}
  toast(modeName(mode)+' isteği gönderildi · rapor ~1 saat içinde');return true}

/* ---------- sayfa ---------- */
function viewOrion(){if(S.orionId)return viewOrionReport(S.orionId);
  const I=orionIdx(),P=orionPend();const f=S.orionF||'all';const L=I.filter(r=>f==='all'||r.mode===f);
  return `<div class="fade">${orionForm(null)}
  ${P.length?`<section class="card sec"><h3>⏳ Hazırlanıyor</h3>${P.map(p=>`<div class="qa pend"><div class="qq"><span class="chip">${esc(modeName(p.mode))}</span> ${esc((p.tickers||[]).map(dispT).join(', ')||p.topic||'genel tarama')}${p.note?` <span class="muted">— ${esc(p.note)}</span>`:''}</div><div class="muted" style="font-size:12.5px">${esc(trDT(p.createdAt))}</div></div>`).join('')}</section>`:''}
  <section class="card sec"><h3>📚 Raporlar <span class="r seg orseg orflt">${[['all','Tümü']].concat(ORION_MODES.map(x=>[x[0],x[1]])).map(x=>`<button class="${f===x[0]?'on':''}" data-f="${x[0]}">${esc(x[1])}</button>`).join('')}</span></h3>
  ${L.length?L.map(r=>`<a class="orrep" href="#/piyasa/arastirma" data-orid="${esc(r.id)}"><div><span class="chip">${esc(modeName(r.mode))}</span> <b>${esc(r.title||(r.tickers||[]).join(', '))}</b> ${stanceChip(r.stance)}</div><div class="muted" style="font-size:13px">${esc(r.summary||'')}</div><div class="muted" style="font-size:11.5px">${esc(trDT(r.answeredAt))}</div></a>`).join(''):'<p class="muted">Henüz rapor yok. Yukarıdan bir istek gönder.</p>'}</section>
  ${flagScanCard()}
  <section class="card sec"><h3>Çerçeve</h3><div class="prose" style="font-size:13.5px"><p><b>5-P:</b> Picture (piyasa rejimi, faiz, dolar, rotasyon) → Probe (iş modeli, marjlar, FCF, ROIC, sulanma) → Price (F/K, EV/FVÖK, FCF getirisi, rakip ve tarihsel aralık) → Pressure (0-30 gün / 1-3 ay / 3-12 ay katalizörler: teyitli, olası, spekülatif) → Position (trend, göreli güç, hacim, destek/direnç).</p><p><b>Ayı tezi önce</b>, beklenti farkı, 3-5 rakiple rekabet karşılaştırması, üç zaman ufku (işlemci / swing / yatırımcı), ayı-baz-boğa senaryoları ve son itiraz kontrolü. Güvenilir veri bulunamazsa rapor bunu açıkça yazar.</p></div></section></div>`}
function afterOrion(){
  $$('.ormodes button').forEach(b=>b.onclick=()=>{S.orionMode=b.dataset.m;const f=b.closest('form');const v=f.tk.value,n=f.note.value;render(false);const g=$('.orf');if(g){g.tk.value=v;g.note.value=n}});
  $$('.orf').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const ok=await orionSubmit(f.mode.value,f.tk.value,f.note.value,f.querySelector('button[type=submit]'));if(ok){f.tk.value='';f.note.value='';render(false)}});
  $$('.orflt button').forEach(b=>b.onclick=e=>{e.preventDefault();S.orionF=b.dataset.f;render(false)});
  $$('[data-orid]').forEach(a=>a.onclick=e=>{e.preventDefault();S.orionId=a.dataset.orid;if(!location.hash.startsWith('#/piyasa/arastirma'))location.hash='#/piyasa/arastirma';else render(true)});
  $$('[data-orq]').forEach(b=>b.onclick=async e=>{e.preventDefault();b.disabled=true;const ok=await orionSubmit(b.dataset.orq,b.dataset.ort,'',null);b.disabled=false;if(ok)render(false)});
  $$('.orback').forEach(b=>b.onclick=e=>{e.preventDefault();S.orionId=null;render(true)});
  if(S.orionId&&!(S.orionCache||{})[S.orionId]){const id=S.orionId;fetch('data/research/'+id+'.json?v='+Date.now()).then(r=>r.ok?r.json():null).then(j=>{S.orionCache=S.orionCache||{};S.orionCache[id]=j||{missing:true};if(S.orionId===id)render(false)}).catch(()=>{})}}

/* ---------- rapor görüntüleyici ---------- */
function viewOrionReport(id){const R=(S.orionCache||{})[id];const back=`<a href="#/piyasa/arastirma" class="orback muted">← Raporlar</a>`;
  if(!R)return `<div class="fade">${back}<section class="card"><p class="muted">Rapor yükleniyor…</p></section></div>`;
  if(R.missing)return `<div class="fade">${back}<section class="card"><p class="muted">Rapor dosyası bulunamadı.</p></section></div>`;
  const V=R.verdict||{},TF=R.timeframes||{};const sec=Object.fromEntries((R.sections||[]).map(s=>[s.k,s]));
  const tfc=(k,l)=>TF[k]?`<div class="ortf"><div class="muted" style="font-size:12px">${l}</div>${stanceChip(TF[k].stance)}<div style="font-size:13px">${esc(TF[k].text||'')}</div></div>`:'';
  const scn=(R.scenarios||[]);const mx=Math.max(1,...scn.map(s=>Math.abs(s.upside||0)));
  const W={'0-30g':'0-30 gün','1-3a':'1-3 ay','3-12a':'3-12 ay'};
  const body=[
   `<section class="card orhead"><div class="muted" style="font-size:12px"><span class="chip">${esc(modeName(R.mode))}</span> ${esc(trDT(R.answeredAt))}${R.asOf?' · veri '+esc(R.asOf):''}</div><h2 style="margin:6px 0">${esc(R.title||'')}</h2>
    <div class="orverd">${stanceChip(V.stance)}${V.conviction?` <span class="muted">güven: ${esc(V.conviction)}</span>`:''}</div>${V.text?`<p style="margin:8px 0 0"><b>${esc(V.text)}</b></p>`:''}
    ${R.summary?`<div class="prose">${paras(R.summary)}</div>`:''}
    <div class="ortfs">${tfc('trader','İşlemci · 1 gün-4 hafta')}${tfc('swing','Swing · 1-6 ay')}${tfc('investor','Yatırımcı · 1-3 yıl')}</div>
    <button class="btn ghost sm" data-speak="orion:${esc(R.id)}">🔊 Dinle</button></section>`,
   R.trade?`<section class="card sec"><h3>İşlem planı</h3><div class="kpis">${[['Giriş',R.trade.entry],['Stop',R.trade.stop],['Hedefler',(R.trade.targets||[]).join(' / ')],['Risk/getiri',R.trade.rr],['Ufuk',R.trade.horizon]].filter(x=>x[1]!=null&&x[1]!=='').map(x=>`<div class="kpi"><div class="l">${x[0]}</div><div class="v num" style="font-size:18px">${esc(x[1])}</div></div>`).join('')}</div>${R.trade.note?`<p class="muted" style="font-size:13px">${esc(R.trade.note)}</p>`:''}</section>`:'',
   (R.picks||[]).length?`<section class="card sec"><h3>Bulunan fırsatlar</h3><table class="tbl"><tbody>${R.picks.map(p=>`<tr><td><b>${esc(p.t)}</b>${p.n?`<div class="muted" style="font-size:12px">${esc(p.n)}</div>`:''}</td><td style="font-size:13.5px">${esc(p.why||'')}${p.risk?`<div class="muted" style="font-size:12px">Risk: ${esc(p.risk)}</div>`:''}</td><td><button class="btn ghost sm" data-orq="deep" data-ort="${esc(p.t)}">Derin analiz</button></td></tr>`).join('')}</tbody></table></section>`:'',
   scn.length?`<section class="card sec"><h3>Senaryolar <span class="r muted" style="font-size:12px">mevcut fiyattan</span></h3><div class="tscroll"><table class="tbl"><thead><tr><th>Senaryo</th><th>Gelir</th><th>Marj</th><th>EPS/FCF</th><th>Çarpan</th><th class="r">Değer</th><th class="r">Potansiyel</th></tr></thead><tbody>${scn.map(s=>`<tr><td><b>${esc(s.name)}</b>${s.prob?` <span class="muted">%${esc(s.prob)}</span>`:''}</td><td>${esc(s.rev||'')}</td><td>${esc(s.margin||'')}</td><td>${esc(s.eps||'')}</td><td>${esc(s.multiple||'')}</td><td class="r num">${esc(s.value!=null?s.value:'')}</td><td class="r"><span class="orbar"><i class="${(s.upside||0)>=0?'up':'down'}" style="width:${Math.abs(s.upside||0)/mx*100}%"></i></span> <span class="num ${cls(s.upside)}">${pct(s.upside,0)}</span></td></tr>${s.drivers?`<tr><td></td><td colspan="6" class="muted" style="font-size:12.5px">${esc(s.drivers)}</td></tr>`:''}`).join('')}</tbody></table></div></section>`:'',
   (R.catalysts||[]).length?`<section class="card sec"><h3>Katalizör takvimi</h3>${['0-30g','1-3a','3-12a'].map(w=>{const c=R.catalysts.filter(x=>x.window===w);return c.length?`<div class="orcw"><div class="muted" style="font-size:12px;font-weight:600">${W[w]}</div>${c.map(x=>`<div class="orcat"><span class="chip ${x.cls==='teyitli'?'up':x.cls==='olası'?'n':'warnc'}">${esc(x.cls||'')}</span> ${x.date?`<span class="num muted">${esc(x.date)}</span> `:''}${esc(x.what)}</div>`).join('')}</div>`:''}).join('')}</section>`:'',
   (R.redflags||[]).length?`<section class="card sec"><h3>🚩 Kırmızı bayraklar</h3><table class="tbl"><tbody>${R.redflags.map(x=>`<tr><td>${x.status==='var'?'🔴':x.status==='izle'?'🟡':'🟢'} ${esc(x.flag)}</td><td class="muted" style="font-size:13px">${esc(x.note||'')}</td></tr>`).join('')}</tbody></table></section>`:'',
   (R.peers||[]).length?`<section class="card sec"><h3>Rekabet</h3><div class="tscroll"><table class="tbl"><thead><tr><th>Şirket</th><th class="r">Gelir büyümesi</th><th class="r">Brüt marj</th><th class="r">Faal. marjı</th><th class="r">FCF marjı</th><th class="r">F/K</th><th>Pazar payı</th></tr></thead><tbody>${R.peers.map(p=>`<tr><td><b>${esc(p.t)}</b></td>${['revG','gm','opm','fcfm'].map(k=>`<td class="r num">${isNum(p[k])?'%'+nf(p[k],1):'—'}</td>`).join('')}<td class="r num">${isNum(p.pe)?nf(p.pe,1):'—'}</td><td>${esc(p.share||'')}</td></tr>`).join('')}</tbody></table></div></section>`:'',
   ORION_SECT.filter(([k])=>sec[k]&&k!=='summary').map(([k,h])=>`<details class="card sec orsec" ${['gap','bear','verdict'].includes(k)?'open':''}><summary><h3 style="display:inline">${esc(sec[k].h||h)}</h3></summary><div class="prose">${paras(sec[k].body)}</div></details>`).join(''),
   (R.sections||[]).filter(s=>!ORION_SECT.some(x=>x[0]===s.k)).map(s=>`<details class="card sec orsec"><summary><h3 style="display:inline">${esc(s.h)}</h3></summary><div class="prose">${paras(s.body)}</div></details>`).join(''),
   (R.metrics||[]).length||(R.changeMind||[]).length?`<section class="card sec two">${(R.metrics||[]).length?`<div><h3>İzlenecek metrikler</h3><ul>${R.metrics.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}${(R.changeMind||[]).length?`<div><h3>Fikrimi ne değiştirir</h3><ul>${R.changeMind.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}</section>`:'',
   (R.sources||[]).length?`<section class="card sec"><h3>Kaynaklar</h3><ol class="muted" style="font-size:12.5px">${R.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>${s.date?' · '+esc(s.date):''}</li>`).join('')}</ol></section>`:'',
   `<p class="muted" style="font-size:11.5px">Bu rapor araştırma amaçlıdır, yatırım tavsiyesi değildir.</p>`];
  return `<div class="fade">${back}${body.join('')}</div>`}
function orionSpeak(id){const R=(S.orionCache||{})[id];if(!R)return '';const V=R.verdict||{};
  return [R.title,V.stance?'Karar: '+V.stance:'',V.text||'',R.summary||''].concat((R.sections||[]).filter(s=>['gap','bear','verdict'].includes(s.k)).flatMap(s=>[s.h+'.',s.body])).filter(Boolean).join('. ')}
document.addEventListener('click',e=>{const b=e.target&&e.target.closest&&e.target.closest('[data-speak^="orion:"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();speakText(orionSpeak(b.dataset.speak.slice(6)),b)},true);

/* ---------- enstrüman sayfası kartı ---------- */
function orionInstCard(t){const T=dispT(t);const I=orionIdx().filter(r=>(r.tickers||[]).map(x=>x.toUpperCase()).includes(T.toUpperCase())||(r.tickers||[]).includes(t)).slice(0,3);
  const P=orionPend().filter(p=>(p.tickers||[]).includes(T));const isStock=(inst(t)||{}).type==='Hisse';
  const modes=isStock?['snapshot','deep','earnings','trade']:['snapshot','trade'];
  return `<section class="card sec"><h3>🔭 ORION araştırma</h3>
  ${I.map(r=>`<a class="orrep" href="#/piyasa/arastirma" data-orid="${esc(r.id)}"><div><span class="chip">${esc(modeName(r.mode))}</span> ${stanceChip(r.stance)} <span class="muted" style="font-size:12px">${esc(trDT(r.answeredAt))}</span></div><div style="font-size:13px">${esc(r.summary||'')}</div></a>`).join('')}
  ${P.map(p=>`<div class="muted" style="font-size:12.5px">⏳ ${esc(modeName(p.mode))} hazırlanıyor…</div>`).join('')}
  <div class="seg orseg" style="margin-top:8px;flex-wrap:wrap">${modes.map(m=>`<button data-orq="${m}" data-ort="${esc(T)}">${esc(modeName(m))}</button>`).join('')}</div>
  <p class="muted" style="font-size:11.5px;margin:6px 0 0">Bir mod seç; rapor ~1 saat içinde hazır olur.</p></section>`}
function afterOrionInst(){$$('[data-orq]').forEach(b=>b.onclick=async e=>{e.preventDefault();b.disabled=true;const ok=await orionSubmit(b.dataset.orq,b.dataset.ort,'',null);b.disabled=false;if(ok)render(false)});
  $$('[data-orid]').forEach(a=>a.onclick=e=>{e.preventDefault();S.orionId=a.dataset.orid;location.hash='#/piyasa/arastirma'})}
