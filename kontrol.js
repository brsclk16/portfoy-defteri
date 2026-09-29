/* Portföy Defteri — işlem öncesi kontrol, bilanço öncesi kartı, alarm kuralları sayfası */
"use strict";

/* ---------- ortak: ağırlıklardan risk payı ---------- */
function riskShares(wmap){
  const ts=Object.keys(wmap).filter(t=>wmap[t]>0);if(!ts.length)return null;const C=S.labCache||(S.labCache={});
  const key='rs|'+tickers().concat(ts).sort().join(',');if(!C[key])C[key]=alignedReturns(Array.from(new Set(tickers().concat(ts))),252);const {dates,R}=C[key];
  const sum=ts.reduce((s,t)=>s+wmap[t],0);const pr=dates.map((_,i)=>{let s=0,q=0;ts.forEach(t=>{const v=R[t]&&R[t][i];if(v==null)return;s+=wmap[t]/sum*v;q+=wmap[t]/sum});return q>0?s/q:null});
  const st=stats(pr);if(!st)return null;const varP=st.sd*st.sd;const out={vol:st.sd*Math.sqrt(252)*100,rc:{},th:{}};
  ts.forEach(t=>{const c=covar(R[t]||[],pr);out.rc[t]=c&&varP?wmap[t]/sum*c.cov/varP*100:0;const T=themeOf(t).name;out.th[T]=(out.th[T]||0)+out.rc[t]});
  return out;
}
function themeW(wmap){const s=Object.values(wmap).reduce((a,b)=>a+b,0)||1;const o={};Object.entries(wmap).forEach(([t,v])=>{const T=themeOf(t).name;o[T]=(o[T]||0)+v/s*100});return o}

/* ---------- bilanço yakınlığı ---------- */
function upcomingEarnings(days){
  const EH=(S.ehist&&S.ehist.data)||{};const now=Date.now(),lim=now+days*864e5;const out=new Map();
  (S.data.events||[]).filter(e=>e.kind==='bilanco').forEach(e=>{const d=new Date(e.date).getTime();if(d<now-6*3600e3||d>lim)return;
    const cs=(e.holdings&&e.holdings.length?e.holdings:(e.tickers||[]).filter(t=>inst(t)&&inst(t).type==='Hisse'));cs.forEach(c=>{if(!out.has(c))out.set(c,{t:c,date:e.date,title:e.title})})});
  Object.entries(EH).forEach(([c,x])=>{if(!x.next)return;const d=new Date(x.next.dt||x.next.d).getTime();if(d<now-6*3600e3||d>lim)return;if(!out.has(c))out.set(c,{t:c,date:x.next.dt||x.next.d,title:`${x.name||c} bilançosu (${x.next.q||''})`})});
  return Array.from(out.values()).sort((a,b)=>a.date.localeCompare(b.date));
}
function exposureTo(c){ // portföyde c şirketine doğrudan ve fonlar üzerinden $ maruziyet
  const P=positions();const real=P.total>0;const {w}=weights();const base=real?P.total:10000;const via=[];
  const val=t=>real?((P.list.find(m=>m.t===t)||{}).value||0):base*(w[t]||0)/100;
  Object.values(S.data.instruments).forEach(i=>{if(i.watchlist)return;const v=val(i.ticker);if(!(v>0))return;
    if(i.ticker===c)via.push({t:i.ticker,w:100,v,usd:v});else{const h=(i.holdings||[]).find(x=>x.t===c);if(h)via.push({t:i.ticker,w:h.w,v,usd:v*h.w/100})}});
  return {via,usd:via.reduce((s,x)=>s+x.usd,0),base,real};
}
function earnStats(c){
  const x=S.ehist&&S.ehist.data&&S.ehist.data[c];if(!x||!x.hist||!x.hist.length)return null;const H=x.hist.slice(0,8);const m=H.map(h=>h.move);
  const big=H.reduce((a,h)=>Math.abs(h.move)>Math.abs(a.move)?h:a,H[0]);
  return {name:x.name,H,n:H.length,avgAbs:m.reduce((s,v)=>s+Math.abs(v),0)/m.length,up:m.filter(v=>v>0).length,big,avg:m.reduce((s,v)=>s+v,0)/m.length};
}
function fundMoveOn(t,rd,prev){const s=closeSeries(t);const a=lastLE(s,prev),b=lastLE(s,rd);return a&&b?(b/a-1)*100:null}
function viewEarnPre(days=7,compact){
  const L=upcomingEarnings(days).map(e=>({...e,st:earnStats(e.t),ex:exposureTo(e.t)})).filter(e=>e.st||e.ex.usd>0);if(!L.length)return '';
  const tf=d=>new Date(d).toLocaleString('tr-TR',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'});
  return `<section class="card ep"><h3>Bilanço yaklaşıyor <span class="r muted">${days} gün içinde · son 8 bilançodaki ilk gün tepkileri</span></h3>
  <div class="ep-list">${L.slice(0,compact?3:12).map(e=>{const s=e.st,x=e.ex;const typ=s?s.avgAbs:null;
    const fundRx=s?x.via.filter(v=>v.t!==e.t).map(v=>{const mv=s.H.map(h=>fundMoveOn(v.t,h.rd,h.prev)).filter(isNum);return mv.length?{t:v.t,avg:mv.reduce((a,b)=>a+Math.abs(b),0)/mv.length}:null}).filter(Boolean):[];
    return `<div class="ep-i"><div class="ep-h"><span class="sym">${logo(e.t)}<b>${esc(s&&s.name||e.t)}</b></span><span class="muted">${esc(tf(e.date))}</span></div>
      ${s?`<div class="ep-k"><span>Tipik hareket <b>±%${nf(s.avgAbs,1)}</b></span><span>Yükselen <b>${s.up}/${s.n}</b></span>${(()=>{const m=typeof emFor==='function'?emFor(e.t,e.date):null;return m?`<span>Opsiyonlar <b>±%${nf(m.em,1)}</b> fiyatlıyor</span>`:''})()}<span>En sert <b class="${cls(s.big.move)}">${pct(s.big.move,1)}</b> <span class="muted">(${esc(s.big.q||s.big.d)})</span></span></div>
      <div class="ep-bars">${s.H.slice().reverse().map(h=>`<i class="${h.move>=0?'u':'d'}" style="height:${Math.min(100,Math.abs(h.move)/Math.max(8,Math.abs(s.big.move))*100)}%" title="${esc(h.q||'')} ${esc(h.d)}: ${pct(h.move,1)}"></i>`).join('')}</div>`:''}
      ${x.usd>0?`<div class="ep-x">Portföyünde ${x.via.map(v=>v.t===e.t?`<b>doğrudan</b> ${usd(v.usd,0)}`:`<b>${esc(v.t)}</b> içinde %${nf(v.w,1)} (${usd(v.usd,0)})`).join(' · ')}.
        ${typ?` Tipik bir hareket (±%${nf(typ,1)}) portföyüne mekanik olarak <b>±${usd(x.usd*typ/100,0)}</b>; %10 düşüş <b class="down">−${usd(x.usd*.1,0)}</b>.`:''}
        ${fundRx.length?`<span class="muted"> Geçmiş bilanço günlerinde ${fundRx.map(f=>`${esc(f.t)} ortalama ±%${nf(f.avg,1)}`).join(', ')} hareket etti.</span>`:''}</div>`:''}</div>`}).join('')}</div>
  <p class="muted" style="font-size:12px;margin:8px 0 0">Tepki: sonuçların açıklandığı seansın (piyasa kapanışı sonrasıysa ertesi günün) kapanışı ile önceki kapanış arası. Çubuklar eskiden yeniye son 8 bilanço. Kaynak: Bigdata.com, Twelve Data.</p></section>`;
}

/* ---------- işlem öncesi kontrol ---------- */
function pretradeData(lot){
  const t=lot.t,buy=lot.side!=='S';const cv=isTRY(t)&&fx()?fx():1;const px=lot.p/cv;const amt=lot.q*px+(buy?1:-1)*(+lot.fee||0)/cv;
  const P=positions();const w0={};P.list.forEach(m=>{if(m.value>0)w0[m.t]=m.value});const w1={...w0};w1[t]=Math.max(0,(w1[t]||0)+(buy?1:-1)*lot.q*(quote(t).price||lot.p)/cv);if(!(w1[t]>0))delete w1[t];
  const tot0=P.total,tot1=Object.values(w1).reduce((a,b)=>a+b,0);
  const o={t,buy,px,amt,tot0,tot1,wt0:tot0>0?(w0[t]||0)/tot0*100:0,wt1:tot1>0?(w1[t]||0)/tot1*100:0,th0:themeW(w0),th1:themeW(w1),theme:themeOf(t).name,target:(S.settings.targets||{})[t]};
  try{o.r0=Object.keys(w0).length?riskShares(w0):null;o.r1=Object.keys(w1).length?riskShares(w1):null}catch(e){}
  if((S.ohlc&&(S.ohlc[t]||[]).length>=120)){try{o.plan=tradePlan(t)}catch(e){}}
  if(o.plan&&buy){const pl=o.plan;o.rrAt=px>pl.stop?(pl.tp1.p-px)/(px-pl.stop):null;o.zonePos=px<pl.zone.lo?'altında':px<=pl.zone.hi?'içinde':'üstünde';o.zoneGap=px>pl.zone.hi?(px/pl.zone.hi-1)*100:px<pl.zone.lo?(px/pl.zone.lo-1)*100:0}
  if(buy&&+lot.stop>0){o.riskUsd=lot.q*(px-(+lot.stop)/cv);o.riskPct=tot1>0?o.riskUsd/tot1*100:null}
  const rel=[t].concat(((inst(t)||{}).holdings||[]).filter(h=>h.w>=4).map(h=>h.t));o.earn=upcomingEarnings(10).filter(e=>rel.includes(e.t)).map(e=>({...e,st:earnStats(e.t),w:e.t===t?100:((inst(t).holdings||[]).find(h=>h.t===e.t)||{}).w}));
  if(!buy){
    const m=P.list.find(x=>x.t===t);o.realUsd=m?lot.q*(px-m.avg)-(+lot.fee||0)/cv:null;
    const T0=taxCalc();S.lots.push(lot);let T1;try{T1=taxCalc()}finally{S.lots.pop()}const sale=T1.sales.find(s=>s.l===lot);const y=lot.date.slice(0,4);
    const y0=T0.years.find(x=>x.year===y)||{net:0,tax:0},y1=T1.years.find(x=>x.year===y)||{net:0,tax:0};
    const ym=(S.macro&&S.macro.yiufe&&S.macro.yiufe.monthly)||{};const ks=Object.keys(ym).sort().slice(-3);const mr=ks.length?ks.reduce((s,k)=>s+ym[k],0)/ks.length/100:0.02;
    o.tax={sale,y,net0:y0.net,net1:y1.net,tax0:y0.tax||0,tax1:y1.tax||0,parts:(sale?sale.parts:[]).map(p=>{const r=p.uf;const need=r!=null&&r<1.10&&mr>0?Math.ceil(Math.log(1.10/r)/Math.log(1+mr)):0;return {...p,inc:r!=null?(r-1)*100:null,months:need}})};
  }
  return o;
}
function pretradeHTML(lot){
  const o=pretradeData(lot);const tl=v=>isNum(v)?(v<0?'−':'')+'₺'+nf(Math.abs(v),0):'—';const pl=o.plan;const flags=[];
  if(o.buy&&pl){if(o.zonePos==='üstünde'&&o.zoneGap>3)flags.push(['warn',`Fiyat alım bölgesinin %${nf(o.zoneGap,1)} üstünde`]);if(o.rrAt!=null&&o.rrAt<1)flags.push(['warn',`Bu fiyattan TP1'e göre risk/getiri 1:${nf(o.rrAt,1)}`]);if(pl.state==='Destek kırıldı')flags.push(['down','Teknik plan: destek kırılmış']);if(pl.state==='Aşırı ısınmış')flags.push(['warn','Teknik plan: aşırı ısınmış']);if(o.zonePos==='içinde')flags.push(['up','Fiyat alım bölgesinde'])}
  if(o.buy&&o.target!=null&&o.wt1>+o.target+5)flags.push(['warn',`Hedef ağırlığı (%${nf(+o.target,0)}) %${nf(o.wt1-o.target,1)} puan aşacak`]);
  if(o.r1&&o.r1.th[o.theme]>60&&o.buy)flags.push(['warn',`${o.theme} risk payı %${nf(o.r1.th[o.theme],0)}'e çıkıyor`]);
  o.earn.forEach(e=>flags.push(['warn',`${e.t===o.t?'Bilanço':e.t+' bilançosu'} ${new Date(e.date).toLocaleDateString('tr-TR',{day:'numeric',month:'short'})}${e.st?` · tipik hareket ±%${nf(e.st.avgAbs,1)}`:''}`]));
  if(!o.buy&&o.tax&&o.tax.parts.some(p=>p.months>0&&p.months<=3))flags.push(['warn','Bazı lotlar Yİ-ÜFE %10 eşiğine 3 aydan az uzakta']);
  const row=(l,a,b,c)=>`<div class="pt-r"><span>${l}</span><span class="num">${a}</span>${b!==undefined?`<span class="muted">→</span><span class="num ${c||''}">${b}</span>`:''}</div>`;
  const th=Object.keys({...o.th0,...o.th1}).sort((a,b)=>(o.th1[b]||0)-(o.th1[a]||0)).slice(0,4);
  return `<div class="card pt-card"><h3>İşlem öncesi kontrol <span class="r muted">${o.buy?'Alış':'Satış'} · ${esc(dispT(o.t))} · ${nf(lot.q,lot.q%1?4:0)} × ${nf(lot.p,2)} = ${usd(o.amt,0)}</span></h3>
  ${flags.length?`<div class="pt-flags">${flags.map(([c,x])=>`<span class="tag ${c}">${esc(x)}</span>`).join('')}</div>`:''}
  <div class="pt-grid">
   ${o.buy&&pl?`<div><h4>Teknik plan</h4>${row('Durum (piyasa fiyatına göre)',esc(pl.state))}${row('Alım bölgesi',`${nf(pl.zone.lo,2)}–${nf(pl.zone.hi,2)}`)}${row('Bu fiyat',`${nf(o.px,2)} · bölgenin ${o.zonePos}`)}${row('Stop / TP1',`${nf(pl.stop,2)} / ${nf(pl.tp1.p,2)}`)}${row('Risk/getiri (bu fiyattan)',o.rrAt!=null?'1:'+nf(o.rrAt,1):'—')}${o.riskUsd!=null?row('Stop çalışırsa kayıp',`${usd(o.riskUsd,0)} · portföyün %${nf(o.riskPct,1)}`):''}</div>`:''}
   <div><h4>Ağırlık ve risk</h4>${row(esc(dispT(o.t))+' ağırlığı','%'+nf(o.wt0,1),'%'+nf(o.wt1,1))}${o.target!=null?row('Hedef','%'+nf(+o.target,1)):''}
     ${o.r0||o.r1?row(esc(dispT(o.t))+' risk payı','%'+nf(o.r0&&o.r0.rc[o.t]||0,1),'%'+nf(o.r1&&o.r1.rc[o.t]||0,1),(o.r1&&o.r1.rc[o.t]||0)>(o.r0&&o.r0.rc[o.t]||0)+3?'down':''):''}
     ${o.r0&&o.r1?row('Portföy oynaklığı','%'+nf(o.r0.vol,1),'%'+nf(o.r1.vol,1),o.r1.vol>o.r0.vol+1?'down':o.r1.vol<o.r0.vol-1?'up':''):''}
     ${th.map(k=>row(esc(k)+' (ağırlık · risk)','%'+nf(o.th0[k]||0,0)+' · %'+nf(o.r0&&o.r0.th[k]||0,0),'%'+nf(o.th1[k]||0,0)+' · %'+nf(o.r1&&o.r1.th[k]||0,0))).join('')}</div>
   ${!o.buy&&o.tax?`<div><h4>Vergi (${o.tax.y})</h4>${o.tax.sale?row('Satış tutarı',tl(o.tax.sale.sellTL))+row('Endeksli maliyet',tl(o.tax.sale.idxCostTL))+row('Vergiye tabi kazanç',tl(o.tax.sale.gain),undefined,cls(o.tax.sale.gain)):''}
     ${row('Yıl toplamı',tl(o.tax.net0),tl(o.tax.net1))}${row('Tahmini vergi (başka gelir yoksa)',tl(o.tax.tax0),tl(o.tax.tax1),o.tax.tax1>o.tax.tax0?'down':'')}${o.realUsd!=null?row('Gerçekleşen kâr/zarar ($)',smoney(o.realUsd,0)):''}
     ${o.tax.parts.map(p=>`<div class="pt-lot">${esc(p.d)} alışı · ${nf(p.q,2)} adet · Yİ-ÜFE ${p.inc==null?'verisi yok':'+%'+nf(p.inc,1)} ${p.inc==null?'':p.inc>=10?'<span class="tag up">endekslenir</span>':`<span class="tag warn">eşiğe ~${p.months} ay</span>`}</div>`).join('')}</div>`:''}
  </div>
  <p class="muted" style="font-size:12px;margin:10px 0 0">Risk payı son 1 yılın günlük getirileriyle hesaplanır. Vergi FIFO ve Yİ-ÜFE endekslemesiyle tahmindir; eşiğe kalan süre son 3 ayın ortalama Yİ-ÜFE artışıyla öngörülür. Yatırım tavsiyesi değildir.</p>
  <div class="pt-act"><label class="muted" style="font-size:13px;display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="ptSkip" style="width:auto"> Bu kontrolü bir daha gösterme</label><button class="btn ghost" id="ptNo">Vazgeç</button><button class="btn" id="ptOk">Onayla ve kaydet</button></div></div>`;
}
function pretradeConfirm(lot){
  if(S.settings.skipPretrade)return Promise.resolve(true);
  return new Promise(res=>{let html;try{html=pretradeHTML(lot)}catch(e){console.error(e);return res(true)}
    const m=document.createElement('div');m.className='modal';m.id='ptm';m.innerHTML=html;document.body.appendChild(m);
    const done=async ok=>{const sk=$('#ptSkip',m);if(ok&&sk&&sk.checked){S.settings.skipPretrade=true;try{await saveSettings()}catch(e){}}m.remove();res(ok)};
    $('#ptOk',m).onclick=()=>done(true);$('#ptNo',m).onclick=()=>done(false);m.onclick=e=>{if(e.target===m)done(false)}});
}

/* ---------- alarm kuralları sayfası ---------- */
function rulesAll(){return Array.isArray(S.settings.rules)?S.settings.rules:[]}
async function rulesSave(){await saveSettings();if(S.settings.ghToken&&typeof syncRemoteAlarms==='function')await syncRemoteAlarms()}
function ruleAlerts(){const out=[];rulesAll().filter(r=>r.on!==false).forEach(R=>{let E;try{E=ruleEval(R)}catch(e){return}if(E.ok)out.push({lvl:2,ic:'🎯',txt:ruleText(R,E),href:'#/teknik/kural'})});return out}
function viewKural(){
  if(!S.rDraft)S.rDraft={t:tickers()[0],logic:'and',conds:[{k:'rsi_lt',v:30}],name:''};const D=S.rDraft;const R=rulesAll();const tk=Array.from(new Set(techTickers().concat(tickers())));
  const condRow=(c,i)=>{const K=RULE_KINDS.find(x=>x.k===c.k)||RULE_KINDS[0];return `<div class="rc"><select data-ck="${i}">${RULE_KINDS.map(x=>`<option value="${x.k}" ${x.k===c.k?'selected':''}>${esc(x.l)}</option>`).join('')}</select>${K.v!==null||c.k.startsWith('px_')?`<input type="number" step="any" data-cv="${i}" value="${esc(c.v??K.v??'')}" placeholder="${c.k.startsWith('px_')?'fiyat':''}"><span class="muted">${esc(K.u||'')}</span>`:'<span></span><span></span>'}<button class="lnk2" data-cd="${i}" title="Sil">✕</button></div>`};
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Alarm kuralları</h2><p>Koşulları birleştir; kural sağlandığında telefonuna bildirim gelir (fiyat görevi her saat kontrol eder)</p></div></div>
  ${S.settings.ghToken?'':`<div class="note warn" style="margin-bottom:14px">Telefon bildirimi için kuralların görevlere ulaşması gerekiyor: Portföyüm → Pozisyonlar → Ayarlar'a GitHub anahtarını bir kez gir. Anahtar yokken kurallar sadece bu sitede "Dikkat edilecekler" listesinde görünür.</div>`}
  <div class="grid g-main" style="align-items:start">
   <section class="card"><h3>Yeni kural</h3>
    <div class="filters" id="rPre">${RULE_PRESETS.map((p,i)=>`<button data-i="${i}">${esc(p.name)}</button>`).join('')}</div>
    <div class="rform"><label>Sembol<select id="rT">${tk.map(t=>`<option ${t===D.t?'selected':''}>${esc(t)}</option>`).join('')}</select></label>
      <label>Bağlaç<select id="rL"><option value="and" ${D.logic!=='or'?'selected':''}>Hepsi sağlansın (VE)</option><option value="or" ${D.logic==='or'?'selected':''}>Biri yeter (VEYA)</option></select></label>
      <label style="grid-column:1/-1">Ad (isteğe bağlı)<input id="rN" value="${esc(D.name||'')}" placeholder="ör. SMH dipte"></label></div>
    <div class="rcs">${D.conds.map(condRow).join('')}</div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn ghost sm" id="rAdd">+ Koşul ekle</button><button class="btn sm" id="rSave">Kuralı kaydet</button></div>
    <div id="rPrev" class="note" style="margin-top:12px">${(()=>{try{const E=ruleEval(D);return `Şu an: <b class="${E.ok?'up':''}">${E.ok?'sağlanıyor':'sağlanmıyor'}</b> · ${E.parts.map(p=>`${p.ok?'✓':'✗'} ${esc(p.txt)}`).join(' · ')}`}catch(e){return 'Önizleme yok'}})()}</div></section>
   <section class="card"><h3>Kuralların <span class="r muted">${R.length}</span></h3>${R.length?`<div class="rl">${R.map((r,i)=>{let E;try{E=ruleEval(r)}catch(e){E={ok:false,parts:[]}}return `<div class="rl-i ${r.on===false?'off':''}"><div><b>${esc(dispT(r.t))}</b> ${esc(r.name||'')}<div class="muted" style="font-size:12px">${r.conds.map(c=>esc(ruleLabel(c))).join(r.logic==='or'?' <b>veya</b> ':' <b>ve</b> ')}</div>
      <div style="font-size:12px;margin-top:3px">${E.parts.map(p=>`<span class="${p.ok?'up':'muted'}">${p.ok?'✓':'✗'} ${esc(p.txt)}</span>`).join(' · ')}</div></div>
      <div class="rl-a"><span class="tag ${E.ok?'up':''}">${E.ok?'sağlanıyor':'bekliyor'}</span><button class="lnk2" data-ron="${i}">${r.on===false?'Aç':'Kapat'}</button><button class="lnk2" data-rdel="${i}">Sil</button></div></div>`}).join('')}</div>`:'<p class="muted">Henüz kural yok. Soldan bir hazır kural seç ya da kendin kur.</p>'}
    <p class="muted" style="font-size:12px;margin:10px 0 0">Bildirim, kural sağlanmıyorken sağlanır hale geldiğinde bir kez gelir; koşul bozulup tekrar oluşursa yeniden gelir.</p></section></div></div>`;
}
function afterKural(){const D=S.rDraft;const rr=()=>render(false);
  $$('#rPre button').forEach(b=>b.onclick=()=>{const p=RULE_PRESETS[+b.dataset.i];D.conds=p.conds.map(c=>({...c}));D.name=p.name;rr()});
  const T=$('#rT');if(T)T.onchange=()=>{D.t=T.value;rr()};const L=$('#rL');if(L)L.onchange=()=>{D.logic=L.value;rr()};const N=$('#rN');if(N)N.oninput=()=>{D.name=N.value};
  $$('[data-ck]').forEach(s=>s.onchange=()=>{const i=+s.dataset.ck;const K=RULE_KINDS.find(x=>x.k===s.value);D.conds[i]={k:s.value,v:s.value.startsWith('px_')?+(quote(D.t).price||0).toFixed(2):K.v};rr()});
  $$('[data-cv]').forEach(s=>s.onchange=()=>{D.conds[+s.dataset.cv].v=+s.value;rr()});$$('[data-cd]').forEach(b=>b.onclick=()=>{D.conds.splice(+b.dataset.cd,1);rr()});
  const A=$('#rAdd');if(A)A.onclick=()=>{D.conds.push({k:'below_sma',v:50});rr()};
  const Sv=$('#rSave');if(Sv)Sv.onclick=async()=>{if(!D.conds.length){toast('En az bir koşul ekle');return}S.settings.rules=rulesAll().concat([{id:Date.now().toString(36),t:D.t,logic:D.logic,name:D.name||'',conds:D.conds.map(c=>({...c})),on:true,created:new Date().toISOString().slice(0,10)}]);
    await rulesSave();toast(S.settings.ghToken?'Kural kaydedildi, telefon bildirimi açık':'Kural kaydedildi');S.rDraft=null;rr()};
  $$('[data-ron]').forEach(b=>b.onclick=async()=>{const r=rulesAll()[+b.dataset.ron];r.on=r.on===false;await rulesSave();rr()});
  $$('[data-rdel]').forEach(b=>b.onclick=async()=>{if(!confirm('Kural silinsin mi?'))return;S.settings.rules=rulesAll().filter((_,i)=>i!==+b.dataset.rdel);await rulesSave();rr()});
}
