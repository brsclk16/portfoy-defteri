/* Portföy Defteri — statik site (GitHub Pages) + Supabase (pozisyonlar) */
"use strict";
const SUPA_URL = 'https://etwanruohujctvkjvxzw.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0d2FucnVvaHVqY3R2a2p2eHp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTA0NzAsImV4cCI6MjA5Nzc4NjQ3MH0.aErGOAe7s7Ge5Nq5tRXi0EhOOU23EpCC4cCpth_oPsU';

const COLORS = {SMH:'#b8f25c',SOXX:'#8b7bff',AMD:'#ff6b6b',CRDO:'#ff6fd0',VRT:'#2fe39a',DELL:'#4d9bff',XBI:'#5cd3ff',AGNG:'#ffa45c',COPX:'#e58b5a',IAU:'#ffd35c',SLV:'#c6ceda'};
const THEMES = [
  {name:'Yarı iletken', t:['SMH','SOXX','AMD','CRDO'], c:'#b8f25c'},
  {name:'AI altyapı', t:['VRT','DELL'], c:'#4d9bff'},
  {name:'Biyotek & sağlık', t:['XBI','AGNG'], c:'#5cd3ff'},
  {name:'Değerli metal', t:['IAU','SLV'], c:'#ffd35c'},
  {name:'Sanayi metali', t:['COPX'], c:'#e58b5a'}
];
const ORDER = ['SMH','SOXX','AMD','CRDO','VRT','DELL','XBI','AGNG','COPX','IAU','SLV'];
const IMPACT = {olumlu:'Olumlu',olumsuz:'Olumsuz',karisik:'Karışık',notr:'Nötr'};
const KIND = {bilanco:'Bilanço',makro:'Makro',fed:'Fed',politika:'Politika',fda:'FDA',etkinlik:'Etkinlik'};

const S = {
  data:null, prices:null, hist:{}, live:{}, fx:null, fxSrc:'',
  ccy: lsGet('pd_ccy') || 'USD',
  lots: lsJSON('pd_lots', []),
  settings: lsJSON('pd_settings', {targets:{}, tdKey:''}),
  session:null, liveBusy:false, liveAt:0, liveErr:'',
  range:{hero:'1Y', inst:'1Y', perf:'YTD'}, newsFilter:'ALL', perfSel:null
};

/* ---------- utils ---------- */
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function lsJSON(k,d){try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}}
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isNum = v => typeof v==='number' && isFinite(v);
function nf(v,d=2){return isNum(v)?v.toLocaleString('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—'}
function fx(){return S.fx||0}
function conv(usd){return S.ccy==='TRY'&&fx()? usd*fx() : usd}
function sym(){return S.ccy==='TRY'&&fx()?'₺':'$'}
function money(usd,d=2){if(!isNum(usd))return '—';const v=conv(usd);return (v<0?'−':'')+sym()+nf(Math.abs(v),d)}
function smoney(usd,d=2){if(!isNum(usd))return '—';const v=conv(usd);return (v>0?'+':v<0?'−':'')+sym()+nf(Math.abs(v),d)}
function usd(v,d=2){return isNum(v)?'$'+nf(v,d):'—'}
function pct(v,d=2,sign=true){if(!isNum(v))return '—';return (sign&&v>0?'+':v<0?'−':'')+'%'+nf(Math.abs(v),d)}
function cls(v){return !isNum(v)||v===0?'':v>0?'up':'down'}
function chip(v,d=2){return `<span class="chip ${cls(v)||'n'}">${v>0?'▲':v<0?'▼':''} ${pct(v,d)}</span>`}
function trDate(s,opt){const d=new Date(s);return isNaN(d)?'—':d.toLocaleDateString('tr-TR',opt||{day:'2-digit',month:'short',year:'numeric'})}
function trDT(s){const d=new Date(s);return isNaN(d)?'—':d.toLocaleString('tr-TR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
function ago(s){const t=new Date(s).getTime();if(!t)return '';const m=Math.round((Date.now()-t)/60000);if(m<1)return 'az önce';if(m<60)return m+' dk önce';const h=Math.round(m/60);if(h<48)return h+' sa önce';return Math.round(h/24)+' gün önce'}
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2600)}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function color(t){return COLORS[t]||'#9aa6b8'}
function logo(t,size){const c=color(t);return `<span class="logo" style="background:${c}${size?`;width:${size}px;height:${size}px`:''}">${esc(t.replace('.B','').slice(0,4))}</span>`}

/* ---------- market clock ---------- */
function nyNow(){const s=new Date().toLocaleString('en-US',{timeZone:'America/New_York'});return new Date(s)}
function marketState(){
  const n=nyNow(),d=n.getDay(),m=n.getHours()*60+n.getMinutes();
  const open = d>0&&d<6&&m>=570&&m<960;
  let msg;
  if(open){const r=960-m;msg=`ABD piyasası açık · kapanışa ${Math.floor(r/60)}s ${r%60}dk`}
  else{
    let add=0,dd=d,mm=m;
    // minutes until next 09:30 ET on a weekday
    let mins = (mm<570&&dd>0&&dd<6)?570-mm:(1440-mm)+570;
    dd=(dd+ (mm<570&&dd>0&&dd<6?0:1))%7;
    while(dd===0||dd===6){mins+=1440;dd=(dd+1)%7}
    add=mins;
    const h=Math.floor(add/60);msg=`ABD piyasası kapalı · açılışa ${h>=24?Math.floor(h/24)+'g '+(h%24)+'s':h+'s '+(add%60)+'dk'}`;
  }
  return {open,msg};
}

/* ---------- data access ---------- */
function inst(t){return S.data&&S.data.instruments[t]}
function allTickers(){return tickers().concat(Object.values(S.data.instruments).filter(i=>i.watchlist).map(i=>i.ticker)).concat(((S.watch&&S.watch.tickers)||[]).map(w=>w.t).filter(t=>!S.data.instruments[t]))}
function tickers(){const all=Object.keys(S.data.instruments).filter(t=>!S.data.instruments[t].watchlist);return ORDER.filter(t=>all.includes(t)).concat(all.filter(t=>!ORDER.includes(t)).sort())}
function quote(t){
  const i=inst(t)||{}, p=(S.prices&&S.prices.quotes[t])||{}, l=S.live[t];
  const base={price:p.price??i.price, chg:p.chg??i.dayChange, pct:p.pct??i.dayChangePct, day:p.day||(i.priceAsOf||'').slice(0,10), hi52:p.hi52??i.high52, lo52:p.lo52??i.low52, src:S.prices?S.prices.source:''};
  if(l&&l.price>0&&(!base.day||l.day>=base.day)) return {...base,...l,src:'Twelve Data (canlı)'};
  return base;
}
function series(t){
  const h=(S.hist[t]||[]).slice(); const q=quote(t);
  if(q.price>0&&q.day){ if(h.length&&h[h.length-1][0]===q.day) h[h.length-1]=[q.day,q.price]; else if(!h.length||q.day>h[h.length-1][0]) h.push([q.day,q.price]); }
  return h;
}
function rangeStart(r,last){
  const d=new Date(last+'T00:00:00Z');
  if(r==='1A')d.setUTCMonth(d.getUTCMonth()-1);
  else if(r==='3A')d.setUTCMonth(d.getUTCMonth()-3);
  else if(r==='6A')d.setUTCMonth(d.getUTCMonth()-6);
  else if(r==='YTD')return last.slice(0,4)+'-01-01';
  else d.setUTCFullYear(d.getUTCFullYear()-1);
  return d.toISOString().slice(0,10);
}
function sliceRange(pts,r){if(!pts.length)return pts;const s=rangeStart(r,pts[pts.length-1][0]);let i=pts.findIndex(p=>p[0]>=s);if(r==='YTD'){i=Math.max(0,i-1)}return pts.slice(Math.max(0,i))}
function perf(t,r){const s=sliceRange(series(t),r);if(s.length<2)return null;return (s[s.length-1][1]/s[0][1]-1)*100}
function ytd(t){const i=inst(t)||{},q=quote(t);if(i.ytdBase>0&&q.price>0)return (q.price/i.ytdBase-1)*100;return perf(t,'YTD')}
function pos52(t){const q=quote(t);if(!(q.hi52>q.lo52))return null;return Math.max(0,Math.min(1,(q.price-q.lo52)/(q.hi52-q.lo52)))}
function pegTxt(i){return i&&i.peg?String(i.peg.value).replace(/^~/,'≈'):'—'}
function pegNum(t){const p=inst(t)&&inst(t).peg;if(!p)return null;const v=parseFloat(String(p.value).replace('~','').replace(',','.'));return isFinite(v)?v:null}
function sig(t){return S.data.signals&&S.data.signals[t]}
function upside(t){const s=sig(t),q=quote(t);if(!s||!(s.target>0)||!(q.price>0))return null;return (s.target/q.price-1)*100}

/* ---------- portfolio math ---------- */
function positions(){
  const map={};
  const lots=S.lots.slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  for(const l of lots){
    const t=l.t; const m=map[t]||(map[t]={t,qty:0,cost:0,costTRY:0,realized:0,realizedTRY:0,first:l.date,n:0});
    const q=+l.q,rate=+l.fx||fx()||0,tq=isTRY(t)?(rate||1):1,p=+l.p/tq,fee=(+l.fee||0)/tq; m.n++;
    if(l.side==='S'){
      if(m.qty<=0)continue; const qq=Math.min(q,m.qty); const avg=m.cost/m.qty, avgT=m.costTRY/m.qty;
      m.realized+=qq*(p-avg)-fee; m.realizedTRY+=qq*(p*rate-avgT)-fee*rate;
      m.cost-=avg*qq; m.costTRY-=avgT*qq; m.qty-=qq;
    }else{ m.qty+=q; m.cost+=q*p+fee; m.costTRY+=(q*p+fee)*rate; }
  }
  const out=[];let total=0;
  for(const m of Object.values(map)){
    const qt=quote(m.t); const cv=isTRY(m.t)&&fx()?fx():1; m.price=qt.price/cv; m.value=m.qty*(qt.price||0); m.avg=m.qty>0?m.cost/m.qty:0;
    m.pnl=m.value-m.cost; m.pnlPct=m.cost>0?m.pnl/m.cost*100:null; m.day=m.qty*(qt.chg||0)/cv; m.dayPct=qt.pct;
    m.pnlTRY = fx()? m.value*fx()-m.costTRY : null;
    total+=m.value; out.push(m);
  }
  out.forEach(m=>m.w=total>0?m.value/total*100:0);
  out.sort((a,b)=>b.value-a.value);
  return {list:out,total};
}
function totals(P){
  const o={value:0,cost:0,day:0,realized:0,realizedTRY:0,pnlTRY:0,costTRY:0};
  P.list.forEach(m=>{o.value+=m.value;o.cost+=m.cost;o.day+=m.day;o.realized+=m.realized;o.realizedTRY+=m.realizedTRY;o.costTRY+=m.costTRY;if(m.pnlTRY!=null)o.pnlTRY+=m.pnlTRY});
  o.pnl=o.value-o.cost;o.pnlPct=o.cost>0?o.pnl/o.cost*100:null;o.dayPct=o.value-o.day>0?o.day/(o.value-o.day)*100:null;return o;
}
function modelWeights(){
  const T=S.settings.targets||{}; const ts=tickers(); const sum=ts.reduce((a,t)=>a+(+T[t]||0),0);
  const w={}; ts.forEach(t=>w[t]=sum>0?(+T[t]||0)/sum*100:100/ts.length); return {w,src:sum>0?'hedef ağırlıklar':'eşit ağırlık'};
}
function weights(){const P=positions();if(P.total>0){const w={};P.list.forEach(m=>{if(m.value>0)w[m.t]=m.w});return {w,src:'gerçek pozisyonlar',real:true}}return modelWeights()}
function portfolioSeries(){
  const P=positions(); const dates=series('SMH').map(p=>p[0]);
  if(P.total>0){
    const lots=S.lots.slice().sort((a,b)=>a.date<b.date?-1:1); const first=lots[0].date;
    const idx={}; tickers().forEach(t=>{idx[t]=new Map(series(t))});
    const lastPx={}; const out=[];
    for(const d of dates){
      if(d<first)continue; let v=0;
      const held={}; for(const l of lots){ if(l.date>d)break; held[l.t]=(held[l.t]||0)+(l.side==='S'?-l.q:+l.q); }
      for(const t in held){ let px=idx[t]&&idx[t].get(d); if(px&&isTRY(t))px=px/(fxAt(d)||1); if(px)lastPx[t]=px; v+=held[t]*(lastPx[t]||+(lots.find(l=>l.t===t)||{}).p||0); }
      out.push([d,v]);
    }
    return {pts:out,real:true};
  }
  // model: $10.000, 1 yıl önce, ağırlıklara göre (al ve tut)
  const {w}=modelWeights(); const start=dates[0]; const units={};
  tickers().forEach(t=>{const s=series(t);const p0=s.find(p=>p[0]>=start);if(p0)units[t]=10000*w[t]/100/p0[1]});
  const idx={};tickers().forEach(t=>idx[t]=new Map(series(t)));const last={};
  const pts=dates.map(d=>{let v=0;for(const t in units){const px=idx[t].get(d);if(px)last[t]=px;v+=units[t]*(last[t]||0)}return [d,v]});
  return {pts,real:false};
}
function exposure(){
  const {w,src}=weights(); const ex={};
  for(const t in w){const i=inst(t);if(!i)continue;
    if(i.holdings&&i.holdings.length){i.holdings.forEach(h=>{const k=h.t||h.n;(ex[k]||(ex[k]={t:h.t,n:h.n,w:0,via:[]})).w+=w[t]*h.w/100;ex[k].via.push(t)})}
    else if(/hisse/i.test(i.type||'')){(ex[t]||(ex[t]={t,n:i.name,w:0,via:[]})).w+=w[t];ex[t].via.push('doğrudan')}
  }
  return {list:Object.values(ex).sort((a,b)=>b.w-a.w),src};
}

/* ---------- SVG charts ---------- */
function niceTicks(min,max,n=4){const span=max-min||Math.abs(max)||1;const step0=span/n;const mag=Math.pow(10,Math.floor(Math.log10(step0)));const st=[1,2,2.5,5,10].map(x=>x*mag).find(x=>x>=step0);const lo=Math.floor(min/st)*st,hi=Math.ceil(max/st)*st;const out=[];for(let v=lo;v<=hi+st/2;v+=st)out.push(+v.toFixed(10));return out}
function spark(pts,w=96,h=30,col){
  if(!pts||pts.length<2)return `<svg class="spark" viewBox="0 0 ${w} ${h}"></svg>`;
  const ys=pts.map(p=>p[1]),mn=Math.min(...ys),mx=Math.max(...ys),r=mx-mn||1;
  const d=pts.map((p,i)=>`${i?'L':'M'}${(i/(pts.length-1)*w).toFixed(1)},${(h-2-(p[1]-mn)/r*(h-4)).toFixed(1)}`).join('');
  const c=col||(ys[ys.length-1]>=ys[0]?'var(--up)':'var(--down)');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}
/* lineChart: seriler [{name,color,pts:[[date,val]]}], opts {fmt, area, pct} */
function lineChart(el,list,opts={}){
  el.innerHTML='';
  const W=el.clientWidth||600,H=el.clientHeight||260,pl=8,pr=58,pt=12,pb=26;
  list=list.filter(s=>s.pts&&s.pts.length>1);
  if(!list.length){el.innerHTML='<div class="empty">Grafik için veri yok</div>';return}
  const dates=Array.from(new Set(list.flatMap(s=>s.pts.map(p=>p[0])))).sort();
  const xi=new Map(dates.map((d,i)=>[d,i]));
  const all=list.flatMap(s=>s.pts.map(p=>p[1]));let mn=Math.min(...all),mx=Math.max(...all);
  if(opts.pct){mn=Math.min(mn,0);mx=Math.max(mx,0)}
  const pad=(mx-mn)*.08||1;mn-=pad;mx+=pad;
  const X=i=>pl+(dates.length>1?i/(dates.length-1):0)*(W-pl-pr), Y=v=>pt+(1-(v-mn)/(mx-mn))*(H-pt-pb);
  const fmt=opts.fmt||(v=>nf(v,2));
  let g='';
  niceTicks(mn,mx,4).forEach(v=>{if(v<mn||v>mx)return;g+=`<line class="gridl" x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${W-pr+8}" y="${Y(v)+4}">${esc(fmt(v,true))}</text>`});
  if(opts.pct)g+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line2)"/>`;
  const nx=Math.min(6,Math.max(2,Math.floor((W-pl-pr)/110)));
  for(let k=0;k<nx;k++){const i=Math.round(k/(nx-1)*(dates.length-1));const d=new Date(dates[i]+'T12:00:00Z');g+=`<text x="${X(i)}" y="${H-6}" text-anchor="${k===0?'start':k===nx-1?'end':'middle'}">${d.toLocaleDateString('tr-TR',{day:'numeric',month:'short'})}</text>`}
  let paths='',defs='';
  list.forEach((s,si)=>{
    const d=s.pts.map((p,i)=>`${i?'L':'M'}${X(xi.get(p[0])).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
    if(opts.area&&list.length===1){const id='ga'+Math.random().toString(36).slice(2,7);defs+=`<linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".32"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`;
      paths+=`<path d="${d}L${X(xi.get(s.pts[s.pts.length-1][0]))},${H-pb}L${X(xi.get(s.pts[0][0]))},${H-pb}Z" fill="url(#${id})"/>`}
    paths+=`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${list.length>1?1.8:2.2}" stroke-linejoin="round" stroke-linecap="round"/>`;
    const lp=s.pts[s.pts.length-1];paths+=`<circle cx="${X(xi.get(lp[0]))}" cy="${Y(lp[1])}" r="3.5" fill="${s.color}"/>`;
  });
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}"><defs>${defs}</defs><g class="axis">${g}</g>${paths}<g class="hov" style="display:none"><line y1="${pt}" y2="${H-pb}" stroke="var(--muted)" stroke-dasharray="3 3"/></g><rect x="${pl}" y="0" width="${W-pl-pr}" height="${H}" fill="transparent"/></svg><div class="tip" hidden></div>`;
  const svg=el.querySelector('svg'),hov=svg.querySelector('.hov'),tip=el.querySelector('.tip'),line=hov.querySelector('line');
  const maps=list.map(s=>new Map(s.pts));
  const move=ev=>{
    const r=svg.getBoundingClientRect();const cx=((ev.touches?ev.touches[0].clientX:ev.clientX)-r.left)*W/r.width;
    const i=Math.max(0,Math.min(dates.length-1,Math.round((cx-pl)/(W-pl-pr)*(dates.length-1))));const d=dates[i];
    hov.style.display='';line.setAttribute('x1',X(i));line.setAttribute('x2',X(i));
    $$('.dot',hov).forEach(n=>n.remove());
    let rows='';let ty=H;
    list.forEach((s,k)=>{const v=maps[k].get(d);if(v==null)return;const y=Y(v);ty=Math.min(ty,y);
      const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('class','dot');c.setAttribute('cx',X(i));c.setAttribute('cy',y);c.setAttribute('r',4);c.setAttribute('fill',s.color);c.setAttribute('stroke','var(--panel)');c.setAttribute('stroke-width',2);hov.appendChild(c);
      rows+=`<div class="li"><span><i style="background:${s.color}"></i>${esc(s.name)}</span><b>${esc(fmt(v))}</b></div>`});
    tip.innerHTML=`<div class="d">${trDate(d+'T12:00:00Z',{day:'numeric',month:'long',year:'numeric'})}</div>${rows}`;tip.hidden=false;
    const px=X(i)/W*r.width;tip.style.left=Math.max(80,Math.min(r.width-80,px))+'px';tip.style.top=Math.max(40,ty/H*r.height)+'px';
  };
  svg.addEventListener('mousemove',move);svg.addEventListener('touchmove',move,{passive:true});
  svg.addEventListener('mouseleave',()=>{hov.style.display='none';tip.hidden=true});
}
function donut(parts,size=170){
  const tot=parts.reduce((a,p)=>a+p.v,0)||1;const R=size/2,r=R-18;let a0=-Math.PI/2,out='';
  parts.forEach(p=>{if(p.v<=0)return;const a1=a0+p.v/tot*Math.PI*2;const large=a1-a0>Math.PI?1:0;
    const x0=R+r*Math.cos(a0),y0=R+r*Math.sin(a0),x1=R+r*Math.cos(a1-0.0001),y1=R+r*Math.sin(a1-0.0001);
    out+=`<path d="M${x0},${y0}A${r},${r} 0 ${large} 1 ${x1},${y1}" stroke="${p.c}" stroke-width="22" fill="none"><title>${esc(p.name)} ${nf(p.v/tot*100,1)}%</title></path>`;a0=a1});
  return `<svg class="donut" viewBox="0 0 ${size} ${size}">${out}</svg>`;
}
function heatBg(p){if(!isNum(p))return 'var(--panel2)';const a=Math.min(.9,.14+Math.abs(p)/4*.76);return p>=0?`rgba(47,227,154,${a})`:`rgba(255,93,122,${a})`}

/* ---------- auth / Supabase ---------- */
function jwtExp(tok){try{return JSON.parse(atob(tok.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp*1000}catch(e){return 0}}
function storeSession(s){S.session=s;lsSet('pd_session',JSON.stringify(s))}
async function refreshSession(rt){
  const r=await fetch(SUPA_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SUPA_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:rt})});
  const d=await r.json();if(!d.access_token)throw new Error('oturum yenilenemedi');storeSession({access_token:d.access_token,refresh_token:d.refresh_token,user:d.user});return S.session;
}
async function loadSession(){
  for(const k of ['pd_session']){
    const s=lsJSON(k,null);if(!s||!s.access_token||!s.user)continue;
    if(jwtExp(s.access_token)>Date.now()+60000){S.session=s;return s}
    if(s.refresh_token){try{return await refreshSession(s.refresh_token)}catch(e){}}
  }
  return null;
}
async function ensureFresh(){if(S.session&&jwtExp(S.session.access_token)<Date.now()+60000){if(S.session.refresh_token)await refreshSession(S.session.refresh_token);else{S.session=null}}}
async function supa(path,method='GET',body){
  await ensureFresh();
  const h={apikey:SUPA_KEY,Authorization:'Bearer '+(S.session?S.session.access_token:SUPA_KEY),'Content-Type':'application/json',Accept:'application/json'};
  if(method==='POST')h.Prefer='return=minimal';
  const r=await fetch(SUPA_URL+path,{method,headers:h,body:body?JSON.stringify(body):undefined});
  const t=await r.text();if(!r.ok)throw new Error('Supabase '+r.status+': '+t.slice(0,160));return t?JSON.parse(t):[];
}
async function login(email,pass){
  const r=await fetch(SUPA_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:SUPA_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password:pass})});
  const d=await r.json();if(!d.access_token)throw new Error(d.error_description||d.msg||d.message||'Giriş başarısız');
  storeSession({access_token:d.access_token,refresh_token:d.refresh_token,user:d.user});
}
function logout(){S.session=null;try{localStorage.removeItem('pd_session')}catch(e){};renderUser();toast('Çıkış yapıldı');}
async function cloudLoad(){
  if(!S.session)return;
  try{
    const rows=await supa(`/rest/v1/user_settings?user_id=eq.${S.session.user.id}&key=in.(portfoy_lots,portfoy_settings)&select=key,value`);
    const m={};rows.forEach(r=>m[r.key]=r.value);
    const localLots=S.lots;
    if(Array.isArray(m.portfoy_lots)){S.lots=m.portfoy_lots;lsSet('pd_lots',JSON.stringify(S.lots))}
    else if(localLots.length){await cloudSave('portfoy_lots',localLots);toast('Yerel pozisyonlar hesabına taşındı')}
    if(m.portfoy_settings&&typeof m.portfoy_settings==='object'){S.settings={targets:{},tdKey:'',...m.portfoy_settings};lsSet('pd_settings',JSON.stringify(S.settings))}
    if(!S.watch&&Array.isArray(S.settings.watchLocal))S.watch={tickers:S.settings.watchLocal};
    S.cloudOK=true;
  }catch(e){S.cloudOK=false;S.cloudErr=e.message;console.warn(e)}
}
async function cloudSave(key,value){
  if(!S.session)return false;
  try{const uid=S.session.user.id;
    await supa(`/rest/v1/user_settings?user_id=eq.${uid}&key=eq.${key}`,'DELETE');
    await supa('/rest/v1/user_settings','POST',{user_id:uid,key,value});S.cloudOK=true;return true;
  }catch(e){S.cloudOK=false;S.cloudErr=e.message;toast('Buluta kaydedilemedi, yerelde tutuldu');return false}
}
async function saveLots(){lsSet('pd_lots',JSON.stringify(S.lots));await cloudSave('portfoy_lots',S.lots)}
async function saveSettings(){lsSet('pd_settings',JSON.stringify(S.settings));await cloudSave('portfoy_settings',S.settings)}

/* ---------- live data (tarayıcıdan, kullanıcının kendi anahtarıyla) ---------- */
async function loadFX(){
  try{const r=await fetch('https://open.er-api.com/v6/latest/USD');const d=await r.json();if(d&&d.rates&&d.rates.TRY>0){S.fx=d.rates.TRY;S.fxSrc='ExchangeRate-API';return}}catch(e){}
  try{const r=await fetch('https://api.frankfurter.app/latest?from=USD&to=TRY');const d=await r.json();if(d&&d.rates&&d.rates.TRY>0){S.fx=d.rates.TRY;S.fxSrc='Frankfurter (ECB)'}}catch(e){}
  if(!S.fx&&S.prices&&S.prices.usdtry)S.fx=S.prices.usdtry;
}
async function fetchLive(manual){
  const key=(S.settings.tdKey||'').trim();
  if(!key){if(manual){toast('Canlı fiyat için Pozisyonlar → Ayarlar’dan Twelve Data anahtarı ekle');}return}
  if(S.liveBusy)return;S.liveBusy=true;S.liveErr='';$('#refresh').classList.add('spin');
  const list=allTickers();const chunks=[];for(let i=0;i<list.length;i+=8)chunks.push(list.slice(i,i+8));
  try{
    for(let c=0;c<chunks.length;c++){
      if(c)await sleep(61000);
      const r=await fetch(`https://api.twelvedata.com/quote?symbol=${chunks[c].join(',')}&apikey=${encodeURIComponent(key)}`);
      const d=await r.json();
      if(d&&d.code&&d.status==='error'){S.liveErr=d.message||'Twelve Data hatası';break}
      const obj=chunks[c].length===1?{[chunks[c][0]]:d}:d;
      for(const t of chunks[c]){const q=obj[t];if(!q||q.status==='error'||!(+q.close>0))continue;
        S.live[t]={price:+q.close,chg:+q.change,pct:+q.percent_change,day:q.datetime,hi52:q.fifty_two_week?+q.fifty_two_week.high:undefined,lo52:q.fifty_two_week?+q.fifty_two_week.low:undefined,open:!!q.is_market_open,o:+q.open,high:+q.high,low:+q.low,vol:+q.volume}}
      S.liveAt=Date.now();render(false);
    }
  }catch(e){S.liveErr=e.message}
  S.liveBusy=false;$('#refresh').classList.remove('spin');render(false);
  if(manual)toast(S.liveErr?('Canlı fiyat: '+S.liveErr):'Fiyatlar güncellendi');
}
function autoLive(){
  if(document.visibilityState!=='visible'||!S.settings.tdKey)return;
  const ms=marketState();const age=Date.now()-S.liveAt;
  if(ms.open?age>10*60000:!S.liveAt&&(Date.now()-new Date(S.prices?S.prices.updatedAt:0))>6*3600000)fetchLive(false);
}

/* ---------- chrome ---------- */
function renderTop(){
  const ms=marketState();const m=$('#mkt');m.classList.toggle('open',ms.open);m.lastElementChild.textContent=ms.msg;m.title=ms.msg;
  $$('#ccy span').forEach(s=>s.classList.toggle('on',s.dataset.c===S.ccy));
  const items=tickers().map(t=>{const q=quote(t);return `<a class="tk" href="#/t/${t}"><b>${t}</b><span class="num">${pxf(t,q.price)}</span><span class="num ${cls(q.pct)}">${pct(q.pct)}</span></a>`}).join('');
  const fxItem=S.fx?`<span class="tk"><b>USD/TRY</b><span class="num">${nf(S.fx,4)}</span></span>`:'';
  $('#tapeIn').innerHTML=(items+fxItem).repeat(2);
  const p=S.prices||{};const live=S.liveAt?` · canlı ${ago(S.liveAt)}`:'';
  $('#fresh').innerHTML=`Fiyatlar: ${esc(p.asOf?trDate(p.asOf+'T12:00:00Z'):'—')} · ${esc(p.source||'')} · site verisi ${esc(ago(p.updatedAt))}${live}${S.fx?` · USD/TRY ${nf(S.fx,4)} (${esc(S.fxSrc||'')})`:''} · analiz ${esc(trDT(S.data.generatedAt))}`;
}
function renderUser(){const b=$('#user');if(S.session){b.textContent=(S.session.user.email||'').split('@')[0];b.classList.add('in');b.title='Çıkış için tıkla'}else{b.textContent='Giriş';b.classList.remove('in');b.title='Giriş yap'}}
function setTabs(r){$$('#tabs a').forEach(a=>a.classList.toggle('on',a.dataset.r===r||(r==='t'&&a.dataset.r==='enstruman')))}

/* ---------- views ---------- */
function rangeBtns(key,opts=['1A','3A','6A','YTD','1Y']){return `<div class="ranges" data-k="${key}">${opts.map(r=>`<button data-r="${r}" class="${S.range[key]===r?'on':''}">${r==='YTD'?'YBB':r==='1Y'?'1Y':r}</button>`).join('')}</div>`}

function viewOzet(){
  const P=positions(),T=totals(P),real=P.total>0;const W=weights();
  const ps=portfolioSeries();const hs=sliceRange(ps.pts,S.range.hero);
  const rng=hs.length>1?(hs[hs.length-1][1]/hs[0][1]-1)*100:null;
  const ex=exposure();const ts=tickers();
  const themeParts=THEMES.map(th=>({name:th.name,c:th.c,v:th.t.reduce((a,t)=>a+(W.w[t]||0),0)}));
  const up=(S.data.events||[]).filter(e=>new Date(e.date)>=new Date(Date.now()-864e5)).slice(0,6);
  const news=(S.data.news||[]).slice(0,5);
  const heroVal=real?money(T.value):money(hs.length?hs[hs.length-1][1]:null);
  const wk=S.weekly&&S.weekly.reports&&S.weekly.reports[0];
  return `<div class="fade">
  ${realLine()}${journalBanner()}${planBanner()}
  <div class="grid g-hero">
    <section class="card hero">
      <div class="lbl">${real?'Portföy değeri':'Model portföy · 1 yıl önce $10.000 ('+esc(W.src)+')'}</div>
      <div class="big">${heroVal}</div>
      <div class="chg">${real?`${chip(T.dayPct)}<span class="num ${cls(T.day)}">${smoney(T.day)} bugün</span><span class="dim">·</span>`:''}<span class="muted">${S.range.hero==='YTD'?'Yılbaşından beri':'Seçili dönem'}</span> ${chip(rng)}</div>
      ${rangeBtns('hero')}
      <div class="chart" id="cHero"></div>
    </section>
    <section class="card">
      <h3>Durum <span class="r muted">${real?P.list.length+' pozisyon':'pozisyon yok'}</span></h3>
      ${real?`<div class="kpis">
        <div class="kpi"><div class="l">Açık K/Z</div><div class="v ${cls(T.pnl)}">${smoney(T.pnl,0)}</div><div class="s">${pct(T.pnlPct)} · maliyet ${money(T.cost,0)}</div></div>
        <div class="kpi"><div class="l">Bugün</div><div class="v ${cls(T.day)}">${smoney(T.day,0)}</div><div class="s">${pct(T.dayPct)}</div></div>
        <div class="kpi"><div class="l">Gerçekleşen K/Z</div><div class="v ${cls(T.realized)}">${smoney(T.realized,0)}</div><div class="s">satışlardan</div></div>
        <div class="kpi"><div class="l">TL bazında K/Z</div><div class="v ${cls(T.pnlTRY)}">${S.fx?(T.pnlTRY>=0?'+':'−')+'₺'+nf(Math.abs(T.pnlTRY),0):'—'}</div><div class="s">alış kurlarıyla</div></div>
      </div>`:`<div class="empty"><b>Henüz pozisyon girilmedi</b>Alışlarını ekleyince değer, K/Z ve ağırlıklar burada gerçek verilerle görünür.<div style="margin-top:14px"><a class="btn" href="#/pozisyon" style="text-decoration:none">Pozisyon ekle</a></div></div>`}
      <h3 style="margin-top:18px">Tema dağılımı <span class="r muted">${esc(W.src)}</span></h3>
      <div class="donut-w">${donut(themeParts,150)}<div class="legend">${themeParts.map(p=>`<div><i style="background:${p.c}"></i>${esc(p.name)}<span class="v">%${nf(p.v,1)}</span></div>`).join('')}</div></div>
    </section>
  </div>

  ${weeklyCard(wk,false)}
  ${viewEarnSection()}
  <div class="sec-t"><div><h2>Bugün piyasada</h2><p>Günlük değişim · karo boyu eşit, renk yoğunluğu hareketin büyüklüğü</p></div></div>
  <div class="heat">${ts.map(t=>{const q=quote(t);const s=sliceRange(series(t),'1A');return `<a class="tile" href="#/t/${t}" style="background:${heatBg(q.pct)}"><div><b>${t}</b><div class="p">${pxf(t,q.price)}</div></div><div class="c">${pct(q.pct)}</div>${spark(s,120,40,'rgba(255,255,255,.9)')}</a>`}).join('')}</div>

  <div class="sec-t"><div><h2>Karşılaştırmalı performans</h2><p>Seçili dönemin başına göre yüzde getiri</p></div>${rangeBtns('perf')}</div>
  <section class="card"><div class="filters" id="perfSel">${ts.map(t=>`<button data-t="${t}" class="${(S.perfSel||ts).includes(t)?'on':''}" style="${(S.perfSel||ts).includes(t)?`background:${color(t)};border-color:${color(t)};color:#0b0e13`:''}">${t}</button>`).join('')}</div><div class="chart" id="cPerf" style="height:320px"></div></section>

  <div class="sec-t"><div><h2>Değerleme ve sinyaller</h2><p>PEG, analist hedefi ve 52 haftalık aralıktaki konum</p></div></div>
  <section class="card"><div class="tscroll"><table class="tbl"><thead><tr><th>Enstrüman</th><th class="r">Fiyat</th><th class="r">Gün</th><th class="r">YBB</th><th class="r">1 yıl</th><th>3 ay</th><th style="min-width:130px">52 hafta konumu</th><th>Teknik</th><th class="r">PEG</th><th class="r">Hedefe</th>${real?'<th class="r">Ağırlık</th>':''}</tr></thead><tbody>
  ${ts.map(t=>{const i=inst(t),q=quote(t),p5=pos52(t),pg=pegNum(t),u=upside(t),pm=P.list.find(m=>m.t===t);return `<tr onclick="location.hash='#/t/${t}'" style="cursor:pointer"><td><div class="sym">${logo(t)}<div><div class="n">${t}</div><div class="d">${esc(i.name)}</div></div></div></td>
  <td class="r num">${pxf(t,q.price)}</td><td class="r num ${cls(q.pct)}">${pct(q.pct)}</td><td class="r num ${cls(ytd(t))}">${pct(ytd(t),1)}</td><td class="r num ${cls(perf(t,'1Y'))}">${pct(perf(t,'1Y'),1)}</td>
  <td>${spark(sliceRange(series(t),'3A'))}</td><td>${p5==null?'—':`<div class="meter" style="height:6px"><i style="left:${p5*100}%;width:11px;height:11px"></i></div>`}</td>
  <td class="tcell">${techBadge(t)}</td><td class="r num ${pg==null?'':pg<1?'up':pg>2?'down':''}">${esc(pegTxt(i))}</td><td class="r num ${cls(u)}">${u==null?'<span class="dim">fon</span>':pct(u,1)}</td>${real?`<td class="r num">${pm?'%'+nf(pm.w,1):'—'}</td>`:''}</tr>`}).join('')}
  </tbody></table></div></section>

  <div class="grid g2 sec">
    <section class="card"><h3>Şirket bazında gerçek maruziyet <span class="r muted">${esc(ex.src)}</span></h3>
      <div class="bars">${ex.list.slice(0,14).map(e=>`<div class="bar" title="${esc(e.n)} · ${esc(Array.from(new Set(e.via)).join(', '))}"><span class="t"><b>${esc(e.t||'')}</b> <span class="muted">${esc(e.n||'')}</span></span><div class="tr"><div class="f" style="width:${Math.min(100,e.w/ex.list[0].w*100)}%"></div></div><span class="v">%${nf(e.w,1)}</span></div>`).join('')}</div>
      <p class="muted" style="font-size:12.5px;margin:12px 0 0">Fonların açıklanan en büyük varlıkları üzerinden hesaplanır; aynı şirket hem fonda hem doğrudan tutuluyorsa toplanır.</p>
    </section>
    <section class="card"><h3>Yaklaşan olaylar <a class="r muted" href="#/takvim">tümü →</a></h3>${up.length?up.map(evRow).join(''):'<div class="empty">Yaklaşan olay yok</div>'}</section>
  </div>

  <section class="card sec"><h3>Son haberler <a class="r muted" href="#/haber">tümü →</a></h3><div class="news">${news.map(nwRow).join('')}</div></section>
  </div>`;
}
function afterOzet(){
  const ps=portfolioSeries();const hs=sliceRange(ps.pts,S.range.hero);
  const c=hs.length>1&&hs[hs.length-1][1]>=hs[0][1]?'#2fe39a':'#ff5d7a';
  lineChart($('#cHero'),[{name:ps.real?'Portföy':'Model',color:c,pts:hs.map(p=>[p[0],conv(p[1])])}],{area:true,fmt:(v,ax)=>sym()+nf(v,ax?0:2)});
  const sel=S.perfSel||tickers();
  const list=sel.map(t=>{const s=sliceRange(series(t),S.range.perf);if(s.length<2)return null;const b=s[0][1];return {name:t,color:color(t),pts:s.map(p=>[p[0],(p[1]/b-1)*100])}}).filter(Boolean);
  lineChart($('#cPerf'),list,{pct:true,fmt:(v,ax)=>(v>0?'+':'')+nf(v,ax?0:1)+'%'});
  $$('#perfSel button').forEach(b=>b.onclick=()=>{const t=b.dataset.t;let s=S.perfSel?S.perfSel.slice():tickers().slice();
    if(s.length===tickers().length&&!S.perfSel)s=[t];else s=s.includes(t)?s.filter(x=>x!==t):s.concat(t);
    S.perfSel=s.length?s:null;render(false)});
}
function evRow(e){
  const d=new Date(e.date);const days=Math.ceil((d-Date.now())/864e5);
  const imp=`<span class="imp">${[1,2,3].map(k=>`<i class="${k<=(e.importance||1)?'on':''}"></i>`).join('')}</span>`;
  return `<div class="ev"><div class="dt"><b>${d.toLocaleDateString('tr-TR',{day:'2-digit',timeZone:'Europe/Istanbul'})}</b><span>${d.toLocaleDateString('tr-TR',{month:'short',timeZone:'Europe/Istanbul'})}</span></div>
  <div><div class="ti">${esc(e.title)}${imp}</div><div class="no">${esc(KIND[e.kind]||e.kind||'')}${e.note?' · '+esc(e.note):''}${(e.tickers||[]).length?' · '+e.tickers.map(t=>`<a href="#/t/${t}">${t}</a>`).join(', '):''}</div></div>
  <div class="in">${days<=0?'bugün':days===1?'yarın':days+' gün'}<div class="dim" style="text-align:right">${/T00:00:00/.test(e.date)?'':d.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'})}</div></div></div>`;
}
function nwRow(n){
  return `<article class="nw"><div class="im ${esc(n.impact||'')}"></div><div>
  <a class="t" href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a>
  <div class="m"><span>${esc(n.source||'')}</span><span>·</span><span>${esc(trDate(n.publishedAt,{day:'numeric',month:'short'}))}</span>${n.impact?`<span class="tag">${esc(IMPACT[n.impact]||n.impact)}</span>`:''}${(n.tickers||[]).map(t=>`<a class="tag" href="#/t/${t}" style="text-decoration:none">${t}</a>`).join('')}</div>
  ${n.summary?`<p>${esc(n.summary)}</p>`:''}${n.whyItMatters?`<div class="why"><b>Neden önemli:</b> ${esc(n.whyItMatters)}</div>`:''}</div></article>`;
}

function viewEnstruman(){
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Enstrümanlar</h2><p>${tickers().length} enstrüman · kartın üstüne tıkla, detaylı analiz açılır</p></div></div>
  ${THEMES.map(th=>{const ts=th.t.filter(t=>inst(t));if(!ts.length)return '';return `<h3 class="muted" style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin:22px 0 10px;display:flex;gap:8px;align-items:center"><i style="width:10px;height:10px;border-radius:3px;background:${th.c}"></i>${esc(th.name)}</h3>
  <div class="icards">${ts.map(t=>{const i=inst(t),q=quote(t),s=sliceRange(series(t),'6A');return `<a class="card ic" href="#/t/${t}">
    <div class="row"><div class="sym">${logo(t)}<div><div class="n">${t}</div><div class="d">${esc(i.name)}</div></div></div><span class="tag">${esc(i.type||'')}</span></div>
    <div class="row"><span class="px">${pxf(t,q.price)}</span>${chip(q.pct)}</div>
    ${spark(s,300,56,color(t))}
    <div class="ft"><span class="tag">YBB ${pct(ytd(t),1)}</span><span class="tag">1Y ${pct(perf(t,'1Y'),1)}</span>${i.peg?`<span class="tag">PEG ${esc(pegTxt(i))}</span>`:''}${upside(t)!=null?`<span class="tag">Hedefe ${pct(upside(t),1)}</span>`:''}</div></a>`}).join('')}</div>`}).join('')}${viewWatch()}</div>`;
}

function viewInst(t){
  const i=inst(t);if(!i)return `<div class="empty"><b>${esc(t)} bulunamadı</b><a href="#/enstruman">Enstrümanlara dön</a></div>`;
  const q=quote(t),p5=pos52(t),s=sig(t),u=upside(t),P=positions(),pm=P.list.find(m=>m.t===t);
  const news=(S.data.news||[]).filter(n=>(n.tickers||[]).includes(t)||(n.holdings||[]).includes(t));
  const evs=(S.data.events||[]).filter(e=>(e.tickers||[]).includes(t)&&new Date(e.date)>=new Date(Date.now()-864e5));
  const metrics=(i.peg?[{label:'PEG oranı',value:pegTxt(i),note:i.peg.note,hl:true}]:[]).concat(i.metrics||[]);
  const hold=(i.holdings||[]).slice(0,15);const hmax=hold.length?Math.max(...hold.map(h=>h.w)):1;
  const offHigh=q.hi52>0?(q.price/q.hi52-1)*100:null;
  return `<div class="fade">
  <a class="back" href="#/enstruman">← Enstrümanlar</a>
  <div class="ihead">${logo(t)}<div><h1>${esc(i.name)}</h1><div class="sub">${esc(t)} · ${esc(i.issuer||'')} · ${esc(i.type||'')}</div></div>
    <div class="px"><div class="big">${pxf(t,q.price)}</div><div class="chg" style="display:flex;gap:8px;justify-content:inherit;margin-top:8px;flex-wrap:wrap">${chip(q.pct)}<span class="chip n">YBB ${pct(ytd(t),1)}</span><span class="chip n">1Y ${pct(perf(t,'1Y'),1)}</span></div><div class="dim" style="font-size:12px;margin-top:6px">${esc(q.day?trDate(q.day+'T12:00:00Z'):'')} · ${esc(q.src||'')}</div></div></div>

  <div class="grid g-main">
    <section class="card">${rangeBtns('inst')}<div class="chart" id="cInst" style="height:330px"></div></section>
    <section class="card">
      <h3>52 haftalık aralık</h3>
      ${p5==null?'<div class="muted">—</div>':`<div class="meter"><i style="left:${p5*100}%"></i></div><div class="meter-l"><span>${pxf(t,q.lo52)}</span><span>${pxf(t,q.hi52)}</span></div><div class="muted" style="font-size:13px;margin-top:8px">Zirveden uzaklık <b class="num ${cls(offHigh)}">${pct(offHigh,1)}</b> · dipten <b class="num up">${pct((q.price/q.lo52-1)*100,1)}</b></div>`}
      <h3 style="margin-top:22px">Dönemsel getiri</h3><div class="rets">${['1A','3A','6A','YTD','1Y'].map(r=>{const v=perf(t,r);return `<div><span>${r==='YTD'?'YBB':r}</span><b class="${cls(v)}">${pct(v,1)}</b></div>`}).join('')}</div>
      ${techCard(t)}
      ${s&&s.target>0?`<h3 style="margin-top:22px">Analist hedefi <span class="r num ${cls(u)}">${pct(u,1)}</span></h3>
      <div class="gauge">${(()=>{const lo=Math.min(s.targetLow||s.target,q.price),hi=Math.max(s.targetHigh||s.target,q.price);const X=v=>((v-lo)/(hi-lo||1)*100);return `<div class="tr"><div class="rng" style="left:${X(s.targetLow||s.target)}%;right:${100-X(s.targetHigh||s.target)}%"></div><span class="tm" style="left:${X(s.target)}%" title="Ortalama hedef"></span><span class="pm" style="left:${X(q.price)}%" title="Fiyat"></span></div>`})()}
      <div class="meter-l"><span>düşük ${pxf(t,s.targetLow,0)}</span><span>ort. ${pxf(t,s.target,0)}</span><span>yüksek ${pxf(t,s.targetHigh,0)}</span></div></div>
      <div class="muted" style="font-size:13px;margin-top:10px">Haber tonu <b class="${s.sentimentDir==='UP'?'up':s.sentimentDir==='DOWN'?'down':''}">${nf(s.sentiment,2)} ${s.sentimentDir==='UP'?'↑':s.sentimentDir==='DOWN'?'↓':'→'}</b>${isNum(s.epsSurprise)?` · son EPS sürprizi <b class="${cls(s.epsSurprise)}">${pct(s.epsSurprise,1)}</b> (${esc(s.epsPeriod||'')})`:''}</div>`:''}
      ${pm&&pm.qty>0?`<h3 style="margin-top:22px">Pozisyonun</h3><div class="kpis">
        <div class="kpi"><div class="l">Adet · ort. maliyet</div><div class="v" style="font-size:18px">${nf(pm.qty,pm.qty%1?4:0)} · ${usd(pm.avg)}</div></div>
        <div class="kpi"><div class="l">Değer</div><div class="v" style="font-size:18px">${money(pm.value)}</div><div class="s">ağırlık %${nf(pm.w,1)}</div></div>
        <div class="kpi"><div class="l">K/Z</div><div class="v ${cls(pm.pnl)}" style="font-size:18px">${smoney(pm.pnl)}</div><div class="s">${pct(pm.pnlPct)}</div></div>
        <div class="kpi"><div class="l">Bugün</div><div class="v ${cls(pm.day)}" style="font-size:18px">${smoney(pm.day)}</div></div></div>`:`<div class="note" style="margin-top:22px">Bu enstrümanda pozisyonun yok. <a href="#/pozisyon">Pozisyon ekle →</a></div>`}
    </section>
  </div>

  ${techSection(t)}
  <section class="card sec"><h3>Temel göstergeler</h3><div class="metrics">${metrics.map(m=>`<div class="mt ${m.hl?'hl':''}"><div class="l">${esc(m.label)}</div><div class="v">${esc(m.value)}</div>${m.note?`<div class="n">${esc(m.note)}</div>`:''}</div>`).join('')}</div></section>

  <div class="grid g-main sec">
    <section class="card prose"><h3>Değerlendirme <span class="r muted">${esc(i.updatedAt||'')}</span></h3>${(i.summary||[]).map(p=>`<p>${esc(p)}</p>`).join('')}</section>
    <section class="card"><h3>Takip listesi</h3><div class="watch">${(i.watch||[]).map(w=>`<div><b>${esc(w.label)}</b>${esc(w.detail)}</div>`).join('')||'<div class="muted">—</div>'}</div></section>
  </div>
  <div class="grid g2 sec">
    <section class="card"><h3>Güçlü yanlar</h3><ul class="lst">${(i.strengths||[]).map(x=>`<li><span>${esc(x)}</span></li>`).join('')}</ul></section>
    <section class="card"><h3>Riskler</h3><ul class="lst risk">${(i.risks||[]).map(x=>`<li><span>${esc(x)}</span></li>`).join('')}</ul></section>
  </div>

  ${hold.length?`<div class="grid g-main sec">
    <section class="card"><h3>En büyük varlıklar <span class="r muted">${esc(i.holdingsAsOf||'')}</span></h3><div class="bars">${hold.map(h=>{const sg=sig(h.t);const uu=h.t&&inst(h.t)?upside(h.t):(sg&&sg.target>0&&sg.price>0?(sg.target/sg.price-1)*100:null);return `<div class="bar"><span class="t"><b>${esc(h.t||'')}</b> <span class="muted">${esc(h.n)}</span></span><div class="tr"><div class="f" style="width:${h.w/hmax*100}%"></div></div><span class="v">%${nf(h.w,2)}${uu!=null?`<br><span class="${cls(uu)}" style="font-size:11px" title="Analist hedefine">${pct(uu,0)}</span>`:''}</span></div>`}).join('')}</div></section>
    <section class="card">${(i.segments||[]).length?`<h3>Segmentler</h3><div class="bars">${i.segments.map(g=>`<div class="bar"><span class="t">${esc(g.name)}</span><div class="tr"><div class="f" style="width:${g.w}%"></div></div><span class="v">%${nf(g.w,1)}</span></div>`).join('')}</div>${i.segmentsNote?`<p class="muted" style="font-size:12.5px;margin:10px 0 0">${esc(i.segmentsNote)}</p>`:''}`:''}
      ${(i.countries||[]).length?`<h3 style="margin-top:22px">Ülkeler</h3><div class="bars">${i.countries.map(g=>`<div class="bar"><span class="t">${esc(g.name)}</span><div class="tr"><div class="f" style="width:${g.w}%"></div></div><span class="v">%${nf(g.w,1)}</span></div>`).join('')}</div>`:''}</section>
  </div>`:(i.segments||[]).length?`<section class="card sec"><h3>Yapı</h3><div class="bars">${i.segments.map(g=>`<div class="bar"><span class="t">${esc(g.name)}</span><div class="tr"><div class="f" style="width:${g.w}%"></div></div><span class="v">%${nf(g.w,1)}</span></div>`).join('')}</div></section>`:''}

  ${earningsFor(t).length?`<div class="grid g2 sec">${earningsFor(t).map(earnCard).join('')}</div>`:''}
  ${insiderCard(t)}
  <div class="grid g-main sec">
    <section class="card"><h3>İlgili haberler <span class="r muted">${news.length}</span></h3><div class="news">${news.map(nwRow).join('')||'<div class="muted">Şimdilik ilgili haber yok.</div>'}</div></section>
    <div class="grid" style="align-content:start">
      <section class="card"><h3>Yaklaşan olaylar</h3>${evs.map(evRow).join('')||'<div class="muted">—</div>'}</section>
      <section class="card src"><h3>Kaynaklar</h3>${(i.sources||[]).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} ↗</a>`).join('')}</section>
    </div>
  </div></div>`;
}
function afterInst(t){
  afterTech(t);
  const s=sliceRange(series(t),S.range.inst);const c=s.length>1&&s[s.length-1][1]>=s[0][1]?'#2fe39a':'#ff5d7a';
  const lots=S.lots.filter(l=>l.t===t);
  lineChart($('#cInst'),[{name:t,color:c,pts:s}],{area:true,fmt:(v,ax)=>'$'+nf(v,ax?0:2)});
}

function viewPozisyon(){
  const P=positions(),T=totals(P);const ts=tickers();const W=weights();const T0=S.settings.targets||{};
  const tSum=ts.reduce((a,t)=>a+(+T0[t]||0),0);
  const lots=S.lots.slice().sort((a,b)=>a.date<b.date?1:-1);
  const today=new Date().toISOString().slice(0,10);
  return `<div class="fade">
  <div class="sec-t" style="margin-top:0"><div><h2>Pozisyonlar</h2><p>${S.session?`Hesabına kayıtlı${S.cloudOK===false?' <span class="down">(bulut bağlantısı yok: '+esc(S.cloudErr||'')+')</span>':''}`:'Giriş yapmadan eklediklerin sadece bu cihazda kalır. <a href="#" id="goLogin">Giriş yap</a>'}</p></div></div>
  ${P.total>0?`<div class="grid g4">
    <div class="card kpi"><div class="l">Toplam değer</div><div class="v">${money(T.value)}</div><div class="s">${S.ccy==='USD'&&S.fx?'₺'+nf(T.value*S.fx,0):S.ccy==='TRY'?'$'+nf(T.value,0):''}</div></div>
    <div class="card kpi"><div class="l">Açık K/Z</div><div class="v ${cls(T.pnl)}">${smoney(T.pnl)}</div><div class="s">${pct(T.pnlPct)}</div></div>
    <div class="card kpi"><div class="l">Bugün</div><div class="v ${cls(T.day)}">${smoney(T.day)}</div><div class="s">${pct(T.dayPct)}</div></div>
    <div class="card kpi"><div class="l">Gerçekleşen</div><div class="v ${cls(T.realized)}">${smoney(T.realized)}</div><div class="s">${S.fx?'TL bazında K/Z '+(T.pnlTRY>=0?'+':'−')+'₺'+nf(Math.abs(T.pnlTRY),0):''}</div></div>
  </div>
  <section class="card sec"><div class="tscroll"><table class="tbl"><thead><tr><th>Enstrüman</th><th class="r">Adet</th><th class="r">Ort. maliyet</th><th class="r">Fiyat</th><th class="r">Değer</th><th class="r">K/Z</th><th class="r">K/Z %</th><th class="r">Bugün</th><th class="r">Ağırlık</th><th class="r">Hedef</th><th class="r">Fark</th></tr></thead><tbody>
    ${P.list.filter(m=>m.qty>0).map(m=>{const tg=tSum>0?(+T0[m.t]||0)/tSum*100:null;const df=tg==null?null:m.w-tg;return `<tr><td><a class="sym" href="#/t/${m.t}">${logo(m.t)}<div><div class="n">${m.t}</div><div class="d">${esc(inst(m.t)?inst(m.t).name:'')}</div></div></a></td>
    <td class="r num">${nf(m.qty,m.qty%1?4:0)}</td><td class="r num">${usd(m.avg)}</td><td class="r num">${usd(m.price)}</td><td class="r num">${money(m.value)}</td>
    <td class="r num ${cls(m.pnl)}">${smoney(m.pnl)}</td><td class="r num ${cls(m.pnlPct)}">${pct(m.pnlPct)}</td><td class="r num ${cls(m.day)}">${smoney(m.day)}</td>
    <td class="r num">%${nf(m.w,1)}</td><td class="r num">${tg==null?'—':'%'+nf(tg,1)}</td><td class="r num ${df==null?'':Math.abs(df)>5?'down':''}">${df==null?'—':(df>0?'+':'')+nf(df,1)}</td></tr>`}).join('')}
  </tbody></table></div></section>`:''}

  <section class="card sec"><h3>İşlem ekle</h3>
    <form class="form" id="lotForm" autocomplete="off">
      <label>Tarih<input type="date" name="date" value="${today}" max="${today}" required></label>
      <label>Enstrüman<select name="t">${allTickers().map(t=>`<option>${t}</option>`).join('')}</select></label>
      <label>Yön<select name="side"><option value="B">Alış</option><option value="S">Satış</option></select></label>
      <label>Adet<input type="number" name="q" step="any" min="0" required placeholder="10"></label>
      <label>Fiyat ($ · BIST'te ₺)<input type="number" name="p" step="any" min="0" required placeholder="${nf(quote(ts[0]).price,2).replace('.','').replace(',','.')}"></label>
      <label>Komisyon ($)<input type="number" name="fee" step="any" min="0" value="0"></label>
      <label>USD/TRY (işlem günü)<input type="number" name="fx" step="any" min="0" placeholder="${S.fx?nf(S.fx,4).replace(',','.'):''}"></label>
      <label style="grid-column:span 4">Not<input name="note" placeholder="opsiyonel"></label>
      <label style="grid-column:span 3">Neden aldım? (karar günlüğü)<input name="thesis" placeholder="ör. AI veri merkezi soğutma talebi 2027'ye kadar güçlü"></label>
      <label>Hedef fiyat<input name="target" type="number" step="any" min="0"></label>
      <label style="grid-column:span 2">Hangi durumda satarım?<input name="exitRule" placeholder="ör. iki çeyrek üst üste sipariş düşerse"></label>
      <button class="btn" type="submit">Ekle</button>
    </form>
  </section>

  <section class="card sec"><h3>İşlem geçmişi <span class="r"><button class="btn ghost sm" id="expJSON">Dışa aktar</button> <label class="btn ghost sm" style="display:inline-block">İçe aktar<input type="file" id="impJSON" accept="application/json" hidden></label></span></h3>
    ${lots.length?`<div class="tscroll"><table class="tbl"><thead><tr><th>Tarih</th><th>Enstrüman</th><th>Yön</th><th class="r">Adet</th><th class="r">Fiyat</th><th class="r">Tutar</th><th class="r">Kur</th><th>Not</th><th></th></tr></thead><tbody>
    ${lots.map(l=>`<tr><td class="num">${esc(trDate(l.date+'T12:00:00Z'))}</td><td><b>${esc(l.t)}</b></td><td><span class="tag" style="${l.side==='S'?'color:var(--down)':'color:var(--up)'}">${l.side==='S'?'Satış':'Alış'}</span></td><td class="r num">${nf(+l.q,(+l.q)%1?4:0)}</td><td class="r num">${pxf(l.t,+l.p)}</td><td class="r num">${pxf(l.t,l.q*l.p)}</td><td class="r num">${l.fx?nf(+l.fx,4):'—'}</td><td class="muted">${esc(l.note||'')}</td><td class="r"><button class="lnk" data-del="${esc(l.id)}" title="Sil">✕</button></td></tr>`).join('')}
    </tbody></table></div>`:'<div class="empty"><b>İşlem yok</b>İlk alışını yukarıdan ekle.</div>'}
  </section>

  <div class="grid g2 sec">
    <section class="card"><h3>Hedef ağırlıklar <span class="r muted">toplam %${nf(tSum,0)}</span></h3>
      <div class="bars">${ts.map(t=>{const cur=W.real?(W.w[t]||0):null;const tg=tSum>0?(+T0[t]||0)/tSum*100:0;return `<div class="bar" style="grid-template-columns:70px minmax(0,1fr) 84px"><span class="t"><b>${t}</b></span><div class="tr"><div class="f" style="width:${Math.min(100,(cur??tg)*2)}%;${cur==null?'opacity:.45':''}"></div>${cur!=null&&tSum>0?`<span class="mk" style="left:${Math.min(100,tg*2)}%"></span>`:''}</div><input class="tw" type="number" min="0" max="100" step="0.5" data-tw="${t}" value="${T0[t]??''}" placeholder="%"></div>`}).join('')}</div>
      <p class="muted" style="font-size:12.5px;margin:12px 0 0">Çubuk: mevcut ağırlık (ölçek ×2). Dikey çizgi: hedef. Pozisyon yokken Özet'teki model portföy bu hedefleri kullanır.</p>
    </section>
    <section class="card"><h3>Ayarlar</h3>
      <label class="muted" style="font-size:13px;display:flex;flex-direction:column;gap:6px">Twelve Data API anahtarı (canlı fiyat için, opsiyonel)
        <div style="display:flex;gap:8px"><input id="tdKey" type="password" value="${esc(S.settings.tdKey||'')}" placeholder="twelvedata.com → API Keys"><button class="btn ghost" id="tdSave">Kaydet</button></div></label>
      <p class="muted" style="font-size:13px;margin:10px 0 0">Anahtar sadece senin hesabında (Supabase) ve bu tarayıcıda saklanır; GitHub'a asla yazılmaz. Anahtar yoksa site, saatlik güncellenen fiyat dosyasını kullanır. Ücretsiz plan dakikada 8 sembol çektiği için 11 sembol yaklaşık 1 dakikada tamamlanır; piyasa açıkken 10 dakikada bir yenilenir.</p>
      ${S.liveErr?`<div class="note warn" style="margin-top:10px">Son canlı çekim: ${esc(S.liveErr)}</div>`:''}
      <label class="muted" style="font-size:13px;display:flex;flex-direction:column;gap:6px;margin-top:18px">Mevduat faizi karşılaştırması (yıllık brüt %)
        <div style="display:flex;gap:8px"><input id="depR" type="number" step="0.5" min="0" value="${esc(S.settings.depositRate??'')}" placeholder="varsayılan %${esc(S.macro&&S.macro.deposit?S.macro.deposit.annualGross:40)}"><button class="btn ghost" id="depSave">Kaydet</button></div></label>
      <label class="muted" style="font-size:13px;display:flex;flex-direction:column;gap:6px;margin-top:18px">GitHub anahtarı (izleme listesini otomatik görevlere iletmek için)
        <div style="display:flex;gap:8px"><input id="ghTok" type="password" value="${esc(S.settings.ghToken||'')}" placeholder="github_pat_..."><button class="btn ghost" id="ghSave">Kaydet</button></div></label>
      <p class="muted" style="font-size:12.5px;margin:8px 0 0">GitHub → Settings → Developer settings → Fine-grained tokens → Generate. Repository access: sadece <b>portfoy-defteri</b>. Permissions → Contents: <b>Read and write</b>. Anahtar yalnızca senin hesabında ve bu tarayıcıda saklanır.</p>
      <div class="row-end" style="justify-content:flex-start"><button class="btn ghost sm" id="liveNow">Şimdi canlı çek</button>${S.session?'<button class="btn ghost sm" id="logout2">Çıkış yap</button>':''}</div>
    </section>
  </div></div>`;
}
function afterPozisyon(){
  const f=$('#lotForm');
  if(f){
    f.t.onchange=()=>{f.p.placeholder=String(quote(f.t.value).price||'')};f.t.onchange();
    if(S.prefill){const pf=S.prefill;f.t.value=pf.t;f.q.value=pf.q;f.p.value=pf.p;f.note.value=pf.note||'';S.prefillUsed={planId:pf.planId,planI:pf.planI};S.prefill=null;f.scrollIntoView({behavior:'smooth',block:'center'});toast('Plan taksiti forma işlendi; fiyatı kontrol edip ekle')}
    f.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));
      const lot={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),date:d.date,t:d.t,side:d.side,q:+d.q,p:+d.p,fee:+d.fee||0,fx:+d.fx||(S.fx?+S.fx.toFixed(4):null),note:d.note||''};
      if(d.thesis&&d.side==='B'){lot.thesis=d.thesis.trim();lot.target=+d.target||null;lot.exitRule=(d.exitRule||'').trim();lot.reviewAt=addDays(d.date,90)}
      if(!(lot.q>0&&lot.p>0)){toast('Adet ve fiyat gir');return}
      if(lot.side==='S'){const m=positions().list.find(x=>x.t===lot.t);if(!m||m.qty<lot.q-1e-9){toast('Elindeki adetten fazla satılamaz');return}}
      S.lots.push(lot);await saveLots();if(S.prefillUsed)await planMarkDone();toast('İşlem eklendi');render(true)};
  }
  $$('[data-del]').forEach(b=>b.onclick=async()=>{if(!confirm('Bu işlem silinsin mi?'))return;S.lots=S.lots.filter(l=>l.id!==b.dataset.del);await saveLots();render(true)});
  $$('[data-tw]').forEach(inp=>inp.onchange=async()=>{const v=inp.value===''?null:+inp.value;S.settings.targets=S.settings.targets||{};if(v==null)delete S.settings.targets[inp.dataset.tw];else S.settings.targets[inp.dataset.tw]=v;await saveSettings();render(false)});
  const ts=$('#tdSave');if(ts)ts.onclick=async()=>{S.settings.tdKey=$('#tdKey').value.trim();await saveSettings();toast('Anahtar kaydedildi');fetchLive(true)};
  const dr=$('#depSave');if(dr)dr.onclick=async()=>{const v=$('#depR').value;S.settings.depositRate=v===''?null:+v;await saveSettings();toast('Kaydedildi')};
  const gs=$('#ghSave');if(gs)gs.onclick=async()=>{S.settings.ghToken=$('#ghTok').value.trim();await saveSettings();toast('GitHub anahtarı kaydedildi')};
  const ln=$('#liveNow');if(ln)ln.onclick=()=>fetchLive(true);
  const lo=$('#logout2');if(lo)lo.onclick=()=>{logout();render(true)};
  const gl=$('#goLogin');if(gl)gl.onclick=e=>{e.preventDefault();openLogin()};
  const ex=$('#expJSON');if(ex)ex.onclick=()=>{const b=new Blob([JSON.stringify({lots:S.lots,settings:{targets:S.settings.targets}},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='portfoy-islemler.json';a.click()};
  const im=$('#impJSON');if(im)im.onchange=async()=>{try{const d=JSON.parse(await im.files[0].text());if(!Array.isArray(d.lots))throw 0;if(!confirm(d.lots.length+' işlem içe aktarılsın mı? Mevcut liste değişecek.'))return;S.lots=d.lots;if(d.settings&&d.settings.targets)S.settings.targets=d.settings.targets;await saveLots();await saveSettings();render(true);toast('İçe aktarıldı')}catch(e){toast('Dosya okunamadı')}};
}

function viewHaber(){
  const all=S.data.news||[];const tk=Array.from(new Set(all.flatMap(n=>n.tickers||[]))).sort((a,b)=>ORDER.indexOf(a)-ORDER.indexOf(b));
  const f=S.newsFilter;const list=f==='ALL'?all:all.filter(n=>(n.tickers||[]).includes(f));
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Haberler</h2><p>Fonlar ve içindeki şirketlerle ilgili seçilmiş haberler · günde iki kez güncellenir</p></div></div>
  <div class="filters" id="nf"><button data-f="ALL" class="${f==='ALL'?'on':''}">Tümü (${all.length})</button>${tk.map(t=>`<button data-f="${t}" class="${f===t?'on':''}">${t}</button>`).join('')}</div>
  <section class="card"><div class="news">${list.map(nwRow).join('')||'<div class="empty">Bu filtrede haber yok</div>'}</div></section></div>`;
}
function viewTakvim(){
  const ev=(S.data.events||[]).filter(e=>new Date(e.date)>=new Date(Date.now()-864e5));
  const groups={};ev.forEach(e=>{const k=new Date(e.date).toLocaleDateString('tr-TR',{month:'long',year:'numeric',timeZone:'Europe/Istanbul'});(groups[k]||(groups[k]=[])).push(e)});
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Takvim</h2><p>Bilançolar, makro veriler ve Fed · saatler İstanbul saati · Google Takvim'ine de işlendi</p></div></div>
  ${Object.entries(groups).map(([k,v])=>`<section class="card sec"><h3>${esc(k)}</h3>${v.map(evRow).join('')}</section>`).join('')||'<div class="empty">Yaklaşan olay yok</div>'}</div>`;
}

/* ---------- router ---------- */
function route(){const h=location.hash.replace(/^#\/?/,'')||'ozet';const [r,a]=h.split('/');return {r,a:a&&decodeURIComponent(a).toUpperCase()}}
let lastRoute='';
function render(scrollTop){
  if(!S.data)return;
  const {r,a}=route();const key=r+'/'+(a||'');
  const y=window.scrollY;
  setTabs(r);renderTop();renderUser();
  const v=$('#view');
  if(r==='t'){v.innerHTML=viewInst(a);afterInst(a)}
  else if(r==='pozisyon'){v.innerHTML=viewPozisyon();afterPozisyon()}
  else if(r==='enstruman'){v.innerHTML=viewEnstruman();afterWatch()}
  else if(r==='analiz'){v.innerHTML=viewAnaliz()+viewScreener()+viewSim();afterAnaliz();afterSim()}
  else if(r==='haftalik'){v.innerHTML=viewHaftalik()}
  else if(r==='defter'){v.innerHTML=viewDefter();afterDefter()}
  else if(r==='haber'){v.innerHTML=viewHaber();$$('#nf button').forEach(b=>b.onclick=()=>{S.newsFilter=b.dataset.f;render(false)})}
  else if(r==='takvim'){v.innerHTML=viewTakvim()}
  else{v.innerHTML=viewOzet();afterOzet()}
  $$('.ranges').forEach(g=>$$('button',g).forEach(b=>b.onclick=()=>{S.range[g.dataset.k]=b.dataset.r;render(false)}));
  if(scrollTop!==false&&key!==lastRoute)window.scrollTo(0,0);else window.scrollTo(0,y);
  lastRoute=key;
  if(!scrollTop)$$('.fade').forEach(n=>n.classList.remove('fade'));
}

/* ---------- boot ---------- */
function openLogin(){$('#login').hidden=false;setTimeout(()=>$('#lEmail').focus(),50)}
async function loadData(){
  const v='?t='+Math.floor(Date.now()/60000);
  const [d,p,h]=await Promise.all(['portfolio','prices','history'].map(n=>fetch('data/'+n+'.json'+v).then(r=>{if(!r.ok)throw new Error(n+'.json '+r.status);return r.json()})));
  const opt=n=>fetch('data/'+n+'.json'+v).then(r=>r.ok?r.json():null).catch(()=>null);
  const [m,w,wl,er,ins,oh]=await Promise.all([opt('macro'),opt('weekly'),opt('watchlist'),opt('earnings'),opt('insider'),opt('ohlc')]);
  S.data=d;S.prices=p;S.hist=h;S.macro=m;S.weekly=w;if(wl)S.watch=wl;S.earn=er;S.insider=ins;S.ohlc=oh;
}
async function boot(){
  const th=lsGet('pd_theme');if(th)document.documentElement.dataset.theme=th;
  $('#theme').onclick=()=>{const n=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=n;lsSet('pd_theme',n);render(false)};
  $('#ccy').onclick=()=>{if(!S.fx){toast('Kur alınamadı');return}S.ccy=S.ccy==='USD'?'TRY':'USD';lsSet('pd_ccy',S.ccy);render(false)};
  $('#refresh').onclick=()=>fetchLive(true);
  $('#user').onclick=()=>{if(S.session){if(confirm('Çıkış yapılsın mı?')){logout();render(false)}}else openLogin()};
  $('[data-close]').onclick=()=>$('#login').hidden=true;
  $('#login').onclick=e=>{if(e.target.id==='login')$('#login').hidden=true};
  const go=async()=>{const err=$('#lErr');err.hidden=true;try{await login($('#lEmail').value.trim(),$('#lPass').value);$('#login').hidden=true;await cloudLoad();toast('Hoş geldin');render(false);fetchLive(false)}catch(e){err.textContent=e.message;err.hidden=false}};
  $('#lGo').onclick=go;$('#lPass').onkeydown=e=>{if(e.key==='Enter')go()};
  try{await loadData()}catch(e){$('#view').innerHTML=`<div class="empty"><b>Veri yüklenemedi</b>${esc(e.message)}</div>`;return}
  await Promise.all([loadFX(),loadSession().then(s=>s&&cloudLoad())]);
  render(true);
  window.addEventListener('hashchange',()=>render(true));
  let rt;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>render(false),150)});
  setInterval(()=>{renderTop();autoLive()},60000);
  document.addEventListener('visibilitychange',autoLive);
  setInterval(async()=>{try{const old=S.prices&&S.prices.updatedAt;await loadData();if(S.prices.updatedAt!==old)render(false)}catch(e){}},15*60000);
  autoLive();
}
boot();
