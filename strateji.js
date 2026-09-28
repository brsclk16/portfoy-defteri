/* Portföy Defteri — seviyeler ve strateji: destek/direnç, Fibonacci, VWAP, hacim profili, ADX, göreli güç,
   mevsimsellik, işlem planı (alım bölgesi / stop / kar al) ve 12-30-60 gün beklenti (Monte Carlo) */
"use strict";

/* ---------- seviyeler ---------- */
function pivots(a,k=5,from=0){const hi=[],lo=[];for(let i=Math.max(k,from);i<a.length-k;i++){let isH=true,isL=true;for(let j=i-k;j<=i+k;j++){if(j===i)continue;if(a[j].h>a[i].h)isH=false;if(a[j].l<a[i].l)isL=false}if(isH)hi.push({i,p:a[i].h,d:a[i].d});if(isL)lo.push({i,p:a[i].l,d:a[i].d})}return {hi,lo}}
function srLevels(a,px,atr){
  const from=Math.max(0,a.length-250);const {hi,lo}=pivots(a,5,from);const pts=hi.map(x=>({...x,k:'h'})).concat(lo.map(x=>({...x,k:'l'}))).sort((x,y)=>x.p-y.p);
  const tol=Math.max(px*0.012,(atr||0)*0.6);const cl=[];
  for(const p of pts){const c=cl[cl.length-1];if(c&&p.p-c.max<=tol){c.pts.push(p);c.max=p.p}else cl.push({pts:[p],max:p.p})}
  return cl.map(c=>{const ps=c.pts.map(x=>x.p);const p=ps.reduce((s,v)=>s+v,0)/ps.length;const last=c.pts.reduce((m,x)=>x.i>m?x.i:m,0);
    return {p,touches:c.pts.length,last:a[last].d,recent:a.length-1-last,type:p<px?'destek':'direnç'}}).filter(l=>l.touches>=2||l.recent<60).sort((x,y)=>x.p-y.p);
}
function fibLevels(a,look=126){
  const s=a.slice(-look);let hi=0,lo=0;s.forEach((x,i)=>{if(x.h>s[hi].h)hi=i;if(x.l<s[lo].l)lo=i});const H=s[hi].h,L=s[lo].l,R=H-L;if(!(R>0))return null;
  const up=lo<hi;const rs=[0.236,0.382,0.5,0.618,0.786];
  const retr=rs.map(r=>({r,p:up?H-R*r:L+R*r,label:`Fib %${nf(r*100,1)}`}));
  const ext=[1.272,1.618].map(r=>({r,p:up?L+R*r:H-R*r,label:`Fib ${nf(r,3)} uzantı`}));
  return {up,H,L,hiD:s[hi].d,loD:s[lo].d,retr,ext};
}
function vwapN(a,n){const s=a.slice(-n);let pv=0,v=0;s.forEach(x=>{const tp=(x.h+x.l+x.c)/3;pv+=tp*(x.v||0);v+=x.v||0});return v?pv/v:null}
function vwapSeries(a,n){return a.map((_,i)=>{if(i<n-1)return null;let pv=0,v=0;for(let j=i-n+1;j<=i;j++){const x=a[j];pv+=(x.h+x.l+x.c)/3*(x.v||0);v+=x.v||0}return v?pv/v:null})}
function volProfile(a,n=126,bins=24){
  const s=a.slice(-n);const lo=Math.min(...s.map(x=>x.l)),hi=Math.max(...s.map(x=>x.h));const step=(hi-lo)/bins||1;const B=Array(bins).fill(0);
  s.forEach(x=>{const b0=Math.max(0,Math.floor((x.l-lo)/step)),b1=Math.min(bins-1,Math.floor((x.h-lo)/step));const share=(x.v||0)/(b1-b0+1);for(let b=b0;b<=b1;b++)B[b]+=share});
  const tot=B.reduce((p,q)=>p+q,0);if(!tot)return null;let poc=0;B.forEach((v,i)=>{if(v>B[poc])poc=i});
  let inc=B[poc],l=poc,h=poc;while(inc<tot*0.7&&(l>0||h<bins-1)){const nl=l>0?B[l-1]:-1,nh=h<bins-1?B[h+1]:-1;if(nh>=nl){h++;inc+=B[h]}else{l--;inc+=B[l]}}
  return {lo,hi,step,bins:B,poc:lo+(poc+0.5)*step,vaL:lo+l*step,vaH:lo+(h+1)*step,max:B[poc]};
}
function adxS(a,n=14){
  const len=a.length,pdm=[0],mdm=[0],tr=[a[0].h-a[0].l];
  for(let i=1;i<len;i++){const up=a[i].h-a[i-1].h,dn=a[i-1].l-a[i].l;pdm.push(up>dn&&up>0?up:0);mdm.push(dn>up&&dn>0?dn:0);tr.push(Math.max(a[i].h-a[i].l,Math.abs(a[i].h-a[i-1].c),Math.abs(a[i].l-a[i-1].c)))}
  const sm=v=>{const o=Array(len).fill(null);let s=0;for(let i=1;i<len;i++){if(i<=n){s+=v[i];if(i===n)o[i]=s}else{s=s-s/n+v[i];o[i]=s}}return o};
  const T=sm(tr),P=sm(pdm),M=sm(mdm);const pdi=[],mdi=[],dx=[];for(let i=0;i<len;i++){if(T[i]){pdi[i]=100*P[i]/T[i];mdi[i]=100*M[i]/T[i];dx[i]=100*Math.abs(pdi[i]-mdi[i])/((pdi[i]+mdi[i])||1)}else{pdi[i]=mdi[i]=dx[i]=null}}
  const adx=Array(len).fill(null);let s=null,c=0;for(let i=0;i<len;i++){if(dx[i]==null)continue;c++;if(c<n)continue;if(s==null){let t=0;for(let j=i-n+1;j<=i;j++)t+=dx[j];s=t/n}else s=(s*(n-1)+dx[i])/n;adx[i]=s}
  return {adx,pdi,mdi};
}
function peerOf(t){const i=inst(t)||{};if((i.holdings||[]).length||!/hisse/i.test(i.type||''))return 'SPY';return ['AMD','CRDO','NVDA','MU','AVGO','TSM','INTC'].includes(t)?'SMH':'SPY'}
function relStrength(t){
  const s=series(t),sp=S.hist.SPY||[],peer=peerOf(t),pp=peer==='SPY'?sp:series(peer);if(s.length<60||!sp.length)return null;
  const ret=(arr,n)=>{if(arr.length<n+1)return null;return (arr[arr.length-1][1]/arr[arr.length-1-n][1]-1)*100};
  const out={peer,rows:[['1A',21],['3A',63],['6A',126],['1Y',Math.min(250,s.length-1)]].map(([k,n])=>{const a=ret(s,n),b=ret(sp,n),c=peer==='SPY'?null:ret(pp,n);return {k,own:a,spy:b,peer:c,exS:a!=null&&b!=null?a-b:null,exP:a!=null&&c!=null?a-c:null}})};
  const m=new Map(sp);const base=s.find(p=>m.has(p[0]));if(base){const b0=base[1]/m.get(base[0]);out.line=s.filter(p=>m.has(p[0])).map(p=>[p[0],(p[1]/m.get(p[0]))/b0*100])}
  return out;
}
function seasonality(t){
  const M=S.monthly&&S.monthly.series&&S.monthly.series[t];if(!M||M.length<25)return null;const by=Array.from({length:12},()=>[]);
  for(let i=1;i<M.length;i++){const r=(M[i][1]/M[i-1][1]-1)*100;const mo=+M[i][0].slice(5,7)-1;by[mo].push({y:M[i][0].slice(0,4),r})}
  const cur=new Date().getMonth();
  return {years:new Set(M.map(x=>x[0].slice(0,4))).size,months:by.map((a,i)=>{const v=a.map(x=>x.r).sort((p,q)=>p-q);return {m:i,n:v.length,avg:v.length?v.reduce((p,q)=>p+q,0)/v.length:null,med:v.length?v[Math.floor(v.length/2)]:null,pos:v.length?v.filter(x=>x>0).length/v.length*100:null,best:v[v.length-1],worst:v[0]}}),cur};
}

/* ---------- işlem planı ---------- */
function tradePlan(t){
  const a=candles(t);if(a.length<120)return null;const cl=a.map(x=>x.c);const i=a.length-1,px=cl[i];
  const atr=atrS(a)[i]||px*0.02;const I=ichimoku(a);const s20=smaS(cl,20)[i],s50=smaS(cl,50)[i],s200=smaS(cl,200)[i];const B=bollinger(cl);
  const fib=fibLevels(a);const sr=srLevels(a,px,atr);const vp=volProfile(a);const vw50=vwapN(a,50);const q=quote(t);
  const cTop=Math.max(I.A[i]??-Infinity,I.B[i]??-Infinity),cBot=Math.min(I.A[i]??Infinity,I.B[i]??Infinity);
  const C=[];const add=(p,name,w)=>{if(isNum(p)&&p>0)C.push({p,name,w})};
  add(I.K[i],'Kijun',2);if(px>cTop){add(cTop,'Bulut üstü',2);add(cBot,'Bulut altı',1)}else add(cBot,'Bulut altı',1);add(I.T[i],'Tenkan',1);
  add(s20,'20G ort.',1);add(s50,'50G ort.',2);add(s200,'200G ort.',2);add(B.mid[i],'Bollinger orta',1);add(vw50,'VWAP (50G)',1);
  if(vp){add(vp.poc,'Hacim yoğunluğu (POC)',2);add(vp.vaL,'Değer alanı altı',1)}
  if(fib&&fib.up)fib.retr.forEach(f=>add(f.p,f.label,f.r===0.618?3:f.r===0.382||f.r===0.5?2:1));
  sr.forEach(l=>add(l.p,`Destek/direnç (${l.touches} temas)`,Math.min(3,1+l.touches/2)));
  const below=C.filter(c=>c.p<px*1.005&&c.p>px*0.78).sort((x,y)=>y.p-x.p);
  const tol=Math.max(px*0.012,atr*0.5);const clusters=[];
  for(const c of below){const g=clusters[clusters.length-1];if(g&&g.min-c.p<=tol){g.items.push(c);g.min=c.p}else clusters.push({items:[c],max:c.p,min:c.p})}
  clusters.forEach(g=>{g.score=g.items.reduce((s,c)=>s+c.w,0);g.dist=(px-g.max)/px*100;g.rank=g.score/(1+Math.max(0,g.dist)/6)});
  const good=clusters.filter(g=>g.score>=3);const zoneG=(good.length?good:clusters).sort((x,y)=>y.rank-x.rank)[0];
  if(!zoneG)return null;
  let zLo=zoneG.min,zHi=zoneG.max;if(zHi-zLo<px*0.006){const m=(zHi+zLo)/2;zLo=m-px*0.003;zHi=m+px*0.003}
  const entry=(zLo+zHi)/2;
  // stop: bölgenin altındaki ilk anlamlı seviyenin biraz altı ya da 1,2 ATR
  const under=C.filter(c=>c.p<zLo-atr*0.5&&c.p>zLo-atr*2.5).sort((x,y)=>y.w-x.w||y.p-x.p)[0];
  let stop=under?under.p-atr*0.3:zLo-atr*1.2;stop=Math.max(stop,zLo*0.85);
  // hedefler
  const R=[];const addR=(p,name)=>{if(isNum(p)&&p>px+atr*0.8)R.push({p,name})};
  sr.filter(l=>l.p>px).forEach(l=>addR(l.p,`Direnç (${l.touches} temas)`));addR(q.hi52,'52 hafta zirvesi');
  if(fib){if(fib.up)fib.ext.forEach(f=>addR(f.p,f.label));else fib.retr.forEach(f=>addR(f.p,f.label))}
  addR(B.up[i],'Bollinger üst');const sg=sig(t);if(sg&&sg.target>0)addR(sg.target,'Analist ortalama hedefi');
  R.sort((x,y)=>x.p-y.p);const merged=[];R.forEach(r=>{const m=merged[merged.length-1];if(m&&r.p-m.p<atr*0.8){m.name+=' + '+r.name}else merged.push({...r})});
  let tp1=merged[0],tp2=merged.find(r=>tp1&&r.p>tp1.p+atr*1.5);
  if(!tp1){tp1={p:px+atr*3,name:'3 ATR'}}if(!tp2){tp2={p:tp1.p+atr*3,name:'TP1 + 3 ATR'}}
  const rr=(tp,e)=>(tp.p-e)/Math.max(1e-9,e-stop);
  const rsi=rsiS(cl)[i];const d200=s200?(px/s200-1)*100:null;const inZone=px<=zHi*1.01&&px>=zLo*0.99;const broke=px<stop;
  let state,stc,msg;
  if(broke){state='Destek kırıldı';stc='down';msg=`Fiyat hesaplanan stop seviyesinin (${pxf(t,stop)}) altında. Teknik yapı bozulmuş; yeni bir taban oluşmadan alım bölgesi tanımlamak zor.`}
  else if(inZone){state='Fiyat alım bölgesinde';stc='up';msg=`Fiyat, ${zoneG.items.length} ayrı seviyenin birleştiği bölgede (${pxf(t,zLo)} – ${pxf(t,zHi)}). Risk/getiri oranı buradan hesaplanıyor.`}
  else if((rsi>=70)||(d200!=null&&d200>35)){state='Aşırı ısınmış';stc='warn';msg=`RSI ${nf(rsi,0)}${d200!=null?`, fiyat 200 günlük ortalamanın %${nf(d200,0)} üzerinde`:''}. Teknik olarak ${pxf(t,zLo)} – ${pxf(t,zHi)} bölgesine geri çekilme, şu anki seviyeden daha dengeli bir giriş sunar.`}
  else{state='Bölgenin üzerinde';stc='';msg=`Fiyat alım bölgesinin %${nf((px/zHi-1)*100,1)} üzerinde. Şu anki fiyattan giriş risk/getiriyi düşürür; bölgeye yaklaşması beklenebilir ya da kademeli girilebilir.`}
  return {t,px,atr,zone:{lo:zLo,hi:zHi,items:zoneG.items,score:zoneG.score},entry,stop,tp1,tp2,rr1:rr(tp1,entry),rr2:rr(tp2,entry),rrNow:rr(tp1,px),riskPct:(entry-stop)/entry*100,riskNowPct:(px-stop)/px*100,
    state,stc,msg,sr,fib,vp,vw50,res:merged.slice(0,5),sup:below.slice(0,8),rsi,d200};
}

/* ---------- beklenti: Monte Carlo ---------- */
function rng(seed){let a=seed>>>0;return ()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
function hashStr(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function dailyLogRets(arr){const r=[];for(let i=1;i<arr.length;i++)if(arr[i]>0&&arr[i-1]>0)r.push(Math.log(arr[i]/arr[i-1]));return r}
function monteCarlo(rets,start,H,opts={}){
  const P=opts.paths||2000,block=5,rnd=rng(opts.seed||1);const n=rets.length;if(n<40)return null;
  const mean=rets.reduce((s,v)=>s+v,0)/n;const adj=opts.mode==='hist'?0:-mean;
  const hz=opts.horizons||[12,30,60];const maxH=Math.max(...hz);const res={};hz.forEach(h=>res[h]={end:[],hitT:0,hitS:0});
  const cone=Array.from({length:maxH+1},()=>[]);
  for(let p=0;p<P;p++){let lp=0;let t=0;let hitT=null,hitS=null;cone[0].push(start);
    while(t<maxH){const b=Math.floor(rnd()*(n-block));for(let k=0;k<block&&t<maxH;k++){lp+=rets[b+k]+adj;t++;const pr=start*Math.exp(lp);cone[t].push(pr);
      if(opts.tp&&hitT==null&&pr>=opts.tp)hitT=t;if(opts.sl&&hitS==null&&pr<=opts.sl)hitS=t;
      if(res[t]){res[t].end.push(pr);const ft=hitT!=null&&(hitS==null||hitT<hitS),fs=hitS!=null&&(hitT==null||hitS<hitT);if(ft)res[t].hitT++;if(fs)res[t].hitS++}}}}
  const pc=(arr,q)=>{const s=arr.slice().sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(q*s.length))]};
  const out={};hz.forEach(h=>{const e=res[h].end;out[h]={p5:pc(e,.05),p25:pc(e,.25),p50:pc(e,.5),p75:pc(e,.75),p95:pc(e,.95),up:e.filter(x=>x>start).length/e.length*100,
    up10:e.filter(x=>x>start*1.1).length/e.length*100,dn10:e.filter(x=>x<start*0.9).length/e.length*100,tpFirst:res[h].hitT/P*100,slFirst:res[h].hitS/P*100}});
  const coneQ=cone.map(v=>v.length?{p5:pc(v,.05),p25:pc(v,.25),p50:pc(v,.5),p75:pc(v,.75),p95:pc(v,.95)}:null);
  const annVol=Math.sqrt(rets.reduce((s,v)=>s+(v-mean)**2,0)/(n-1))*Math.sqrt(252)*100;
  return {h:out,cone:coneQ,annVol,drift:mean*252*100,mode:opts.mode||'notr'};
}
function histWindows(arr,hz=[12,30,60]){const o={};hz.forEach(h=>{const r=[];for(let i=h;i<arr.length;i++)r.push((arr[i]/arr[i-h]-1)*100);r.sort((x,y)=>x-y);o[h]=r.length?{n:r.length,med:r[Math.floor(r.length/2)],pos:r.filter(x=>x>0).length/r.length*100,min:r[0],max:r[r.length-1],p10:r[Math.floor(r.length*.1)],p90:r[Math.floor(r.length*.9)]}:null});return o}
function expectation(t){
  if(!S.mcMode)S.mcMode='notr';const key=t+'|'+S.mcMode;S.mcCache=S.mcCache||{};if(S.mcCache[key])return S.mcCache[key];
  const s=series(t).map(p=>p[1]);if(s.length<60)return null;const plan=tradePlan(t);const px=s[s.length-1];
  const mc=monteCarlo(dailyLogRets(s.slice(-253)),px,60,{seed:hashStr(t),mode:S.mcMode,tp:plan?plan.tp1.p:null,sl:plan?plan.stop:null});
  const hw=histWindows(s);const out={mc,hw,plan,px};S.mcCache[key]=out;return out;
}

/* ---------- görünümler ---------- */
function planCard(t,compact){
  const P=tradePlan(t);if(!P)return '';const pos=positions().list.find(m=>m.t===t&&m.qty>0);
  const lv=(label,v,cls,sub)=>`<div class="lv ${cls||''}"><span>${label}</span><b class="num">${pxf(t,v)}</b>${sub?`<i>${sub}</i>`:''}</div>`;
  const pc=v=>pct((v/P.px-1)*100,1);
  const posBox=pos?(()=>{const cv=isTRY(t)&&fx()?fx():1;const q=pos.qty;const at=v=>q*(v/cv-pos.avg);
    const trail=Math.max(P.stop,(ichimoku(candles(t)).K.slice(-1)[0]||0)-P.atr*0.3,P.px-2.5*P.atr);
    return `<div class="note" style="margin-top:12px;line-height:1.7"><b>Pozisyonuna göre</b> (${nf(q,q%1?4:0)} adet, ort. maliyet ${usd(pos.avg)}):<br>
      Stop'ta (${pxf(t,P.stop)}) K/Z <b class="${cls(at(P.stop))}">${smoney(at(P.stop),0)}</b> · TP1'de (${pxf(t,P.tp1.p)}) <b class="${cls(at(P.tp1.p))}">${smoney(at(P.tp1.p),0)}</b> · TP2'de <b class="${cls(at(P.tp2.p))}">${smoney(at(P.tp2.p),0)}</b><br>
      İzleyen stop önerisi (Kijun ve 2,5 ATR'den yüksek olanı): <b>${pxf(t,trail)}</b>${trail>pos.avg*cv?` — maliyetinin üzerinde, kârı korur`:''}</div>`})():'';
  return `<section class="card ${compact?'':'sec'} plan-c"><div class="th"><h3 style="margin:0">Teknik işlem planı</h3><span class="chip ${P.stc==='up'?'up':P.stc==='down'?'down':'n'} ${P.stc==='warn'?'warnc':''}">${esc(P.state)}</span></div>
    <p class="plan-msg">${esc(P.msg)}</p>
    <div class="ladder">${lv('Kar al 2',P.tp2.p,'tp',`${pc(P.tp2.p)} · ${esc(P.tp2.name)}`)}${lv('Kar al 1',P.tp1.p,'tp',`${pc(P.tp1.p)} · ${esc(P.tp1.name)}`)}
      <div class="lv now"><span>Şu anki fiyat</span><b class="num">${pxf(t,P.px)}</b><i>RSI ${nf(P.rsi,0)} · ATR ${pxf(t,P.atr)}</i></div>
      <div class="lv zone"><span>Alım bölgesi</span><b class="num">${pxf(t,P.zone.lo)} – ${pxf(t,P.zone.hi)}</b><i>${pc(P.entry)} · ${P.zone.items.map(x=>esc(x.name)).join(', ')}</i></div>
      ${lv('Stop',P.stop,'sl',`${pc(P.stop)} · bölge ortasından risk %${nf(P.riskPct,1)}`)}</div>
    <div class="rrrow"><div><span>Risk / getiri (bölgeden, TP1)</span><b class="${P.rr1>=2?'up':P.rr1<1?'down':''}">1 : ${nf(P.rr1,1)}</b></div><div><span>Bölgeden, TP2</span><b class="${P.rr2>=2?'up':''}">1 : ${nf(P.rr2,1)}</b></div><div><span>Şu anki fiyattan, TP1</span><b class="${P.rrNow>=2?'up':P.rrNow<1?'down':''}">1 : ${nf(P.rrNow,1)}</b></div></div>
    ${posBox}
    <p class="muted" style="font-size:12px;margin:10px 0 0;line-height:1.5">Seviyeler Ichimoku, hareketli ortalamalar, Fibonacci, destek/direnç, hacim profili ve ATR'nin birleşiminden otomatik hesaplanır. Yatırım tavsiyesi değildir; bilanço gibi olaylar teknik seviyeleri geçersiz kılabilir.</p></section>`;
}
function fanChart(el,t,E){
  const s=sliceRange(series(t),'3A');const P=E.plan;const cone=E.mc.cone;const W=el.clientWidth||800,H=300,pl=6,pr=70,pt=10,pb=24;
  const past=s.length,N=past+60;const vals=s.map(p=>p[1]).concat(cone.flatMap(c=>c?[c.p5,c.p95]:[]));if(P)vals.push(P.stop,P.tp1.p);let mn=Math.min(...vals),mx=Math.max(...vals);const pd=(mx-mn)*.06;mn-=pd;mx+=pd;
  const X=i=>pl+i/(N-1)*(W-pl-pr),Y=v=>pt+(1-(v-mn)/(mx-mn))*(H-pt-pb);let g='';
  niceTicks(mn,mx,5).forEach(v=>{if(v<mn||v>mx)return;g+=`<line class="gridl" x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${W-pr+6}" y="${Y(v)+4}">${esc(pxf(t,v,v>=1000?0:2))}</text>`});
  const band=(a,b,f)=>{let d='';for(let k=0;k<=60;k++)d+=`${d?'L':'M'}${X(past-1+k)},${Y(cone[k][a])}`;for(let k=60;k>=0;k--)d+=`L${X(past-1+k)},${Y(cone[k][b])}`;return `<path d="${d}Z" fill="${f}"/>`};
  g+=band('p95','p5','rgba(139,123,255,.12)')+band('p75','p25','rgba(139,123,255,.22)');
  let md='';for(let k=0;k<=60;k++)md+=`${md?'L':'M'}${X(past-1+k)},${Y(cone[k].p50)}`;g+=`<path d="${md}" fill="none" stroke="#8b7bff" stroke-width="1.6" stroke-dasharray="5 4"/>`;
  let pdh='';s.forEach((p,i)=>pdh+=`${pdh?'L':'M'}${X(i)},${Y(p[1])}`);g+=`<path d="${pdh}" fill="none" stroke="var(--text)" stroke-width="1.8"/>`;
  const hl=(v,c,lab)=>`<line x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="${c}" stroke-dasharray="4 3" stroke-width="1.1"/><text class="ax" x="${pl+4}" y="${Y(v)-4}" style="fill:${c}">${lab}</text>`;
  if(P){g+=`<rect x="${pl}" y="${Y(P.zone.hi)}" width="${W-pl-pr}" height="${Math.max(2,Y(P.zone.lo)-Y(P.zone.hi))}" fill="rgba(92,211,255,.10)"/>`+hl(P.tp1.p,'#2fe39a','TP1')+hl(P.tp2.p,'#2fe39a','TP2')+hl(P.stop,'#ff5d7a','Stop')}
  [12,30,60].forEach(h=>{const x=X(past-1+h);g+=`<line x1="${x}" x2="${x}" y1="${pt}" y2="${H-pb}" stroke="var(--line2)" stroke-dasharray="2 3"/><text class="ax" x="${x}" y="${H-6}" text-anchor="middle">${h} gün</text>`});
  g+=`<text class="ax" x="${X(0)}" y="${H-6}">${esc(trDate(s[0][0]+'T12:00:00Z',{day:'numeric',month:'short'}))}</text>${W>=600?`<text class="ax" x="${X(past-1)}" y="${H-6}" text-anchor="middle">bugün</text>`:''}`;
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px">${g}</svg>`;el.style.height=H+'px';
}
function expectSection(t){
  const E=expectation(t);if(!E||!E.mc)return '';const P=E.plan;const m=E.mc;const px=E.px;const pc=v=>pct((v/px-1)*100,1);
  return `<section class="card sec"><div class="th"><h3 style="margin:0">Vade beklentisi · 12 / 30 / 60 gün</h3>
    <div class="seg2" id="mcMode"><button data-m="notr" class="${S.mcMode==='notr'?'on':''}">Nötr eğilim</button><button data-m="hist" class="${S.mcMode==='hist'?'on':''}">Son 1 yılın eğilimi</button></div></div>
    <div class="grid expg"><div style="min-width:0"><div class="chart" id="cFan" style="height:300px"></div>
      <div class="leg" style="margin-top:6px"><span><i style="background:rgba(139,123,255,.5)"></i>%50 olasılık aralığı</span><span><i style="background:rgba(139,123,255,.2)"></i>%90 olasılık aralığı</span><span><i style="background:#8b7bff"></i>Medyan yol</span>${P?`<span><i style="background:rgba(92,211,255,.5)"></i>Alım bölgesi</span>`:''}</div></div>
    <div class="exp-t"><table class="tbl"><thead><tr><th></th><th class="r">12 gün</th><th class="r">30 gün</th><th class="r">60 gün</th></tr></thead><tbody>
      <tr><td class="muted">Medyan fiyat</td>${[12,30,60].map(h=>`<td class="r num">${pxf(t,m.h[h].p50)}<div class="dim" style="font-size:11px">${pc(m.h[h].p50)}</div></td>`).join('')}</tr>
      <tr><td class="muted">%50 aralık</td>${[12,30,60].map(h=>`<td class="r num" style="font-size:12.5px">${pc(m.h[h].p25)} / ${pc(m.h[h].p75)}</td>`).join('')}</tr>
      <tr><td class="muted">%90 aralık</td>${[12,30,60].map(h=>`<td class="r num" style="font-size:12.5px">${pc(m.h[h].p5)} / ${pc(m.h[h].p95)}</td>`).join('')}</tr>
      <tr><td class="muted">Yükselme olasılığı</td>${[12,30,60].map(h=>`<td class="r num">%${nf(m.h[h].up,0)}</td>`).join('')}</tr>
      <tr><td class="muted">+%10 üstü</td>${[12,30,60].map(h=>`<td class="r num up">%${nf(m.h[h].up10,0)}</td>`).join('')}</tr>
      <tr><td class="muted">−%10 altı</td>${[12,30,60].map(h=>`<td class="r num down">%${nf(m.h[h].dn10,0)}</td>`).join('')}</tr>
      ${P?`<tr><td class="muted">Önce TP1'e değme</td>${[12,30,60].map(h=>`<td class="r num up">%${nf(m.h[h].tpFirst,0)}</td>`).join('')}</tr>
      <tr><td class="muted">Önce stop'a değme</td>${[12,30,60].map(h=>`<td class="r num down">%${nf(m.h[h].slFirst,0)}</td>`).join('')}</tr>`:''}
      <tr><td class="muted">Geçmiş 1 yıl, aynı vade<br><span class="dim" style="font-size:11px">medyan · pozitif oran</span></td>${[12,30,60].map(h=>E.hw[h]?`<td class="r num" style="font-size:12.5px">${pct(E.hw[h].med,1)}<div class="dim">%${nf(E.hw[h].pos,0)} pozitif</div></td>`:'<td class="r">—</td>').join('')}</tr>
    </tbody></table></div></div>
    <p class="muted" style="font-size:12px;margin:10px 0 0;line-height:1.55">Son 1 yılın günlük getirilerinden 5 günlük bloklarla 2.000 olası yol üretildi (bootstrap Monte Carlo). Yıllık oynaklık %${nf(m.annVol,0)}. "Nötr eğilim" geçmişteki ortalama getiriyi sıfırlar (oynaklık aynı kalır). "Son 1 yılın eğilimi" geçen yılın yıllık %${nf(m.drift,0)} eğiliminin sürdüğünü varsayar. Geçmiş yükseliş güçlüyse bu varsayım iyimser olur. Olasılıklar tahmindir, garanti değildir.</p></section>`;
}
function afterExpect(t){const E=expectation(t);const el=$('#cFan');if(E&&E.mc&&el)fanChart(el,t,E);$$('#mcMode button').forEach(b=>b.onclick=()=>{S.mcMode=b.dataset.m;render(false)})}
function levelsSection(t){
  const a=candles(t);if(a.length<120)return '';const px=a[a.length-1].c;const atr=atrS(a)[a.length-1];const sr=srLevels(a,px,atr);const fib=fibLevels(a);const vp=volProfile(a);const ad=adxS(a);const i=a.length-1;const RS=relStrength(t);const SE=seasonality(t);
  const vw20=vwapN(a,20),vw50=vwapN(a,50);const adx=ad.adx[i],pdi=ad.pdi[i],mdi=ad.mdi[i];
  const MON=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  return `<div class="grid g2 sec">
    <section class="card"><h3>Destek ve direnç</h3><div class="sr">${sr.filter(l=>Math.abs(l.p/px-1)<0.3).reverse().map(l=>`<div class="srl ${l.p>px?'res':'sup'}"><span>${l.p>px?'Direnç':'Destek'}</span><b class="num">${pxf(t,l.p)}</b><i>${pct((l.p/px-1)*100,1)} · ${l.touches} temas · son ${esc(trDate(l.last+'T12:00:00Z',{day:'numeric',month:'short'}))}</i></div>`).join('')||'<div class="muted">Belirgin seviye yok</div>'}</div>
      ${fib?`<h3 style="margin-top:18px">Fibonacci <span class="r muted">${fib.up?'yükseliş':'düşüş'} dalgası · ${pxf(t,fib.L)} → ${pxf(t,fib.H)}</span></h3><div class="sr">${fib.ext.concat(fib.retr).sort((x,y)=>y.p-x.p).map(f=>`<div class="srl ${f.p>px?'res':'sup'}"><span>${esc(f.label)}</span><b class="num">${pxf(t,f.p)}</b><i>${pct((f.p/px-1)*100,1)}</i></div>`).join('')}</div>`:''}</section>
    <section class="card"><h3>Hacim ve trend gücü</h3>
      <div class="ins"><div><span>VWAP (20 gün)</span><b>${pxf(t,vw20)}</b> <i class="${px>vw20?'up':'down'}" style="font-style:normal">${px>vw20?'fiyat üstünde':'fiyat altında'}</i></div><div><span>VWAP (50 gün)</span><b>${pxf(t,vw50)}</b> <i class="${px>vw50?'up':'down'}" style="font-style:normal">${px>vw50?'üstünde':'altında'}</i></div>
      ${vp?`<div><span>Hacim yoğunluğu (POC, 6 ay)</span><b>${pxf(t,vp.poc)}</b></div><div><span>Değer alanı (%70 hacim)</span><b>${pxf(t,vp.vaL)} – ${pxf(t,vp.vaH)}</b></div>`:''}
      <div><span>ADX (14) · trend gücü</span><b class="${adx>=25?'up':''}">${nf(adx,0)} ${adx>=40?'· çok güçlü':adx>=25?'· güçlü trend':adx<20?'· trend yok':'· zayıf'}</b></div><div><span>+DI / −DI</span><b class="${pdi>mdi?'up':'down'}">${nf(pdi,0)} / ${nf(mdi,0)} ${pdi>mdi?'· alıcılar baskın':'· satıcılar baskın'}</b></div></div>
      ${vp?`<div class="vpbars">${vp.bins.map((v,k)=>({v,p:vp.lo+(k+0.5)*vp.step})).reverse().map(b=>`<div class="vpb ${Math.abs(b.p-px)<vp.step/2?'cur':''} ${b.p>=vp.vaL&&b.p<=vp.vaH?'va':''}"><span class="num">${pxf(t,b.p,b.p>=1000?0:1)}</span><i style="width:${b.v/vp.max*100}%"></i></div>`).join('')}</div>`:''}</section>
  </div>
  <div class="grid g2 sec">
    ${RS?`<section class="card"><h3>Göreli güç <span class="r muted">S&P 500${RS.peer!=='SPY'?' ve '+RS.peer:''}'e göre</span></h3>
      <div class="tscroll"><table class="tbl"><thead><tr><th>Dönem</th><th class="r">${esc(dispT(t))}</th><th class="r">S&P 500 farkı</th>${RS.peer!=='SPY'?`<th class="r">${RS.peer} farkı</th>`:''}</tr></thead><tbody>${RS.rows.map(r=>`<tr><td>${r.k==='1Y'?'1 yıl':r.k}</td><td class="r num ${cls(r.own)}">${pct(r.own,1)}</td><td class="r num ${cls(r.exS)}">${r.exS==null?'—':(r.exS>0?'+':'')+nf(r.exS,1)+' puan'}</td>${RS.peer!=='SPY'?`<td class="r num ${cls(r.exP)}">${r.exP==null?'—':(r.exP>0?'+':'')+nf(r.exP,1)+' puan'}</td>`:''}</tr>`).join('')}</tbody></table></div>
      <div class="chart" id="cRS" style="height:150px;margin-top:10px"></div><p class="muted" style="font-size:12px;margin:6px 0 0">Çizgi yükseliyorsa ${esc(dispT(t))} S&P 500'den iyi gidiyor.</p></section>`:''}
    ${SE?`<section class="card"><h3>Mevsimsellik <span class="r muted">son ${SE.years} yıl · aylık ortalama getiri</span></h3>
      <div class="season">${SE.months.map(m=>`<div class="sm ${m.m===SE.cur?'cur':''}" title="${MON[m.m]}: ortalama ${nf(m.avg,1)}%, medyan ${nf(m.med,1)}%, %${nf(m.pos,0)} pozitif, en iyi ${nf(m.best,1)}%, en kötü ${nf(m.worst,1)}% (${m.n} yıl)"><div class="bar2"><i class="${m.avg>=0?'p':'n'}" style="height:${Math.min(100,Math.abs(m.avg||0)*6)}%"></i></div><b class="${cls(m.avg)}">${m.avg==null?'—':(m.avg>0?'+':'')+nf(m.avg,1)}</b><span>${MON[m.m]}</span><em>%${nf(m.pos,0)}</em></div>`).join('')}</div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">Alt satır: o ayın pozitif kapandığı yılların oranı. Bu ay (${MON[SE.cur]}) ve gelecek ay (${MON[(SE.cur+1)%12]}) tarihsel olarak ${SE.months[SE.cur].avg>=0?'olumlu':'zayıf'} / ${SE.months[(SE.cur+1)%12].avg>=0?'olumlu':'zayıf'}. Geçmiş örüntü tekrar etmeyebilir.</p></section>`:''}
  </div>`;
}
function afterLevels(t){const RS=relStrength(t);const el=$('#cRS');if(RS&&RS.line&&el){const L=RS.line.slice(-252);lineChart(el,[{name:'Göreli güç',color:'#8b7bff',pts:L}],{fmt:(v,ax)=>nf(v,ax?0:1)})}}

/* ---------- portföy geneli beklenti ---------- */
function portfolioExpect(){
  const M=riskModel();const pr=M.R.__P.filter(v=>v!=null).map(v=>Math.log(1+v));if(pr.length<60)return null;
  const P=positions();const base=P.total>0?P.total:10000;const mc=monteCarlo(pr,base,60,{seed:777,mode:S.mcMode||'notr'});return {mc,base,real:P.total>0};
}
function viewPortExpect(){
  if(!S.mcMode)S.mcMode='notr';const E=portfolioExpect();if(!E)return '';const m=E.mc;const b=E.base;
  return `<div class="sec-t"><div><h2>Portföy vade beklentisi</h2><p>${E.real?'Gerçek pozisyonların':'Model portföy ($10.000)'} için 12 / 30 / 60 günlük olası sonuçlar</p></div><div class="seg2" id="mcModeP"><button data-m="notr" class="${S.mcMode==='notr'?'on':''}">Nötr eğilim</button><button data-m="hist" class="${S.mcMode==='hist'?'on':''}">Son 1 yılın eğilimi</button></div></div>
  <section class="card"><div class="grid g3">${[12,30,60].map(h=>{const x=m.h[h];return `<div class="kpi mini"><div class="l">${h} gün sonra</div><div class="v">${money(x.p50,0)}</div><div class="s">medyan ${smoney(x.p50-b,0)} · yükselme olasılığı %${nf(x.up,0)}</div>
    <div class="rangebar"><i style="left:${Math.max(0,Math.min(100,(x.p5/b-0.7)/0.6*100))}%;right:${Math.max(0,100-Math.min(100,(x.p95/b-0.7)/0.6*100))}%"></i><b style="left:${Math.max(0,Math.min(100,(x.p25/b-0.7)/0.6*100))}%;right:${Math.max(0,100-Math.min(100,(x.p75/b-0.7)/0.6*100))}%"></b><em style="left:50%"></em></div>
    <div class="s">%90 aralık: ${smoney(x.p5-b,0)} / ${smoney(x.p95-b,0)}<br>−%10'dan kötü olasılığı %${nf(x.dn10,0)}</div></div>`}).join('')}</div>
    <p class="muted" style="font-size:12px;margin:10px 0 0">Portföyün son 1 yılın ağırlıklı günlük getirilerinden 2.000 yol üretildi; yıllık oynaklık %${nf(m.annVol,0)}. Aralık çubuğunun ortası bugünkü değer, ölçek −%30 ile +%30 arası.</p></section>`;
}
function afterPortExpect(){$$('#mcModeP button').forEach(b=>b.onclick=()=>{S.mcMode=b.dataset.m;S.mcCache={};render(false)})}

/* ---------- tarama tablosuna plan sütunları ---------- */
function planCells(t){const P=tradePlan(t);if(!P)return '<td class="r">—</td><td class="r">—</td><td class="r">—</td><td class="r">—</td>';
  return `<td class="r num" style="font-size:12.5px">${pxf(t,P.zone.lo)}–${pxf(t,P.zone.hi)}<div class="dim" style="font-size:11px">${pct((P.entry/P.px-1)*100,1)}</div></td><td class="r num down" style="font-size:12.5px">${pxf(t,P.stop)}</td><td class="r num up" style="font-size:12.5px">${pxf(t,P.tp1.p)}</td><td class="r num ${P.rr1>=2?'up':P.rr1<1?'down':''}">1:${nf(P.rr1,1)}</td>`}
