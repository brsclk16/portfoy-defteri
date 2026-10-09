#!/usr/bin/env node
// Portföy Defteri — canlı sinyal karnesi.
// Sitenin KENDİ ürettiği sinyalleri her iş günü kapanıştan sonra tarih ve fiyatıyla kaydeder, 5 / 21 / 63 işlem günü sonra
// SPY ve SMH'ye karşı puanlar. Sinyal kodu sitedekiyle aynıdır (teknik.js, strateji.js, pro.js Node vm içinde çalışır).
//   Kaynaklar: teknik plan durumu (alım bölgesi / aşırı ısınma / stop kırılımı), Fikir tarayıcı presetleri (yeni giren hisse),
//              ORION araştırma duruşu, seçilmiş haberlerin etki etiketi (olumlu / olumsuz).
//   src:'canli' → gerçekten o gün kaydedilmiş sinyal (sonradan değiştirilemez, commit geçmişinde tarih damgalı).
//   src:'geri'  → aynı plan kodunun geçmiş günlere yeniden uygulanması (karşılaştırma için; bugünkü kodla üretildiği için iyimser olabilir).
// Kullanım: node tools/signal_log.mjs [--backfill] [--dry]
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import {fileURLToPath} from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');const D=f=>path.join(ROOT,'data',f);
const rd=(f,d=null)=>{try{return JSON.parse(fs.readFileSync(D(f),'utf8'))}catch(e){return d}};
const args=process.argv.slice(2);const DRY=args.includes('--dry');
const OUT='signals.json';const H=[5,21,63];const MAX_EVENTS=6000;

/* ---------- sitenin kodunu yükle ---------- */
const S={data:rd('portfolio.json'),prices:rd('prices.json',{quotes:{}}),hist:rd('history.json',{}),ohlc:rd('ohlc.json',{}),monthly:rd('monthly.json'),
  univ:rd('universe.json'),valuation:rd('valuation.json'),watch:rd('watchlist.json'),live:{},settings:{},lots:[],fx:0};
const isNum=v=>typeof v==='number'&&isFinite(v);
const nf=(v,d=2)=>isNum(v)?v.toLocaleString('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const ctx={S,isNum,nf,console,Math,Date,JSON,Map,Set,Array,Object,Number,String,isFinite,Infinity,NaN,parseFloat,
  usd:(v,d=2)=>isNum(v)?'$'+nf(v,d):'—',pct:(v,d=2)=>isNum(v)?(v>0?'+':'')+'%'+nf(v,d):'—',esc:s=>String(s??''),fx:()=>0,
  inst:t=>S.data.instruments[t],sig:()=>null,trDate:s=>String(s).slice(0,10),series:t=>S.hist[t]||[],lsGet:()=>null,lsSet:()=>{},lsJSON:(k,d)=>d,
  navigator:{},window:{},location:{hash:''},document:{addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},$:()=>null,$$:()=>[],toast:()=>{}};
ctx.quote=t=>{const i=ctx.inst(t)||{},p=(S.prices.quotes||{})[t]||{};return {price:p.price??i.price,day:p.day||(i.priceAsOf||'').slice(0,10),hi52:p.hi52??i.high52,lo52:p.lo52??i.low52}};
vm.createContext(ctx);
for(const f of ['ekler.js','teknik.js','strateji.js','pro.js']){try{vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f})}catch(e){console.error('yükleme uyarısı',f,e.message)}}

/* ---------- fiyat erişimi ---------- */
const LP=rd('long_px.json',{dates:[],px:{}});
const CAL=(S.ohlc.SPY||[]).map(r=>r[0]);const TODAY=CAL[CAL.length-1];
if(!TODAY){console.log(JSON.stringify({skipped:'SPY ohlc yok'}));process.exit(0)}
const calIdx=new Map(CAL.map((d,i)=>[d,i]));
const series={};
for(const [t,a] of Object.entries(S.ohlc))series[t]=a.map(r=>[r[0],r[4]]);
for(const [t,a] of Object.entries(LP.px||{})){if(series[t])continue;const s=[];a.forEach((v,i)=>{if(v>0)s.push([LP.dates[i],v])});series[t]=s}
function lastLE(a,d){let lo=0,hi=a.length-1,ans=null;while(lo<=hi){const m=(lo+hi)>>1;if(a[m][0]<=d){ans=a[m];lo=m+1}else hi=m-1}return ans}
function firstGE(a,d){let lo=0,hi=a.length-1,ans=null;while(lo<=hi){const m=(lo+hi)>>1;if(a[m][0]>=d){ans=a[m];hi=m-1}else lo=m+1}return ans}
const sym=t=>t==='NOVO.B'?'NVO':t;
function pxOn(t,d){const s=series[t];if(s&&s.length){const r=lastLE(s,d);return r&&r[0]===d?r[1]:null}return null}
function hasSeries(t){return !!(series[t]&&series[t].length)}
function uPx(t){const u=((S.univ&&S.univ.data)||{})[sym(t)];return u&&u.px>0?{px:u.px,d:u.asOf}:null}
// sinyal günü: o günün kapanışı (yoksa ilk sonraki işlem günü)
function entryDay(d){const r=firstGE(CAL.map(x=>[x]),d);return r?r[0]:null}

/* ---------- defter ---------- */
const L=rd(OUT,null)||{events:[],state:{plan:{},scr:{}},seen:{}};L.state=L.state||{plan:{},scr:{}};L.seen=L.seen||{};
const have=new Set(L.events.map(e=>e.id));
let added=0;
const COOL=10;const lastAt={};  // aynı hisse+tür için 10 işlem gününden sık tekrar eden sinyal yeni olay sayılmaz (iç içe geçen olaylar istatistiği şişirir)
for(const e of L.events){const k=e.src+'|'+e.k+'|'+e.t;const i=calIdx.get(e.d);if(i!=null&&(lastAt[k]==null||i>lastAt[k]))lastAt[k]=i}
function addEvent(e){if(have.has(e.id))return;const k=e.src+'|'+e.k+'|'+e.t;const i=calIdx.get(e.d);
  if(i!=null&&lastAt[k]!=null&&Math.abs(i-lastAt[k])<COOL)return;if(i!=null)lastAt[k]=i;have.add(e.id);e.r={};L.events.push(e);added++}
function bench(d){return {spy:pxOn('SPY',d),smh:pxOn('SMH',d)}}

const PLAN={'Fiyat alım bölgesinde':['plan_alim',1,'Teknik alım bölgesine girdi'],'Aşırı ısınmış':['plan_isinma',-1,'Aşırı ısınmış'],'Destek kırıldı':['plan_kirildi',-1,'Stop seviyesinin altına indi']};
const candlesTo=(t,n)=>(S.ohlc[t]||[]).slice(0,n).map(r=>({d:r[0],o:r[1],h:r[2],l:r[3],c:r[4],v:r[5]||0}));
const planTickers=Object.keys(S.ohlc).filter(t=>t!=='SPY'&&(S.ohlc[t]||[]).length>=200);

/* 1) geriye dönük plan sinyalleri (bir kez ya da --backfill ile) */
if(args.includes('--backfill')||!L.backfillAt){
  L.events=L.events.filter(e=>e.src!=='geri');for(const id of [...have])if(id.startsWith('g|'))have.delete(id);for(const k of Object.keys(lastAt))if(k.startsWith('geri|'))delete lastAt[k];
  for(const t of planTickers){const a=S.ohlc[t];let prev=null;
    for(let n=200;n<a.length;n++){let P=null;try{P=ctx.tradePlan(t,candlesTo(t,n))}catch(e){}
      const st=P?P.state:null;const d=a[n-1][0];
      if(prev&&st&&st!==prev&&PLAN[st]){const [k,dir,lbl]=PLAN[st];addEvent({id:`g|${k}|${t}|${d}`,src:'geri',k,dir,t,d,lbl,px:P.px,...bench(d)})}
      if(st)prev=st}}
  L.backfillAt=new Date().toISOString();
}

/* 2) canlı: bugünkü plan durumu */
for(const t of planTickers){let P=null;try{P=ctx.tradePlan(t,candlesTo(t,S.ohlc[t].length))}catch(e){}if(!P)continue;
  const d=S.ohlc[t][S.ohlc[t].length-1][0];const prev=L.state.plan[t];
  if(prev&&prev!==P.state&&PLAN[P.state]){const [k,dir,lbl]=PLAN[P.state];addEvent({id:`c|${k}|${t}|${d}`,src:'canli',k,dir,t,d,lbl,px:P.px,...bench(d)})}
  L.state.plan[t]=P.state}

/* 3) canlı: Fikir tarayıcı presetleri — listeye yeni giren hisseler */
try{const PRE=vm.runInContext('SCR_PRE',ctx).filter(p=>Object.keys(p.f).length);const rows=ctx.scrRows();
  const uDay=(S.univ&&S.univ.updatedAt||'').slice(0,10);const d=entryDay(uDay)||TODAY;
  PRE.forEach((p,i)=>{const key='p'+i;const now=ctx.scrApply(rows,p.f).map(r=>r.t);const prev=L.state.scr[key];
    if(prev){const ps=new Set(prev);for(const t of now)if(!ps.has(t)){const u=uPx(t);if(!u)continue;
      addEvent({id:`c|scr${i}|${t}|${d}`,src:'canli',k:'scr'+i,dir:1,t,d,lbl:'Tarayıcı: '+p.n,px:pxOn(sym(t),d)||u.px,...bench(d)})}}
    L.state.scr[key]=now});
  L.state.scrNames=Object.fromEntries(PRE.map((p,i)=>['scr'+i,p.n]));
}catch(e){console.error('tarayıcı atlandı',e.message)}

/* 4) canlı: ORION duruşları */
const ST={'olumlu':1,'al':1,'pozitif':1,'olumsuz':-1,'sat':-1,'negatif':-1,'nötr':0,'notr':0};
for(const it of ((rd('research/index.json',{})||{}).items||[])){const dir=ST[String(it.stance||'').toLowerCase()];if(dir==null)continue;
  const d=entryDay(String(it.answeredAt||'').slice(0,10));if(!d)continue;
  for(const t of it.tickers||[]){const px=pxOn(t,d)||(d===TODAY&&uPx(t)?uPx(t).px:null);if(!px)continue;
    addEvent({id:`c|orion|${t}|${it.id}`,src:'canli',k:'orion',dir,t,d,lbl:'ORION: '+it.stance,px,...bench(d)})}}

/* 5) canlı: seçilmiş haberlerin etki etiketi (önem ≥2, portföydeki enstrüman) */
for(const n of (S.data.news||[])){const dir=n.impact==='olumlu'?1:n.impact==='olumsuz'?-1:null;if(dir==null||(n.importance||1)<2)continue;
  const d=entryDay(String(n.publishedAt||'').slice(0,10));if(!d)continue;
  for(const t of (n.tickers||[]).filter(x=>S.data.instruments[x])){const px=pxOn(t,d);if(!px)continue;
    addEvent({id:`c|haber|${t}|${n.id||n.url}`,src:'canli',k:'haber',dir,t,d,lbl:'Haber: '+(n.impact),px,...bench(d),title:(n.title||'').slice(0,120)})}}

/* ---------- puanlama ---------- */
const iToday=calIdx.get(TODAY);
for(const e of L.events){const i0=calIdx.get(e.d);if(i0==null)continue;e.r=e.r||{};
  for(const h of H){if(e.r[h])continue;const i1=i0+h;if(i1>iToday)continue;const d1=CAL[i1];
    let p1=hasSeries(e.t)?pxOn(e.t,d1):null,approx=false;
    if(p1==null&&!hasSeries(e.t)){const u=uPx(e.t);if(u&&i1>=iToday-1){p1=u.px;approx=true}}  // geçmişi olmayan hisse: vadesi dolduğu gün güncel fiyatla işaretle
    const b=bench(d1);if(!(p1>0)||!(e.px>0)||!(b.spy>0)||!(e.spy>0))continue;
    const ret=(p1/e.px-1)*100,spy=(b.spy/e.spy-1)*100,smh=e.smh>0&&b.smh>0?(b.smh/e.smh-1)*100:null;
    e.r[h]={d:d1,ret:+ret.toFixed(2),spy:+spy.toFixed(2),smh:smh==null?null:+smh.toFixed(2),ex:+(ret-spy).toFixed(2),...(approx?{approx:1}:{})}}}

/* ---------- taban oran: aynı hissede rastgele bir günün SPY üstü getirisi ---------- */
const BASE_FROM=CAL[Math.min(CAL.length-1,199)];const base={};
function uncond(t,h){const k=t+'|'+h;if(k in base)return base[k];const s=series[t];if(!s||!s.length)return base[k]=null;
  let sum=0,n=0;for(let i=calIdx.get(BASE_FROM)??0;i+h<=iToday;i++){const a=pxOn(t,CAL[i]),b=pxOn(t,CAL[i+h]),x=pxOn('SPY',CAL[i]),y=pxOn('SPY',CAL[i+h]);
    if(a>0&&b>0&&x>0&&y>0){sum+=(b/a-1)*100-(y/x-1)*100;n++}}return base[k]=n>20?sum/n:null}

/* ---------- özet ---------- */
const med=a=>{if(!a.length)return null;const s=a.slice().sort((x,y)=>x-y);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
const NAMES={plan_alim:'Alım bölgesine giriş',plan_isinma:'Aşırı ısınma',plan_kirildi:'Stop kırılımı',orion:'ORION duruşu',haber:'Haber etkisi',...(L.state.scrNames||{})};
const groups={};
for(const e of L.events){const g=groups[e.src+'|'+e.k]||(groups[e.src+'|'+e.k]={src:e.src,k:e.k,name:NAMES[e.k]||e.k,n:0,h:{}});g.n++;
  for(const h of H){const r=e.r&&e.r[h];if(!r)continue;const x=g.h[h]||(g.h[h]={exs:[],hits:0,rets:[],bases:[]});x.exs.push(e.dir*r.ex);x.rets.push(r.ret);if(e.dir&&e.dir*r.ex>0)x.hits++;const u=uncond(e.t,h);if(u!=null&&e.dir)x.bases.push(e.dir*u)}}
const summary=Object.values(groups).map(g=>({src:g.src,k:g.k,name:g.name,n:g.n,h:Object.fromEntries(H.map(h=>{const x=g.h[h];if(!x||!x.exs.length)return [h,{n:0}];
  const avg=x.exs.reduce((s,v)=>s+v,0)/x.exs.length;const bs=x.bases.length?x.bases.reduce((s,v)=>s+v,0)/x.bases.length:null;
  const sd=Math.sqrt(x.exs.reduce((s,v)=>s+(v-avg)**2,0)/Math.max(1,x.exs.length-1));
  return [h,{n:x.exs.length,edge:+avg.toFixed(2),med:+med(x.exs).toFixed(2),hit:+(x.hits/x.exs.length*100).toFixed(0),
    base:bs==null?null:+bs.toFixed(2),vsBase:bs==null?null:+(avg-bs).toFixed(2),t:x.exs.length>2&&sd>0?+((avg-(bs||0))/(sd/Math.sqrt(x.exs.length))).toFixed(2):null}]}))}))
  .sort((a,b)=>(a.src<b.src?-1:a.src>b.src?1:b.n-a.n));

L.events.sort((a,b)=>a.d<b.d?1:a.d>b.d?-1:0);if(L.events.length>MAX_EVENTS){const keep=L.events.filter(e=>e.src==='canli');L.events=keep.concat(L.events.filter(e=>e.src!=='canli').slice(0,Math.max(0,MAX_EVENTS-keep.length)))}
L.updatedAt=new Date().toISOString();L.asOf=TODAY;L.horizons=H;L.summary=summary;
L.note='edge = sinyal yönünde SPY üstü getiri (puan): yön +1 ise getiri−SPY, yön −1 ise SPY−getiri. hit = edge>0 oranı. base = aynı hisselerde rastgele bir günün aynı yöndeki SPY üstü getirisi (taban oran); vsBase = edge−base, sinyalin gerçek katkısı. t = vsBase / standart hata (olaylar vadede iç içe geçebildiği için iyimser; |t|<2 ise ayırt edilemez). canli: o gün kaydedildi; geri: bugünkü kodla geçmişe uygulandı.';
if(!DRY)fs.writeFileSync(D(OUT),JSON.stringify(L)+'\n');
console.log(JSON.stringify({asOf:TODAY,added,events:L.events.length,canli:L.events.filter(e=>e.src==='canli').length,summary:summary.map(s=>({src:s.src,name:s.name,n:s.n,h5:s.h['5'],h21:s.h['21'],h63:s.h['63']}))},null,1));
