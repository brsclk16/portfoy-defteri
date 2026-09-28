/* Portföy Defteri — ekler: teknik göstergeler, ekleme simülatörü, karar günlüğü, alım planları, vergi, bilanço kartları, içeriden işlemler, BIST, PWA */
"use strict";

/* ---------- para birimi (BIST desteği) ---------- */
function isTRY(t){const i=S.data&&S.data.instruments[t];return (i&&i.currency==='TRY')||/:BIST$/.test(t)}
function pxf(t,v,d=2){return isTRY(t)?(isNum(v)?'₺'+nf(v,d):'—'):usd(v,d)}
function dispT(t){return String(t).replace(/:BIST$/,'')}

/* ---------- teknik göstergeler ---------- */
function sma(a,n){if(a.length<n)return null;let s=0;for(let i=a.length-n;i<a.length;i++)s+=a[i];return s/n}
function rsi(a,n=14){if(a.length<n+1)return null;let g=0,l=0;for(let i=1;i<=n;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d}g/=n;l/=n;for(let i=n+1;i<a.length;i++){const d=a[i]-a[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n}return l===0?100:100-100/(1+g/l)}
function tech(t){
  const s=series(t).map(p=>p[1]);if(s.length<30)return null;const px=s[s.length-1];
  const m50=sma(s,50),m200=sma(s,200),r=rsi(s);
  const d50=m50?(px/m50-1)*100:null,d200=m200?(px/m200-1)*100:null;
  let trend='—',tc='';if(m50&&m200){if(px>m50&&m50>m200){trend='Yükseliş trendi';tc='up'}else if(px<m50&&m50<m200){trend='Düşüş trendi';tc='down'}else trend='Kararsız'}
  let rs='Nötr',rc='';if(r!=null){if(r>=70){rs='Aşırı alım';rc='down'}else if(r<=30){rs='Aşırı satım';rc='up'}}
  const hot=d200!=null&&d200>40;
  return {px,m50,m200,d50,d200,rsi:r,trend,tc,rs,rc,hot,m200ok:!!m200};
}
function techBadge(t){const x=tech(t);if(!x)return '<span class="dim">—</span>';
  const parts=[];if(x.rsi!=null)parts.push(`<span class="tb ${x.rc}" title="RSI(14) ${nf(x.rsi,0)}: ${x.rs}">RSI ${nf(x.rsi,0)}</span>`);
  if(x.d200!=null)parts.push(`<span class="tb ${x.hot?'down':x.d200<0?'warn':''}" title="200 günlük ortalamaya uzaklık">200G ${pct(x.d200,0)}</span>`);
  return parts.join(' ');}
function techCard(t){const x=tech(t);if(!x)return '';
  return `<h3 style="margin-top:22px">Teknik görünüm <span class="r ${x.tc}">${esc(x.trend)}</span></h3>
  <div class="tgrid"><div><span>50 günlük ort.</span><b class="num">${pxf(t,x.m50)}</b><i class="${cls(x.d50)}">${pct(x.d50,1)}</i></div>
  <div><span>200 günlük ort.</span><b class="num">${x.m200?pxf(t,x.m200):'—'}</b><i class="${x.hot?'down':cls(x.d200)}">${x.d200!=null?pct(x.d200,1):'veri az'}</i></div>
  <div><span>RSI (14)</span><b class="num ${x.rc}">${nf(x.rsi,0)}</b><i class="${x.rc}">${esc(x.rs)}</i></div></div>
  ${x.hot?`<div class="note warn" style="margin-top:10px">Fiyat 200 günlük ortalamanın %${nf(x.d200,0)} üzerinde. Tarihsel olarak bu kadar gerilmiş seviyelerden sonra sert geri çekilmeler sık görülür.</div>`:''}`;}

/* ---------- ekleme simülatörü ---------- */
function exposureFor(w){const ex={};for(const t in w){const i=inst(t);if(!i||!w[t])continue;
  if(i.holdings&&i.holdings.length){i.holdings.forEach(h=>{const k=h.t||h.n;(ex[k]||(ex[k]={t:h.t,n:h.n,w:0})).w+=w[t]*h.w/100})}
  else if(/hisse/i.test(i.type||'')){(ex[t]||(ex[t]={t,n:i.name,w:0})).w+=w[t]}}return ex}
function statsFor(w){
  const keys=Object.keys(w).filter(t=>w[t]>0&&series(t).length>30);const {dates,R}=alignedReturns(keys.concat(['SPY']));
  const tot=keys.reduce((s,t)=>s+w[t],0)||1;
  const pr=dates.map((_,i)=>{let s=0,ws=0;for(const t of keys){const v=R[t][i];if(v==null)continue;s+=w[t]/tot*v;ws+=w[t]/tot}return ws>0?s/ws:null});
  const st=stats(pr),cv=covar(pr,R.SPY);let v=100;const pts=dates.map((d,i)=>{if(pr[i]!=null)v*=1+pr[i];return [d,v]});
  return {vol:st?st.sd*Math.sqrt(252)*100:null,beta:cv?cv.cov/cv.vb:null,mdd:maxDD(pts).mdd,ret:(v/100-1)*100};
}
function simulate(t,amt){
  const P=positions();const base={};let total;
  if(P.total>0){P.list.forEach(m=>{if(m.value>0)base[m.t]=m.value});total=P.total}else{const {w}=modelWeights();for(const k in w)base[k]=10000*w[k]/100;total=10000}
  const after={...base};after[t]=(after[t]||0)+amt;const tot2=total+amt;
  const pctw=(o,T)=>{const r={};for(const k in o)r[k]=o[k]/T*100;return r};
  const wb=pctw(base,total),wa=pctw(after,tot2);
  const eb=exposureFor(wb),ea=exposureFor(wa);
  const keys=Array.from(new Set(Object.keys(ea).concat(Object.keys(eb)))).map(k=>({k,t:(ea[k]||eb[k]).t,n:(ea[k]||eb[k]).n,b:(eb[k]||{}).w||0,a:(ea[k]||{}).w||0})).sort((x,y)=>y.a-x.a);
  const th=w=>THEMES.map(x=>({name:x.name,c:x.c,v:x.t.reduce((s,k)=>s+(w[k]||0),0)}));
  return {sb:statsFor(wb),sa:statsFor(wa),keys,thb:th(wb),tha:th(wa),real:P.total>0,total,wa,wb};
}
function viewSim(){
  if(!S.sim)S.sim={t:(allTickers()[0]||'SMH'),a:1000};
  const opts=allTickers().filter(t=>inst(t)&&series(t).length>30);if(!opts.includes(S.sim.t))S.sim.t=opts[0];
  const r=simulate(S.sim.t,+S.sim.a||0);const tk=S.sim.t;const own=r.keys.find(k=>k.t===tk);
  const d=(a,b,dec=1,inv)=>{const x=a-b;const good=inv?x<0:x>0;return `<span class="${Math.abs(x)<0.05?'dim':good?'up':'down'}">${x>0?'+':''}${nf(x,dec)}</span>`};
  return `<div class="sec-t"><div><h2>"Eklesem ne olur?" simülatörü</h2><p>Bir alışın portföy riskine ve şirket maruziyetine etkisini alıştan önce gör</p></div></div>
  <section class="card"><div class="scn-in"><label>Enstrüman<select id="simT">${opts.map(t=>`<option value="${t}" ${t===tk?'selected':''}>${dispT(t)}${inst(t).watchlist?' (izleme)':''}</option>`).join('')}</select></label>
    <label>Tutar ($)<input id="simA" type="number" min="0" step="100" value="${esc(S.sim.a)}"></label><div class="scn-res muted">${r.real?'Gerçek pozisyonlarına göre':'Model portföye ($10.000) göre'}</div></div>
  <div class="grid g4" style="margin-top:14px">
    <div class="kpi mini"><div class="l">Oynaklık</div><div class="v">%${nf(r.sa.vol,1)}</div><div class="s">önce %${nf(r.sb.vol,1)} · ${d(r.sa.vol,r.sb.vol,1,true)}</div></div>
    <div class="kpi mini"><div class="l">Beta (S&P 500)</div><div class="v">${nf(r.sa.beta,2)}</div><div class="s">önce ${nf(r.sb.beta,2)} · ${d(r.sa.beta,r.sb.beta,2,true)}</div></div>
    <div class="kpi mini"><div class="l">1Y en büyük düşüş</div><div class="v">${pct(r.sa.mdd,1)}</div><div class="s">önce ${pct(r.sb.mdd,1)}</div></div>
    ${(()=>{const etf=(inst(tk).holdings||[]).length>0;const A=etf?r.wa[tk]:(own?own.a:r.wa[tk]),B=etf?(r.wb[tk]||0):(own?own.b:0);return `<div class="kpi mini"><div class="l">${esc(dispT(tk))} ${etf?'portföy ağırlığı':'gerçek maruziyet (fonlar dahil)'}</div><div class="v">%${nf(A,1)}</div><div class="s">önce %${nf(B,1)}</div></div>`})()}
  </div>
  <div class="grid g2" style="margin-top:14px"><div><h3>En büyük şirket maruziyetleri (sonra)</h3><div class="bars">${r.keys.slice(0,8).map(k=>`<div class="bar" style="grid-template-columns:minmax(80px,130px) minmax(0,1fr) 92px"><span class="t"><b>${esc(k.t||'')}</b> <span class="muted">${esc(k.n||'')}</span></span><div class="tr"><div class="f" style="width:${Math.min(100,k.a/r.keys[0].a*100)}%"></div></div><span class="v">%${nf(k.a,1)} <span class="dim">${k.a-k.b>0.05?'+':''}${Math.abs(k.a-k.b)>=0.05?nf(k.a-k.b,1):''}</span></span></div>`).join('')}</div></div>
  <div><h3>Tema dağılımı</h3><div class="bars">${r.tha.map((x,i)=>`<div class="bar" style="grid-template-columns:minmax(90px,140px) minmax(0,1fr) 92px"><span class="t">${esc(x.name)}</span><div class="tr"><div class="f" style="width:${Math.min(100,x.v)}%;background:${x.c}"></div></div><span class="v">%${nf(x.v,1)} <span class="dim">${x.v-r.thb[i].v>0.05?'+':''}${Math.abs(x.v-r.thb[i].v)>=0.05?nf(x.v-r.thb[i].v,1):''}</span></span></div>`).join('')}</div></div></div>
  </section>`;
}
function afterSim(){const t=$('#simT'),a=$('#simA');if(t)t.onchange=()=>{S.sim.t=t.value;render(false)};if(a)a.onchange=()=>{S.sim.a=+a.value||0;render(false)}}

/* ---------- karar günlüğü ---------- */
const REV={ok:['Tez geçerli','up'],weak:['Tez zayıfladı','warn'],broken:['Tez bozuldu','down']};
function addDays(d,n){const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)}
function today(){return new Date().toISOString().slice(0,10)}
function journalDue(){return S.lots.filter(l=>l.side!=='S'&&l.thesis&&(l.reviewAt||addDays(l.date,90))<=today())}
function journalBanner(){const d=journalDue();if(!d.length)return '';return `<a class="note warn jb" href="#/defter" style="display:block;margin-bottom:14px;text-decoration:none">📓 ${d.length} alışın gözden geçirme zamanı geldi: ${d.slice(0,4).map(l=>esc(dispT(l.t))).join(', ')}${d.length>4?'…':''}. Tezin hâlâ geçerli mi? →</a>`}
function viewJournal(){
  const L=S.lots.filter(l=>l.side!=='S').sort((a,b)=>a.date<b.date?1:-1);
  return `<div class="sec-t" style="margin-top:0"><div><h2>Karar günlüğü</h2><p>Her alışın nedeni, hedefi ve çıkış kuralı · 90 günde bir gözden geçirme</p></div></div>
  <section class="card">${L.length?L.map(l=>{const q=quote(l.t);const ret=q.price&&l.p?(q.price/l.p-1)*100:null;const due=(l.reviewAt||addDays(l.date,90));const isDue=l.thesis&&due<=today();
    const tp=l.target&&q.price?Math.max(0,Math.min(100,(q.price-l.p)/(l.target-l.p)*100)):null;const last=(l.reviews||[]).slice(-1)[0];
    return `<div class="jr ${isDue?'due':''}"><div class="jh"><div class="sym">${logo(l.t)}<div><div class="n">${esc(dispT(l.t))} <span class="muted" style="font-weight:400">· ${esc(trDate(l.date+'T12:00:00Z'))} · ${nf(+l.q,(+l.q)%1?4:0)} adet @ ${pxf(l.t,+l.p)}</span></div><div class="d">Alıştan beri <b class="${cls(ret)}">${pct(ret,1)}</b>${last?` · son değerlendirme: <b class="${REV[last.s][1]}">${REV[last.s][0]}</b> (${esc(trDate(last.d+'T12:00:00Z'))})`:''}</div></div></div>
      ${l.thesis?`<span class="tag ${isDue?'warn':''}">${isDue?'Gözden geçir':'Sonraki: '+esc(trDate(due+'T12:00:00Z'))}</span>`:''}</div>
      ${l.thesis?`<div class="jt"><b>Neden aldım:</b> ${esc(l.thesis)}</div>`:`<div class="jt muted">Bu alış için tez yazılmamış. <button class="lnk2" data-jedit="${esc(l.id)}">Şimdi ekle</button></div>`}
      ${l.target||l.exitRule?`<div class="jm">${l.target?`<span>Hedef <b>${pxf(l.t,+l.target)}</b>${tp!=null?` <span class="prog"><i style="width:${tp}%"></i></span> %${nf(tp,0)}`:''}</span>`:''}${l.exitRule?`<span>Çıkış kuralı: ${esc(l.exitRule)}</span>`:''}</div>`:''}
      ${(l.reviews||[]).length?`<div class="jrev">${l.reviews.slice(-3).map(r=>`<div><b class="${REV[r.s][1]}">${REV[r.s][0]}</b> <span class="muted">${esc(trDate(r.d+'T12:00:00Z'))}</span> ${esc(r.note||'')}</div>`).join('')}</div>`:''}
      ${l.thesis?`<div class="jact">${Object.entries(REV).map(([k,[lab]])=>`<button class="btn ghost sm" data-jrev="${esc(l.id)}" data-s="${k}">${lab}</button>`).join('')}<button class="lnk2" data-jedit="${esc(l.id)}">Tezi düzenle</button></div>`:''}
    </div>`}).join(''):'<div class="empty"><b>Henüz alış yok</b>Pozisyonlar sayfasından alış eklerken "Neden aldım" alanını doldur.</div>'}
  </section>`;
}
function afterJournal(){
  $$('[data-jrev]').forEach(b=>b.onclick=async()=>{const l=S.lots.find(x=>x.id===b.dataset.jrev);if(!l)return;const note=prompt(REV[b.dataset.s][0]+' — kısa not (opsiyonel):','');if(note===null)return;
    l.reviews=(l.reviews||[]).concat({d:today(),s:b.dataset.s,note});l.reviewAt=addDays(today(),b.dataset.s==='ok'?90:30);await saveLots();toast('Kaydedildi');render(false)});
  $$('[data-jedit]').forEach(b=>b.onclick=async()=>{const l=S.lots.find(x=>x.id===b.dataset.jedit);if(!l)return;
    const th=prompt('Neden aldım? (tez)',l.thesis||'');if(th===null)return;const tg=prompt('Hedef fiyat (boş bırakılabilir)',l.target||'');if(tg===null)return;const ex=prompt('Hangi durumda satarım? (çıkış kuralı)',l.exitRule||'');if(ex===null)return;
    l.thesis=th.trim();l.target=tg.trim()?+tg.replace(',','.'):null;l.exitRule=ex.trim();if(!l.reviewAt)l.reviewAt=addDays(l.date,90);await saveLots();toast('Tez kaydedildi');render(false)});
}

/* ---------- kademeli alım planları ---------- */
function planDates(p){const out=[];const [y,m]=p.start.split('-').map(Number);for(let i=0;i<p.n;i++){const t=y*12+m-1+i;const Y=Math.floor(t/12),M=t%12+1;const dim=new Date(Y,M,0).getDate();out.push(`${Y}-${String(M).padStart(2,'0')}-${String(Math.min(p.day,dim)).padStart(2,'0')}`)}return out}
function planDue(){const td=today();const out=[];(S.settings.plans||[]).forEach(p=>planDates(p).forEach((d,i)=>{if(d<=td&&!(p.done||[]).includes(i))out.push({p,i,d})}));return out}
function icsFor(p){
  const ds=planDates(p);const amt=p.total/p.n;const stamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z';
  const ev=ds.map((d,i)=>['BEGIN:VEVENT',`UID:pd-${p.id}-${i}@portfoy-defteri`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${d.replace(/-/g,'')}`,`SUMMARY:[Portföy] ${dispT(p.t)} alımı ${i+1}/${p.n} — $${nf(amt,0)}`,`DESCRIPTION:Kademeli alım planı. Adet hesabı: https://brsclk16.github.io/portfoy-defteri/#/defter`,'BEGIN:VALARM','TRIGGER:PT9H','ACTION:DISPLAY',`DESCRIPTION:${dispT(p.t)} alım günü`,'END:VALARM','END:VEVENT'].join('\r\n'));
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Portfoy Defteri//TR','CALSCALE:GREGORIAN'].concat(ev).concat(['END:VCALENDAR']).join('\r\n');
}
function viewPlans(){
  const P=S.settings.plans||[];const nm=today().slice(0,7);
  return `<div class="sec-t"><div><h2>Kademeli alım planları</h2><p>Toplam tutarı aylara böl, zamanı gelince kaç adet alacağını gör · takvime ekle</p></div></div>
  <section class="card"><form class="form" id="planF" style="grid-template-columns:repeat(5,minmax(0,1fr)) auto"><label>Enstrüman<select name="t">${allTickers().map(t=>`<option value="${t}">${dispT(t)}</option>`).join('')}</select></label>
    <label>Toplam ($)<input name="total" type="number" min="1" step="50" required placeholder="3000"></label><label>Kaç ay<input name="n" type="number" min="1" max="36" value="3" required></label>
    <label>Ayın günü<input name="day" type="number" min="1" max="28" value="5" required></label><label>Başlangıç ayı<input name="start" type="month" value="${nm}" required></label><button class="btn" type="submit">Plan ekle</button></form>
  ${P.length?`<div class="plans">${P.map(p=>{const ds=planDates(p);const amt=p.total/p.n;const q=quote(p.t);const done=(p.done||[]).length;
    return `<div class="plan"><div class="ph"><div class="sym">${logo(p.t)}<div><div class="n">${esc(dispT(p.t))} · $${nf(p.total,0)} / ${p.n} ay</div><div class="d">Her ayın ${p.day}'i · taksit $${nf(amt,0)} · şimdiki fiyatla ~${q.price?nf(amt/q.price,amt/q.price<10?2:0):'—'} adet</div></div></div>
      <div><button class="btn ghost sm" data-ics="${esc(p.id)}">Takvime ekle (.ics)</button> <button class="lnk" data-pdel="${esc(p.id)}" title="Planı sil">✕</button></div></div>
      <div class="prog big"><i style="width:${done/p.n*100}%"></i></div>
      <div class="steps">${ds.map((d,i)=>{const isDone=(p.done||[]).includes(i);const isDue=!isDone&&d<=today();return `<div class="st ${isDone?'done':isDue?'due':''}"><span>${esc(trDate(d+'T12:00:00Z',{day:'numeric',month:'short'}))}</span>${isDone?'✓ alındı':isDue?`<button class="btn sm" data-pbuy="${esc(p.id)}" data-i="${i}">Al: ~${q.price?nf(amt/q.price,amt/q.price<10?2:0):'—'} adet</button>`:'bekliyor'}</div>`}).join('')}</div></div>`}).join('')}</div>`:'<div class="empty" style="margin-top:12px">Henüz plan yok.</div>'}
  </section>`;
}
function afterPlans(){
  const f=$('#planF');if(f)f.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));const p={id:Date.now().toString(36),t:d.t,total:+d.total,n:+d.n,day:+d.day,start:d.start,done:[]};
    S.settings.plans=(S.settings.plans||[]).concat(p);await saveSettings();toast('Plan eklendi');render(false)};
  $$('[data-pdel]').forEach(b=>b.onclick=async()=>{if(!confirm('Plan silinsin mi?'))return;S.settings.plans=(S.settings.plans||[]).filter(p=>p.id!==b.dataset.pdel);await saveSettings();render(false)});
  $$('[data-ics]').forEach(b=>b.onclick=()=>{const p=(S.settings.plans||[]).find(x=>x.id===b.dataset.ics);const bl=new Blob([icsFor(p)],{type:'text/calendar'});const a=document.createElement('a');a.href=URL.createObjectURL(bl);a.download=`alim-plani-${dispT(p.t)}.ics`;a.click()});
  $$('[data-pbuy]').forEach(b=>b.onclick=()=>{const p=(S.settings.plans||[]).find(x=>x.id===b.dataset.pbuy);const i=+b.dataset.i;const q=quote(p.t);const amt=p.total/p.n;
    S.prefill={t:p.t,q:q.price?+(amt/q.price).toFixed(amt/q.price<10?4:0):'',p:q.price||'',planId:p.id,planI:i,note:`Alım planı ${i+1}/${p.n}`};location.hash='#/pozisyon'});
}
async function planMarkDone(){if(!S.prefillUsed)return;const {planId,planI}=S.prefillUsed;const p=(S.settings.plans||[]).find(x=>x.id===planId);if(p){p.done=Array.from(new Set((p.done||[]).concat(planI)));await saveSettings()}S.prefillUsed=null}

/* ---------- vergi ---------- */
function yiufeRatio(buyD,sellD){
  const m=(S.macro&&S.macro.yiufe&&S.macro.yiufe.monthly)||{};const ks=Object.keys(m).sort();if(!ks.length)return {r:null};
  const b=buyD.slice(0,7),s=sellD.slice(0,7);if(b>=s)return {r:1};
  if(b<ks[0])return {r:null,miss:true};let r=1,k=b,miss=false;
  const next=k=>{const [y,mo]=k.split('-').map(Number);const t=y*12+mo;return `${Math.floor(t/12)}-${String(t%12+1).padStart(2,'0')}`};
  while(k<s){if(m[k]==null){miss=true;break}r*=1+m[k]/100;k=next(k)}return {r:miss?null:r,miss};
}
function taxCalc(){
  const lots=S.lots.slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);const fifo={};const sales=[];
  for(const l of lots){const t=l.t;fifo[t]=fifo[t]||[];const rate=+l.fx||fxAt(l.date);
    if(l.side!=='S'){fifo[t].push({d:l.date,q:+l.q,c:(+l.q*+l.p+(+l.fee||0))/+l.q,fx:rate});continue}
    let q=+l.q;const sellTL=(+l.q*+l.p-(+l.fee||0))*rate;let costTL=0,idxCostTL=0,parts=[],miss=false;
    while(q>1e-9&&fifo[t].length){const b=fifo[t][0];const u=Math.min(q,b.q);const c=u*b.c*b.fx;const yr=yiufeRatio(b.d,l.date);if(yr.r==null)miss=true;
      const idx=yr.r!=null&&yr.r>=1.10?c*yr.r:c;costTL+=c;idxCostTL+=idx;parts.push({d:b.d,q:u,fx:b.fx,uf:yr.r});b.q-=u;q-=u;if(b.q<=1e-9)fifo[t].shift()}
    const pr=(+l.q-q)/+l.q;const sTL=sellTL*pr;
    sales.push({l,t,d:l.date,year:l.date.slice(0,4),q:+l.q-q,sellTL:sTL,costTL,idxCostTL,gain:sTL-idxCostTL,rawGain:sTL-costTL,parts,miss,fx:rate,unmatched:q>1e-9});
  }
  const years={};sales.forEach(s=>{const y=years[s.year]||(years[s.year]={year:s.year,gain:0,loss:0,net:0,n:0});if(s.gain>=0)y.gain+=s.gain;else y.loss+=s.gain;y.net+=s.gain;y.n++});
  Object.values(years).forEach(y=>{y.tax=taxOn(Math.max(0,y.net),y.year)});
  return {sales,years:Object.values(years).sort((a,b)=>b.year.localeCompare(a.year))};
}
function taxOn(x,year){const B=(S.macro&&S.macro.tax&&S.macro.tax.brackets)||{};const br=B[year]||B[Object.keys(B).sort().slice(-1)[0]];if(!br)return null;let t=0,prev=0;for(const [lim,rate] of br){const top=lim==null?Infinity:lim;if(x>prev){t+=(Math.min(x,top)-prev)*rate/100}prev=top;if(x<=top)break}return t}
function viewTax(){
  const T=taxCalc();const tl=v=>isNum(v)?(v<0?'−':'')+'₺'+nf(Math.abs(v),0):'—';
  return `<div class="sec-t"><div><h2>Yurt dışı hisse vergi hesaplayıcı</h2><p>Satışların TL kazancı · FIFO · Yİ-ÜFE endekslemesi · yıllık özet</p></div></div>
  <section class="card">${T.years.length?`<div class="grid g3">${T.years.map(y=>`<div class="kpi mini"><div class="l">${y.year} · ${y.n} satış</div><div class="v ${cls(y.net)}">${tl(y.net)}</div><div class="s">kazanç ${tl(y.gain)} · zarar ${tl(y.loss)}<br>tahmini vergi (başka gelir yoksa) <b>${tl(y.tax)}</b></div></div>`).join('')}</div>
    <div class="tscroll" style="margin-top:14px"><table class="tbl"><thead><tr><th>Satış</th><th>Enstrüman</th><th class="r">Adet</th><th class="r">Satış (TL)</th><th class="r">Maliyet (TL)</th><th class="r">Endeksli maliyet</th><th class="r">Vergiye tabi</th></tr></thead><tbody>
    ${T.sales.slice().reverse().map(s=>`<tr><td class="num">${esc(trDate(s.d+'T12:00:00Z'))}</td><td><b>${esc(dispT(s.t))}</b></td><td class="r num">${nf(s.q,s.q%1?4:0)}</td><td class="r num">${tl(s.sellTL)}<div class="dim" style="font-size:11px">kur ${nf(s.fx,4)}</div></td><td class="r num">${tl(s.costTL)}</td><td class="r num">${tl(s.idxCostTL)}${s.idxCostTL>s.costTL+1?'<div class="up" style="font-size:11px">Yİ-ÜFE uygulandı</div>':s.miss?'<div class="warn" style="font-size:11px">Yİ-ÜFE verisi eksik</div>':''}</td><td class="r num ${cls(s.gain)}"><b>${tl(s.gain)}</b></td></tr>`).join('')}
    </tbody></table></div>`:'<div class="empty"><b>Henüz satış yok</b>Satış işlemi girdiğinde kazanç/zarar burada TL olarak hesaplanır.</div>'}
    <div class="note" style="margin-top:14px;line-height:1.6"><b>Nasıl hesaplanıyor?</b> Alış ve satış tutarları işlem günündeki kurla TL'ye çevrilir (işlem girerken kur yazdıysan o, yazmadıysan piyasa kuru kullanılır; beyanda <b>TCMB döviz alış kuru</b> esas alınır, işlem girerken onu yazman en doğrusu). Alım ayı dahil, satış ayı hariç Yİ-ÜFE artışı %10'u geçerse maliyet bu oranda artırılır. Aynı enstrümanda önce alınan önce satılmış sayılır (FIFO). Aynı yıl içindeki yurt dışı hisse/fon zararları kazançlardan düşülür; başka gelirlerden düşülemez. Bu kazanç türünde istisna ve beyan sınırı yok; beyan ertesi yılın Mart ayında. Vergi tahmini 2025/2026 gelir vergisi tarifesiyle ve başka gelirin olmadığı varsayımıyla yapılır. Yurt dışı temettüde 2026 beyan sınırı ${tl((S.macro&&S.macro.tax&&S.macro.tax.dividendThreshold2026)||22000)}. <b>Mali müşavirinle son kontrolü yap.</b></div>
    <div class="row-end" style="justify-content:flex-start"><button class="btn ghost sm" id="taxCsv">Müşavir için CSV indir</button></div>
  </section>`;
}
function afterTax(){const b=$('#taxCsv');if(b)b.onclick=()=>{const T=taxCalc();const rows=[['Satış tarihi','Sembol','Adet','Satış kuru','Satış TL','Maliyet TL','Endeksli maliyet TL','Vergiye tabi TL','Alış tarihleri']];
  T.sales.forEach(s=>rows.push([s.d,dispT(s.t),s.q,s.fx,s.sellTL.toFixed(2),s.costTL.toFixed(2),s.idxCostTL.toFixed(2),s.gain.toFixed(2),s.parts.map(p=>`${p.d} (${p.q} ad., kur ${p.fx})`).join(' | ')]));
  const csv='﻿'+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(';')).join('\r\n');const bl=new Blob([csv],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(bl);a.download='yurtdisi-hisse-satislari.csv';a.click()}}

/* ---------- Defter sekmesi ---------- */
function viewDefter(){return `<div class="fade">${viewJournal()}${viewPlans()}${viewTax()}</div>`}
function afterDefter(){afterJournal();afterPlans();afterTax()}

/* ---------- bilanço kartları ---------- */
function earnCard(c){
  const aff=(c.affects||[]).map(a=>`<a class="tag" href="#/t/${a.t}" style="text-decoration:none">${esc(dispT(a.t))}${a.note?' · '+esc(a.note):''}</a>`).join(' ');
  return `<article class="card ec"><div class="eh"><div class="sym">${logo(c.t)}<div><div class="n">${esc(c.company)} <span class="muted" style="font-weight:400">· ${esc(c.quarter||'')}</span></div><div class="d">${esc(trDate(c.date+'T12:00:00Z'))} · ${esc(c.time||'')}</div></div></div>
    ${c.reaction?`<span class="chip ${cls(c.reaction.pct)}">Tepki ${pct(c.reaction.pct,1)}</span>`:''}</div>
    <div class="estats">${c.eps&&isNum(c.eps.surprisePct)?`<div><span>Hisse başı kâr</span><b class="${cls(c.eps.surprisePct)}">beklentiye göre ${pct(c.eps.surprisePct,1)}</b></div>`:''}
    ${c.rev?`<div><span>Gelir</span><b>${nf(c.rev.act,c.rev.act<100?1:0)} ${esc(c.rev.unit||'')}</b>${isNum(c.rev.yoy)?` <i class="${cls(c.rev.yoy)}">yıllık ${pct(c.rev.yoy,0)}</i>`:''}${isNum(c.rev.surprisePct)?` <i class="${cls(c.rev.surprisePct)}">beklentiye göre ${pct(c.rev.surprisePct,1)}</i>`:''}</div>`:''}</div>
    ${c.guidance?`<div class="why"><b>Rehberlik:</b> ${esc(c.guidance)}</div>`:''}
    ${c.summary?`<p class="muted" style="margin:10px 0 0;font-size:14px">${esc(c.summary)}</p>`:''}
    ${(c.highlights||[]).length?`<ul class="lst" style="margin-top:10px">${c.highlights.map(h=>`<li><span>${esc(h)}</span></li>`).join('')}</ul>`:''}
    <div class="ef">${aff}${(c.sources||[]).map(s=>`<a class="muted" href="${esc(s.url)}" target="_blank" rel="noopener" style="font-size:12.5px">${esc(s.title)} ↗</a>`).join(' ')}</div></article>`;
}
function earningsFor(t){return ((S.earn&&S.earn.cards)||[]).filter(c=>c.t===t||(c.affects||[]).some(a=>a.t===t))}
function viewEarnSection(){const L=((S.earn&&S.earn.cards)||[]).slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);if(!L.length)return '';
  return `<div class="sec-t"><div><h2>Son bilançolar</h2><p>Portföy ve fonların büyük şirketleri · beklenti, sonuç ve piyasa tepkisi</p></div></div><div class="grid g2">${L.map(earnCard).join('')}</div>`}

/* ---------- içeriden ve Kongre işlemleri ---------- */
function insiderCard(t){
  const x=S.insider&&S.insider.tickers&&S.insider.tickers[t];if(!x)return '';const I=x.insider,C=x.congress;const $m=v=>'$'+(v>=1e6?nf(v/1e6,1)+' mn':nf(v,0));
  return `<section class="card sec"><h3>Şirket içi ve Kongre işlemleri <span class="r muted">Alpha Vantage · ${esc(trDate(S.insider.updatedAt))}</span></h3><div class="grid g2">
  ${I?`<div><div class="ins"><div><span>Son 90 gün yönetici alımı</span><b class="up">${I.buyCount} işlem · ${$m(I.buyValue)}</b></div><div><span>Yönetici satışı</span><b class="down">${I.sellCount} işlem · ${$m(I.sellValue)}</b></div></div>
    <div class="bars" style="margin-top:10px">${(I.people||[]).slice(0,5).map(p=>`<div class="pair"><span><b>${esc(p.name)}</b> <span class="muted" style="font-size:12px">${esc(p.title||'')}</span></span><span class="num">${p.buy?`<span class="up">+${$m(p.buy)}</span> `:''}${p.sell?`<span class="down">−${$m(p.sell)}</span>`:''}</span></div>`).join('')}</div>
    <p class="muted" style="font-size:12.5px;margin:10px 0 0">Yönetici satışları çoğunlukla önceden planlanmış (10b5-1) satışlar ve vergi ödemeleridir; tek başına olumsuz sinyal sayılmaz. Açık piyasadan <b>alım</b> daha anlamlıdır.${I.grants?` Ayrıca ${I.grants} hisse ödülü/hak kullanımı kaydı var.`:''}</p></div>`:'<div class="muted">Veri yok</div>'}
  ${C?`<div><div class="ins"><div><span>Son 12 ay Kongre alımı</span><b class="up">${C.buys}</b></div><div><span>Kongre satışı</span><b class="down">${C.sells}</b></div></div>
    <div class="bars" style="margin-top:10px">${(C.trades||[]).slice(0,6).map(r=>`<div class="pair"><span><b>${esc(r.who)}</b> <span class="muted" style="font-size:12px">${esc(r.party||'')}-${esc(r.chamber==='SENATE'?'Senato':'Temsilciler')} · ${esc(trDate(r.d+'T12:00:00Z'))}</span></span><span class="${r.type==='BUY'?'up':'down'}">${r.type==='BUY'?'Alım':'Satış'} $${nf(r.min/1000,0)}–${nf(r.max/1000,0)} bin</span></div>`).join('')}</div>
    <p class="muted" style="font-size:12.5px;margin:10px 0 0">Kongre üyeleri işlemleri 45 güne kadar gecikmeyle bildirir; tutarlar aralık olarak açıklanır.</p></div>`:''}
  </div></section>`;
}

/* ---------- PWA ---------- */
if('serviceWorker' in navigator&&location.protocol==='https:'){window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}))}
function planBanner(){const d=planDue();if(!d.length)return '';return `<a class="note jb" href="#/defter" style="display:block;margin-bottom:14px;text-decoration:none">🗓️ Alım planı: ${d.slice(0,3).map(x=>`${esc(dispT(x.p.t))} ${x.i+1}/${x.p.n}`).join(', ')} taksiti zamanı geldi →</a>`}
