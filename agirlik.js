/* Portföy Defteri — ağırlık önerici: hedef ağırlıkları neye göre koymalı?
   Yöntemler yalnızca riske bakar (getiri tahmini yok, çünkü getiri tahmini en kırılgan girdidir):
     mevcut   : bugünkü ağırlıklarını hep korumak (ay sonlarında bu oranlara geri dönmek)
     eşit     : her enstrümana eşit pay
     ters oyn.: oynaklığı düşük olana daha çok pay (1/σ)
     eşit risk: her enstrüman portföy riskine eşit katkı yapsın (kovaryansı da hesaba katar)
   Geriye dönük test ay sonlarında, o günkü bilgiyle (son 252 işlem günü) yapılır; ileriye bakma yok. İşlem maliyeti: dönen tutarın %0,1'i.
   Veri: data/long_px.json (Yahoo düzeltilmiş kapanış, 2010'dan). */
"use strict";
const AG_M=[['cur','Mevcut ağırlıklar','#b8f25c'],['eq','Eşit ağırlık','#c6ceda'],['iv','Ters oynaklık','#5cd3ff'],['erc','Eşit risk katkısı','#ffd35c']];
const AG_COST=0.001,AG_WIN=252;
function agSym(t){return t==='NOVO.B'?'NVO':t}
function agData(){
  const L=S.longpx;if(!L||!L.dates||!L.px)return null;
  const ts=tickers().filter(t=>{const a=L.px[agSym(t)];return a&&a.some(v=>v>0)});
  if(ts.length<2)return null;
  return {dates:L.dates,ts,px:ts.map(t=>L.px[agSym(t)]),skipped:tickers().filter(t=>!ts.includes(t))};
}
// i gününe kadar son n günün basit getirileri (yalnızca seçili varlıklar, hepsinin fiyatı olan günler)
function agRets(D,idx,i,n){
  const R=idx.map(()=>[]);
  for(let k=i-n+1;k<=i;k++){if(k<1)continue;const ok=idx.every(j=>D.px[j][k]>0&&D.px[j][k-1]>0);if(!ok)continue;idx.forEach((j,m)=>R[m].push(D.px[j][k]/D.px[j][k-1]-1))}
  return R;
}
function agCov(R){const n=R.length,T=R[0].length;const mu=R.map(r=>r.reduce((a,b)=>a+b,0)/T);const C=[];
  for(let a=0;a<n;a++){C[a]=[];for(let b=0;b<n;b++){let s=0;for(let k=0;k<T;k++)s+=(R[a][k]-mu[a])*(R[b][k]-mu[b]);C[a][b]=s/(T-1)}}return C}
function agERC(C){const n=C.length;let w=C.map((r,i)=>1/Math.sqrt(r[i]));let s=w.reduce((a,b)=>a+b,0);w=w.map(x=>x/s);
  for(let it=0;it<300;it++){const m=C.map(r=>r.reduce((a,c,j)=>a+c*w[j],0));const rc=w.map((x,i)=>x*m[i]);const avg=rc.reduce((a,b)=>a+b,0)/n;
    w=w.map((x,i)=>x*Math.sqrt(avg/Math.max(rc[i],1e-12)));s=w.reduce((a,b)=>a+b,0);w=w.map(x=>x/s)}
  return w}
// risk katkısı (%): w_i (Σw)_i / w'Σw
function agRC(C,w){const m=C.map(r=>r.reduce((a,c,j)=>a+c*w[j],0));const v=w.reduce((a,x,i)=>a+x*m[i],0);return w.map((x,i)=>v>0?x*m[i]/v*100:0)}
function agWeights(kind,C,idx,D,cur){
  const n=idx.length;
  if(kind==='eq')return idx.map(()=>1/n);
  if(kind==='iv'){const w=C.map((r,i)=>1/Math.sqrt(r[i]));const s=w.reduce((a,b)=>a+b,0);return w.map(x=>x/s)}
  if(kind==='erc')return agERC(C);
  const w=idx.map(j=>Math.max(0,+cur[D.ts[j]]||0));const s=w.reduce((a,b)=>a+b,0);return s>0?w.map(x=>x/s):idx.map(()=>1/n);
}
function agBacktest(D,cur){
  const N=D.dates.length;const nA=D.ts.length;
  const monthEnd=[];for(let i=AG_WIN;i<N-1;i++)if(D.dates[i].slice(0,7)!==D.dates[i+1].slice(0,7))monthEnd.push(i);
  const out={};
  for(const [k] of AG_M){
    let hold=new Array(nA).fill(0),val=1,started=null;const curve=[];let turn=0,nReb=0;const wHist=[];
    const rebSet=new Set(monthEnd);
    for(let i=AG_WIN;i<N;i++){
      // önce günün getirisi (dünkü ağırlıklarla)
      if(started!=null){let v=0;for(let j=0;j<nA;j++){if(!hold[j])continue;const a=D.px[j][i-1],b=D.px[j][i];v+=hold[j]*((a>0&&b>0)?b/a:1)}hold=hold.map((h,j)=>{const a=D.px[j][i-1],b=D.px[j][i];return h*((a>0&&b>0)?b/a:1)});val=v;curve.push([D.dates[i],val])}
      if(!rebSet.has(i))continue;
      const idx=[];for(let j=0;j<nA;j++){let c=0;for(let k2=i-AG_WIN+1;k2<=i;k2++)if(D.px[j][k2]>0)c++;if(c>=AG_WIN*0.95&&D.px[j][i]>0)idx.push(j)}
      if(idx.length<3)continue;
      const R=agRets(D,idx,i,AG_WIN);if(R[0].length<150)continue;
      const C=agCov(R);const w=agWeights(k,C,idx,D,cur);
      const tgt=new Array(nA).fill(0);idx.forEach((j,m)=>tgt[j]=w[m]);
      if(started==null){started=i;val=1;hold=tgt.slice();curve.push([D.dates[i],1]);wHist.push([D.dates[i],tgt]);continue}
      const tot=hold.reduce((a,b)=>a+b,0);const now=hold.map(h=>h/tot);const tw=tgt.reduce((a,x,j)=>a+Math.abs(x-now[j]),0);
      const after=tot*(1-AG_COST*tw);hold=tgt.map(x=>x*after);val=after;turn+=tw/2;nReb++;wHist.push([D.dates[i],tgt]);
    }
    out[k]={curve,turn:nReb?turn/nReb*12:0,wHist,start:started!=null?D.dates[started]:null};
  }
  return out;
}
function agStats(curve){
  if(curve.length<260)return null;const v=curve.map(p=>p[1]);const n=v.length;const yrs=n/252;
  const cagr=(Math.pow(v[n-1]/v[0],1/yrs)-1)*100;const r=[];for(let i=1;i<n;i++)r.push(v[i]/v[i-1]-1);
  const m=r.reduce((a,b)=>a+b,0)/r.length;const vol=Math.sqrt(r.reduce((a,b)=>a+(b-m)**2,0)/(r.length-1)*252)*100;
  let pk=v[0],mdd=0,ddFrom=null,ddTo=null,pkD=curve[0][0];for(let i=0;i<n;i++){if(v[i]>pk){pk=v[i];pkD=curve[i][0]}const d=(v[i]/pk-1)*100;if(d<mdd){mdd=d;ddFrom=pkD;ddTo=curve[i][0]}}
  let w12=Infinity;for(let i=252;i<n;i++){const x=(v[i]/v[i-252]-1)*100;if(x<w12)w12=x}
  const yr={};curve.forEach(p=>{const y=p[0].slice(0,4);(yr[y]||(yr[y]=[p[1],p[1]]))[1]=p[1]});
  const years=Object.entries(yr).map(([y,[a,b]])=>[y,(b/a-1)*100]);
  return {cagr,vol,mdd,ddFrom,ddTo,w12,ratio:vol>0?cagr/vol:null,years,end:v[n-1]};
}
function agToday(D,cur){
  const N=D.dates.length,i=N-1;const idx=[];
  for(let j=0;j<D.ts.length;j++){let c=0;for(let k=i-AG_WIN+1;k<=i;k++)if(D.px[j][k]>0)c++;if(c>=126&&D.px[j][i]>0)idx.push(j)}
  if(idx.length<2)return null;const R=agRets(D,idx,i,AG_WIN);const C=agCov(R);
  const W={};for(const [k] of AG_M)W[k]=agWeights(k,C,idx,D,cur);
  const vol=C.map((r,m)=>Math.sqrt(r[m]*252)*100);
  const pv=w=>Math.sqrt(w.reduce((a,x,p)=>a+x*C[p].reduce((s,c,q)=>s+c*w[q],0),0)*252)*100;
  return {idx,C,W,vol,rc:Object.fromEntries(AG_M.map(([k])=>[k,agRC(C,W[k])])),pvol:Object.fromEntries(AG_M.map(([k])=>[k,pv(W[k])])),asOf:D.dates[i]};
}
function agPct(v,d=1){return isNum(v)?`${v<0?'−':''}%${nf(Math.abs(v),d)}`:'—'}
function viewAgirlik(){
  const D=agData();
  if(!D)return `<div class="fade"><div class="empty"><b>Uzun fiyat geçmişi yok</b>Ağırlık önerisi için data/long_px.json gerekiyor (her iş günü güncellenir).</div></div>`;
  const W0=weights();const cur=W0.w||{};
  const key='ag|'+D.dates[D.dates.length-1]+'|'+D.ts.join(',')+'|'+JSON.stringify(cur);
  if(!S.agCache||S.agCache.key!==key){const B=agBacktest(D,cur);S.agCache={key,B,T:agToday(D,cur),st:Object.fromEntries(Object.entries(B).map(([k,b])=>[k,agStats(b.curve)]))}}
  const {B,T,st}=S.agCache;
  const start=(B.cur.start||'').slice(0,7);
  const best=k=>{const vals=AG_M.map(([m])=>st[m]&&st[m][k]).filter(isNum);return vals.length?Math.max(...vals):null};
  const bc=(k,v)=>isNum(v)&&v===best(k)?' style="font-weight:700"':'';
  const yrs=st.cur?st.cur.years.map(y=>y[0]):[];
  const thW=t=>(typeof themeOf==='function'?themeOf(t).name:'');
  const themeRisk=(()=>{if(!T)return [];const m={};T.idx.forEach((j,p)=>{const n=thW(D.ts[j])||'Diğer';m[n]=(m[n]||0)+T.rc.cur[p]});return Object.entries(m).sort((a,b)=>b[1]-a[1])})();
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Ağırlık önerisi</h2><p>Hedef ağırlıkları neye göre koymalı? Dört yöntem ${esc(start)}'den bu yana ay sonlarında, o günkü bilgiyle dengelenmiş gibi karşılaştırılır · ${W0.real?'mevcut = gerçek pozisyonların':'mevcut = '+esc(W0.src)}</p></div></div>
  ${agSummary(st)}
  <section class="card"><div class="tscroll"><table class="tbl"><thead><tr><th>Yöntem</th><th class="r">Yıllık getiri</th><th class="r">Oynaklık</th><th class="r">Getiri / oynaklık</th><th class="r">En sert düşüş</th><th class="r">En kötü 12 ay</th><th class="r">Yıllık devir</th></tr></thead><tbody>
    ${AG_M.map(([k,l,c])=>{const s=st[k];if(!s)return `<tr><td><b>${l}</b></td><td colspan="6" class="muted">yeterli geçmiş yok</td></tr>`;
      return `<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c};margin-right:8px"></span><b>${l}</b></td><td class="r num ${cls(s.cagr)}"${bc('cagr',s.cagr)}>${agPct(s.cagr)}</td><td class="r num">${agPct(s.vol)}</td><td class="r num"${bc('ratio',s.ratio)}>${nf(s.ratio,2)}</td><td class="r num down"${bc('mdd',s.mdd)}>${agPct(s.mdd)}<div class="muted" style="font-size:11px">${esc(trDate(s.ddFrom+'T12:00:00Z',{month:'short',year:'numeric'}))} → ${esc(trDate(s.ddTo+'T12:00:00Z',{month:'short',year:'numeric'}))}</div></td><td class="r num ${cls(s.w12)}"${bc('w12',s.w12)}>${agPct(s.w12)}</td><td class="r num">%${nf(B[k].turn*100,0)}</td></tr>`}).join('')}
  </tbody></table></div><div id="agChart" style="height:280px;margin-top:14px"></div><p class="muted" style="font-size:12px;margin:6px 0 0">100 ile başlayan birikim, logaritmik ölçek (eşit dikey mesafe = eşit yüzde değişim).</p></section>
  <section class="card sec"><h3>Yıl yıl<span class="r muted" style="font-size:12px">kalın: o yılın en iyisi · *yılbaşından bugüne</span></h3><div class="tscroll"><table class="tbl"><thead><tr><th>Yöntem</th>${yrs.map((y,i)=>`<th class="r">${y}${i===yrs.length-1?'*':''}</th>`).join('')}</tr></thead><tbody>
    ${AG_M.map(([k,l])=>{const s=st[k];if(!s)return '';const m=Object.fromEntries(s.years);return `<tr><td><b>${l}</b></td>${yrs.map(y=>{const v=m[y];const bestY=Math.max(...AG_M.map(([q])=>st[q]&&Object.fromEntries(st[q].years)[y]).filter(isNum));return `<td class="r num ${cls(v)}"${isNum(v)&&v===bestY?' style="font-weight:700"':''}>${isNum(v)?agPct(v,0):'—'}</td>`}).join('')}</tr>`}).join('')}
  </tbody></table></div></section>
  ${T?`<section class="card sec"><h3>Bugün önerilen ağırlıklar<span class="r muted" style="font-size:12px">son 1 yılın oynaklık ve korelasyonlarıyla · ${esc(trDate(T.asOf+'T12:00:00Z'))}</span></h3><div class="tscroll"><table class="tbl"><thead><tr><th>Enstrüman</th><th class="r">Yıllık oynaklık</th><th class="r">Mevcut ağırlık</th><th class="r">Riskteki payı</th>${AG_M.slice(1).map(([,l])=>`<th class="r">${l}</th>`).join('')}</tr></thead><tbody>
    ${T.idx.map((j,p)=>{const t=D.ts[j];const w=T.W.cur[p]*100,rc=T.rc.cur[p];return `<tr><td><b>${esc(typeof dispT==='function'?dispT(t):t)}</b> <span class="muted" style="font-size:12px">${esc(thW(t))}</span></td><td class="r num">%${nf(T.vol[p],0)}</td><td class="r num">%${nf(w,1)}</td><td class="r num ${rc>w*1.4&&rc-w>3?'down':''}">%${nf(rc,1)}</td>${AG_M.slice(1).map(([k])=>`<td class="r num">%${nf(T.W[k][p]*100,1)}</td>`).join('')}</tr>`}).join('')}
    <tr><td class="muted">Portföy oynaklığı</td><td></td><td class="r num">%${nf(T.pvol.cur,0)}</td><td></td>${AG_M.slice(1).map(([k])=>`<td class="r num">%${nf(T.pvol[k],0)}</td>`).join('')}</tr>
  </tbody></table></div>
  ${themeRisk.length?`<p style="margin:12px 0 0">Mevcut portföyde riskin dağılımı: ${themeRisk.map(([n,v])=>`<b>${esc(n)}</b> %${nf(v,0)}`).join(' · ')}</p>`:''}
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">${AG_M.slice(1).map(([k,l])=>`<button class="btn" data-agset="${k}">${l} ağırlıklarını hedef yap</button>`).join('')}</div>
  <p class="muted" style="font-size:12px;margin:8px 0 0">Hedefler Ayarlar'daki hedef ağırlıkların yerine geçer; Dengeleme sayfası alım/satım tutarlarını buna göre hesaplar. Kırmızı: riskteki payı ağırlığından belirgin büyük.</p></section>`:''}
  <section class="card sec"><h3>Nasıl okunur?</h3><div class="note" style="line-height:1.65">
    <p><b>Hiçbir yöntem getiri tahmin etmiyor</b>; yalnızca riski dağıtıyor. Getiri tahminine dayanan "en iyi portföy" hesapları geçmişe aşırı uyar ve gelecekte genelde çöker.</p>
    <p><b>Eşit risk katkısı</b> her enstrümanın portföy dalgalanmasına eşit katkı yapmasını sağlar: oynak olana az, sakin olana çok pay verir ve birlikte hareket edenleri (SMH ile SOXX gibi) tek bahis sayar. Genelde getiriden biraz feragat edip düşüşleri belirgin azaltır. <b>Ters oynaklık</b> aynısının korelasyonu yok sayan basit hali.</p>
    <p><b>Önemli uyarı:</b> enstrümanlar bugünkü portföyden seçildi, yani geçmişte iyi gidenler. Bu, bütün yöntemlerin geçmiş getirisini şişirir; anlamlı olan mutlak getiri değil, yöntemler arasındaki <b>fark</b>, özellikle düşüş ve en kötü 12 ay sütunları. "Mevcut ağırlıklar" bugünün ağırlıklarını geçmişe taşıdığı için ayrıca iyimserdir. ${D.skipped.length?`Uzun geçmişi olmayan enstrümanlar dahil edilmedi: ${D.skipped.map(esc).join(', ')}.`:''} Geçmişi bir yıldan kısa olan enstrüman o tarihte dengelemeye girmez. Dolar bazında; kur, sıralamayı değiştirmez.</p>
  </div></section></div>`;
}
// veriden otomatik özet: yöntemler risk başına getiriyi gerçekten değiştiriyor mu, yoksa sadece risk seviyesini mi?
function agSummary(st){
  const c=st.cur,e=st.erc;if(!c||!e)return '';
  const rs=AG_M.map(([k,l])=>[l,st[k]&&st[k].ratio]).filter(x=>isNum(x[1]));const lo=Math.min(...rs.map(x=>x[1])),hi=Math.max(...rs.map(x=>x[1]));
  const ddGain=e.mdd-c.mdd,retCost=c.cagr-e.cagr;
  const close=hi-lo<0.15;
  return `<div class="note" style="margin:0 0 14px;line-height:1.6">${close
    ?`<b>Özet:</b> Dört yöntemin risk başına getirisi birbirine çok yakın (${nf(lo,2)}–${nf(hi,2)}). Yani yöntem seçimi tek başına daha çok kazandırmıyor; asıl belirlediği şey <b>ne kadar risk aldığın</b>.`
    :`<b>Özet:</b> Risk başına getiri yöntemden yönteme belirgin değişiyor (${nf(lo,2)}–${nf(hi,2)}); en yüksek: <b>${esc(rs.find(x=>x[1]===hi)[0])}</b>.`}
    ${isNum(ddGain)&&isNum(retCost)?` Eşit risk katkısı, mevcut ağırlıklara göre en sert düşüşü <b>${nf(Math.abs(ddGain),1)} puan ${ddGain>0?'azaltıyor':'artırıyor'}</b>, buna karşılık yıllık getiri <b>${nf(Math.abs(retCost),1)} puan ${retCost>0?'daha düşük':'daha yüksek'}</b>.`:''}
    Hangisinin doğru olduğu, sert bir düşüşte (−%${nf(Math.abs(Math.min(c.mdd,e.mdd)),0)}) satmadan durabilme kapasitene bağlı: dayanamayacağın bir düşüş, kâğıt üzerindeki yüksek getiriyi gerçek zarara çevirir.</div>`;
}
function afterAgirlik(){
  const C=S.agCache;const el=$('#agChart');
  if(C&&el&&typeof lineChart==='function'){const ser=AG_M.filter(([k])=>C.B[k].curve.length).map(([k,l,c])=>({name:l,color:c,pts:C.B[k].curve.filter((p,i)=>i%3===0||i===C.B[k].curve.length-1).map(p=>[p[0],Math.log10(p[1]*100)])}));
    // logaritmik ölçek: 15 yıllık birikimde ilk yıllar da okunabilsin; eksen etiketleri gerçek değeri gösterir (100 ile başlar)
    try{lineChart(el,ser,{fmt:(v,ax)=>nf(Math.pow(10,v),0),xfmt:d=>d.slice(0,4)})}catch(e){console.error(e)}}
  $$('[data-agset]').forEach(b=>b.onclick=async()=>{const k=b.dataset.agset;const T=C&&C.T;if(!T)return;const D=agData();
    const tg={};T.idx.forEach((j,p)=>{tg[D.ts[j]]=Math.round(T.W[k][p]*1000)/10});
    const lbl=(AG_M.find(m=>m[0]===k)||[])[1];
    if(!confirm(`${lbl} ağırlıkları hedef olarak kaydedilsin mi?\n\n${Object.entries(tg).map(([t,v])=>`${t}: %${nf(v,1)}`).join('\n')}\n\nMevcut hedeflerin yerine geçer.`))return;
    S.settings.targets=tg;await saveSettings();toast('Hedefler kaydedildi · Dengeleme sayfasına bak');});
}
