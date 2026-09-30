/* Portföy Defteri — faktör ayrıştırma:
   1) Kaç bağımsız bahis? (temel bileşen analizi + Meucci etkin bahis sayısı)
   2) Kendine özgü hareket: her getiriyi piyasa + sektör + kendine özgü (artık) parçalarına ayırır; artığın sapmasını ve geçmişte sonrasında ne olduğunu gösterir. */
"use strict";
function qMean(a){return a.reduce((s,x)=>s+x,0)/(a.length||1)}
function qSd(a){const m=qMean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/Math.max(1,a.length-1))}
/* simetrik matris için Jacobi özdeğer ayrışımı → {vals, vecs(sütunlar)} büyükten küçüğe */
function qEig(A){const n=A.length;const a=A.map(r=>r.slice());const V=a.map((_,i)=>a.map((_,j)=>i===j?1:0));
  for(let sweep=0;sweep<80;sweep++){let off=0;for(let p=0;p<n;p++)for(let q=p+1;q<n;q++)off+=a[p][q]**2;if(off<1e-14)break;
    for(let p=0;p<n;p++)for(let q=p+1;q<n;q++){if(Math.abs(a[p][q])<1e-15)continue;const th=(a[q][q]-a[p][p])/(2*a[p][q]);const t=Math.sign(th||1)/(Math.abs(th)+Math.sqrt(th*th+1));const c=1/Math.sqrt(t*t+1),s=t*c;
      for(let k=0;k<n;k++){const akp=a[k][p],akq=a[k][q];a[k][p]=c*akp-s*akq;a[k][q]=s*akp+c*akq}
      for(let k=0;k<n;k++){const apk=a[p][k],aqk=a[q][k];a[p][k]=c*apk-s*aqk;a[q][k]=s*apk+c*aqk}
      for(let k=0;k<n;k++){const vkp=V[k][p],vkq=V[k][q];V[k][p]=c*vkp-s*vkq;V[k][q]=s*vkp+c*vkq}}}
  const idx=a.map((r,i)=>i).sort((x,y)=>a[y][y]-a[x][x]);return {vals:idx.map(i=>a[i][i]),vecs:idx.map(i=>V.map(r=>r[i]))}}

function qRets(t,D,from,to){const a=D.px[t];const r=[];for(let i=from;i<=to;i++)r.push(a&&a[i]&&a[i-1]?a[i]/a[i-1]-1:null);return r}

/* ================= 1) kaç bağımsız bahis ================= */
function pcaData(){const D=vData();if(!D)return null;const W=weights();const w0=W.w||{};
  const T=Object.keys(w0).filter(t=>(w0[t]||0)>0&&D.px[t]);if(T.length<3)return null;
  const n=D.dates.length;const from=n-252,to=n-1;const R=T.map(t=>qRets(t,D,from,to));const ok=R[0].map((_,j)=>R.every(r=>r[j]!=null));
  const X=R.map(r=>r.filter((_,j)=>ok[j]));const L=X[0].length;if(L<120)return null;
  const mu=X.map(qMean),sd=X.map(qSd);const cov=T.map((_,i)=>T.map((_,j)=>{let s=0;for(let k=0;k<L;k++)s+=(X[i][k]-mu[i])*(X[j][k]-mu[j]);return s/(L-1)}));
  const cor=cov.map((r,i)=>r.map((v,j)=>v/(sd[i]*sd[j])));const Ec=qEig(cor);const tr=Ec.vals.reduce((s,x)=>s+x,0);
  const wsum=T.reduce((s,t)=>s+w0[t],0);const w=T.map(t=>w0[t]/wsum);const Es=qEig(cov);
  const f=Es.vecs.map(v=>v.reduce((s,x,i)=>s+x*w[i],0));const pv=f.map((x,k)=>x*x*Es.vals[k]);const tot=pv.reduce((s,x)=>s+x,0);const p=pv.map(x=>x/tot);
  const enb=Math.exp(-p.filter(x=>x>1e-12).reduce((s,x)=>s+x*Math.log(x),0));
  const enbEq=(()=>{const we=T.map(()=>1/T.length);const fe=Es.vecs.map(v=>v.reduce((s,x,i)=>s+x*we[i],0));const pe=fe.map((x,k)=>x*x*Es.vals[k]);const te=pe.reduce((s,x)=>s+x,0);return Math.exp(-pe.map(x=>x/te).filter(x=>x>1e-12).reduce((s,x)=>s+x*Math.log(x),0))})();
  const pcs=Ec.vecs.slice(0,3).map((v,k)=>{const s=v.reduce((a,x)=>a+x,0)<0?-1:1;const ld=T.map((t,i)=>({t,l:v[i]*s})).sort((a,b)=>Math.abs(b.l)-Math.abs(a.l));return {k,ev:Ec.vals[k]/tr*100,ld}});
  return {T,w,ev:Ec.vals.map(x=>x/tr*100),pcs,enb,enbEq,p1:p[0]*100,days:L,src:W.src}}
function pcaCard(){const P=pcaData();if(!P)return '<section class="card"><p class="muted">Bağımsız bahis analizi için en az 3 pozisyon ve 6 aylık fiyat geçmişi gerekli.</p></section>';
  const bars=P.ev.slice(0,Math.min(8,P.ev.length));let cum=0;const mx=bars[0];
  const nm=pc=>{const pos=pc.ld.filter(x=>x.l>0.2).slice(0,4).map(x=>dispT(x.t)),neg=pc.ld.filter(x=>x.l<-0.2).slice(0,3).map(x=>dispT(x.t));return pc.k===0?'ortak hareket (hepsi birlikte)':(pos.length?pos.join(', '):'—')+(neg.length?' ↔ '+neg.join(', '):'')};
  return `<section class="card sec"><h3>Kaç bağımsız bahsin var? <span class="r muted" style="font-size:12px">son ${P.days} işlem günü · ${esc(P.src||'')}</span></h3>
  <div class="qbig"><div><b class="num">${P.T.length}</b><span>enstrüman</span></div><div class="qarr">≈</div><div><b class="num ${P.enb<2.5?'down':P.enb<4?'warnc':'up'}">${nf(P.enb,1)}</b><span>bağımsız bahis</span></div>
   <p>${P.enb<2.5?'Portföy pratikte birkaç ortak güce bağlı; enstrüman sayısı çeşitlendirme sanılmasın.':P.enb<4?'Çeşitlilik orta düzeyde; risk birkaç ana kaynağa toplanmış.':'Risk birkaç farklı kaynağa dağılmış.'} Portföy riskinin <b>%${nf(P.p1,0)}</b>'i tek bir ana bileşenden geliyor. Aynı enstrümanlar eşit ağırlıkla tutulsaydı ${nf(P.enbEq,1)} bağımsız bahis olurdu.</p></div>
  <h4 style="margin:12px 0 6px">Getirilerin ne kadarını kaç güç açıklıyor</h4>
  <div class="qev">${bars.map((v,i)=>{cum+=v;return `<div><i style="height:${v/mx*100}%"></i><b class="num">%${nf(v,0)}</b><span>${i+1}.</span><em class="muted num">Σ%${nf(cum,0)}</em></div>`}).join('')}</div>
  <table class="tbl wrap" style="margin-top:10px"><tbody>${P.pcs.map(pc=>`<tr><td><b>${pc.k+1}. güç</b> <span class="muted">(%${nf(pc.ev,0)})</span></td><td>${esc(nm(pc))}</td></tr>`).join('')}</tbody></table>
  <p class="muted" style="font-size:12px;margin:8px 0 0">Temel bileşen analizi korelasyon matrisinden; "bağımsız bahis" Meucci'nin etkin bahis sayısı (portföy riskinin bileşenlere ne kadar eşit dağıldığı; 1 = tek bahis). Ağırlıklar ${esc(P.src||'')}.</p></section>`}

/* ================= 2) kendine özgü hareket ================= */
function qOLS(y,X){const k=X.length,n=y.length;const A=X.map(a=>X.map(b=>a.reduce((s,v,i)=>s+v*b[i],0)));const b=X.map(a=>a.reduce((s,v,i)=>s+v*y[i],0));const beta=solveLin(A,b);
  const fit=y.map((_,i)=>X.reduce((s,a,j)=>s+a[i]*beta[j],0));const e=y.map((v,i)=>v-fit[i]);const my=qMean(y);const ssT=y.reduce((s,v)=>s+(v-my)**2,0);return {beta,e,r2:ssT?1-e.reduce((s,v)=>s+v*v,0)/ssT:0}}
function residData(){const D=vData();if(!D)return null;const key=D.dates[D.dates.length-1]+'|'+Object.keys(S.live||{}).length;if(S._res&&S._res.k===key&&Date.now()-S._res.at<60000)return S._res.v;
  const n=D.dates.length;const W0=Math.max(2,n-600),Wf=n-6;const spy=qRets('SPY',D,1,n-1);const smh=qRets('SMH',D,1,n-1);
  const tick=allTickers().map(t=>t==='NOVO.B'?'NVO':t).filter((t,i,a)=>a.indexOf(t)===i&&t!=='SPY'&&D.px[t]);
  const ix=[];for(let j=W0-1;j<Wf;j++)if(spy[j]!=null&&smh[j]!=null)ix.push(j);
  const sm=qOLS(ix.map(j=>smh[j]),[ix.map(()=>1),ix.map(j=>spy[j])]);const smE=j=>smh[j]-(sm.beta[0]+sm.beta[1]*spy[j]);
  const liveR=t=>{const l=S.live&&S.live[t],ls=S.live&&S.live.SPY,lm=S.live&&S.live.SMH;return l&&ls&&l.day===ls.day&&isNum(l.pct)&&isNum(ls.pct)?{r:l.pct/100,m:ls.pct/100,s:lm&&lm.day===l.day&&isNum(lm.pct)?lm.pct/100:null,day:l.day}:null};
  const out=[];const events=[];
  tick.forEach(t=>{const r=qRets(t,D,1,n-1);const I=ix.filter(j=>r[j]!=null);if(I.length<150)return;const isStock=(inst(t)||{}).type==='Hisse'||(inst(t==='NVO'?'NOVO.B':t)||{}).type==='Hisse';
    const c=(()=>{const a=I.map(j=>r[j]),b=I.map(j=>smh[j]);const ma=qMean(a),mb=qMean(b);let s=0,va=0,vb=0;a.forEach((v,i)=>{s+=(v-ma)*(b[i]-mb);va+=(v-ma)**2;vb+=(b[i]-mb)**2});return s/Math.sqrt(va*vb)})();
    const useS=isStock&&t!=='SMH'&&t!=='SOXX'&&c>0.5;const X=[I.map(()=>1),I.map(j=>spy[j])].concat(useS?[I.map(j=>smE(j))]:[]);const M=qOLS(I.map(j=>r[j]),X);
    const [a0,bm,bs]=[M.beta[0],M.beta[1],useS?M.beta[2]:0];const sd=qSd(M.e);
    const resAt=j=>r[j]==null||spy[j]==null?null:r[j]-(a0+bm*spy[j]+(useS&&smh[j]!=null?bs*smE(j):0));
    const E=[];for(let j=W0-1;j<n-1;j++)E.push([j,resAt(j)]);
    const cum=(k)=>{const x=E.slice(-k).map(e=>e[1]).filter(isNum);return x.length===k?x.reduce((s,v)=>s+v,0):null};
    let today={r:r[n-2],m:bm*spy[n-2],s:useS&&smh[n-2]!=null?bs*smE(n-2):0,live:false,day:D.dates[n-1]};const L=liveR(t==='NVO'&&!S.live.NVO?'NOVO.B':t);
    if(L&&L.day>D.dates[n-1]){const se=L.s!=null?L.s-(sm.beta[0]+sm.beta[1]*L.m):0;today={r:L.r,m:bm*L.m,s:useS?bs*se:0,live:true,day:L.day}}
    today.e=today.r-a0-today.m-today.s;
    const c5=cum(5),c20=cum(20);
    // geçmiş: 5 günlük kümülatif artık |z|>2 sonrası 5 günlük artık (çakışmasız olaylar)
    const vals=E.map(e=>e[1]);for(let k=5;k<vals.length-5;k++){const w5=vals.slice(k-5,k);const nx=vals.slice(k,k+5);if(w5.some(v=>v==null)||nx.some(v=>v==null))continue;const z=w5.reduce((s,v)=>s+v,0)/(sd*Math.sqrt(5));
      if(Math.abs(z)>=2){events.push({t,z,next:nx.reduce((s,v)=>s+v,0)*Math.sign(z)*-1});k+=5}}
    out.push({t:t==='NVO'&&inst('NOVO.B')?'NOVO.B':t,bm,bs,useS,r2:M.r2*100,sd,today,z1:today.e/sd,z5:c5!=null?c5/(sd*Math.sqrt(5)):null,z20:c20!=null?c20/(sd*Math.sqrt(20)):null,c5,c20})});
  const ev={n:events.length,rev:events.length?qMean(events.map(e=>e.next))*100:null,hit:events.length?events.filter(e=>e.next>0).length/events.length*100:null};
  const v={rows:out.sort((a,b)=>Math.abs(b.z5||0)-Math.abs(a.z5||0)),ev,from:D.dates[W0],to:D.dates[Wf],smB:sm.beta[1]};S._res={k:key,at:Date.now(),v};return v}
function zc(z){return !isNum(z)?'':Math.abs(z)>=2?(z>0?'up':'down'):''}
function residCard(){const R=residData();if(!R||!R.rows.length)return '';const e=R.ev;
  return `<section class="card sec"><h3>Kendine özgü hareket <span class="r muted" style="font-size:12px">piyasa (SPY) ve yarı iletken sektörü (SMH) etkisi çıkarıldıktan sonra kalan</span></h3>
  <div class="tscroll"><table class="tbl"><thead><tr><th>Enstrüman</th><th class="r">Piyasa β</th><th class="r">Sektör β</th><th class="r">Ortak pay</th><th class="r">Son gün</th><th class="r">= piyasa</th><th class="r">+ sektör</th><th class="r">+ kendine özgü</th><th class="r">5 gün z</th><th class="r">20 gün z</th></tr></thead><tbody>
  ${R.rows.map(x=>`<tr><td><b>${esc(dispT(x.t))}</b>${x.today.live?' <span class="chip up" style="font-size:10px">canlı</span>':''}</td><td class="r num">${nf(x.bm,2)}</td><td class="r num">${x.useS?nf(x.bs,2):'—'}</td><td class="r num">%${nf(x.r2,0)}</td>
    <td class="r num ${cls(x.today.r)}">${pct(x.today.r*100,2)}</td><td class="r num muted">${pct(x.today.m*100,2)}</td><td class="r num muted">${x.useS?pct(x.today.s*100,2):'—'}</td><td class="r num ${zc(x.z1)}"><b>${pct(x.today.e*100,2)}</b></td>
    <td class="r num ${zc(x.z5)}">${isNum(x.z5)?(x.z5>0?'+':'')+nf(x.z5,1):'—'}</td><td class="r num ${zc(x.z20)}">${isNum(x.z20)?(x.z20>0?'+':'')+nf(x.z20,1):'—'}</td></tr>`).join('')}</tbody></table></div>
  ${e.n?`<p style="margin:10px 0 0">Geçmiş kontrolü: son ~2 yılda bir enstrümanın 5 günlük kendine özgü hareketi ±2 standart sapmayı aştığı <b>${e.n}</b> durumda, sonraki 5 günde ortalama <b class="${cls(e.rev)}">${pct(e.rev,2)}</b> ${e.rev>0?'<b>ters yönde düzeltme</b>':'<b>aynı yönde devam</b>'} oldu (olayların %${nf(e.hit,0)}'inde ters yöne döndü). ${Math.abs(e.rev)<0.3||e.n<25?'Etki küçük ya da örnek az: tek başına işlem sinyali sayılmaz.':'Bu bir ipucu; maliyet ve örneklem dışı test olmadan sinyal sayılmaz.'}</p>`:''}
  <p class="muted" style="font-size:12px;margin:6px 0 0">Ortak pay (R²): günlük hareketin ne kadarının piyasa + sektörle açıklandığı. z: kendine özgü hareketin kendi normal oynaklığına göre büyüklüğü; ±2 üstü olağandışı (renkli). Betalar son ~2 yıldan, son 5 gün hariç tahmin edilir. ABD seansında canlı akış açıksa son gün sütunu anlık fiyatla hesaplanır.</p></section>`}
function residLine(t){const R=residData();if(!R)return '';const x=R.rows.find(r=>r.t===t);if(!x)return '';
  return `<section class="card sec"><h3>Bu hareketin kaynağı <span class="r muted" style="font-size:12px">${x.today.live?'canlı':esc(x.today.day)}</span></h3>
  <div class="qdec">${[['Toplam',x.today.r],['Piyasa',x.today.m],['Sektör',x.useS?x.today.s:null],['Kendine özgü',x.today.e]].filter(y=>y[1]!=null).map(y=>`<div><span>${y[0]}</span><b class="num ${cls(y[1])}">${pct(y[1]*100,2)}</b></div>`).join('')}</div>
  <p class="muted" style="font-size:12.5px;margin:6px 0 0">Piyasa betası ${nf(x.bm,2)}${x.useS?`, sektör betası ${nf(x.bs,2)}`:''}; hareketlerin %${nf(x.r2,0)}'i ortak güçlerden. Son 5 günün kendine özgü hareketi ${isNum(x.z5)?`<b class="${zc(x.z5)}">${x.z5>0?'+':''}${nf(x.z5,1)} standart sapma</b>${Math.abs(x.z5)>=2?' (olağandışı)':''}`:'—'}.</p></section>`}
function viewFaktor(){return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Faktör ayrıştırma</h2><p>Piyasa birkaç ortak güçten oluşur. Önce portföyünün kaç gerçek bahisten oluştuğunu, sonra her hareketin ne kadarının hisseye özgü olduğunu gösterir.</p></div></div>${pcaCard()}${residCard()}</div>`}
