/* Portföy Defteri — teknik analiz: mum grafik, Ichimoku, Bollinger, MACD, RSI, Stokastik, hacim, ATR ve teknik tarama */
"use strict";
const IND_DEF={lvl:'Plan seviyeleri',ichi:'Ichimoku',fib:'Fibonacci',boll:'Bollinger',sma:'Ort. 20/50/200',vwap:'VWAP',vp:'Hacim profili',vol:'Hacim',rsi:'RSI',macd:'MACD',stoch:'Stokastik',adx:'ADX'};
function indState(){if(!S.ind){try{S.ind=JSON.parse(localStorage.getItem('pd_ind'))}catch(e){}if(!S.ind)S.ind={lvl:true,ichi:true,fib:false,boll:false,sma:false,vwap:false,vp:false,vol:true,rsi:true,macd:true,stoch:false,adx:false};['lvl','fib','vwap','vp','adx'].forEach(k=>{if(!(k in S.ind))S.ind[k]=k==='lvl'})}return S.ind}
function saveInd(){try{localStorage.setItem('pd_ind',JSON.stringify(S.ind))}catch(e){}}

/* ---------- veri ---------- */
function candles(t){
  const raw=(S.ohlc&&S.ohlc[t])||[];if(!raw.length)return [];
  const c=raw.map(r=>({d:r[0],o:r[1],h:r[2],l:r[3],c:r[4],v:r[5]||0}));
  const q=quote(t);if(q&&q.price>0&&q.day){const last=c[c.length-1];
    if(last.d===q.day){last.c=q.price;last.h=Math.max(last.h,q.price);last.l=Math.min(last.l,q.price)}
    else if(q.day>last.d){const o=isNum(q.o)&&q.o>0?q.o:last.c;c.push({d:q.day,o,h:Math.max(o,q.price,q.high||0),l:Math.min(o,q.price,q.low||Infinity),c:q.price,v:q.vol||0})}}
  return c;
}
/* ---------- göstergeler ---------- */
const hh=(a,i,n)=>{let m=-Infinity;for(let k=Math.max(0,i-n+1);k<=i;k++)m=Math.max(m,a[k].h);return m};
const ll=(a,i,n)=>{let m=Infinity;for(let k=Math.max(0,i-n+1);k<=i;k++)m=Math.min(m,a[k].l);return m};
function smaS(v,n){const o=Array(v.length).fill(null);let s=0;for(let i=0;i<v.length;i++){s+=v[i];if(i>=n)s-=v[i-n];if(i>=n-1)o[i]=s/n}return o}
function emaS(v,n){const o=Array(v.length).fill(null);const k=2/(n+1);let e=null;for(let i=0;i<v.length;i++){if(v[i]==null)continue;if(e==null){if(i>=n-1){let s=0,c=0;for(let j=i-n+1;j<=i;j++){if(v[j]!=null){s+=v[j];c++}}e=s/c}else continue}else e=v[i]*k+e*(1-k);o[i]=e}return o}
function ichimoku(a){
  const n=a.length,T=[],K=[],A=Array(n+26).fill(null),B=Array(n+26).fill(null),C=Array(n).fill(null);
  for(let i=0;i<n;i++){T[i]=i>=8?(hh(a,i,9)+ll(a,i,9))/2:null;K[i]=i>=25?(hh(a,i,26)+ll(a,i,26))/2:null;
    if(T[i]!=null&&K[i]!=null)A[i+26]=(T[i]+K[i])/2; if(i>=51)B[i+26]=(hh(a,i,52)+ll(a,i,52))/2; if(i>=26)C[i-26]=a[i].c}
  return {T,K,A,B,C};
}
function bollinger(cl,n=20,m=2){const mid=smaS(cl,n);const up=[],lo=[];for(let i=0;i<cl.length;i++){if(mid[i]==null){up.push(null);lo.push(null);continue}let s=0;for(let j=i-n+1;j<=i;j++)s+=(cl[j]-mid[i])**2;const sd=Math.sqrt(s/n);up.push(mid[i]+m*sd);lo.push(mid[i]-m*sd)}return {mid,up,lo}}
function rsiS(cl,n=14){const o=Array(cl.length).fill(null);if(cl.length<n+1)return o;let g=0,l=0;for(let i=1;i<=n;i++){const d=cl[i]-cl[i-1];if(d>0)g+=d;else l-=d}g/=n;l/=n;o[n]=l===0?100:100-100/(1+g/l);for(let i=n+1;i<cl.length;i++){const d=cl[i]-cl[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;o[i]=l===0?100:100-100/(1+g/l)}return o}
function macdS(cl){const e12=emaS(cl,12),e26=emaS(cl,26);const m=cl.map((_,i)=>e12[i]!=null&&e26[i]!=null?e12[i]-e26[i]:null);const sig=emaS(m,9);return {m,sig,h:m.map((v,i)=>v!=null&&sig[i]!=null?v-sig[i]:null)}}
function stochS(a,n=14,sk=3,sd=3){const raw=a.map((x,i)=>i>=n-1?((x.c-ll(a,i,n))/((hh(a,i,n)-ll(a,i,n))||1))*100:null);const k=smaNull(raw,sk),d=smaNull(k,sd);return {k,d}}
function smaNull(v,n){const o=Array(v.length).fill(null);for(let i=0;i<v.length;i++){let s=0,c=0;for(let j=i-n+1;j<=i;j++){if(j<0||v[j]==null){c=-1;break}s+=v[j];c++}if(c===n)o[i]=s/n}return o}
function atrS(a,n=14){const tr=a.map((x,i)=>i?Math.max(x.h-x.l,Math.abs(x.h-a[i-1].c),Math.abs(x.l-a[i-1].c)):x.h-x.l);const o=Array(a.length).fill(null);let s=null;for(let i=0;i<a.length;i++){if(i<n-1)continue;if(s==null){s=tr.slice(0,n).reduce((p,q)=>p+q,0)/n}else s=(s*(n-1)+tr[i])/n;o[i]=s}return o}
function nextBizDays(d,n){const out=[];const x=new Date(d+'T12:00:00Z');while(out.length<n){x.setUTCDate(x.getUTCDate()+1);const w=x.getUTCDay();if(w&&w<6)out.push(x.toISOString().slice(0,10))}return out}

/* ---------- sinyal özeti ---------- */
function techSignals(t){
  const a=candles(t);if(a.length<60)return null;const cl=a.map(x=>x.c);const n=a.length,i=n-1,px=cl[i];
  const I=ichimoku(a);const cTop=Math.max(I.A[i]??-Infinity,I.B[i]??-Infinity),cBot=Math.min(I.A[i]??Infinity,I.B[i]??Infinity);
  const checks=[];
  const cloudPos=px>cTop?1:px<cBot?-1:0;checks.push({k:'Fiyat bulutun',v:cloudPos>0?'üstünde':cloudPos<0?'altında':'içinde',s:cloudPos});
  const tk=I.T[i]!=null&&I.K[i]!=null?(I.T[i]>I.K[i]?1:I.T[i]<I.K[i]?-1:0):0;checks.push({k:'Tenkan / Kijun',v:tk>0?'Tenkan üstte':tk<0?'Tenkan altta':'eşit',s:tk});
  const fA=I.A[n+25],fB=I.B[n+25];const fut=fA!=null&&fB!=null?(fA>fB?1:-1):0;checks.push({k:'Gelecek bulut',v:fut>0?'yeşil (Senkou A üstte)':'kırmızı (Senkou B üstte)',s:fut});
  const ch=n>26?(px>cl[n-27]?1:-1):0;checks.push({k:'Chikou (26 gün önceye göre)',v:ch>0?'fiyatın üstünde':'fiyatın altında',s:ch});
  const kj=I.K[i]!=null?(px>I.K[i]?1:-1):0;checks.push({k:'Fiyat / Kijun',v:kj>0?'Kijun üstünde':'Kijun altında',s:kj});
  let lastCross=null;{const sg=[];let prev=0;for(let j=0;j<=i;j++){if(I.T[j]==null||I.K[j]==null){sg.push(0);continue}const d=I.T[j]-I.K[j];const v=d>0?1:d<0?-1:prev;sg.push(v);prev=v}for(let j=i;j>Math.max(26,i-90);j--){if(sg[j]&&sg[j-1]&&sg[j]!==sg[j-1]){lastCross={d:a[j].d,up:sg[j]>0,ago:i-j};break}}}
  const score=checks.reduce((s,c)=>s+c.s,0);
  const lab=score>=4?['Güçlü pozitif','up']:score>=2?['Pozitif','up']:score<=-4?['Güçlü negatif','down']:score<=-2?['Negatif','down']:['Nötr',''];
  const R=rsiS(cl);const M=macdS(cl);const B=bollinger(cl);const St=stochS(a);const ATR=atrS(a);
  const pb=B.up[i]!=null?(px-B.lo[i])/((B.up[i]-B.lo[i])||1):null;const bw=B.mid[i]?(B.up[i]-B.lo[i])/B.mid[i]*100:null;
  const bwHist=B.mid.map((m,j)=>m?(B.up[j]-B.lo[j])/m*100:null).filter(x=>x!=null).slice(-120);const squeeze=bw!=null&&bwHist.length>60&&bw<=Math.min(...bwHist)*1.1;
  const macdCross=M.h[i]!=null&&M.h[i-1]!=null&&M.h[i]*M.h[i-1]<0?(M.h[i]>0?'yukarı kesti':'aşağı kesti'):null;
  return {px,ichi:{checks,score,label:lab[0],cls:lab[1],cloudTop:cTop,cloudBot:cBot,kijun:I.K[i],tenkan:I.T[i],lastCross,cloudPos},
    rsi:R[i],macd:{m:M.m[i],sig:M.sig[i],h:M.h[i],cross:macdCross,rising:M.h[i]>M.h[i-1]},boll:{pb,bw,squeeze,up:B.up[i],lo:B.lo[i],mid:B.mid[i]},
    stoch:{k:St.k[i],d:St.d[i]},atr:ATR[i],atrPct:ATR[i]?ATR[i]/px*100:null,
    volRatio:(()=>{const v=a.slice(-21,-1).map(x=>x.v).filter(Boolean);return v.length&&a[i].v?a[i].v/(v.reduce((p,q)=>p+q,0)/v.length):null})()};
}
function ichiChip(t){const s=techSignals(t);if(!s)return '';const I=s.ichi;return `<span class="tb ${I.cls}" title="Ichimoku skoru ${I.score>0?'+':''}${I.score} / 5">☁ ${esc(I.label)}</span>`}

/* ---------- mum grafik ---------- */
function techChart(el,t,range){
  const all=candles(t);if(all.length<30){el.innerHTML='<div class="empty">Mum grafiği için OHLC verisi yok (yeni eklenen semboller ilk fiyat güncellemesinden sonra dolar).</div>';return}
  const st=indState();const cl=all.map(x=>x.c);
  const I=st.ichi?ichimoku(all):null,B=st.boll?bollinger(cl):null,R=st.rsi?rsiS(cl):null,M=st.macd?macdS(cl):null,SK=st.stoch?stochS(all):null;
  const S20=st.sma?smaS(cl,20):null,S50=st.sma?smaS(cl,50):null,S200=st.sma?smaS(cl,200):null;
  const nShow={'1A':22,'3A':63,'6A':126,'1Y':252}[range]||126;const start=Math.max(0,all.length-nShow);
  const fut=st.ichi?26:0;const fdates=fut?nextBizDays(all[all.length-1].d,fut):[];
  const N=all.length-start+fut;const W=el.clientWidth||900;
  const panels=[{k:'main',h:S.techBig?(innerWidth<760?360:520):340}];if(st.vol)panels.push({k:'vol',h:70});if(st.rsi)panels.push({k:'rsi',h:90});if(st.macd)panels.push({k:'macd',h:100});if(st.stoch)panels.push({k:'stoch',h:90});if(st.adx)panels.push({k:'adx',h:90});
  const gap=14,pl=6,pr=62;const H=panels.reduce((s,p)=>s+p.h+gap,0)+22;let yOff=6;panels.forEach(p=>{p.y=yOff;yOff+=p.h+gap});
  const cw=(W-pl-pr)/N;const X=i=>pl+(i-start+0.5)*cw;
  let svg='';
  // ana panel ölçeği
  const main=panels[0];let mn=Infinity,mx=-Infinity;for(let i=start;i<all.length;i++){mn=Math.min(mn,all[i].l);mx=Math.max(mx,all[i].h)}
  const inc=v=>{if(v!=null&&isFinite(v)){mn=Math.min(mn,v);mx=Math.max(mx,v)}};
  if(I)for(let i=start;i<all.length+fut;i++){inc(I.A[i]);inc(I.B[i])}
  if(B)for(let i=start;i<all.length;i++){inc(B.up[i]);inc(B.lo[i])}
  const PL=st.lvl&&typeof tradePlan==='function'?tradePlan(t):null;const FB=st.fib&&typeof fibLevels==='function'?fibLevels(all):null;
  const lastC=all[all.length-1].c;const near=v=>v!=null&&Math.abs(v/lastC-1)<0.35;
  if(PL)[PL.stop,PL.tp1.p,PL.tp2.p,PL.zone.lo,PL.zone.hi].forEach(v=>{if(near(v))inc(v)});
  if(FB)FB.retr.concat(FB.ext).forEach(f=>{if(near(f.p))inc(f.p)});
  const pad=(mx-mn)*.05;mn-=pad;mx+=pad;const Y=v=>main.y+(1-(v-mn)/(mx-mn))*main.h;
  const fmt=v=>pxf(t,v,v>=1000?0:2);
  const lastPx=all[all.length-1].c;niceTicks(mn,mx,5).forEach(v=>{if(v<mn||v>mx)return;if(Math.abs(Y(v)-Y(lastPx))<14){svg+=`<line class="gridl" x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}"/>`;return}svg+=`<line class="gridl" x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${W-pr+6}" y="${Y(v)+4}">${esc(fmt(v))}</text>`});
  // Ichimoku bulutu
  if(I){let segs=[];let cur=null;for(let i=start;i<all.length+fut;i++){const a=I.A[i],b=I.B[i];if(a==null||b==null){cur=null;continue}const g=a>=b;if(!cur||cur.g!==g){cur={g,pts:[]};segs.push(cur);if(segs.length>1){const prev=segs[segs.length-2];const lp=prev.pts[prev.pts.length-1];if(lp)cur.pts.push(lp)}}cur.pts.push([X(i),Y(a),Y(b)])}
    segs.forEach(s=>{if(s.pts.length<2)return;const top=s.pts.map(p=>`${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L');const bot=s.pts.slice().reverse().map(p=>`${p[0].toFixed(1)},${p[2].toFixed(1)}`).join(' L');svg+=`<path d="M${top} L${bot} Z" fill="${s.g?'rgba(47,227,154,.16)':'rgba(255,93,122,.16)'}"/>`});
    const line=(arr,c,w,dash,off=0)=>{let d='';for(let i=start;i<arr.length&&i<all.length+fut;i++){const v=arr[i];if(v==null){continue}d+=`${d?'L':'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`}return d?`<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" ${dash?`stroke-dasharray="${dash}"`:''}/>`:''};
    svg+=line(I.A,'rgba(47,227,154,.7)',1)+line(I.B,'rgba(255,93,122,.7)',1)+line(I.T,'#5cd3ff',1.4)+line(I.K,'#ff9f5c',1.6)+line(I.C,'#c792ff',1.2,'3 3');
  }
  if(B){const ln=(arr,c,dash)=>{let d='';for(let i=start;i<all.length;i++){if(arr[i]==null)continue;d+=`${d?'L':'M'}${X(i).toFixed(1)},${Y(arr[i]).toFixed(1)}`}return `<path d="${d}" fill="none" stroke="${c}" stroke-width="1.1" ${dash?`stroke-dasharray="${dash}"`:''}/>`};
    let area='';for(let i=start;i<all.length;i++)if(B.up[i]!=null)area+=`${area?'L':'M'}${X(i).toFixed(1)},${Y(B.up[i]).toFixed(1)}`;for(let i=all.length-1;i>=start;i--)if(B.lo[i]!=null)area+=`L${X(i).toFixed(1)},${Y(B.lo[i]).toFixed(1)}`;
    svg+=`<path d="${area}Z" fill="rgba(139,123,255,.07)"/>`+ln(B.up,'#8b7bff')+ln(B.lo,'#8b7bff')+ln(B.mid,'#8b7bff','4 3')}
  if(S20){const ln=(arr,c)=>{let d='';for(let i=start;i<all.length;i++){if(arr[i]==null)continue;d+=`${d?'L':'M'}${X(i).toFixed(1)},${Y(arr[i]).toFixed(1)}`}return d?`<path d="${d}" fill="none" stroke="${c}" stroke-width="1.4"/>`:''};svg+=ln(S20,'#ffd35c')+ln(S50,'#5cd3ff')+ln(S200,'#ff6fd0')}
  if(st.vp&&typeof volProfile==='function'){const vp=volProfile(all.slice(start));if(vp){const maxW=(W-pl-pr)*0.22;const bh=Math.abs(Y(vp.lo)-Y(vp.lo+vp.step));vp.bins.forEach((v,k)=>{const p0=vp.lo+k*vp.step;const inVA=p0+vp.step/2>=vp.vaL&&p0+vp.step/2<=vp.vaH;svg+=`<rect x="${W-pr-v/vp.max*maxW}" y="${Y(p0+vp.step)}" width="${v/vp.max*maxW}" height="${Math.max(1,bh-1)}" fill="${inVA?'rgba(139,123,255,.28)':'rgba(139,123,255,.12)'}"/>`});svg+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(vp.poc)}" y2="${Y(vp.poc)}" stroke="#8b7bff" stroke-width="1" stroke-dasharray="6 3"/><text class="ax" x="${W-pr-4}" y="${Y(vp.poc)-4}" text-anchor="end" style="fill:#8b7bff">POC</text>`}}
  if(st.vwap&&typeof vwapSeries==='function'){const vw=vwapSeries(all,20);let d='';for(let i=start;i<all.length;i++){if(vw[i]==null)continue;d+=`${d?'L':'M'}${X(i).toFixed(1)},${Y(vw[i]).toFixed(1)}`}svg+=`<path d="${d}" fill="none" stroke="#e7c6ff" stroke-width="1.4" stroke-dasharray="1 0"/>`}
  if(FB){FB.retr.concat(FB.ext).forEach(f=>{if(!near(f.p))return;svg+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(f.p)}" y2="${Y(f.p)}" stroke="#ffd35c" stroke-opacity=".55" stroke-dasharray="2 4"/><text class="ax" x="${pl+4}" y="${Y(f.p)-3}" style="fill:#ffd35c">${esc(f.label)} ${esc(fmt(f.p))}</text>`})}
  if(PL){const zy1=Y(PL.zone.hi),zy2=Y(PL.zone.lo);svg+=`<rect x="${pl}" y="${zy1}" width="${W-pl-pr}" height="${Math.max(2,zy2-zy1)}" fill="rgba(92,211,255,.12)" stroke="rgba(92,211,255,.45)" stroke-dasharray="3 3"/><text class="ax" x="${W-pr-6}" y="${zy2-4}" text-anchor="end" style="fill:#5cd3ff">Alım bölgesi</text>`;
    [[PL.tp2.p,'TP2','#2fe39a'],[PL.tp1.p,'TP1','#2fe39a'],[PL.stop,'Stop','#ff5d7a']].forEach(([v,l,c])=>{if(!near(v))return;svg+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="${c}" stroke-width="1.2" stroke-dasharray="6 3"/><rect x="${W-pr+2}" y="${Y(v)-9}" width="${pr-4}" height="18" rx="4" fill="${c}" opacity=".9"/><text x="${W-pr+6}" y="${Y(v)+4}" style="fill:#0b0e13;font:600 10.5px var(--mono)">${l} ${esc(fmt(v))}</text>`})}
  // mumlar
  const bw=Math.max(1,Math.min(9,cw*.66));
  for(let i=start;i<all.length;i++){const c=all[i];const up=c.c>=c.o;const col=up?'var(--up)':'var(--down)';const x=X(i);
    svg+=`<line x1="${x}" x2="${x}" y1="${Y(c.h)}" y2="${Y(c.l)}" stroke="${col}" stroke-width="1"/><rect x="${x-bw/2}" y="${Y(Math.max(c.o,c.c))}" width="${bw}" height="${Math.max(1,Math.abs(Y(c.o)-Y(c.c)))}" fill="${up?col:col}" ${up?'fill-opacity=".85"':''}/>`}
  // son fiyat etiketi
  const lp=all[all.length-1].c;svg+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(lp)}" y2="${Y(lp)}" stroke="var(--muted)" stroke-dasharray="2 3" stroke-width=".8"/><rect x="${W-pr+2}" y="${Y(lp)-9}" width="${pr-4}" height="18" rx="4" fill="var(--text)"/><text x="${W-pr+6}" y="${Y(lp)+4}" style="fill:var(--bg);font:600 11px var(--mono)">${esc(fmt(lp))}</text>`;
  if(fut)svg+=`<line x1="${X(all.length)-cw/2}" x2="${X(all.length)-cw/2}" y1="${main.y}" y2="${main.y+main.h}" stroke="var(--line2)" stroke-dasharray="4 4"/><text class="ax" x="${X(all.length)+4}" y="${main.y+12}">26 gün ileri bulut</text>`;
  // alt paneller
  const sub=(p,series,opt)=>{let lo=opt.lo,hi=opt.hi;if(hi==null&&lo!=null){hi=-Infinity;series.forEach(s=>{for(let i=start;i<all.length;i++){const v=s.a[i];if(v!=null)hi=Math.max(hi,v)}});hi=hi*1.08||1}if(lo==null){lo=Infinity;hi=-Infinity;series.forEach(s=>{for(let i=start;i<all.length;i++){const v=s.a[i];if(v!=null){lo=Math.min(lo,v);hi=Math.max(hi,v)}}});if(opt.zero){lo=Math.min(lo,0);hi=Math.max(hi,0)}const pd=(hi-lo)*.08||1;lo-=pd;hi+=pd}
    const Yp=v=>p.y+(1-(v-lo)/(hi-lo))*p.h;let g=`<rect x="${pl}" y="${p.y}" width="${W-pl-pr}" height="${p.h}" fill="none" stroke="var(--line)" rx="4"/><text class="ax" x="${pl+6}" y="${p.y+13}" style="fill:var(--muted)">${esc(opt.title)}</text>`;
    (opt.lines||[]).forEach(v=>{g+=`<line x1="${pl}" x2="${W-pr}" y1="${Yp(v)}" y2="${Yp(v)}" stroke="var(--line2)" stroke-dasharray="3 3"/><text class="ax" x="${W-pr+6}" y="${Yp(v)+4}">${v}</text>`});
    if(opt.band)g+=`<rect x="${pl}" y="${Yp(opt.band[1])}" width="${W-pl-pr}" height="${Yp(opt.band[0])-Yp(opt.band[1])}" fill="rgba(139,123,255,.06)"/>`;
    series.forEach(s=>{if(s.bars){for(let i=start;i<all.length;i++){const v=s.a[i];if(v==null)continue;const y0=Yp(s.base??0),y1=Yp(v);const c=s.color?s.color(i,v):(v>=0?'var(--up)':'var(--down)');g+=`<rect x="${X(i)-bw/2}" y="${Math.min(y0,y1)}" width="${bw}" height="${Math.max(1,Math.abs(y1-y0))}" fill="${c}" opacity="${s.op||.6}"/>`}}
      else{let d='';for(let i=start;i<all.length;i++){const v=s.a[i];if(v==null)continue;d+=`${d?'L':'M'}${X(i).toFixed(1)},${Yp(v).toFixed(1)}`}g+=`<path d="${d}" fill="none" stroke="${s.c}" stroke-width="1.4"/>`}});
    const lastV=series.find(s=>!s.bars);if(lastV&&lastV.a[all.length-1]!=null)g+=`<text class="ax" x="${W-pr+6}" y="${p.y+p.h-4}" style="fill:${lastV.c}">${nf(lastV.a[all.length-1]/(opt.scale||1),opt.scale?1:(opt.dec??1))}</text>`;
    return g};
  panels.slice(1).forEach(p=>{
    if(p.k==='vol'){const v=all.map(x=>x.v||null);const va=smaS(all.map(x=>x.v||0),20);svg+=sub(p,[{a:v,bars:true,base:0,color:i=>all[i].c>=all[i].o?'var(--up)':'var(--down)',op:.45},{a:va,c:'var(--muted)'}],{title:'Hacim · 20 gün ort. (mn)',lo:0,dec:0,scale:1e6})}
    if(p.k==='rsi')svg+=sub(p,[{a:R,c:'#ffd35c'}],{title:'RSI (14)',lo:0,hi:100,lines:[30,70],band:[30,70],dec:0});
    if(p.k==='macd')svg+=sub(p,[{a:M.h,bars:true,base:0,op:.55},{a:M.m,c:'#5cd3ff'},{a:M.sig,c:'#ff9f5c'}],{title:'MACD (12, 26, 9)',zero:true,dec:2});
    if(p.k==='stoch')svg+=sub(p,[{a:SK.k,c:'#5cd3ff'},{a:SK.d,c:'#ff9f5c'}],{title:'Stokastik (14, 3, 3)',lo:0,hi:100,lines:[20,80],band:[20,80],dec:0});
    if(p.k==='adx'){const AD=adxS(all);svg+=sub(p,[{a:AD.adx,c:'#e7c6ff'},{a:AD.pdi,c:'#2fe39a'},{a:AD.mdi,c:'#ff5d7a'}],{title:'ADX (14) · +DI yeşil / −DI kırmızı',lo:0,hi:Math.max(50,...AD.adx.filter(x=>x!=null).slice(-300)),lines:[25],dec:0})}
  });
  // x ekseni
  const dates=all.map(x=>x.d).concat(fdates);const nx=Math.max(3,Math.floor((W-pl-pr)/120));
  for(let k=0;k<nx;k++){const i=start+Math.round(k/(nx-1)*(N-1));const d=dates[i];if(!d)continue;svg+=`<text class="ax" x="${X(i)}" y="${H-6}" text-anchor="middle">${new Date(d+'T12:00:00Z').toLocaleDateString('tr-TR',{day:'numeric',month:'short'})}</text>`}
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" style="height:${H}px">${svg}<g class="hov" style="display:none"><line class="vl" y1="0" y2="${H-20}" stroke="var(--muted)" stroke-dasharray="3 3"/><line class="hl" x1="${pl}" x2="${W-pr}" stroke="var(--muted)" stroke-dasharray="3 3"/></g><rect class="ov" x="${pl}" y="0" width="${W-pl-pr}" height="${H-20}" fill="transparent"/></svg><div class="tip ttip" hidden></div>`;
  el.style.height=H+'px';
  const s=el.querySelector('svg'),hov=s.querySelector('.hov'),tip=el.querySelector('.tip');
  const mv=ev=>{const r=s.getBoundingClientRect();const cx=((ev.touches?ev.touches[0].clientX:ev.clientX)-r.left)*W/r.width,cy=((ev.touches?ev.touches[0].clientY:ev.clientY)-r.top)*H/r.height;
    const i=Math.max(start,Math.min(all.length+fut-1,Math.floor((cx-pl)/cw)+start));hov.style.display='';hov.querySelector('.vl').setAttribute('x1',X(i));hov.querySelector('.vl').setAttribute('x2',X(i));
    const hl=hov.querySelector('.hl');if(cy>=main.y&&cy<=main.y+main.h){hl.style.display='';hl.setAttribute('y1',cy);hl.setAttribute('y2',cy)}else hl.style.display='none';
    const c=all[i];let h=`<div class="d">${esc(trDate((c?c.d:dates[i])+'T12:00:00Z',{weekday:'short',day:'numeric',month:'long',year:'numeric'}))}</div>`;
    if(c)h+=`<div class="li"><span>Açılış</span><b>${esc(fmt(c.o))}</b></div><div class="li"><span>Yüksek</span><b>${esc(fmt(c.h))}</b></div><div class="li"><span>Düşük</span><b>${esc(fmt(c.l))}</b></div><div class="li"><span>Kapanış</span><b class="${c.c>=c.o?'up':'down'}">${esc(fmt(c.c))}</b></div>`;
    if(I){[['Tenkan',I.T[i],'#5cd3ff'],['Kijun',I.K[i],'#ff9f5c'],['Senkou A',I.A[i],'#2fe39a'],['Senkou B',I.B[i],'#ff5d7a']].forEach(([n,v,cc])=>{if(v!=null)h+=`<div class="li"><span><i style="background:${cc}"></i>${n}</span><b>${esc(fmt(v))}</b></div>`})}
    if(B&&B.up[i]!=null)h+=`<div class="li"><span><i style="background:#8b7bff"></i>Bollinger</span><b>${esc(fmt(B.lo[i]))}–${esc(fmt(B.up[i]))}</b></div>`;
    if(R&&R[i]!=null)h+=`<div class="li"><span><i style="background:#ffd35c"></i>RSI</span><b>${nf(R[i],0)}</b></div>`;
    if(M&&M.m[i]!=null)h+=`<div class="li"><span><i style="background:#5cd3ff"></i>MACD</span><b>${nf(M.m[i],2)} / ${nf(M.sig[i],2)}</b></div>`;
    if(SK&&SK.k[i]!=null)h+=`<div class="li"><span><i style="background:#5cd3ff"></i>Stok. %K/%D</span><b>${nf(SK.k[i],0)} / ${nf(SK.d[i],0)}</b></div>`;
    if(c&&c.v)h+=`<div class="li"><span>Hacim</span><b>${nf(c.v/1e6,2)} mn</b></div>`;
    tip.innerHTML=h;tip.hidden=false;const px=X(i)/W*r.width;const left=px>r.width/2?px-16:px+16;tip.style.left=left+'px';tip.style.top='8px';tip.style.transform=px>r.width/2?'translateX(-100%)':'none';tip.style.marginTop='0'};
  s.addEventListener('mousemove',mv);s.addEventListener('touchmove',mv,{passive:true});s.addEventListener('mouseleave',()=>{hov.style.display='none';tip.hidden=true});
}

/* ---------- enstrüman sayfası: teknik analiz kartı ---------- */
function techSection(t){
  if(!S.ohlc||!(S.ohlc[t]||[]).length)return '';const st=indState();const sg=techSignals(t);const rg=S.range.tech||'6A';
  const leg=st.ichi?`<div class="leg"><span><i style="background:#5cd3ff"></i>Tenkan (9)</span><span><i style="background:#ff9f5c"></i>Kijun (26)</span><span><i style="background:rgba(47,227,154,.5)"></i>Bulut (Senkou A/B)</span><span><i style="background:#c792ff"></i>Chikou</span></div>`:'';
  const legS=st.sma?`<div class="leg"><span><i style="background:#ffd35c"></i>20G</span><span><i style="background:#5cd3ff"></i>50G</span><span><i style="background:#ff6fd0"></i>200G</span></div>`:'';
  return `<section class="card sec"><div class="th"><h3 style="margin:0">Teknik analiz${S.techBig?'':` <a class="lnk3" href="#/teknik/grafik/${encodeURIComponent(t)}">Teknik panelde aç ↗</a>`}</h3><div class="ranges" data-k="tech" style="margin:0">${(S.techBig?['1A','3A','6A','1Y']:['3A','6A','1Y']).map(r=>`<button data-r="${r}" class="${rg===r?'on':''}">${r}</button>`).join('')}</div></div>
  <div class="indt" id="indT">${Object.entries(IND_DEF).map(([k,n])=>`<button data-ind="${k}" class="${st[k]?'on':''}">${n}</button>`).join('')}</div>${leg}${legS}
  <div class="grid tgm"><div class="chart tchart" id="cTech"></div>${sg?`<aside class="sigs">
    <div class="sig-h ${sg.ichi.cls}"><span>Ichimoku görünümü</span><b>${esc(sg.ichi.label)}</b><div class="sc">${[-5,-4,-3,-2,-1,0,1,2,3,4,5].map(v=>`<i class="${v===sg.ichi.score?'on':''} ${v>0?'p':v<0?'n':''}"></i>`).join('')}</div></div>
    ${sg.ichi.checks.map(c=>`<div class="ck"><span>${esc(c.k)}</span><b class="${c.s>0?'up':c.s<0?'down':''}">${c.s>0?'▲':c.s<0?'▼':'■'} ${esc(c.v)}</b></div>`).join('')}
    <div class="ck"><span>Bulut aralığı</span><b class="num">${pxf(t,sg.ichi.cloudBot)} – ${pxf(t,sg.ichi.cloudTop)}</b></div>
    <div class="ck"><span>Kijun (destek/direnç)</span><b class="num">${pxf(t,sg.ichi.kijun)}</b></div>
    ${sg.ichi.lastCross?`<div class="ck"><span>Son TK kesişimi</span><b class="${sg.ichi.lastCross.up?'up':'down'}">${sg.ichi.lastCross.up?'Yukarı':'Aşağı'} · ${sg.ichi.lastCross.ago?sg.ichi.lastCross.ago+" gün önce":"bugün"}</b></div>`:''}
    <div class="sig-sep"></div>
    <div class="ck"><span>RSI (14)</span><b class="${sg.rsi>=70?'down':sg.rsi<=30?'up':''}">${nf(sg.rsi,0)} ${sg.rsi>=70?'· aşırı alım':sg.rsi<=30?'· aşırı satım':''}</b></div>
    <div class="ck"><span>MACD</span><b class="${sg.macd.h>0?'up':'down'}">${sg.macd.h>0?'Sinyalin üstünde':'Sinyalin altında'}${sg.macd.cross?' · bugün '+sg.macd.cross:''}${!sg.macd.cross?(sg.macd.rising?' · ivme artıyor':' · ivme azalıyor'):''}</b></div>
    <div class="ck"><span>Bollinger %B</span><b class="${sg.boll.pb>1?'down':sg.boll.pb<0?'up':''}">${nf(sg.boll.pb*100,0)}% ${sg.boll.pb>1?'· üst bandın dışında':sg.boll.pb<0?'· alt bandın dışında':''}</b></div>
    ${sg.boll.squeeze?`<div class="ck"><span>Bollinger sıkışması</span><b class="warn">Bantlar 6 ayın en darı · sert hareket öncesi olabilir</b></div>`:''}
    <div class="ck"><span>Stokastik %K / %D</span><b class="${sg.stoch.k>=80?'down':sg.stoch.k<=20?'up':''}">${nf(sg.stoch.k,0)} / ${nf(sg.stoch.d,0)}</b></div>
    <div class="ck"><span>ATR (14) · günlük oynaklık</span><b>${pxf(t,sg.atr)} · %${nf(sg.atrPct,1)}</b></div>
    ${sg.volRatio?`<div class="ck"><span>Hacim / 20 gün ort.</span><b class="${sg.volRatio>1.5?'warn':''}">${nf(sg.volRatio,1)}×</b></div>`:''}
    <p class="muted" style="font-size:12px;margin:10px 0 0;line-height:1.5">Göstergeler geçmiş fiyattan hesaplanır, geleceği garanti etmez; tek başına alım-satım kararı için kullanılmamalı.</p>
  </aside>`:''}</div></section>`;
}
function afterTech(t){const el=$('#cTech');if(el)techChart(el,t,S.range.tech||'6A');
  $$('#indT button').forEach(b=>b.onclick=()=>{const st=indState();st[b.dataset.ind]=!st[b.dataset.ind];saveInd();render(false)})}

/* ---------- teknik tarama (Analiz) ---------- */
function viewScreener(){
  if(!S.ohlc)return '';const ts=allTickers().filter(t=>(S.ohlc[t]||[]).length>=60);
  const rows=ts.map(t=>({t,s:techSignals(t),x:tech(t)})).filter(r=>r.s);
  const cell=(v,c,title)=>`<td class="sc-c ${c}" title="${esc(title||'')}">${v}</td>`;
  return `<div class="sec-t"><div><h2>Teknik tarama</h2><p>Tüm enstrümanların göstergeleri tek tabloda · satıra tıkla, grafiği aç</p></div></div>
  <section class="card"><div class="tscroll"><table class="tbl scr"><thead><tr><th>Enstrüman</th><th>Ichimoku</th><th>Bulut</th><th>TK</th><th>Trend (50/200)</th><th class="r">RSI</th><th>MACD</th><th class="r">Bollinger %B</th><th class="r">Stok. %K</th><th class="r">ATR %</th><th class="r">Hacim</th></tr></thead><tbody>
  ${rows.map(({t,s,x})=>`<tr onclick="location.hash='#/teknik/grafik/${t}'" style="cursor:pointer"><td><div class="sym">${logo(t)}<b>${esc(dispT(t))}</b>${inst(t)&&inst(t).watchlist?' <span class="tag">izleme</span>':''}</div></td>
    ${cell(`${esc(s.ichi.label)} <span class="dim">${s.ichi.score>0?'+':''}${s.ichi.score}</span>`,s.ichi.cls)}
    ${cell(s.ichi.cloudPos>0?'Üstünde':s.ichi.cloudPos<0?'Altında':'İçinde',s.ichi.cloudPos>0?'up':s.ichi.cloudPos<0?'down':'')}
    ${cell(s.ichi.checks[1].s>0?'▲':'▼',s.ichi.checks[1].s>0?'up':'down',s.ichi.lastCross?`Son kesişim ${s.ichi.lastCross.ago} gün önce`:'')}
    ${cell(x?esc(x.trend):'—',x?x.tc:'')}
    ${cell(nf(s.rsi,0),s.rsi>=70?'down':s.rsi<=30?'up':'')}
    ${cell(s.macd.h>0?'Pozitif':'Negatif',s.macd.h>0?'up':'down',s.macd.cross||'')}
    ${cell(nf(s.boll.pb*100,0)+'%'+(s.boll.squeeze?' ⚡':''),s.boll.pb>1?'down':s.boll.pb<0?'up':'',s.boll.squeeze?'Bollinger sıkışması':'')}
    ${cell(nf(s.stoch.k,0),s.stoch.k>=80?'down':s.stoch.k<=20?'up':'')}
    ${cell('%'+nf(s.atrPct,1),'')}
    ${cell(s.volRatio?nf(s.volRatio,1)+'×':'—',s.volRatio>1.5?'warn':'')}</tr>`).join('')}
  </tbody></table></div><p class="muted" style="font-size:12.5px;margin:10px 0 0">Ichimoku skoru 5 kontrolün toplamı (fiyat–bulut, Tenkan–Kijun, gelecek bulut rengi, Chikou, fiyat–Kijun). RSI ve Stokastik'te kırmızı: aşırı alım, yeşil: aşırı satım. ⚡: Bollinger sıkışması.</p></section>`;
}
