#!/usr/bin/env node
// Portföy Defteri — uzak alarm kontrolü. Sitenin kendi teknik plan kodunu (teknik.js, strateji.js) Node'da çalıştırır.
// Kullanım: node tools/check_alerts.mjs            -> tetiklenen alarmları JSON olarak yazar, data/alert_state.json'u günceller
//           node tools/check_alerts.mjs --summary  -> ayrıca sabah brifingi için özet verisi (movers, plan durumları, olaylar)
//           --dry  -> durum dosyasını değiştirme
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import {fileURLToPath} from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');const D=f=>path.join(ROOT,'data',f);
const rd=(f,d=null)=>{try{return JSON.parse(fs.readFileSync(D(f),'utf8'))}catch(e){return d}};
const args=process.argv.slice(2);const DRY=args.includes('--dry'),SUM=args.includes('--summary');
const LIVE=args.includes('--live'),TG=args.includes('--telegram');
const TGT=(process.env.TG_TOKEN||'').trim(),TGC=(process.env.TG_CHAT||'').trim();
if(TG&&(!TGT||!TGC)){console.log(JSON.stringify({skipped:'TG_TOKEN/TG_CHAT secret yok'}));process.exit(0)}
const S={data:rd('portfolio.json'),prices:rd('prices.json'),hist:rd('history.json',{}),ohlc:rd('ohlc.json',{}),monthly:rd('monthly.json'),live:{},settings:{},lots:[],fx:(rd('prices.json')||{}).usdtry||0};
const isNum=v=>typeof v==='number'&&isFinite(v);
const nf=(v,d=2)=>isNum(v)?v.toLocaleString('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const ctx={S,isNum,nf,console,Math,Date,JSON,Map,Set,Array,Object,Number,String,isFinite,Infinity,NaN,parseFloat,
  usd:(v,d=2)=>isNum(v)?'$'+nf(v,d):'—',pct:(v,d=2)=>isNum(v)?(v>0?'+':v<0?'−':'')+'%'+nf(Math.abs(v),d):'—',esc:s=>String(s??''),fx:()=>S.fx||0,
  inst:t=>S.data.instruments[t],sig:t=>(S.data.signals||{})[t],trDate:s=>String(s).slice(0,10),
  series:t=>S.hist[t]||[],lsGet:()=>null,lsSet:()=>{},lsJSON:(k,d)=>d,navigator:{},window:{},document:{addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},$:()=>null,$$:()=>[]};
ctx.quote=t=>{const i=ctx.inst(t)||{},p=(S.prices&&S.prices.quotes[t])||{};return {price:p.price??i.price,chg:p.chg,pct:p.pct,day:p.day||(i.priceAsOf||'').slice(0,10),hi52:p.hi52??i.high52,lo52:p.lo52??i.low52}};
vm.createContext(ctx);
if(LIVE){const today=new Date().toISOString().slice(0,10);const syms=Object.keys(S.data.instruments).filter(t=>!/:/.test(t));let got=0;
  for(const t of syms){const s=t==='NOVO.B'?'NVO':t;let J=null;for(const h of ['https://cdn.cboe.com','https://cdn-api.cboe.com']){try{const r=await fetch(`${h}/api/global/delayed_quotes/quotes/${s}.json`,{headers:{'User-Agent':'PortfoyDefteri'}});if(r.ok){J=await r.json();break}}catch(e){}}
    const q=J&&J.data;if(!q||!(q.current_price>0))continue;got++;S.prices=S.prices||{quotes:{}};S.prices.quotes=S.prices.quotes||{};const old=S.prices.quotes[t]||{};
    S.prices.quotes[t]={...old,price:q.current_price,chg:q.price_change,pct:q.price_change_percent,day:today};
    const a=S.ohlc[t];if(Array.isArray(a)&&a.length){const L=a[a.length-1];if(L[0]===today){L[2]=Math.max(L[2],q.high||q.current_price);L[3]=Math.min(L[3],q.low||q.current_price);L[4]=q.current_price}else if(L[0]<today)a.push([today,q.open||q.current_price,q.high||q.current_price,q.low||q.current_price,q.current_price,q.volume||0])}}
  S.prices.asOf=new Date().toISOString();if(!got){console.log(JSON.stringify({skipped:'canlı fiyat alınamadı'}));process.exit(0)}}
for(const f of ['ekler.js','teknik.js','strateji.js','kural.js']){try{vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f})}catch(e){console.error('yükleme uyarısı',f,e.message)}}
const I=S.data.instruments;const tickers=Object.keys(I).filter(t=>(S.ohlc[t]||[]).length>=120);
const st=rd('alert_state.json',{plans:{},levels:{},tp:{},day:''});st.rules=st.rules||{};const alarms=rd('alarms.json',{levels:[],planAlerts:true});
const msgs=[];const px=t=>ctx.quote(t).price;const d=t=>String(t).replace(/:BIST$/,'');const f=(t,v)=>ctx.pxf?ctx.pxf(t,v):nf(v);
const plans={};
for(const t of tickers){let P=null;try{P=ctx.tradePlan(t)}catch(e){}if(!P)continue;plans[t]=P;const prev=st.plans[t];
  if(alarms.planAlerts!==false&&prev&&prev!==P.state){
    if(P.state==='Fiyat alım bölgesinde')msgs.push({lvl:2,t,txt:`${d(t)} teknik alım bölgesine geldi (${f(t,P.zone.lo)}–${f(t,P.zone.hi)}). Stop ${f(t,P.stop)}, TP1 ${f(t,P.tp1.p)}.`});
    if(P.state==='Destek kırıldı')msgs.push({lvl:3,t,txt:`${d(t)} plan stop seviyesinin (${f(t,P.stop)}) altına indi. Fiyat ${f(t,P.px)}.`});}
  st.plans[t]=P.state;
  const hi=Math.max(...(S.ohlc[t]||[]).slice(-1).map(r=>r[2]));const key=t+'|'+P.tp1.p.toFixed(2);
  if(alarms.planAlerts!==false&&prev&&hi>=P.tp1.p&&!st.tp[key]&&P.state!=='Fiyat alım bölgesinde'){st.tp[key]=1;}
}
for(const L of (alarms.levels||[])){const p=px(L.t);if(!(p>0))continue;const k=L.t+'|'+L.p;const side=p>L.p?'up':'down';const prev=st.levels[k];
  if(prev&&prev!==side)msgs.push({lvl:3,t:L.t,txt:`${d(L.t)} alarm seviyeni ${side==='up'?'yukarı':'aşağı'} kırdı: seviye ${f(L.t,L.p)}, fiyat ${f(L.t,p)}.`});st.levels[k]=side}
Object.keys(st.levels).forEach(k=>{if(!(alarms.levels||[]).some(L=>L.t+'|'+L.p===k))delete st.levels[k]});
const ruleStat=[];st.trails=st.trails||{};
for(const T of (alarms.trails||[])){const a=ctx.candles?ctx.candles(T.t):[];if(!a||a.length<20)continue;const atr=ctx.atrS(a)[a.length-1];const seg=a.filter(x=>x.d>=T.since);const hi=Math.max(...(seg.length?seg:a.slice(-1)).map(x=>x.c));const lvl=hi-(T.k||3)*atr;const px=a[a.length-1].c;const below=px<lvl;
  if(below&&st.trails[T.t]!==true)msgs.push({lvl:3,t:T.t,txt:`📉 ${d(T.t)} iz süren stopunu kırdı: stop ${f(T.t,lvl)} (zirve ${f(T.t,hi)} − ${T.k||3}×ATR), fiyat ${f(T.t,px)}.`});st.trails[T.t]=below}
for(const R of (alarms.rules||[])){let E=null;try{E=ctx.ruleEval(R)}catch(e){console.error('kural hatası',R.id,e.message)}if(!E)continue;
  if(E.ok&&st.rules[R.id]!==true)msgs.push({lvl:2,t:R.t,txt:'🎯 '+ctx.ruleText(R,E)});st.rules[R.id]=E.ok;ruleStat.push({t:d(R.t),name:R.name,ok:E.ok})}
Object.keys(st.rules).forEach(k=>{if(!(alarms.rules||[]).some(R=>R.id===k))delete st.rules[k]});
if(!LIVE)st.updatedAt=new Date().toISOString();if(!DRY)fs.writeFileSync(D('alert_state.json'),JSON.stringify(st,null,1)+'\n');
const out={asOf:S.prices.asOf,messages:msgs};
if(SUM){const q=t=>S.prices.quotes[t]||{};
  out.movers=Object.keys(I).filter(t=>isNum(q(t).pct)).map(t=>({t:d(t),pct:+q(t).pct.toFixed(2),watch:!!I[t].watchlist})).sort((a,b)=>b.pct-a.pct);
  out.plans=Object.entries(plans).map(([t,P])=>({t:d(t),state:P.state,px:+P.px.toFixed(2),zone:[+P.zone.lo.toFixed(2),+P.zone.hi.toFixed(2)],stop:+P.stop.toFixed(2),tp1:+P.tp1.p.toFixed(2),rr1:+P.rr1.toFixed(2),rsi:Math.round(P.rsi)}));
  const now=Date.now();out.events=(S.data.events||[]).filter(e=>{const x=new Date(e.date)-now;return x>-6*3600e3&&x<48*3600e3}).map(e=>({date:e.date,title:e.title,tickers:e.tickers,importance:e.importance}));
  out.news=(S.data.news||[]).filter(n=>now-new Date(n.publishedAt)<24*3600e3).slice(0,8).map(n=>({title:n.title,tickers:n.tickers,impact:n.impact,importance:n.importance}));}
if(SUM)out.rules=ruleStat;
if(TG&&msgs.length){const txt=msgs.sort((a,b)=>b.lvl-a.lvl).map(m=>'• '+m.txt).join('\n')+'\n\nhttps://brsclk16.github.io/portfoy-defteri/';
  try{const r=await fetch(`https://api.telegram.org/bot${TGT}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:TGC,text:'🔔 Portföy Defteri\n'+txt,disable_web_page_preview:true})});out.telegram=r.ok?'gönderildi':'hata '+r.status}catch(e){out.telegram='hata'}}
console.log(JSON.stringify(out,null,1));
