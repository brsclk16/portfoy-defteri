/* Portföy Defteri — canlı akış (websocket).
   Hisse/ETF: Finnhub (ücretsiz anahtar, gerçek zamanlı işlemler) ya da Alpaca (ücretsiz anahtar, IEX gerçek zamanlı).
   7/24: Binance halka açık akışı (anahtarsız) — USDT/TRY (≈ USD/TRY) ve PAXG (≈ ons altın).
   Anahtarlar yalnızca senin ayarlarında (Supabase + bu tarayıcı) durur, repoya yazılmaz. */
"use strict";
const LV={ws:{},st:{},trades:[],bars:{},tcount:{},lastRender:0,dirty:false,flash:{},hiddenAt:0,prev:{},x:{}};
const LV_MAXT=400;
function etDate(ts){return new Date(ts||Date.now()).toLocaleDateString('en-CA',{timeZone:'America/New_York'})}
function lvSyms(){return allTickers().filter(t=>!/:|\./.test(t)||t==='NOVO.B').map(t=>t==='NOVO.B'?'NVO':t).concat(['SPY','QQQ']).filter((t,i,a)=>a.indexOf(t)===i).slice(0,45)}
function lvT(sym){return sym==='NVO'&&inst('NOVO.B')?'NOVO.B':sym}
function lvPrev(t){if(LV.prev[t]!=null)return LV.prev[t];const p=(S.prices&&S.prices.quotes&&S.prices.quotes[t])||{};const today=etDate();
  let v=null;if(p.day===today&&isNum(p.price)&&isNum(p.chg))v=p.price-p.chg;else{const o=S.ohlc&&S.ohlc[t];if(o&&o.length){const L=o[o.length-1];v=L[0]===today&&o.length>1?o[o.length-2][4]:L[4]}else if(isNum(p.price))v=p.price}
  LV.prev[t]=v;return v}
function lvOnTrade(sym,p,v,ts,src){const t=lvT(sym);if(!(p>0))return;const prev=lvPrev(t);const cur=S.live[t]||{};const day=etDate(ts);
  const hi=cur.day===day&&cur.high?Math.max(cur.high,p):p,lo=cur.day===day&&cur.low?Math.min(cur.low,p):p;
  const old=cur.price;S.live[t]={...cur,price:p,chg:prev?p-prev:cur.chg,pct:prev?(p/prev-1)*100:cur.pct,day,open:true,high:hi,low:lo,src,ts};
  if(old&&old!==p)LV.flash[t]=p>old?'up':'down';
  LV.trades.push({t,p,v:v||0,ts});if(LV.trades.length>LV_MAXT)LV.trades.splice(0,LV.trades.length-LV_MAXT);
  const m=Math.floor(ts/60000);const B=LV.bars[t]=LV.bars[t]||[];const L=B[B.length-1];
  if(L&&L.m===m){L.h=Math.max(L.h,p);L.l=Math.min(L.l,p);L.c=p;L.v+=v||0;L.n++}else{B.push({m,o:p,h:p,l:p,c:p,v:v||0,n:1});if(B.length>480)B.shift()}
  LV.tcount[t]=(LV.tcount[t]||0)+1;S.liveAt=Date.now();LV.dirty=true}
function lvStatus(k,s,msg){LV.st[k]={s,msg:msg||'',at:Date.now()};LV.dirty=true}

/* ---------- sağlayıcılar ---------- */
function lvFinnhub(key){const ws=new WebSocket('wss://ws.finnhub.io?token='+encodeURIComponent(key));LV.ws.fh=ws;lvStatus('fh','bağlanıyor');
  ws.onopen=()=>{lvStatus('fh','bağlı');lvSyms().forEach(s=>ws.send(JSON.stringify({type:'subscribe',symbol:s})))};
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(x){return}if(m.type==='trade')(m.data||[]).forEach(d=>lvOnTrade(d.s,d.p,d.v,d.t,'Finnhub (akış)'));else if(m.type==='error')lvStatus('fh','hata',m.msg)};
  ws.onerror=()=>lvStatus('fh','hata','bağlantı hatası (anahtar geçersiz olabilir)');ws.onclose=()=>{if(LV.st.fh&&LV.st.fh.s!=='hata')lvStatus('fh','kapalı');lvRetry('fh')}}
function lvAlpaca(key,sec){const ws=new WebSocket('wss://stream.data.alpaca.markets/v2/iex');LV.ws.al=ws;lvStatus('al','bağlanıyor');
  ws.onmessage=e=>{let a;try{a=JSON.parse(e.data)}catch(x){return}(Array.isArray(a)?a:[a]).forEach(m=>{
    if(m.T==='success'&&m.msg==='connected')ws.send(JSON.stringify({action:'auth',key,secret:sec}));
    else if(m.T==='success'&&m.msg==='authenticated'){lvStatus('al','bağlı');ws.send(JSON.stringify({action:'subscribe',trades:lvSyms().slice(0,30)}))}
    else if(m.T==='error')lvStatus('al','hata',(m.code||'')+' '+(m.msg||''));
    else if(m.T==='t')lvOnTrade(m.S,m.p,m.s,new Date(m.t).getTime(),'Alpaca IEX (akış)')})};
  ws.onerror=()=>lvStatus('al','hata','bağlantı hatası');ws.onclose=()=>{if(LV.st.al&&LV.st.al.s!=='hata')lvStatus('al','kapalı');lvRetry('al')}}
function lvBinance(){const ws=new WebSocket('wss://data-stream.binance.vision/stream?streams=usdttry@aggTrade/paxgusdt@aggTrade');LV.ws.bn=ws;lvStatus('bn','bağlanıyor');
  ws.onopen=()=>lvStatus('bn','bağlı');
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(x){return}const d=m.data;if(!d)return;const k=d.s==='USDTTRY'?'USDTTRY':d.s==='PAXGUSDT'?'PAXG':null;if(!k)return;
    const p=+d.p;const o=LV.x[k];if(o&&o.p!==p)LV.flash['x'+k]=p>o.p?'up':'down';LV.x[k]={p,ts:d.T};LV.dirty=true};
  ws.onerror=()=>lvStatus('bn','hata','bağlantı hatası');ws.onclose=()=>{if(LV.st.bn&&LV.st.bn.s!=='hata')lvStatus('bn','kapalı');lvRetry('bn')}}
const LV_RT={};
function lvRetry(k){if(!lvOn()||document.visibilityState!=='visible')return;const n=(LV_RT[k]||0)+1;LV_RT[k]=n;if(n>8){lvStatus(k,'hata','tekrar denemeler tükendi; sayfayı yenile');return}
  setTimeout(()=>{if(LV.ws[k]&&LV.ws[k].readyState<2)return;lvStartOne(k)},Math.min(60000,2000*2**n))}
function lvOn(){return S.settings&&S.settings.liveStream!==false}
function lvProv(){const s=S.settings||{};if((s.fhKey||'').trim())return 'fh';if((s.alKey||'').trim()&&(s.alSec||'').trim())return 'al';return null}
function lvStartOne(k){const s=S.settings||{};if(k==='fh'&&(s.fhKey||'').trim())lvFinnhub(s.fhKey.trim());else if(k==='al')lvAlpaca(s.alKey.trim(),s.alSec.trim());else if(k==='bn')lvBinance()}
function lvStop(){Object.entries(LV.ws).forEach(([k,w])=>{try{w.onclose=null;w.close()}catch(e){}lvStatus(k,'kapalı')});LV.ws={}}
function lvStart(){lvStop();if(!lvOn())return;Object.keys(LV_RT).forEach(k=>LV_RT[k]=0);const p=lvProv();if(p)lvStartOne(p);lvStartOne('bn')}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){LV.hiddenAt=Date.now();LV.hideT=setTimeout(()=>{if(document.visibilityState==='hidden')lvStop()},120000)}
  else{clearTimeout(LV.hideT);if(lvOn()&&!Object.values(LV.ws).some(w=>w.readyState<2))lvStart()}});

/* ---------- ekrana yansıtma (kısık) ---------- */
function lvTick(){if(!LV.dirty)return;LV.dirty=false;
  try{if(typeof renderTop==='function')renderTop()}catch(e){}
  const R=typeof route2==='function'?route2():{};const ae=document.activeElement||document.body;
  if(R.r==='piyasa'&&R.sub==='canli'){lvPaint()}
  else if((R.r==='ozet'||(R.r==='portfoy'&&(!R.sub||R.sub==='pozisyon')))&&Date.now()-LV.lastRender>20000&&!(ae.closest&&ae.closest('input,textarea,select,form'))){LV.lastRender=Date.now();render(false)}
  Object.entries(LV.flash).forEach(([t,d])=>{$$(`[data-lp="${CSS.escape(t)}"]`).forEach(el=>{el.classList.remove('fl-up','fl-down');void el.offsetWidth;el.classList.add('fl-'+d)})});
  LV.flash={}}
setInterval(lvTick,1000);

/* ---------- canlı akış sayfası ---------- */
function lvRows(){return lvSyms().map(lvT).filter(t=>quote(t).price||S.live[t])}
function lvMove(t,min){const B=LV.bars[t]||[];if(B.length<2)return null;const now=Math.floor(Date.now()/60000);const ref=B.filter(b=>b.m<=now-min).pop()||B[0];const L=B[B.length-1];return ref&&L?(L.c/ref.o-1)*100:null}
function lvPaint(){const box=$('#lvBox');if(!box)return;box.innerHTML=lvBody()}
function lvBody(){const P=positions();const real=P.total>0;const fx=S.fx||0;const dayPL=real?P.list.reduce((s,m)=>{const q=quote(m.t);return s+(isNum(q.chg)?q.chg*(m.qty||0):0)},0):null;
  const st=k=>{const x=LV.st[k];return x?`<span class="chip ${x.s==='bağlı'?'up':x.s==='hata'?'down':'n'}">${esc(x.s)}</span>${x.msg?` <span class="muted" style="font-size:11.5px">${esc(x.msg)}</span>`:''}`:'<span class="muted">—</span>'};
  const ms=typeof marketState==='function'?marketState():{open:true,msg:''};const rows=lvRows();
  const big=LV.trades.slice().reverse().filter(x=>x.v*x.p>=250000).slice(0,8);
  const movers=rows.map(t=>({t,m5:lvMove(t,5),m15:lvMove(t,15)})).filter(x=>isNum(x.m5)&&Math.abs(x.m5)>=0.5).sort((a,b)=>Math.abs(b.m5)-Math.abs(a.m5));
  return `<div class="lvstat"><span>Hisse akışı: ${lvProv()==='al'?'Alpaca IEX':'Finnhub'} ${st(lvProv()||'fh')}</span><span>7/24 kur/altın: Binance ${st('bn')}</span><span class="muted">${esc(ms.msg||'')}</span></div>
  ${real?`<div class="btk"><div><span>Portföy (canlı)</span><b data-lp="PORT">${money(P.total,0)}</b></div><div><span>Bugün</span><b class="${cls(dayPL)}">${smoney(dayPL,0)}</b></div>${LV.x.USDTTRY?`<div><span>USDT/TRY (≈ USD/TRY)</span><b data-lp="xUSDTTRY">${nf(LV.x.USDTTRY.p,4)}</b></div>`:''}${LV.x.PAXG?`<div><span>PAXG (≈ ons altın)</span><b data-lp="xPAXG">$${nf(LV.x.PAXG.p,1)}</b></div>`:''}</div>`:
   `<div class="btk">${LV.x.USDTTRY?`<div><span>USDT/TRY (≈ USD/TRY)</span><b data-lp="xUSDTTRY">${nf(LV.x.USDTTRY.p,4)}</b></div>`:''}${LV.x.PAXG?`<div><span>PAXG (≈ ons altın)</span><b data-lp="xPAXG">$${nf(LV.x.PAXG.p,1)}</b></div>`:''}</div>`}
  <div class="lvgrid">${rows.map(t=>{const q=quote(t);const l=S.live[t];const B=(LV.bars[t]||[]).map(b=>[b.m,b.c]);const m5=lvMove(t,5);
    return `<a class="lvc" href="#/t/${encodeURIComponent(t)}"><div class="lvh"><b>${esc(dispT(t))}</b><span class="muted" style="font-size:11px">${l&&l.ts?new Date(l.ts).toLocaleTimeString('tr-TR'):'akış bekleniyor'}</span></div>
      <div class="lvp"><span class="num" data-lp="${esc(t)}">${pxf(t,q.price)}</span><span class="num ${cls(q.pct)}">${pct(q.pct)}</span></div>
      <div class="lvs">${B.length>1?spark(B,160,28):'<svg class="spark"></svg>'}</div>
      <div class="muted" style="font-size:11.5px">${LV.tcount[t]||0} işlem${isNum(m5)?` · 5 dk <span class="${cls(m5)}">${pct(m5,2)}</span>`:''}${l&&l.high?` · gün ${pxf(t,l.low)}–${pxf(t,l.high)}`:''}</div></a>`}).join('')}</div>
  <div class="two" style="margin-top:14px"><section><h4>⚡ Anlık hareketler <span class="muted" style="font-weight:400;font-size:12px">5 dakikada ±%0,5+</span></h4>${movers.length?movers.map(x=>`<div class="lvr"><b>${esc(dispT(x.t))}</b><span class="num ${cls(x.m5)}">5 dk ${pct(x.m5,2)}</span><span class="num muted">15 dk ${pct(x.m15,2)}</span></div>`).join(''):'<p class="muted" style="font-size:13px">Şu an sert hareket yok.</p>'}
    <h4 style="margin-top:14px">🐋 Büyük işlemler <span class="muted" style="font-weight:400;font-size:12px">$250 bin ve üstü tek işlem</span></h4>${big.length?big.map(x=>`<div class="lvr"><span class="muted num">${new Date(x.ts).toLocaleTimeString('tr-TR')}</span><b>${esc(dispT(x.t))}</b><span class="num">${nf(x.v,0)} × ${pxf(x.t,x.p)}</span><span class="num">$${nf(x.v*x.p/1e6,2)} mn</span></div>`).join(''):'<p class="muted" style="font-size:13px">Henüz yok.</p>'}</section>
   <section><h4>Zaman ve satış <span class="muted" style="font-weight:400;font-size:12px">son işlemler</span></h4><div class="lvtape">${LV.trades.slice(-40).reverse().map((x,i,a)=>{const pv=LV.trades.slice().reverse().find((y,j)=>j>i&&y.t===x.t);const d=pv?(x.p>pv.p?'up':x.p<pv.p?'down':''):'';return `<div class="lvr"><span class="muted num">${new Date(x.ts).toLocaleTimeString('tr-TR')}</span><b>${esc(dispT(x.t))}</b><span class="num ${d}">${pxf(x.t,x.p)}</span><span class="num muted">${nf(x.v,0)}</span></div>`}).join('')||'<p class="muted" style="font-size:13px">Akış başladığında işlemler burada kayar.</p>'}</div></section></div>`}
function viewCanli(){const s=S.settings||{};const has=lvProv();
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Canlı akış</h2><p>Websocket ile saniye saniye işlemler: fiyat, hacim, büyük işlemler, anlık hareketler. ABD seansında (TR 16:30–23:00) hisseler, 7/24 kur ve altın akar.</p></div></div>
  <section class="card sec"><div id="lvBox">${lvBody()}</div></section>
  <section class="card sec"><h3>Akış ayarları ${has?'<span class="chip up">hisse akışı tanımlı</span>':'<span class="chip warnc">hisse akışı için ücretsiz anahtar gerekli</span>'}</h3>
   <label class="lvon"><input type="checkbox" id="lvOn" ${lvOn()?'checked':''}> Canlı akışı açık tut (sekme 2 dakikadan uzun arka planda kalırsa kendiliğinden kapanır)</label>
   <div class="lvset"><label>Finnhub anahtarı <span class="muted">(önerilen · finnhub.io → ücretsiz kayıt → Dashboard)</span><input id="fhKey" type="password" value="${esc(s.fhKey||'')}" placeholder="finnhub.io API key"></label>
   <label>Alpaca anahtarı <span class="muted">(yedek · alpaca.markets → ücretsiz hesap → Paper → API Keys)</span><input id="alKey" type="password" value="${esc(s.alKey||'')}" placeholder="Key ID"></label>
   <label>Alpaca gizli anahtarı<input id="alSec" type="password" value="${esc(s.alSec||'')}" placeholder="Secret Key"></label></div>
   <button class="btn" id="lvSave">Kaydet ve bağlan</button>
   <p class="muted" style="font-size:12px;margin:8px 0 0">Anahtarlar yalnızca senin hesabında (Supabase) ve bu tarayıcıda saklanır; GitHub'a yazılmaz. Finnhub ücretsiz planı ABD hisse/ETF işlemlerini gerçek zamanlı akıtır. Alpaca ücretsiz planı yalnızca IEX borsasındaki işlemleri (toplam hacmin küçük bir kısmı) gösterir; fiyat doğru, hacim eksik görünür; en fazla 30 sembol. Alpaca için yalnızca <b>Paper</b> hesap anahtarı kullan (gerçek para hesabı anahtarı değil). USDT/TRY bir kripto çiftidir, resmi USD/TRY'ye çok yakın ama birebir aynı değildir; portföy hesabında resmi kur kullanılmaya devam eder.</p></section></div>`}
function afterCanli(){const sv=$('#lvSave');if(sv)sv.onclick=async()=>{S.settings.fhKey=$('#fhKey').value.trim();S.settings.alKey=$('#alKey').value.trim();S.settings.alSec=$('#alSec').value.trim();S.settings.liveStream=$('#lvOn').checked;
    await saveSettings();lvStart();toast(lvProv()?'Kaydedildi · akış bağlanıyor':'Kaydedildi · hisse akışı için anahtar yok, sadece kur/altın akacak');render(false)};
  const on=$('#lvOn');if(on)on.onchange=async()=>{S.settings.liveStream=on.checked;await saveSettings();on.checked?lvStart():lvStop();render(false)}}
