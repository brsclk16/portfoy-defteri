/* Portföy Defteri — ileri analiz: tema riski + TL riske maruz değer + şirket bazında maruziyet, çok etkenli senaryo,
   göreli güç sıralaması, kurumsal yatırımcılar (13F), temettü takvimi, aylık rapor */
"use strict";
function themeOf(t){return THEMES.find(x=>x.t.includes(t))||{name:'Diğer',c:'#9aa4b2',t:[]}}
function pctl(a,p){if(!a.length)return null;const s=a.slice().sort((x,y)=>x-y);const k=Math.max(0,Math.min(s.length-1,Math.floor(p*(s.length-1))));return s[k]}
function portBaseUSD(){const P=positions();return P.total>0?{v:P.total,real:true}:{v:10000,real:false}}

/* ---------- Risk: ek bölümler ---------- */
function portDaily(days){
  const ts=tickers();const {dates,R}=alignedReturns(ts.concat(['USDTRY']),days);const {w}=weights();const ws=Object.values(w).reduce((a,b)=>a+b,0)||1;
  const pr=dates.map((_,i)=>{let s=0,q=0;for(const t of ts){const x=(w[t]||0)/ws;if(!x)continue;const v=R[t][i];if(v==null)continue;s+=x*v;q+=x}return q>0?s/q:null});
  const tl=pr.map((p,i)=>p==null?null:(1+p)*(1+(R.USDTRY[i]||0))-1);
  return {dates,usd:pr,tl};
}
function varCalc(){
  const C=S.labCache||(S.labCache={});if(C.var)return C.var;
  const D=portDaily(756);const b=portBaseUSD();const tlNow=b.v*(fxNow()||0);
  const d1=D.tl.slice(-252).filter(v=>v!=null),dU=D.usd.slice(-252).filter(v=>v!=null);
  const m21=[];for(let i=21;i<=D.tl.length;i++){let g=1,ok=true;for(let j=i-21;j<i;j++){if(D.tl[j]==null){ok=false;break}g*=1+D.tl[j]}if(ok)m21.push(g-1)}
  const es=(a,p)=>{const c=pctl(a,p);const t=a.filter(x=>x<=c);return t.length?t.reduce((s,x)=>s+x,0)/t.length:c};
  return C.var={tlNow,real:b.real,day:{v:-pctl(d1,.05),es:-es(d1,.05),usd:-pctl(dU,.05)},mon:{v:-pctl(m21,.05),es:-es(m21,.05),worst:-Math.min(...m21),n:m21.length},w:weights().src};
}
function lookThroughExp(){
  const {w}=weights();const ws=Object.values(w).reduce((a,b)=>a+b,0)||1;const E={};
  const add=(t,n,src,x)=>{const o=E[t]||(E[t]={t,n,tot:0,src:{}});o.tot+=x;o.src[src]=(o.src[src]||0)+x;if(!o.n&&n)o.n=n};
  Object.entries(w).forEach(([t,x])=>{const f=x/ws*100;const i=inst(t);if(!i||!f)return;
    if(i.holdings&&i.holdings.length)i.holdings.forEach(h=>add(h.t,h.n,t,f*h.w/100));else if(i.type==='Hisse')add(t,i.name,'doğrudan',f)});
  return Object.values(E).sort((a,b)=>b.tot-a.tot);
}
function viewRiskPlus(){
  const M=riskModel();const V=varCalc();const E=lookThroughExp().slice(0,12);
  const th={};M.contrib.forEach(c=>{const T=themeOf(c.t);const o=th[T.name]||(th[T.name]={n:T.name,c:T.c,w:0,rc:0});o.w+=c.w;o.rc+=c.rc});
  const TH=Object.values(th).sort((a,b)=>b.rc-a.rc);const mx=Math.max(...TH.map(x=>Math.max(x.w,x.rc)),1);
  const cmx=Math.max(...M.contrib.map(x=>Math.max(x.w,x.rc)),1);const emx=Math.max(...E.map(x=>x.tot),1);
  const tl=v=>'₺'+nf(v,0);
  return `<div class="sec-t"><div><h2>TL bazında kayıp riski</h2><p>${esc(V.w)} · son 3 yılın günlük fiyat ve kur hareketleriyle (dolar/TL dahil)</p></div></div>
  <div class="grid g4">
    <div class="card kpi"><div class="l">Kötü bir gün (20'de 1)</div><div class="v down">−${tl(V.tlNow*V.day.v)}</div><div class="s">%${nf(V.day.v*100,1)} · dolar bazında %${nf(V.day.usd*100,1)}</div></div>
    <div class="card kpi"><div class="l">O kötü günlerin ortalaması</div><div class="v down">−${tl(V.tlNow*V.day.es)}</div><div class="s">%${nf(V.day.es*100,1)} (beklenen kuyruk kaybı)</div></div>
    <div class="card kpi"><div class="l">Kötü bir ay (20'de 1)</div><div class="v ${V.mon.v>0?'down':'up'}">${V.mon.v>0?'−':'+'}${tl(Math.abs(V.tlNow*V.mon.v))}</div><div class="s">21 iş günlük pencere, TL bazında</div></div>
    <div class="card kpi"><div class="l">3 yılın en kötü ayı</div><div class="v ${V.mon.worst>0?'down':'up'}">${pct(-V.mon.worst*100,1)}</div><div class="s">bugünkü ağırlıklarla</div></div>
  </div>
  <p class="muted" style="font-size:12.5px;margin:10px 2px 0">Portföy değeri ${V.real?'gerçek pozisyonlarından':'model olarak $10.000'} alındı: ₺${nf(V.tlNow,0)}. TL'nin değer kaybı dolar bazlı kayıpları kısmen telafi ettiği için TL bazındaki aylık risk dolar bazındakinden düşük görünebilir. Geçmişe dayalı bir ölçüdür, üst sınır değildir.</p>
  <div class="grid g-main sec" style="align-items:start">
    <section class="card"><h3>Ağırlık mı, risk mi? <span class="r muted"><i class="lg-sw" style="background:var(--muted)"></i>ağırlık <i class="lg-sw" style="background:var(--down)"></i>risk payı</span></h3>
      <div class="rw-list">${M.contrib.map(c=>`<div class="rw"><span class="t"><b>${esc(dispT(c.t))}</b></span><div class="rw-b"><div class="a" style="width:${c.w/cmx*100}%"></div><div class="b" style="width:${Math.max(0,c.rc)/cmx*100}%"></div></div><span class="v num">%${nf(c.w,0)} → <b class="${c.rc>c.w*1.25?'down':c.rc<c.w*.75?'up':''}">%${nf(c.rc,0)}</b></span></div>`).join('')}</div>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">Kırmızı çubuk gri çubuktan uzunsa o pozisyon ağırlığından fazla risk taşıyor.</p></section>
    <section class="card"><h3>Tema bazında</h3>
      <div class="rw-list">${TH.map(x=>`<div class="rw"><span class="t"><i class="dot" style="background:${x.c}"></i><b>${esc(x.n)}</b></span><div class="rw-b"><div class="a" style="width:${x.w/mx*100}%"></div><div class="b" style="width:${Math.max(0,x.rc)/mx*100}%;background:${x.c}"></div></div><span class="v num">%${nf(x.w,0)} → <b>%${nf(x.rc,0)}</b></span></div>`).join('')}</div>
      ${TH[0]&&TH[0].rc>55?`<div class="note warn" style="margin-top:12px">Portföy oynaklığının %${nf(TH[0].rc,0)}'i tek temadan (${esc(TH[0].n)}) geliyor.</div>`:''}</section>
  </div>
  <section class="card sec"><h3>Şirket bazında gerçek maruziyet <span class="r muted">fonların içi + doğrudan pozisyonlar</span></h3>
    <div class="rw-list">${E.map(x=>`<div class="rw"><span class="t"><b>${esc(x.t)}</b> <span class="muted" style="font-size:12px">${esc((x.n||'').slice(0,22))}</span></span><div class="rw-b"><div class="b" style="width:${x.tot/emx*100}%;background:var(--accent2)"></div></div><span class="v num"><b>%${nf(x.tot,1)}</b></span></div><div class="rw-src">${Object.entries(x.src).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<span class="chip">${esc(k)} %${nf(v,1)}</span>`).join('')}</div>`).join('')}</div>
    <p class="muted" style="font-size:12.5px;margin:10px 0 0">Her fonun en büyük 10 varlığı üzerinden hesaplanır; gerçek maruziyet biraz daha yüksek olabilir. Aynı şirket birden fazla fonda ve doğrudan pozisyonda varsa burada toplanır.</p></section>`;
}

/* ---------- Çok etkenli senaryo ---------- */
const FX2=[{k:'SMH',n:'Yarı iletkenler',mn:-50,mx:50},{k:'SPY',n:'ABD piyasası (S&P 500)',mn:-40,mx:40},{k:'XBI',n:'Biyoteknoloji',mn:-40,mx:40},{k:'IAU',n:'Altın',mn:-30,mx:40},{k:'SLV',n:'Gümüş',mn:-40,mx:50},{k:'COPX',n:'Bakır madencileri',mn:-50,mx:50},{k:'USDTRY',n:'Dolar/TL',mn:-15,mx:60}];
const SCN_PRE=[
  {n:'Çip çöküşü',v:{SMH:-25,SPY:-8}},{n:'AI rallisi',v:{SMH:20,SPY:6}},{n:'Resesyon',v:{SPY:-20,SMH:-30,XBI:-15,COPX:-25,IAU:8}},
  {n:'TL şoku',v:{USDTRY:20,IAU:5}},{n:'Emtia döngüsü',v:{COPX:25,SLV:20,IAU:10}},{n:'Faiz şoku',v:{SPY:-8,XBI:-12,IAU:-6,SLV:-8}},{n:'Sıfırla',v:{}}];
function solveLin(A,b){const n=b.length;const M=A.map((r,i)=>r.concat([b[i]]));for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;[M[c],M[p]]=[M[p],M[c]];const d=M[c][c]||1e-12;for(let r=0;r<n;r++){if(r===c)continue;const f=M[r][c]/d;for(let k=c;k<=n;k++)M[r][k]-=f*M[c][k]}}return M.map((r,i)=>r[n]/(r[i]||1e-12))}
function scnBetas(t,fs){
  const C=S.labCache||(S.labCache={});const key='b|'+t+'|'+fs.join(',');if(C[key])return C[key];
  if(!C.scnR)C.scnR=alignedReturns(tickers().concat(['SPY']),504).R;const R=C.scnR;const y=R[t];if(!y)return C[key]=fs.map(()=>0);
  const rows=[];for(let i=0;i<y.length;i++){if(y[i]==null)continue;const x=fs.map(f=>R[f]?R[f][i]:null);if(x.some(v=>v==null))continue;rows.push([y[i],x])}
  if(rows.length<60)return C[key]=fs.map(()=>0);
  const k=fs.length,my=rows.reduce((s,r)=>s+r[0],0)/rows.length,mx=fs.map((_,j)=>rows.reduce((s,r)=>s+r[1][j],0)/rows.length);
  const A=Array.from({length:k},()=>Array(k).fill(0)),b=Array(k).fill(0);
  rows.forEach(([yy,x])=>{for(let a=0;a<k;a++){b[a]+=(x[a]-mx[a])*(yy-my);for(let c=0;c<k;c++)A[a][c]+=(x[a]-mx[a])*(x[c]-mx[c])}});
  const tr=A.reduce((s,r,i)=>s+r[i],0)/k;for(let a=0;a<k;a++)A[a][a]+=tr*0.02;
  return C[key]=solveLin(A,b);
}
function scenario2(){
  const v=S.scn2;const fs=FX2.filter(f=>f.k!=='USDTRY'&&+v[f.k]).map(f=>f.k);const fxs=+v.USDTRY||0;
  const P=positions();const real=P.total>0;const {w}=weights();const base=real?P.total:10000;
  const rows=tickers().map(t=>{const val=real?((P.list.find(m=>m.t===t)||{}).value||0):base*(w[t]||0)/100;if(!(val>0))return null;
    let imp=0,how='';if(fs.includes(t)){imp=+v[t];how='doğrudan'}else if(fs.length){const B=scnBetas(t,fs);imp=B.reduce((s,bb,j)=>s+bb*v[fs[j]],0);how=fs.map((f,j)=>`${f} β${nf(B[j],2)}`).join(' · ')}
    imp=Math.max(-95,imp);return {t,val,imp,usd:val*imp/100,how}}).filter(Boolean);
  const totUsd=rows.reduce((s,r)=>s+r.usd,0),usdPct=base?totUsd/base*100:0,tlPct=((1+usdPct/100)*(1+fxs/100)-1)*100,f0=fxNow()||0;
  return {rows,totUsd,usdPct,tlPct,base,real,tl0:base*f0,tl1:(base+totUsd)*f0*(1+fxs/100)};
}
function viewScn2(){
  if(!S.scn2)S.scn2={SMH:-20,SPY:-10,XBI:0,IAU:5,SLV:0,COPX:0,USDTRY:10};
  const R=scenario2();const mx=Math.max(...R.rows.map(r=>Math.abs(r.imp)),1);
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Senaryo simülatörü</h2><p>Birden fazla etkeni birlikte değiştir; her pozisyonun tepkisi son 2 yılın ortak hareketlerinden (çoklu beta) hesaplanır</p></div></div>
  <section class="card"><div class="filters" id="scnP2">${SCN_PRE.map((p,i)=>`<button data-i="${i}">${esc(p.n)}</button>`).join('')}</div>
    <div class="sliders">${FX2.map(f=>{const x=+S.scn2[f.k]||0;return `<label class="sl"><span class="n">${esc(f.n)}</span><input type="range" min="${f.mn}" max="${f.mx}" step="1" value="${x}" data-k="${f.k}"><b class="num ${cls(f.k==='USDTRY'?0:x)}" id="slv_${f.k}">${x>0?'+':''}${x}%</b></label>`}).join('')}</div></section>
  <div class="grid g4 sec">
    <div class="card kpi"><div class="l">Dolar bazında</div><div class="v ${cls(R.usdPct)}">${pct(R.usdPct,1)}</div><div class="s">${smoney(R.totUsd,0)}</div></div>
    <div class="card kpi"><div class="l">TL bazında</div><div class="v ${cls(R.tlPct)}">${pct(R.tlPct,1)}</div><div class="s">₺${nf(R.tl0,0)} → ₺${nf(R.tl1,0)}</div></div>
    <div class="card kpi"><div class="l">TL farkı</div><div class="v ${cls(R.tl1-R.tl0)}">${R.tl1-R.tl0>=0?'+':'−'}₺${nf(Math.abs(R.tl1-R.tl0),0)}</div><div class="s">kur etkisi dahil</div></div>
    <div class="card kpi"><div class="l">Baz</div><div class="v" style="font-size:18px">${R.real?'Gerçek pozisyonlar':'Model $10.000'}</div><div class="s">$${nf(R.base,0)}</div></div>
  </div>
  <section class="card sec"><h3>Pozisyon bazında etki</h3><div class="bars">${R.rows.slice().sort((a,b)=>a.imp-b.imp).map(r=>{const wd=Math.min(50,Math.abs(r.imp)/mx*50);return `<div class="bar scn"><span class="t"><b>${esc(dispT(r.t))}</b> <span class="muted" style="font-size:11px">${esc(r.how)}</span></span><div class="tr mid"><div class="f ${r.imp<0?'neg':'pos'}" style="width:${wd}%;${r.imp<0?'right:50%':'left:50%'}"></div></div><span class="v ${cls(r.imp)}">${pct(r.imp,1)}<br><span style="font-size:11px">${smoney(r.usd,0)}</span></span></div>`}).join('')}</div>
  <p class="muted" style="font-size:12.5px;margin:12px 0 0">Kaydırıcıda değiştirdiğin etken portföyde varsa doğrudan o oran uygulanır; diğerleri o etkenlere geçmişteki duyarlılıklarına göre tepki verir. Sert piyasalarda korelasyonlar artar, gerçek sonuç daha kötü olabilir. Dolar/TL yalnızca TL bazındaki sonucu değiştirir.</p></section></div>`;
}
function afterScn2(){
  $$('#scnP2 button').forEach(b=>b.onclick=()=>{const p=SCN_PRE[+b.dataset.i];S.scn2={};FX2.forEach(f=>S.scn2[f.k]=p.v[f.k]||0);render(false)});
  $$('.sliders input[type=range]').forEach(r=>{r.oninput=()=>{const v=+r.value;const e=$('#slv_'+r.dataset.k);if(e)e.textContent=(v>0?'+':'')+v+'%'};r.onchange=()=>{S.scn2[r.dataset.k]=+r.value;render(false)}});
}

/* ---------- Göreli güç sıralaması ---------- */
function rsRank(off){
  const sp=S.hist.SPY||[];const ret=(s,n)=>{const i=s.length-1-off;if(i-n<0)return null;const a=s[i],b=s[i-n];const x=lastLE(sp,a[0]),y=lastLE(sp,b[0]);if(!x||!y)return null;return {own:(a[1]/b[1]-1)*100,ex:((a[1]/b[1])/(x/y)-1)*100}};
  const rows=allTickers().map(t=>{const s=closeSeries(t);if(s.length<140)return null;const r1=ret(s,21),r3=ret(s,63),r6=ret(s,126);if(!r1||!r3||!r6)return null;
    return {t,r1,r3,r6,score:.2*r1.ex+.4*r3.ex+.4*r6.ex,watch:!tickers().includes(t)}}).filter(Boolean).sort((a,b)=>b.score-a.score);
  rows.forEach((r,i)=>r.rank=i+1);return rows;
}
function viewGuc(){
  const now=rsRank(0),prev=rsRank(5);const pm=new Map(prev.map(r=>[r.t,r.rank]));if(!now.length)return '<div class="empty">Yeterli fiyat geçmişi yok</div>';
  const th={};now.forEach(r=>{if(r.watch)return;const T=themeOf(r.t);const o=th[T.name]||(th[T.name]={n:T.name,c:T.c,s:[],p:[]});o.s.push(r.score);const pr=prev.find(x=>x.t===r.t);if(pr)o.p.push(pr.score)});
  const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;const TH=Object.values(th).map(o=>({...o,a:avg(o.s),d:avg(o.s)-avg(o.p)})).sort((a,b)=>b.a-a.a);
  const mx=Math.max(...TH.map(x=>Math.abs(x.a)),1);const ex=v=>`<span class="num ${cls(v.ex)}">${v.ex>0?'+':''}${nf(v.ex,1)}</span>`;
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Göreli güç sıralaması</h2><p>S&P 500'e göre fazla getiri · puan = %20 × 1 ay + %40 × 3 ay + %40 × 6 ay · son kapanış ${esc((S.prices&&S.prices.asOf)||'')}</p></div></div>
  <section class="card"><h3>Temalar: para nereye giriyor? <span class="r muted">haftalık değişim</span></h3><div class="bars">${TH.map(x=>{const w=Math.min(50,Math.abs(x.a)/mx*50);return `<div class="bar scn"><span class="t"><i class="dot" style="background:${x.c}"></i><b>${esc(x.n)}</b></span><div class="tr mid"><div class="f ${x.a<0?'neg':'pos'}" style="width:${w}%;${x.a<0?'right:50%':'left:50%'}"></div></div><span class="v ${cls(x.a)}">${x.a>0?'+':''}${nf(x.a,1)}<br><span style="font-size:11px" class="${cls(x.d)}">${x.d>=0?'▲':'▼'} ${nf(Math.abs(x.d),1)}</span></span></div>`}).join('')}</div></section>
  <section class="card sec"><div class="tscroll"><table class="tbl"><thead><tr><th>#</th><th>Enstrüman</th><th class="r">Geçen hafta</th><th class="r">1 ay</th><th class="r">3 ay</th><th class="r">6 ay</th><th class="r">Puan</th><th>Durum</th></tr></thead><tbody>
  ${now.map(r=>{const p=pm.get(r.t);const d=p?p-r.rank:0;const st=r.r1.ex>0&&r.r3.ex>0&&r.r6.ex>0?['Lider','up']:r.r1.ex>0&&r.r6.ex<0?['Toparlanıyor','warn']:r.r1.ex<0&&r.r6.ex>0?['Yoruluyor','warn']:r.r1.ex<0&&r.r3.ex<0&&r.r6.ex<0?['Zayıf','down']:['Karışık',''];
    return `<tr style="cursor:pointer" onclick="location.hash='#/teknik/grafik/${esc(r.t)}'"><td class="num">${r.rank}</td><td><div class="sym">${logo(r.t)}<b>${esc(dispT(r.t))}</b>${r.watch?' <span class="chip">izleme</span>':''}</div></td><td class="r num ${d>0?'up':d<0?'down':'muted'}">${p?`${p}. ${d>0?'▲'+d:d<0?'▼'+(-d):'='}`:'—'}</td><td class="r">${ex(r.r1)}</td><td class="r">${ex(r.r3)}</td><td class="r">${ex(r.r6)}</td><td class="r num"><b class="${cls(r.score)}">${nf(r.score,1)}</b></td><td><span class="tag ${st[1]}">${st[0]}</span></td></tr>`}).join('')}
  </tbody></table></div><p class="muted" style="font-size:12.5px;margin:10px 0 0">Değerler S&P 500'e göre puan farkıdır (ör. +5,0 = SPY'dan 5 puan iyi). "Yoruluyor": uzun vadede güçlü ama son ay geride; "Toparlanıyor": tersi. Geçen hafta sütunu 5 işlem günü önceki sırayı gösterir.</p></section></div>`;
}

/* ---------- Kurumsal yatırımcılar (13F) ---------- */
function heldVia(t){const out=[];const P=positions();const {w}=weights();
  Object.values(S.data.instruments).forEach(i=>{if(i.watchlist)return;if(i.ticker===t)out.push('doğrudan pozisyon');else{const h=(i.holdings||[]).find(x=>x.t===t);if(h)out.push(`${i.ticker} içinde %${nf(h.w,1)}`)}});return out}
function bigN(v){if(!isNum(v))return '—';const a=Math.abs(v);return (v<0?'−':'')+'$'+(a>=1e9?nf(a/1e9,1)+' mlr':a>=1e6?nf(a/1e6,0)+' mn':nf(a/1e3,0)+' bin')}
function viewKurumsal(){
  const D=S.inst13&&S.inst13.data;if(!D)return '<div class="empty"><b>13F verisi yok</b>Haftalık görev ilk çalıştığında dolacak.</div>';
  const ord=Object.keys(D).sort((a,b)=>{const da=tickers().includes(a)?0:1,db=tickers().includes(b)?0:1;return da-db||((D[b].inflow12m||0)-(D[b].outflow12m||0))-((D[a].inflow12m||0)-(D[a].outflow12m||0))});
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Kurumsal yatırımcı hareketleri</h2><p>SEC 13F bildirimleri · doğrudan tuttuğun hisseler ve fonlarının en büyük varlıkları · güncelleme ${esc(trDate(S.inst13.updatedAt,{day:'numeric',month:'long'}))}</p></div></div>
  <div class="grid g2">${ord.map(t=>{const x=D[t];if(x.err)return '';const net=(x.inflow12m||0)-(x.outflow12m||0);const tot=(x.inflow12m||0)+(x.outflow12m||0)||1;const br=x.buyers12m/((x.buyers12m+x.sellers12m)||1)*100;
    return `<section class="card i13"><h3><span class="sym">${logo(t)}<b>${esc(t)}</b></span><span class="r muted" style="font-size:12px">${heldVia(t).map(esc).join(' · ')}</span></h3>
    <div class="kpis"><div class="kpi"><div class="l">Kurumsal sahiplik</div><div class="v">%${nf(x.instPct,1)}</div></div><div class="kpi"><div class="l">12 ay net akış</div><div class="v ${cls(net)}">${net>0?'+':''}${bigN(net)}</div></div></div>
    <div class="flowbar"><div class="in" style="width:${(x.inflow12m||0)/tot*100}%"></div><div class="out"></div></div>
    <div class="muted" style="font-size:12px;display:flex;justify-content:space-between;margin-top:4px"><span>Giriş ${bigN(x.inflow12m)} · ${nf(x.buyers12m,0)} alıcı</span><span>${nf(x.sellers12m,0)} satıcı · çıkış ${bigN(x.outflow12m)}</span></div>
    ${br<55?`<div class="note warn" style="margin-top:8px">Alıcı/satıcı oranı zayıf (%${nf(br,0)} alıcı).</div>`:''}
    ${(x.rows||[]).length?`<div class="tscroll"><table class="tbl" style="margin-top:10px"><thead><tr><th>Kurum</th><th class="r">Değer</th><th class="r">Çeyrek değişim</th></tr></thead><tbody>${x.rows.slice(0,6).map(r=>`<tr><td style="font-size:13px">${esc(r.h)}<div class="muted" style="font-size:11px">${esc(r.d)}</div></td><td class="r num">${bigN(r.mv)}</td><td class="r num ${r.new?'up':cls(r.chg)}">${r.new?'yeni':r.chg==null?'—':pct(r.chg,1)}</td></tr>`).join('')}</tbody></table></div>`:''}
    <a class="muted" style="font-size:12px" href="${esc(x.url)}" target="_blank" rel="noopener">MarketBeat →</a></section>`}).join('')}</div>
  <p class="muted" style="font-size:12.5px;margin:12px 2px 0">13F bildirimleri çeyrek bitiminden en geç 45 gün sonra yapılır, yani hareketler gecikmelidir. Tablolar son bildirimlerden büyük tutarlı ya da sert değişen pozisyonları gösterir. Kaynak: <a href="https://www.marketbeat.com" target="_blank" rel="noopener">MarketBeat</a> (SEC 13F).</p></div>`;
}

/* ---------- Temettü ---------- */
function qtyAt(t,d){let q=0;S.lots.forEach(l=>{if(l.t===t&&l.date<=d)q+=l.side==='S'?-l.q:+l.q});return Math.max(0,q)}
function addDays(d,n){const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)}
function divPlan(){
  const D=S.divs&&S.divs.data;if(!D)return null;const today=new Date().toISOString().slice(0,10),yAgo=addDays(today,-365),yFwd=addDays(today,365);
  const P=positions();const real=P.total>0;const {w}=weights();const wht=S.settings.divWht!=null&&S.settings.divWht!==''?+S.settings.divWht:20;
  const qNow=t=>real?((P.list.find(m=>m.t===t)||{}).qty||0):(quote(t).price>0?10000*(w[t]||0)/100/quote(t).price:0);
  const up=[],past=[];const per={};
  Object.entries(D).forEach(([t,x])=>{if(!x.pays||!x.hist)return;const rate=t==='ASML'?15:wht;const q=qNow(t);
    const fut=x.hist.filter(h=>h[0]>today);fut.forEach(h=>up.push({t,ex:h[0],pay:h[2],amt:h[1],est:false,q,rate}));
    x.hist.filter(h=>h[0]>yAgo&&h[0]<=today).forEach(h=>{const ex=addDays(h[0],365);if(ex>yFwd)return;if(fut.some(f=>Math.abs(daysBetween(f[0],ex))<25))return;up.push({t,ex,pay:h[2]?addDays(h[2],365):null,amt:h[1],est:true,q,rate});
      const qp=real?qtyAt(t,addDays(h[0],-1)):0;if(qp>0)past.push({t,ex:h[0],pay:h[2],amt:h[1],q:qp,rate})});
    per[t]={freq:x.freq,yield:x.yield,annual:x.annual}});
  const hidden=real?new Set(up.filter(u=>!(u.q>0)).map(u=>u.t)):new Set();if(real){for(let i=up.length-1;i>=0;i--)if(!(up[i].q>0))up.splice(i,1)}
  up.sort((a,b)=>a.ex.localeCompare(b.ex));up.forEach(u=>{u.gross=u.q*u.amt;u.net=u.gross*(1-u.rate/100)});past.forEach(u=>{u.gross=u.q*u.amt;u.net=u.gross*(1-u.rate/100)});
  const sum=(a,k)=>a.reduce((s,x)=>s+x[k],0);const value=real?P.total:10000;
  return {up,past,real,wht,per,gross:sum(up,'gross'),net:sum(up,'net'),pastNet:sum(past,'net'),value,hidden:[...hidden],none:Object.entries(D).filter(([t,x])=>!x.pays).map(([t,x])=>t)};
}
function viewTemettu(){
  const R=divPlan();if(!R)return '<div class="empty"><b>Temettü verisi yok</b></div>';const f=fxNow()||0;
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Temettü takvimi ve gelir tahmini</h2><p>${R.real?'Bugünkü adetlerinle':'Model $10.000 portföyle'} önümüzdeki 12 ay · ilan edilmemiş tarihler geçen yılın aynı dönemine göre tahmindir</p></div>
    <label class="muted" style="font-size:13px">Stopaj (%) <input id="divWht" type="number" min="0" max="40" step="1" value="${esc(R.wht)}" style="width:64px"></label></div>
  <div class="grid g4">
    <div class="card kpi"><div class="l">12 ay brüt</div><div class="v">${usd(R.gross,0)}</div><div class="s">≈ ₺${nf(R.gross*f,0)}</div></div>
    <div class="card kpi"><div class="l">12 ay net (stopaj sonrası)</div><div class="v up">${usd(R.net,0)}</div><div class="s">≈ ₺${nf(R.net*f,0)}</div></div>
    <div class="card kpi"><div class="l">Portföy temettü verimi</div><div class="v">%${nf(R.value>0?R.gross/R.value*100:0,2)}</div><div class="s">brüt, bugünkü değere göre</div></div>
    <div class="card kpi"><div class="l">Son 12 ayda alınan (tahmini)</div><div class="v">${R.real?usd(R.pastNet,0):'—'}</div><div class="s">${R.real?'hak ediş günündeki adetlerle, net':'gerçek pozisyon yok'}</div></div>
  </div>
  <div class="grid g-main sec" style="align-items:start">
    <section class="card"><h3>Takvim</h3>${R.up.length?`<div class="tscroll"><table class="tbl"><thead><tr><th>Hak ediş</th><th>Ödeme</th><th>Enstrüman</th><th class="r">Pay başı</th><th class="r">Adet</th><th class="r">Net sana</th></tr></thead><tbody>
      ${R.up.map(u=>`<tr><td class="num">${esc(trDate(u.ex+'T12:00:00Z',{day:'numeric',month:'short',year:'2-digit'}))}${u.est?' <span class="chip">tahmini</span>':''}</td><td class="num muted">${u.pay?esc(trDate(u.pay+'T12:00:00Z',{day:'numeric',month:'short'})):'—'}</td><td><div class="sym">${logo(u.t)}<b>${esc(u.t)}</b></div></td><td class="r num">$${nf(u.amt,4)}</td><td class="r num">${nf(u.q,R.real?2:1)}</td><td class="r num up">${u.q>0?usd(u.net,2):'—'}</td></tr>`).join('')}
    </tbody></table></div>`:'<p class="muted">Önümüzdeki 12 ayda temettü yok.</p>'}</section>
    <section class="card"><h3>Enstrümanlar</h3><div class="pairs">${Object.entries(R.per).map(([t,p])=>`<div class="pair"><span><b>${esc(t)}</b> <span class="muted">${esc(p.freq||'')}</span></span><span class="num">%${nf(p.yield,2)} · $${nf(p.annual,2)}/yıl</span></div>`).join('')}</div>
      ${R.hidden.length?`<p class="muted" style="font-size:12.5px;margin:12px 0 0">Tutmadığın için takvimde gizlenenler: ${R.hidden.map(esc).join(', ')}.</p>`:''}<p class="muted" style="font-size:12.5px;margin:8px 0 0">Dağıtım yapmayanlar: ${R.none.map(esc).join(', ')}.</p>
      <p class="muted" style="font-size:12.5px;margin:8px 0 0">Stopaj: ABD kaynaklı temettülerde Türkiye-ABD anlaşmasıyla genelde %20 (aracı kurumuna W-8BEN verdiysen), ASML'de Hollanda stopajı %15 alınır. Türkiye'de beyan eşiği ve mahsup için Günlük · plan · vergi sayfasına bak. Kaynak: stockanalysis.com.</p></section>
  </div></div>`;
}
function afterTemettu(){const i=$('#divWht');if(i)i.onchange=async()=>{S.settings.divWht=i.value===''?null:+i.value;try{await saveSettings()}catch(e){}render(false)}}

/* ---------- Aylık rapor ---------- */
const TR_AY=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
function monthList(){const out=[];const d=new Date();for(let i=0;i<12;i++){const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-i,1));out.push(x.toISOString().slice(0,7))}return out}
function pxAt(t,d){const v=lastLE(closeSeries(t),d);if(v==null)return null;return isTRY(t)?v/(fxAt(d)||1):v}
function monthReport(ym){
  const [y,m]=ym.split('-').map(Number);const start=`${ym}-01`,endM=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);const today=new Date().toISOString().slice(0,10);
  const d0=addDays(start,-1),d1=endM<today?endM:today;const partial=endM>=today;
  const real=S.lots.length>0;const ts=Array.from(new Set(real?S.lots.map(l=>l.t):tickers()));const {w}=modelWeights();
  const lotsIn=S.lots.filter(l=>l.date>=start&&l.date<=d1);
  const per=ts.map(t=>{const p0=pxAt(t,d0),p1=pxAt(t,d1);if(!p0||!p1)return null;let v0,v1,F=0,Ftl=0;
    if(real){const q0=qtyAt(t,d0),q1=qtyAt(t,d1);v0=q0*p0;v1=q1*p1;lotsIn.filter(l=>l.t===t).forEach(l=>{const tq=isTRY(t)?(+l.fx||fxAt(l.date)||1):1;const a=(l.side==='S'?-1:1)*(+l.q*(+l.p/tq))+(+l.fee||0)/tq*(l.side==='S'?1:1);F+=a;Ftl+=a*(+l.fx||fxAt(l.date))})}
    else{v0=10000*(w[t]||0)/100;v1=v0*p1/p0}
    return {t,ret:(p1/p0-1)*100,v0,v1,F,Ftl,pnl:v1-v0-F}}).filter(x=>x&&(x.v0>0||x.v1>0||x.F));
  const V0=per.reduce((s,x)=>s+x.v0,0),V1=per.reduce((s,x)=>s+x.v1,0),F=per.reduce((s,x)=>s+x.F,0),Ftl=per.reduce((s,x)=>s+x.Ftl,0);
  const D=Math.max(1,daysBetween(d0,d1));const wF=lotsIn.reduce((s,l)=>{const tq=isTRY(l.t)?(+l.fx||fxAt(l.date)||1):1;return s+(l.side==='S'?-1:1)*(+l.q*(+l.p/tq))*(daysBetween(l.date,d1)/D)},0);
  const f0=fxAt(d0),f1=fxAt(d1);const wFtl=lotsIn.reduce((s,l)=>{const tq=isTRY(l.t)?(+l.fx||fxAt(l.date)||1):1;return s+(l.side==='S'?-1:1)*(+l.q*(+l.p/tq))*(+l.fx||fxAt(l.date))*(daysBetween(l.date,d1)/D)},0);const rUsd=V0+wF>0?(V1-V0-F)/(V0+wF)*100:null;const tl0=V0*f0,tl1=V1*f1;const rTl=tl0+wFtl>0?(tl1-tl0-Ftl)/(tl0+wFtl)*100:null;
  const b=(k)=>{const a=lastLE(S.hist[k]||[],d0),c=lastLE(S.hist[k]||[],d1);return a&&c?(c/a-1)*100:null};
  const g0=goldGramTL(d0),g1=goldGramTL(d1);const cpiM=S.macro&&S.macro.cpi&&S.macro.cpi.monthly&&S.macro.cpi.monthly[ym];
  const dep=((S.settings.depositRate!=null&&S.settings.depositRate!=='')?+S.settings.depositRate:((S.macro&&S.macro.deposit&&S.macro.deposit.annualGross)||40));
  const bench=[['S&P 500 ($)',b('SPY')],['Dolar/TL',b('USDTRY')],['Gram altın (₺)',g0&&g1?(g1/g0-1)*100:null],['TÜFE (aylık)',cpiM!=null?cpiM:null],['Mevduat (brüt, aylık)',(Math.pow(1+dep/100,D/365)-1)*100]];
  const closed=real?tradeLog().closed.filter(x=>x.sd>=start&&x.sd<=d1).sort((a,b)=>b.ret-a.ret):[];
  const divs=[];const DD=S.divs&&S.divs.data;if(DD&&real)Object.entries(DD).forEach(([t,x])=>(x.hist||[]).forEach(h=>{if(h[0]>=start&&h[0]<=d1){const q=qtyAt(t,addDays(h[0],-1));if(q>0)divs.push({t,ex:h[0],amt:h[1],q,g:q*h[1]})}}));
  const news=(S.data.news||[]).filter(n=>(n.publishedAt||'').slice(0,7)===ym&&n.importance>=3).slice(0,6);
  const weeks=((S.weekly&&S.weekly.reports)||[]).filter(r=>(r.weekEnd||'').slice(0,7)===ym);
  const nx=new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);const evs=(S.data.events||[]).filter(e=>(e.date||'').slice(0,7)===nx||(partial&&e.date.slice(0,10)>today&&e.date.slice(0,7)===ym)).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,8);
  return {ym,label:`${TR_AY[m-1]} ${y}`,partial,d0,d1,real,per:per.sort((a,b)=>b.pnl-a.pnl),V0,V1,F,rUsd,rTl,tl0,tl1,Ftl,f0,f1,bench,closed,divs,news,weeks,evs,lotsIn};
}
function viewRapor(){
  const ML=monthList();if(!S.rpM)S.rpM=ML[1];const R=monthReport(S.rpM);const best=R.per[0],worst=R.per[R.per.length-1];
  const row=(l,v,c)=>`<div class="pair"><span>${l}</span><span class="num ${c||''}">${v}</span></div>`;
  return `<div class="fade rapor"><div class="sec-t" style="margin-top:0"><div><h2>Aylık rapor · ${esc(R.label)}${R.partial?' <span class="chip">ay devam ediyor</span>':''}</h2><p>${R.real?'Gerçek işlemlerinle':'Model $10.000 portföy (hedef/eşit ağırlık)'} · ${esc(trDate(R.d0+'T12:00:00Z',{day:'numeric',month:'short'}))} kapanışından ${esc(trDate(R.d1+'T12:00:00Z',{day:'numeric',month:'short'}))} kapanışına</p></div>
    <div class="noprint" style="display:flex;gap:8px;align-items:center"><select id="rpM">${ML.map(k=>{const [y,m]=k.split('-');return `<option value="${k}" ${k===S.rpM?'selected':''}>${TR_AY[+m-1]} ${y}</option>`}).join('')}</select><button class="btn" id="rpPdf">PDF indir</button></div></div>
  <div class="grid g4">
    <div class="card kpi"><div class="l">Dolar bazında getiri</div><div class="v ${cls(R.rUsd)}">${pct(R.rUsd,1)}</div><div class="s">${usd(R.V0,0)} → ${usd(R.V1,0)}</div></div>
    <div class="card kpi"><div class="l">TL bazında getiri</div><div class="v ${cls(R.rTl)}">${pct(R.rTl,1)}</div><div class="s">₺${nf(R.tl0,0)} → ₺${nf(R.tl1,0)}</div></div>
    <div class="card kpi"><div class="l">Ay içi net para girişi</div><div class="v">${R.F?smoney(R.F,0):'—'}</div><div class="s">${R.lotsIn.length} işlem</div></div>
    <div class="card kpi"><div class="l">Kâr/zarar (piyasa)</div><div class="v ${cls(R.V1-R.V0-R.F)}">${smoney(R.V1-R.V0-R.F,0)}</div><div class="s">para girişi hariç</div></div>
  </div>
  <div class="grid g-main sec" style="align-items:start">
    <section class="card"><h3>Pozisyonların ay performansı</h3><div class="tscroll"><table class="tbl"><thead><tr><th>Enstrüman</th><th class="r">Fiyat değişimi</th><th class="r">Ay başı</th><th class="r">Ay sonu</th><th class="r">Kâr/zarar</th></tr></thead><tbody>
      ${R.per.map(x=>`<tr><td><div class="sym">${logo(x.t)}<b>${esc(dispT(x.t))}</b></div></td><td class="r num ${cls(x.ret)}">${pct(x.ret,1)}</td><td class="r num">${usd(x.v0,0)}</td><td class="r num">${usd(x.v1,0)}</td><td class="r num ${cls(x.pnl)}">${smoney(x.pnl,0)}</td></tr>`).join('')}
    </tbody></table></div>${best&&worst&&best!==worst?`<p class="muted" style="font-size:13px;margin:10px 0 0">En çok kazandıran <b>${esc(dispT(best.t))}</b> (${smoney(best.pnl,0)}), ${worst.pnl<0?'en çok kaybettiren':'en zayıf'} <b>${esc(dispT(worst.t))}</b> (${smoney(worst.pnl,0)}).</p>`:''}</section>
    <section class="card"><h3>Karşılaştırma</h3><div class="pairs">${row('<b>Portföy (₺)</b>',pct(R.rTl,1),cls(R.rTl))}${row('<b>Portföy ($)</b>',pct(R.rUsd,1),cls(R.rUsd))}${R.bench.map(([l,v])=>row(esc(l),v==null?'—':pct(v,1),cls(v))).join('')}</div>
      ${R.divs.length?`<h3 style="margin-top:16px">Temettü hak edişleri</h3><div class="pairs">${R.divs.map(d=>row(`<b>${esc(d.t)}</b> <span class="muted">${esc(d.ex)}</span>`,usd(d.g,2)+' brüt')).join('')}</div>`:''}</section>
  </div>
  ${R.real?`<section class="card sec"><h3>Ay içindeki işlemler</h3>${R.lotsIn.length?`<div class="tscroll"><table class="tbl"><thead><tr><th>Tarih</th><th>Enstrüman</th><th>Yön</th><th class="r">Adet</th><th class="r">Fiyat</th></tr></thead><tbody>${R.lotsIn.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(l=>`<tr><td class="num">${esc(l.date)}</td><td><b>${esc(dispT(l.t))}</b></td><td class="${l.side==='S'?'down':'up'}">${l.side==='S'?'Satış':'Alış'}</td><td class="r num">${nf(+l.q,2)}</td><td class="r num">${nf(+l.p,2)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Bu ay işlem yok.</p>'}
    ${R.closed.length?`<h3 style="margin-top:16px">Kapanan işlemler</h3><div class="pairs">${R.closed.map(c=>row(`<b>${esc(dispT(c.t))}</b> <span class="muted">${esc(c.bd)} → ${esc(c.sd)} · ${c.days} gün</span>`,pct(c.ret,1),cls(c.ret))).join('')}</div>`:''}</section>`:''}
  <div class="grid g2 sec" style="align-items:start">
    <section class="card"><h3>Ayın öne çıkanları</h3>${R.weeks.length?`<ul class="rp-ul">${R.weeks.map(w=>`<li><b>${esc(w.range||w.weekEnd)}:</b> ${esc(w.title)}</li>`).join('')}</ul>`:''}${R.news.length?`<ul class="rp-ul">${R.news.map(n=>`<li>${esc(n.title)} <span class="muted">(${esc((n.tickers||[]).join(', '))})</span></li>`).join('')}</ul>`:''}${!R.weeks.length&&!R.news.length?'<p class="muted">Kayıtlı öne çıkan gelişme yok.</p>':''}</section>
    <section class="card"><h3>${R.partial?'Önümüzdeki olaylar':'Gelecek ayın takvimi'}</h3>${R.evs.length?`<div class="pairs">${R.evs.map(e=>row(esc(e.title),esc(trDate(e.date,{day:'numeric',month:'short'})))).join('')}</div>`:'<p class="muted">Takvimde kayıtlı olay yok.</p>'}</section>
  </div>
  <p class="muted" style="font-size:12px;margin:12px 2px 0">Getiri, ay içi para giriş/çıkışlarını tarih ağırlığıyla hesaba katar (Modified Dietz). Kur: Twelve Data. Bu rapor bir değerlendirmedir, yatırım tavsiyesi değildir. · Portföy Defteri, ${esc(new Date().toLocaleDateString('tr-TR'))}</p></div>`;
}
function afterRapor(){const s=$('#rpM');if(s)s.onchange=()=>{S.rpM=s.value;render(false)};const b=$('#rpPdf');if(b)b.onclick=()=>{const t=document.title;document.title='Portfoy-raporu-'+S.rpM;window.print();setTimeout(()=>document.title=t,500)}}
