/* Portföy Defteri — kural tabanlı alarm motoru. Hem sitede hem tools/check_alerts.mjs içinde (Node vm) çalışır; DOM kullanmaz. */
"use strict";
const RULE_KINDS=[
  {k:'rsi_lt',l:'RSI (14) şunun altında',v:30,f:'RSI {v} altında',u:''},{k:'rsi_gt',l:'RSI (14) şunun üstünde',v:70,f:'RSI {v} üstünde',u:''},
  {k:'in_zone',l:'Teknik alım bölgesinde',v:null},{k:'overheated',l:'Aşırı ısınmış (plan)',v:null},{k:'below_stop',l:'Plan stop seviyesinin altında',v:null},
  {k:'px_lt',l:'Fiyat şunun altında',v:null,f:'Fiyat ${v} altında',u:'$'},{k:'px_gt',l:'Fiyat şunun üstünde',v:null,f:'Fiyat ${v} üstünde',u:'$'},
  {k:'below_sma',l:'Fiyat hareketli ortalamanın altında',v:50,f:'{v} günlük ortalamanın altında',u:'gün'},{k:'above_sma',l:'Fiyat hareketli ortalamanın üstünde',v:50,f:'{v} günlük ortalamanın üstünde',u:'gün'},
  {k:'golden',l:'50 günlük ort. 200 günlüğü yukarı kesti (son 5 gün)',v:null},{k:'death',l:'50 günlük ort. 200 günlüğü aşağı kesti (son 5 gün)',v:null},
  {k:'ratio_below',l:'Oran (sembol ÷ SPY) kendi ortalamasının altında',v:50,f:'SPY\'a göre oran {v} günlük ortalamasının altında',u:'gün'},{k:'ratio_above',l:'Oran (sembol ÷ SPY) kendi ortalamasının üstünde',v:50,f:'SPY\'a göre oran {v} günlük ortalamasının üstünde',u:'gün'},
  {k:'dd_high',l:'52 haftalık zirveden en az şu kadar aşağıda',v:15,f:'52 hafta zirvesinden en az %{v} aşağıda',u:'%'},{k:'day_drop',l:'Günlük düşüş en az',v:4,f:'Günlük düşüş en az %{v}',u:'%'},{k:'day_rise',l:'Günlük yükseliş en az',v:4,f:'Günlük yükseliş en az %{v}',u:'%'},
  {k:'vol_spike',l:'Hacim 20 günlük ortalamanın şu katı',v:2,f:'Hacim 20 günlük ortalamanın {v} katı',u:'×'}
];
const RULE_PRESETS=[
  {name:'Alım bölgesi + RSI 35 altı',conds:[{k:'in_zone'},{k:'rsi_lt',v:35}]},
  {name:'SPY\'a göre güç kaybı (oran 50g ortalamanın altında)',conds:[{k:'ratio_below',v:50}]},
  {name:'Zirveden %15 düşüş ve RSI 40 altı',conds:[{k:'dd_high',v:15},{k:'rsi_lt',v:40}]},
  {name:'Altın kesişim',conds:[{k:'golden'}]},
  {name:'Sert günlük düşüş + yüksek hacim',conds:[{k:'day_drop',v:4},{k:'vol_spike',v:1.8}]}
];
function ruleCloses(t){const o=(S.ohlc&&S.ohlc[t])||[];if(o.length>=60){const c=typeof candles==='function'?candles(t):o.map(r=>({d:r[0],c:r[4],h:r[2],l:r[3],v:r[5]}));return c}
  return ((S.hist&&S.hist[t])||[]).map(p=>({d:p[0],c:p[1],h:p[1],l:p[1],v:0}))}
function ruleSma(a,n,i){if(i<n-1)return null;let s=0;for(let k=i-n+1;k<=i;k++)s+=a[k];return s/n}
function ruleEval1(t,c,C){
  const a=C.a;const cl=a.map(x=>x.c);const i=cl.length-1;if(i<20)return {ok:false,txt:'veri yok'};const px=cl[i];const v=+c.v;
  const f=x=>typeof nf==='function'?nf(x,2):String(x);
  switch(c.k){
    case 'rsi_lt':case 'rsi_gt':{if(!C.rsi)C.rsi=rsiS(cl)[i];const r=C.rsi;return {ok:c.k==='rsi_lt'?r<v:r>v,txt:`RSI ${f(r).replace(/,\d+$/,'')}`}}
    case 'in_zone':case 'overheated':case 'below_stop':{if(C.plan===undefined){try{C.plan=tradePlan(t)}catch(e){C.plan=null}}const P=C.plan;if(!P)return {ok:false,txt:'plan yok'};
      const want={in_zone:'Fiyat alım bölgesinde',overheated:'Aşırı ısınmış',below_stop:'Destek kırıldı'}[c.k];
      return {ok:P.state===want,txt:c.k==='in_zone'?`bölge ${f(P.zone.lo)}–${f(P.zone.hi)}`:c.k==='below_stop'?`stop ${f(P.stop)}`:P.state}}
    case 'px_lt':return {ok:px<v,txt:`fiyat ${f(px)}`};
    case 'px_gt':return {ok:px>v,txt:`fiyat ${f(px)}`};
    case 'below_sma':case 'above_sma':{const m=ruleSma(cl,v||50,i);if(m==null)return {ok:false,txt:'veri yok'};return {ok:c.k==='below_sma'?px<m:px>m,txt:`${v}g ort. ${f(m)}`}}
    case 'golden':case 'death':{let hit=false;for(let k=Math.max(200,i-4);k<=i;k++){const a50=ruleSma(cl,50,k),a200=ruleSma(cl,200,k),b50=ruleSma(cl,50,k-1),b200=ruleSma(cl,200,k-1);if([a50,a200,b50,b200].some(x=>x==null))continue;
        if(c.k==='golden'&&b50<=b200&&a50>a200)hit=true;if(c.k==='death'&&b50>=b200&&a50<a200)hit=true}return {ok:hit,txt:c.k==='golden'?'altın kesişim':'ölüm kesişimi'}}
    case 'ratio_below':case 'ratio_above':{const b=c.b||'SPY';const sp=(S.hist&&S.hist[b])||[];const m=new Map(sp);const r=a.filter(x=>m.has(x.d)).map(x=>x.c/m.get(x.d));const n=v||50;if(r.length<n+2)return {ok:false,txt:'veri yok'};
      const j=r.length-1,avg=ruleSma(r,n,j);return {ok:c.k==='ratio_below'?r[j]<avg:r[j]>avg,txt:`${b} oranı ortalamanın %${f((r[j]/avg-1)*100)} ${r[j]<avg?'altında':'üstünde'}`}}
    case 'dd_high':{const hi=Math.max(...a.slice(-252).map(x=>x.h||x.c));const dd=(1-px/hi)*100;return {ok:dd>=v,txt:`zirveden −%${f(dd)}`}}
    case 'day_drop':case 'day_rise':{const ch=(px/cl[i-1]-1)*100;return {ok:c.k==='day_drop'?ch<=-v:ch>=v,txt:`gün ${ch>0?'+%':'−%'}${f(Math.abs(ch))}`}}
    case 'vol_spike':{const vs=a.map(x=>x.v||0);const av=ruleSma(vs,20,i-1);if(!av)return {ok:false,txt:'hacim yok'};return {ok:vs[i]>=av*v,txt:`hacim ${f(vs[i]/av)}×`}}
  }
  return {ok:false,txt:'bilinmeyen koşul'};
}
function ruleEval(R){
  const a=ruleCloses(R.t);if(a.length<30)return {ok:false,parts:[],err:'yeterli fiyat geçmişi yok'};const C={a};
  const parts=(R.conds||[]).map(c=>({c,...ruleEval1(R.t,c,C)}));const ok=parts.length>0&&(R.logic==='or'?parts.some(p=>p.ok):parts.every(p=>p.ok));
  return {ok,parts,px:a[a.length-1].c,d:a[a.length-1].d};
}
function ruleLabel(c){const K=RULE_KINDS.find(x=>x.k===c.k)||{l:c.k};if(!K.f||c.v==null)return K.l;return K.f.replace('{v}',String(c.v).replace('.',','))}
function ruleText(R,E){return `${String(R.t).replace(/:BIST$/,'')}: ${R.name||R.conds.map(ruleLabel).join(R.logic==='or'?' veya ':' ve ')} (${E.parts.filter(p=>p.ok).map(p=>p.txt).join(', ')})`}
