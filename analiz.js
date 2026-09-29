/* Portföy Defteri — analiz modülü: reel getiri, risk, senaryo, dengeleme, izleme listesi, haftalık rapor */
"use strict";
const GH_REPO='brsclk16/portfoy-defteri';
const BENCH_COLORS={port:'#b8f25c',dep:'#5cd3ff',gold:'#ffd35c',spy:'#8b7bff',usd:'#c6ceda',cpi:'#ff6b6b'};

/* ---------- ortak zaman serisi yardımcıları ---------- */
function histArr(k){return (k==='USDTRY'||k==='XAUUSD'||k==='SPY')?(S.hist[k]||[]):series(k)}
function lastLE(arr,d){let lo=0,hi=arr.length-1,ans=null;while(lo<=hi){const m=(lo+hi)>>1;if(arr[m][0]<=d){ans=arr[m][1];lo=m+1}else hi=m-1}return ans}
function fxAt(d){const a=S.hist.USDTRY||[];const v=lastLE(a,d);if(v)return v;return a.length?a[0][1]:(S.fx||null)}
function fxNow(){return S.fx||fxAt('9999')}
function goldGramTL(d){const x=lastLE(S.hist.XAUUSD||[],d),f=fxAt(d);return x&&f?x*f/((S.macro&&S.macro.gramPerOz)||31.1035):null}
function daysBetween(a,b){return (new Date(b+'T12:00:00Z')-new Date(a+'T12:00:00Z'))/864e5}
/* TÜFE endeksi: ay içinde doğrusal-bileşik ara değer, son açıklanan aydan sonrası son aylık oranla tahmin */
function cpiFn(){
  const m=(S.macro&&S.macro.cpi&&S.macro.cpi.monthly)||{};const keys=Object.keys(m).sort();
  if(!keys.length)return ()=>1;
  const start={};let lvl=100;keys.forEach(k=>{start[k]=lvl;lvl*=1+m[k]/100});
  const lastK=keys[keys.length-1],lastR=m[lastK],endLvl=lvl;
  const mAdd=(k,n)=>{const [y,mo]=k.split('-').map(Number);const t=y*12+mo-1+n;return `${Math.floor(t/12)}-${String(t%12+1).padStart(2,'0')}`};
  return d=>{
    const k=d.slice(0,7),day=+d.slice(8,10),dim=new Date(+k.slice(0,4),+k.slice(5,7),0).getDate(),fr=day/dim;
    if(k<keys[0])return 100;
    if(m[k]!=null)return start[k]*Math.pow(1+m[k]/100,fr);
    let n=0,kk=mAdd(lastK,1);while(kk<k&&n<60){kk=mAdd(kk,1);n++}
    return endLvl*Math.pow(1+lastR/100,n+fr);
  };
}
function cpiEstimated(d){const m=(S.macro&&S.macro.cpi&&S.macro.cpi.monthly)||{};const keys=Object.keys(m).sort();return keys.length&&d.slice(0,7)>keys[keys.length-1]}

/* ---------- reel getiri ---------- */
function flowList(){
  if(S.lots.length){
    return S.lots.slice().sort((a,b)=>a.date<b.date?-1:1).map(l=>{const usdAmt=l.side==='S'?-(l.q*l.p-(+l.fee||0)):(l.q*l.p+(+l.fee||0));const f=+l.fx||fxAt(l.date);return {d:l.date,usd:usdAmt,tl:usdAmt*f}});
  }
  const d0=(series('SMH')[0]||[])[0];if(!d0)return [];const f=fxAt(d0);return [{d:d0,usd:10000,tl:10000*f}];
}
function realReturn(){
  const flows=flowList();if(!flows.length||!(S.hist.USDTRY||[]).length)return null;
  const ps=portfolioSeries();const pMap=new Map(ps.pts);
  const dates=series('SMH').map(p=>p[0]).filter(d=>d>=flows[0].d);
  const today=new Date().toISOString().slice(0,10);if(dates.length&&dates[dates.length-1]<today)dates.push(today);
  const cpi=cpiFn();const r=((S.settings.depositRate!=null&&S.settings.depositRate!=='')?+S.settings.depositRate:((S.macro&&S.macro.deposit&&S.macro.deposit.annualGross)||40))/100;
  const acc={usd:0,spy:0,gold:0,dep:0,cpi:0};let wd=0,inTL=0,fi=0,prev=null,lastPort=null;
  const out={port:[],dep:[],gold:[],spy:[],usd:[],cpi:[]};
  for(const d of dates){
    const f=fxAt(d),spy=lastLE(S.hist.SPY||[],d),g=goldGramTL(d);
    if(prev){acc.dep*=Math.pow(1+r,daysBetween(prev,d)/365);acc.cpi*=cpi(d)/cpi(prev)}
    while(fi<flows.length&&flows[fi].d<=d){const fl=flows[fi++];
      if(fl.tl>0)inTL+=fl.tl;else wd+=-fl.tl;
      acc.usd+=fl.tl/f; if(spy)acc.spy+=fl.tl/(spy*f); if(g)acc.gold+=fl.tl/g; acc.dep+=fl.tl; acc.cpi+=fl.tl;}
    prev=d;
    const pv=pMap.has(d)?pMap.get(d):(d===today&&ps.pts.length?(S.lots.length?positions().total:ps.pts[ps.pts.length-1][1]):lastPort);
    if(pv!=null)lastPort=pv;
    const W=v=>v+wd;
    out.port.push([d,W((lastPort||0)*f)]);out.usd.push([d,W(acc.usd*f)]);out.spy.push([d,W(acc.spy*(spy||0)*f)]);
    out.gold.push([d,W(acc.gold*(g||0))]);out.dep.push([d,W(acc.dep)]);out.cpi.push([d,W(acc.cpi)]);
  }
  const end=k=>out[k].length?out[k][out[k].length-1][1]:null;
  const res={series:out,inTL,wd,rate:r*100,real:!!S.lots.length,start:flows[0].d,est:cpiEstimated(today)};
  ['port','dep','gold','spy','usd','cpi'].forEach(k=>res[k]={end:end(k),ret:inTL>0?(end(k)/inTL-1)*100:null});
  res.realVsCpi=(res.port.end/res.cpi.end-1)*100;
  return res;
}
function realLine(){
  const R=realReturn();if(!R)return '';
  const vs=(k)=>(R.port.end/R[k].end-1)*100;
  return `<div class="realbar card"><div class="rb-main"><span class="muted">${R.real?'Portföyün':'Model portföy'} TL bazında</span> <b class="num ${cls(R.port.ret)}">${pct(R.port.ret,1)}</b> <span class="dim">·</span> enflasyona göre reel <b class="num ${cls(R.realVsCpi)}">${pct(R.realVsCpi,1)}</b></div>
  <div class="rb-chips"><span class="chip ${cls(vs('dep'))}">Mevduata göre ${pct(vs('dep'),1)}</span><span class="chip ${cls(vs('gold'))}">Gram altına göre ${pct(vs('gold'),1)}</span><span class="chip ${cls(vs('spy'))}">S&P 500'e göre ${pct(vs('spy'),1)}</span><a class="muted" href="#/analiz" style="font-size:13px">detay →</a></div></div>`;
}

/* ---------- risk ---------- */
function alignedReturns(keys,days=252){
  const base=series('SMH').map(p=>p[0]).slice(-(days+1));
  const maps={};keys.forEach(k=>maps[k]=new Map(histArr(k)));
  const R={};keys.forEach(k=>{const r=[];let prev=null;for(const d of base){const v=maps[k].get(d);if(v==null){r.push(null);continue}if(prev!=null)r.push(v/prev-1);else r.push(null);prev=v}R[k]=r.slice(1)});
  return {dates:base.slice(1),R};
}
function stats(a){const x=a.filter(v=>v!=null);const n=x.length;if(n<20)return null;const m=x.reduce((s,v)=>s+v,0)/n;const v=x.reduce((s,y)=>s+(y-m)*(y-m),0)/(n-1);return {m,sd:Math.sqrt(v),n}}
function covar(a,b){const p=[];for(let i=0;i<a.length;i++)if(a[i]!=null&&b[i]!=null)p.push([a[i],b[i]]);const n=p.length;if(n<20)return null;const ma=p.reduce((s,q)=>s+q[0],0)/n,mb=p.reduce((s,q)=>s+q[1],0)/n;let c=0,va=0,vb=0;p.forEach(q=>{c+=(q[0]-ma)*(q[1]-mb);va+=(q[0]-ma)**2;vb+=(q[1]-mb)**2});return {cov:c/(n-1),corr:c/Math.sqrt(va*vb),vb:vb/(n-1)}}
function maxDD(pts){let peak=-Infinity,mdd=0,pk=null,tr=null,cur=null;for(const [d,v] of pts){if(v>peak){peak=v;cur=d}const dd=v/peak-1;if(dd<mdd){mdd=dd;pk=cur;tr=d}}return {mdd:mdd*100,peak:pk,trough:tr}}
function riskModel(){
  const ts=tickers();const keys=ts.concat(['SPY']);const {dates,R}=alignedReturns(keys);
  const W=weights();const wsum=Object.values(W.w).reduce((a,b)=>a+b,0)||1;
  const pr=dates.map((_,i)=>{let s=0,ws=0;for(const t of ts){const w=(W.w[t]||0)/wsum;if(!w)continue;const v=R[t][i];if(v==null)continue;s+=w*v;ws+=w}return ws>0?s/ws:null});
  R.__P=pr;
  const row=k=>{const st=stats(R[k]);const cv=covar(R[k],R.SPY);let pts=k==='__P'?(()=>{let v=100;return dates.map((d,i)=>{if(pr[i]!=null)v*=1+pr[i];return [d,v]})})():sliceRange(series(k),'1Y');
    return {k,vol:st?st.sd*Math.sqrt(252)*100:null,beta:cv?cv.cov/cv.vb:null,corrSpy:cv?cv.corr:null,mdd:maxDD(pts).mdd,ret:pts.length>1?(pts[pts.length-1][1]/pts[0][1]-1)*100:null}};
  const rows=ts.map(row);const P=row('__P');
  const corr={};ts.forEach(a=>{corr[a]={};ts.forEach(b=>{corr[a][b]=a===b?1:(covar(R[a],R[b])||{}).corr})});
  const wavgVol=ts.reduce((s,t)=>s+(W.w[t]||0)/wsum*((rows.find(r=>r.k===t)||{}).vol||0),0);
  const varP=(stats(pr)||{sd:0}).sd**2;
  const contrib=ts.map(t=>{const w=(W.w[t]||0)/wsum;const c=covar(R[t],pr);return {t,w:w*100,rc:c&&varP?w*c.cov/varP*100:0}}).filter(x=>x.w>0).sort((a,b)=>b.rc-a.rc);
  const pairs=[];ts.forEach((a,i)=>ts.slice(i+1).forEach(b=>{const c=corr[a][b];if(c!=null)pairs.push({a,b,c})}));pairs.sort((x,y)=>y.c-x.c);
  return {rows,P,corr,wavgVol,contrib,pairs,W,R,dates};
}
function corrColor(c){if(c==null)return 'var(--panel2)';const a=Math.min(1,Math.abs(c));return c>=0?`rgba(255,93,122,${.08+a*.72})`:`rgba(92,211,255,${.08+a*.72})`}

/* ---------- senaryo ---------- */
const FACTORS=[
  {k:'SMH',name:'Yarı iletkenler',pre:-20},{k:'SPY',name:'ABD piyasası (S&P 500)',pre:-10},{k:'XBI',name:'Biyoteknoloji',pre:-15},
  {k:'IAU',name:'Altın',pre:10},{k:'SLV',name:'Gümüş',pre:15},{k:'COPX',name:'Bakır madencileri',pre:-15},{k:'USDTRY',name:'Dolar/TL',pre:10}
];
function scenario(fk,shock){
  const ts=tickers();const P=positions();const real=P.total>0;const {w}=weights();
  const base=real?P.total:10000;
  if(fk==='USDTRY'){return {rows:ts.map(t=>({t,beta:0,imp:0,usdChg:0,val:real?((P.list.find(m=>m.t===t)||{}).value||0):base*(w[t]||0)/100})),totUsd:0,totPct:0,tlPct:shock,base,real}}
  const {R}=alignedReturns(ts.concat(fk==='SPY'?['SPY']:[]));
  const fr=R[fk];const rows=ts.map(t=>{let beta=t===fk?1:null;if(beta==null){const c=covar(R[t],fr);beta=c?c.cov/c.vb:0}
    const val=real?((P.list.find(m=>m.t===t)||{}).value||0):base*(w[t]||0)/100;const imp=beta*shock;return {t,beta,imp,val,usdChg:val*imp/100}});
  const totUsd=rows.reduce((s,r)=>s+r.usdChg,0);return {rows,totUsd,totPct:base?totUsd/base*100:0,tlPct:null,base,real};
}

/* ---------- dengeleme ---------- */
function rebalance(amount,frac){
  const ts=tickers();const T=S.settings.targets||{};const tsum=ts.reduce((a,t)=>a+(+T[t]||0),0);if(!(tsum>0))return {err:'Önce Pozisyonlar sayfasından hedef ağırlıkları gir.'};
  const P=positions();const cur={};P.list.forEach(m=>cur[m.t]=m.value);const tot=P.total+amount;
  const rows=ts.map(t=>{const tg=(+T[t]||0)/tsum;return {t,tg:tg*100,cur:cur[t]||0,need:Math.max(0,tg*tot-(cur[t]||0)),px:quote(t).price}});
  const need=rows.reduce((s,r)=>s+r.need,0);const scale=need>amount?amount/need:1;
  let spent=0;rows.forEach(r=>{let a=r.need*scale;let q=r.px>0?a/r.px:0;if(!frac)q=Math.floor(q+1e-9);r.q=q;r.buy=q*r.px;spent+=r.buy});
  // tam adette kalan nakdi, hedefin en çok gerisinde kalana tek tek dağıt
  if(!frac){let left=amount-spent,guard=0;while(guard++<200){const cand=rows.filter(r=>r.px>0&&r.px<=left&&r.tg>0).sort((a,b)=>((b.tg/100*tot-(b.cur+b.buy))/b.tg)-((a.tg/100*tot-(a.cur+a.buy))/a.tg))[0];if(!cand)break;cand.q+=1;cand.buy+=cand.px;left-=cand.px;spent+=cand.px}}
  rows.forEach(r=>{r.after=tot>0?(r.cur+r.buy)/(P.total+spent)*100:0;r.before=P.total>0?r.cur/P.total*100:0});
  return {rows:rows.filter(r=>r.tg>0||r.cur>0),spent,left:amount-spent,tot};
}

/* ---------- görünüm: Analiz ---------- */
function viewAnaliz(){
  if(!S.scn)S.scn={f:'SMH',v:-20};if(!S.reb)S.reb={a:1000,frac:false};
  const R=realReturn();const M=riskModel();const ts=tickers();
  const sc=scenario(S.scn.f,+S.scn.v);const rb=rebalance(+S.reb.a||0,S.reb.frac);
  const fname=(FACTORS.find(f=>f.k===S.scn.f)||{}).name;
  const rt=(k,label,c)=>R?`<div class="cmp"><i style="background:${c}"></i><span>${label}</span><b class="num">${money2TL(R[k].end)}</b><span class="num ${cls(R[k].ret)}">${pct(R[k].ret,1)}</span></div>`:'';
  return `<div class="fade">
  <div class="sec-t" style="margin-top:0"><div><h2>Reel getiri</h2><p>${R?(R.real?'Gerçek alış/satışların':'Model portföy (1 yıl önce $10.000)')+' aynı tarihlerde ve aynı TL tutarlarıyla alternatiflere yatırılsaydı':'Veri yok'}</p></div>${R?`<div class="bigchip ${cls(R.realVsCpi)}">Enflasyona göre reel <b>${pct(R.realVsCpi,1)}</b></div>`:''}</div>
  ${R?`<div class="grid g-main"><section class="card"><div class="chart" id="cReal" style="height:320px"></div></section>
  <section class="card"><h3>Bugünkü değer (TL) <span class="r muted">yatırılan ₺${nf(R.inTL,0)}</span></h3>
    ${rt('port',R.real?'Portföyün':'Model portföy',BENCH_COLORS.port)}${rt('dep','TL mevduat (%'+nf(R.rate,0)+' brüt)',BENCH_COLORS.dep)}${rt('gold','Gram altın',BENCH_COLORS.gold)}${rt('spy','S&P 500 (SPY)',BENCH_COLORS.spy)}${rt('usd','Dolar (nakit)',BENCH_COLORS.usd)}${rt('cpi','Enflasyon (TÜFE)',BENCH_COLORS.cpi)}
    <p class="muted" style="font-size:12.5px;margin:12px 0 0">Satışlardan çekilen para tüm seçeneklerde aynı tarihte çekilmiş sayılır. TÜFE: TÜİK aylık verisi${R.est?', son ay sonrası son aylık oranla tahmin':''}. Mevduat sabit brüt oran varsayar (stopaj hariç); oranı Pozisyonlar → Ayarlar'dan değiştirebilirsin. Kur ve altın: Twelve Data.</p></section></div>`:'<div class="empty">Kur geçmişi yüklenemedi</div>'}

  <div class="sec-t"><div><h2>Risk paneli</h2><p>Son 1 yılın günlük getirileri · ${esc(M.W.src)}</p></div></div>
  <div class="grid g4">
    <div class="card kpi"><div class="l">Portföy oynaklığı (yıllık)</div><div class="v">%${nf(M.P.vol,1)}</div><div class="s">tek tek ortalama %${nf(M.wavgVol,1)}</div></div>
    <div class="card kpi"><div class="l">Çeşitlendirme etkisi</div><div class="v ${M.wavgVol-M.P.vol>3?'up':''}">−${nf(Math.max(0,M.wavgVol-M.P.vol),1)} puan</div><div class="s">birlikte tutunca azalan oynaklık</div></div>
    <div class="card kpi"><div class="l">Zirveden en büyük düşüş</div><div class="v down">${pct(M.P.mdd,1)}</div><div class="s">son 1 yıl</div></div>
    <div class="card kpi"><div class="l">Beta (S&P 500'e göre)</div><div class="v">${nf(M.P.beta,2)}</div><div class="s">piyasa %1 → portföy ~%${nf(M.P.beta,1)}</div></div>
  </div>
  <div class="grid g-main sec">
    <section class="card"><h3>Enstrüman bazında</h3><div class="tscroll"><table class="tbl"><thead><tr><th>Enstrüman</th><th class="r">1Y getiri</th><th class="r">Oynaklık</th><th class="r">Max düşüş</th><th class="r">Beta</th><th class="r">Risk payı</th></tr></thead><tbody>
      ${M.rows.map(r=>{const c=M.contrib.find(x=>x.t===r.k);return `<tr><td><a class="sym" href="#/t/${r.k}">${logo(r.k)}<b>${r.k}</b></a></td><td class="r num ${cls(r.ret)}">${pct(r.ret,1)}</td><td class="r num">%${nf(r.vol,1)}</td><td class="r num down">${pct(r.mdd,1)}</td><td class="r num">${nf(r.beta,2)}</td><td class="r num">${c?`%${nf(c.rc,1)} <span class="dim">(ağ. %${nf(c.w,1)})</span>`:'—'}</td></tr>`}).join('')}
    </tbody></table></div><p class="muted" style="font-size:12.5px;margin:10px 0 0">Risk payı: portföy oynaklığının ne kadarının o enstrümandan geldiği. Ağırlığından çok daha büyükse, o pozisyon portföyü tek başına sürüklüyor demektir.</p></section>
    <section class="card"><h3>Birlikte hareket edenler</h3><div class="pairs">${M.pairs.slice(0,6).map(p=>`<div class="pair"><span><b>${p.a}</b> ↔ <b>${p.b}</b></span><span class="num" style="color:${p.c>.85?'var(--down)':p.c>.6?'var(--warn)':'var(--up)'}">${nf(p.c,2)}</span></div>`).join('')}</div>
      <h3 style="margin-top:18px">En bağımsızlar</h3><div class="pairs">${M.pairs.slice(-4).reverse().map(p=>`<div class="pair"><span><b>${p.a}</b> ↔ <b>${p.b}</b></span><span class="num up">${nf(p.c,2)}</span></div>`).join('')}</div>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">1'e yakın korelasyon: aynı riski iki kez taşıyorsun. 0 civarı ya da negatif: gerçek çeşitlendirme.</p></section>
  </div>
  <section class="card sec"><h3>Korelasyon haritası <span class="r muted">kırmızı: birlikte hareket · mavi: ters</span></h3><div class="tscroll"><table class="corr"><thead><tr><th></th>${ts.map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody>
    ${ts.map(a=>`<tr><th>${a}</th>${ts.map(b=>{const c=M.corr[a][b];return `<td style="background:${corrColor(c)}" title="${a}–${b}: ${nf(c,2)}">${a===b?'':nf(c,2)}</td>`}).join('')}</tr>`).join('')}
  </tbody></table></div></section>

  <div class="sec-t"><div><h2>Senaryo testi</h2><p>Bir etken değişirse, geçmiş 1 yıldaki duyarlılıklara (beta) göre ne olur</p></div></div>
  <section class="card">
    <div class="filters" id="scnPre">${FACTORS.map(f=>`<button data-f="${f.k}" data-v="${f.pre}" class="${S.scn.f===f.k&&+S.scn.v===f.pre?'on':''}">${esc(f.name)} ${f.pre>0?'+':''}${f.pre}%</button>`).join('')}</div>
    <div class="scn-in"><label>Etken<select id="scnF">${FACTORS.map(f=>`<option value="${f.k}" ${S.scn.f===f.k?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label><label>Değişim (%)<input id="scnV" type="number" step="1" value="${esc(S.scn.v)}"></label>
      <div class="scn-res"><span class="muted">${esc(fname)} ${S.scn.v>0?'+':''}${S.scn.v}% olursa ${sc.real?'portföyün':'model portföy'}:</span> ${S.scn.f==='USDTRY'?`<b class="num up">TL bazında ${pct(sc.tlPct,1)}</b> <span class="muted">(dolar bazında değişmez)</span>`:`<b class="num ${cls(sc.totUsd)}">${smoney(sc.totUsd,0)} · ${pct(sc.totPct,1)}</b>`}</div></div>
    ${S.scn.f==='USDTRY'?'':`<div class="bars" style="margin-top:14px">${sc.rows.filter(r=>r.val>0).sort((a,b)=>a.imp-b.imp).map(r=>{const w=Math.min(50,Math.abs(r.imp)/Math.max(1,Math.abs(+S.scn.v)*1.6)*50);return `<div class="bar scn"><span class="t"><b>${r.t}</b> <span class="muted">β ${nf(r.beta,2)}</span></span><div class="tr mid"><div class="f ${r.imp<0?'neg':'pos'}" style="width:${w}%;${r.imp<0?`right:50%`:`left:50%`}"></div></div><span class="v ${cls(r.imp)}">${pct(r.imp,1)}<br><span style="font-size:11px">${smoney(r.usdChg,0)}</span></span></div>`}).join('')}</div>
    <p class="muted" style="font-size:12.5px;margin:12px 0 0">Beta geçmiş ilişkiyi gösterir, geleceği garanti etmez. Sert düşüşlerde korelasyonlar genelde artar; gerçek kayıp bundan büyük olabilir.</p>`}
  </section>

  <div class="sec-t"><div><h2>Dengeleme hesaplayıcı</h2><p>Yeni parayı, satış yapmadan hedef ağırlıklara en yakın olacak şekilde dağıtır</p></div></div>
  <section class="card">
    <div class="scn-in"><label>Eklenecek tutar ($)<input id="rbA" type="number" min="0" step="50" value="${esc(S.reb.a)}"></label><label class="chk"><input type="checkbox" id="rbF" ${S.reb.frac?'checked':''}> Kesirli adet (aracı kurum destekliyorsa)</label>
    ${rb.err?'':`<div class="scn-res"><span class="muted">Harcanan</span> <b class="num">${usd(rb.spent,2)}</b> <span class="muted">· artan nakit</span> <b class="num">${usd(rb.left,2)}</b></div>`}</div>
    ${rb.err?`<div class="note warn" style="margin-top:12px">${esc(rb.err)} <a href="#/pozisyon">Hedef gir →</a></div>`:`<div class="tscroll" style="margin-top:12px"><table class="tbl"><thead><tr><th>Enstrüman</th><th class="r">Şu an</th><th class="r">Hedef</th><th class="r">Al (adet)</th><th class="r">Tutar</th><th class="r">Sonra</th></tr></thead><tbody>
      ${rb.rows.map(r=>`<tr><td><b>${r.t}</b></td><td class="r num">%${nf(r.before,1)}</td><td class="r num">%${nf(r.tg,1)}</td><td class="r num ${r.q>0?'up':''}">${r.q>0?nf(r.q,S.reb.frac?4:0):'—'}</td><td class="r num">${r.buy>0?usd(r.buy):'—'}</td><td class="r num">%${nf(r.after,1)}</td></tr>`).join('')}
    </tbody></table></div>`}
  </section></div>`;
}
function money2TL(v){return isNum(v)?'₺'+nf(v,0):'—'}
function afterAnaliz(){
  const R=realReturn();
  if(R&&$('#cReal')){const L=[['port',R.real?'Portföy':'Model portföy'],['dep','Mevduat'],['gold','Gram altın'],['spy','S&P 500'],['usd','Dolar'],['cpi','Enflasyon']];
    lineChart($('#cReal'),L.map(([k,n])=>({name:n,color:BENCH_COLORS[k],pts:R.series[k]})),{fmt:(v,ax)=>'₺'+(ax&&v>=1e6?nf(v/1e6,1)+' mn':nf(v,0))});}
  $$('#scnPre button').forEach(b=>b.onclick=()=>{S.scn={f:b.dataset.f,v:+b.dataset.v};render(false)});
  const f=$('#scnF'),v=$('#scnV');if(f)f.onchange=()=>{S.scn.f=f.value;render(false)};if(v)v.onchange=()=>{S.scn.v=+v.value||0;render(false)};
  const a=$('#rbA'),fr=$('#rbF');if(a)a.onchange=()=>{S.reb.a=+a.value||0;render(false)};if(fr)fr.onchange=()=>{S.reb.frac=fr.checked;render(false)};
}

/* ---------- izleme listesi ---------- */
function watchDocs(){return Object.values(S.data.instruments).filter(i=>i.watchlist).map(i=>i.ticker)}
function watchPending(){const have=new Set(Object.keys(S.data.instruments));return (S.watch&&S.watch.tickers||[]).filter(w=>!have.has(w.t))}
function viewWatch(){
  const docs=watchDocs(),pend=watchPending();
  return `<div class="sec-t"><div><h2>İzleme listesi</h2><p>Almayı düşündüğün hisse ve fonlar · analiz, fiyat, PEG ve haberler otomatik takip edilir</p></div></div>
  <section class="card"><form class="wadd" id="wAdd"><input name="t" placeholder="Sembol (ör. NVDA, GLD · BIST için THYAO:BIST)" maxlength="14" required>
    <select name="kind" id="wKind"><option value="watch">İzleme listesine</option><option value="port">Portföye (pozisyon açacağım)</option></select>
    <select name="theme" id="wTheme" style="display:none">${THEMES.map(x=>`<option>${esc(x.name)}</option>`).join('')}<option value="__new">+ Yeni tema…</option></select>
    <input name="themeNew" id="wThemeNew" placeholder="Yeni tema adı" style="display:none">
    <input name="note" placeholder="Not (ops.)"><button class="btn" type="submit">Ekle</button></form>
  <p class="muted" style="font-size:12.5px;margin:8px 0 0">Eklediğin hisse ya da fon için ekleme görevi en geç 1 saat içinde her şeyi hazırlar: fiyat geçmişi ve grafik, teknik plan, şirket/fon analizi, analist hedefi, değerleme, temettü, bilanço geçmişi, kurumsal yatırımcılar ve haber taraması. ${S.settings.tdKey?'Twelve Data anahtarın kayıtlı olduğu için fiyat geçmişi ekler eklemez çekilir.':'Pozisyonlar → Ayarlar\'a Twelve Data anahtarını girersen fiyat geçmişi ekler eklemez çekilir.'}</p>
  ${S.settings.ghToken?'':`<div class="note" style="margin-top:10px">Eklediğin sembollerin otomatik görevlere ulaşması için Pozisyonlar → Ayarlar'a GitHub anahtarını bir kez girmen gerekiyor. <a href="#/pozisyon">Nasıl? →</a></div>`}
  ${pend.length?`<div class="pend">${pend.map(w=>`<div class="pd"><b>${esc(w.t)}</b>${S.live[w.t]?`<span class="num">${pxf(w.t,S.live[w.t].price)}</span><span class="num ${cls(S.live[w.t].pct)}">${pct(S.live[w.t].pct)}</span>`:''}<span class="tag">${w.kind==='port'?'Portföy · '+esc(w.theme||''):'İzleme'}</span><span class="muted">${esc(w.note||'')} · ekleme görevi hazırlıyor (en geç 1 saat)${w.seed?' · fiyat geçmişi alındı':''}</span><button class="lnk" data-wdel="${esc(w.t)}" title="Kaldır">✕</button></div>`).join('')}</div>`:''}
  ${docs.length?`<div class="icards" style="margin-top:14px">${docs.map(t=>{const i=inst(t),q=quote(t),s=sliceRange(series(t),'6A');return `<div class="card ic wcard"><a href="#/t/${t}" style="text-decoration:none;display:flex;flex-direction:column;gap:10px"><div class="row"><div class="sym">${logo(t)}<div><div class="n">${t}</div><div class="d">${esc(i.name)}</div></div></div><span class="tag">İzleme</span></div>
    <div class="row"><span class="px">${pxf(t,q.price)}</span>${chip(q.pct)}</div>${spark(s,300,56,color(t))}
    <div class="ft"><span class="tag">YBB ${pct(ytd(t),1)}</span>${i.peg?`<span class="tag">PEG ${esc(pegTxt(i))}</span>`:''}${upside(t)!=null?`<span class="tag">Hedefe ${pct(upside(t),1)}</span>`:''}</div></a><button class="lnk wx" data-wdel="${t}" title="Listeden çıkar">✕</button></div>`}).join('')}</div>`:(pend.length?'':'<div class="empty" style="margin-top:12px">Liste boş. Yukarıdan bir sembol ekle.</div>')}
  </section>`;
}
function b64utf8(s){return btoa(unescape(encodeURIComponent(s)))}
async function ghWatchSave(list){
  const tok=(S.settings.ghToken||'').trim();if(!tok)throw new Error('GitHub anahtarı yok');
  const url=`https://api.github.com/repos/${GH_REPO}/contents/data/watchlist.json`;const h={Authorization:'Bearer '+tok,Accept:'application/vnd.github+json'};
  const g=await fetch(url+'?ref=main',{headers:h});let sha;if(g.ok){sha=(await g.json()).sha}else if(g.status!==404)throw new Error('GitHub '+g.status);
  const body={message:'İzleme listesi güncellendi (site)',content:b64utf8(JSON.stringify({updatedAt:new Date().toISOString(),tickers:list},null,1)+'\n'),branch:'main'};if(sha)body.sha=sha;
  const p=await fetch(url,{method:'PUT',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!p.ok)throw new Error('GitHub '+p.status+' '+(await p.text()).slice(0,120));
}
async function seedFetch(t){const key=(S.settings.tdKey||'').trim();if(!key)return false;const base='https://api.twelvedata.com/';const q=`symbol=${encodeURIComponent(t)}&apikey=${encodeURIComponent(key)}`;
  const qt=await (await fetch(base+'quote?'+q)).json();if(qt.status==='error'){if(/not found|invalid|symbol/i.test(qt.message||''))throw new Error('yok');throw new Error(qt.message)}
  const d=await (await fetch(base+'time_series?interval=1day&outputsize=800&'+q)).json();const m=await (await fetch(base+'time_series?interval=1month&outputsize=130&'+q)).json();
  if(!d.values)return false;const obj={t,fetchedAt:new Date().toISOString(),meta:d.meta||null,daily:d.values,monthly:m.values||[],quote:qt};
  return await ghPutJSON('data/seed/'+t.replace(':','_')+'.json',obj,t+' fiyat geçmişi (site)')}
async function liveOne(t){const key=(S.settings.tdKey||'').trim();if(!key)return;try{const r=await fetch(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(t)}&apikey=${encodeURIComponent(key)}`);const q=await r.json();if(+q.close>0)S.live[t]={price:+q.close,chg:+q.change,pct:+q.percent_change,day:q.datetime,name:q.name}}catch(e){}}
function afterWatch(){
  const f=$('#wAdd');if(f){const k=$('#wKind'),th=$('#wTheme'),tn=$('#wThemeNew');k.onchange=()=>{th.style.display=k.value==='port'?'':'none';tn.style.display=k.value==='port'&&th.value==='__new'?'':'none'};th.onchange=k.onchange;
   f.onsubmit=async e=>{e.preventDefault();const t=f.t.value.trim().toUpperCase().replace(/[^A-Z0-9.:\-]/g,'');if(!t)return;
    const cur=(S.watch&&S.watch.tickers)||[];if(cur.some(w=>w.t===t)||S.data.instruments[t]){toast(t+' zaten takipte');return}
    if(!(S.settings.ghToken||'').trim()){toast('Önce Pozisyonlar → Ayarlar\'a GitHub anahtarını gir');return}
    const kind=k.value,theme=kind==='port'?(th.value==='__new'?(tn.value.trim()||'Diğer'):th.value):null;
    const btn=f.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Ekleniyor…';let seeded=false;
    try{seeded=await seedFetch(t)}catch(err){if(err.message==='yok'){toast(t+' Twelve Data\'da bulunamadı; sembolü kontrol et');btn.disabled=false;btn.textContent='Ekle';return}console.warn(err)}
    const list=cur.concat({t,note:f.note.value.trim(),added:new Date().toISOString().slice(0,10),kind,theme,seed:seeded});
    S.watch={...(S.watch||{}),tickers:list};S.settings.watchLocal=list;
    try{await ghWatchSave(list);toast(t+' eklendi · tüm veriler en geç 1 saat içinde hazır')}catch(err){toast('Kaydedilemedi: '+err.message)}
    await saveSettings();await liveOne(t);render(false)}};
  $$('[data-wdel]').forEach(b=>b.onclick=async()=>{const t=b.dataset.wdel;if(!confirm(t+' izleme listesinden çıkarılsın mı?'))return;
    const list=((S.watch&&S.watch.tickers)||[]).filter(w=>w.t!==t);S.watch={...(S.watch||{}),tickers:list};S.settings.watchLocal=list;
    try{await ghWatchSave(list);toast(t+' çıkarıldı')}catch(err){toast('Yerelde çıkarıldı: '+err.message)}await saveSettings();render(false)});
}

/* ---------- haftalık rapor ---------- */
function weeklyCard(rp,full){
  if(!rp)return '';
  return `<article class="card wk ${full?'':'sec'}"><div class="wk-h"><div><span class="tag">Haftalık değerlendirme</span><h3 class="wk-t">${esc(rp.title)}</h3><div class="muted" style="font-size:13px">${esc(rp.range||'')} · yayın ${esc(trDate(rp.publishedAt||rp.weekEnd+'T20:00:00Z'))}</div></div>
    ${(rp.movers||[]).length?`<div class="wk-m">${rp.movers.slice(0,full?20:6).map(m=>`<a class="chip ${cls(m.pct)}" href="#/t/${m.t}" style="text-decoration:none">${m.t} ${pct(m.pct,1)}</a>`).join('')}</div>`:''}</div>
    <div class="prose">${(rp.summary||[]).slice(0,full?99:2).map(p=>`<p>${esc(p)}</p>`).join('')}</div>
    ${full&&(rp.highlights||[]).length?`<h3 style="margin-top:16px">Öne çıkanlar</h3><ul class="lst">${rp.highlights.map(x=>`<li><span>${esc(x)}</span></li>`).join('')}</ul>`:''}
    ${full&&(rp.nextWeek||[]).length?`<h3 style="margin-top:16px">Gelecek hafta</h3><ul class="lst nx">${rp.nextWeek.map(x=>`<li><span>${esc(x)}</span></li>`).join('')}</ul>`:''}
    ${full&&(rp.watch||[]).length?`<h3 style="margin-top:16px">Dikkat</h3><ul class="lst risk">${rp.watch.map(x=>`<li><span>${esc(x)}</span></li>`).join('')}</ul>`:''}
    ${full?'':`<a class="muted" href="#/haftalik" style="font-size:13px">Raporun tamamı →</a>`}</article>`;
}
function myWeek(){
  const P=positions();if(!(P.total>0))return '';
  const end=series('SMH').slice(-1)[0];if(!end)return '';const d=new Date(end[0]+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-7);const st=d.toISOString().slice(0,10);
  let v0=0,v1=0;P.list.forEach(m=>{const s=series(m.t);const p0=lastLE(s,st);if(p0){v0+=m.qty*p0;v1+=m.qty*(m.price||0)}});
  const ch=v1-v0;return `<div class="note" style="margin-bottom:12px">Senin pozisyonlarınla son 1 hafta: <b class="num ${cls(ch)}">${smoney(ch,0)} (${pct(v0?ch/v0*100:null,1)})</b></div>`;
}
function viewHaftalik(){
  const L=(S.weekly&&S.weekly.reports)||[];
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Haftalık değerlendirme</h2><p>Her cuma ABD kapanışından sonra yayınlanır</p></div></div>
  ${myWeek()}${L.length?L.map((r,i)=>weeklyCard(r,true)).join('<div style="height:16px"></div>'):'<div class="empty"><b>Henüz rapor yok</b>İlk rapor cuma akşamı yayınlanacak.</div>'}</div>`;
}
