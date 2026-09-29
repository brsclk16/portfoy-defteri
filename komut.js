/* Portföy Defteri — grafiğe komutla yönetim (OpenMarket tarzı), çoklu grafik düzeni, grafik görüntüsü (PNG) */
"use strict";
const CMD_IND=[[/ichimoku|bulut/,'ichi'],[/fib(onacci)?/,'fib'],[/bollinger|boll/,'boll'],[/ortalama|sma|hareketli/,'sma'],[/vwap/,'vwap'],[/hacim profil/,'vp'],[/hacim|volume/,'vol'],[/rsi/,'rsi'],[/macd/,'macd'],[/stok(astik)?|stoch/,'stoch'],[/adx/,'adx'],[/plan/,'lvl'],[/olay/,'evt']];
const CMD_RANGE=[[/\b1\s*(a|ay)\b/,'1A'],[/\b3\s*(a|ay)\b/,'3A'],[/\b6\s*(a|ay)\b/,'6A'],[/\b(1\s*y(ıl)?|12\s*ay)\b/,'1Y'],[/\b2\s*y(ıl)?\b/,'2Y'],[/\b3\s*y(ıl)?\b/,'3Y']];
function trLower(s){return String(s).replace(/İ/g,'i').replace(/I/g,'ı').toLowerCase()}
function cmdRun(raw,t0){
  const done=[],miss=[];let t=t0;const L=techTickers();const parts=trLower(raw).split(/[,;]|\s+ve\s+|\s+sonra\s+/).map(x=>x.trim()).filter(Boolean);let go=null,shot=false;
  for(const p of parts){let hit=false;const words=p.toUpperCase().split(/[\s']+/);
    const sym=words.find(w=>L.includes(w)||L.includes(w+':BIST'));if(sym&&!/karşılaştır|oran/.test(p)){t=L.includes(sym)?sym:sym+':BIST';hit=true;done.push(dispT(t)+' açıldı')}
    if(/haftal/.test(p)){S.tf='W';lsSet('pd_tf','W');hit=true;done.push('haftalık')}else if(/günl/.test(p)){S.tf='D';lsSet('pd_tf','D');hit=true;done.push('günlük')}
    for(const [re,r] of CMD_RANGE)if(re.test(p)){S.range.tech=r;hit=true;done.push(r+' aralık');break}
    const off=/kapat|gizle|kaldır|sil|çıkar|kapa\b/.test(p);
    if(/karşılaştır|oran/.test(p)){const ws=words.filter(w=>cmpTickers().includes(w));if(ws.length){S.cmp=S.cmp||{};S.cmp.a=ws[0];S.cmp.b=ws[1]||'SPY';S.cmp.mode=/oran/.test(p)?'oran':'getiri';go='#/teknik/karsilastir';hit=true;done.push(`${ws[0]} / ${S.cmp.b} karşılaştırma`)}}
    const num=(p.match(/(\d+(?:[.,]\d+)?)/)||[])[1];const n=num?+num.replace(',','.'):null;
    if(/alarm/.test(p)&&n){const D=drawAll();D[t]=D[t]||[];const px=quote(t).price;D[t].push({type:'h',p:n,side:px>n?'up':'down',alarm:true});drawSave();if(S.settings.ghToken&&typeof syncRemoteAlarms==='function')syncRemoteAlarms();hit=true;done.push(`${dispT(t)} ${n} alarmı`)}
    else if(/çizgi|seviye|yatay/.test(p)&&n&&!off){const D=drawAll();D[t]=D[t]||[];D[t].push({type:'h',p:n,side:quote(t).price>n?'up':'down'});drawSave();hit=true;done.push(`${n} seviyesi çizildi`)}
    if(/destek|direnç/.test(p)&&!off){let P=null;try{P=tradePlan(t)}catch(e){}if(P){const D=drawAll();D[t]=D[t]||[];const lv=[];if(/destek/.test(p))(P.sup||[]).slice(0,2).forEach(s=>lv.push(s.p||s));if(/direnç/.test(p))(P.res||[]).slice(0,2).forEach(s=>lv.push(s.p||s));lv.filter(isNum).forEach(v=>D[t].push({type:'h',p:+v.toFixed(2),side:quote(t).price>v?'up':'down'}));drawSave();hit=true;done.push(`${lv.length} destek/direnç çizildi`)}}
    if(/temizle|çizimleri sil|hepsini sil/.test(p)){const D=drawAll();D[t]=[];drawSave();if(S.settings.ghToken&&typeof syncRemoteAlarms==='function')syncRemoteAlarms();hit=true;done.push('çizimler temizlendi')}
    const st=indState();for(const [re,k] of CMD_IND){if(re.test(p)&&!(k==='lvl'&&/destek|direnç|alarm/.test(p))&&!(k==='fib'&&false)){st[k]=!off;hit=true;done.push(`${IND_DEF[k]} ${off?'kapalı':'açık'}`)}}saveInd();
    if(/sade|hepsini kapat|temiz görünüm/.test(p)){Object.keys(st).forEach(k=>st[k]=false);st.lvl=true;saveInd();hit=true;done.push('sade görünüm')}
    if(/görüntü|ekran|resim|png|paylaş/.test(p)){shot=true;hit=true}
    if(/(2|iki|4|dört)\s*(li|lü|'li|'lü)?\s*(düzen|grafik|ekran)|çoklu/.test(p)){S.mcN=/4|dört/.test(p)?4:2;const ws=words.filter(w=>L.includes(w));if(ws.length)S.mcT=ws.concat(S.mcT||[]).slice(0,S.mcN);go='#/teknik/coklu';hit=true;done.push(`${S.mcN}'li düzen`)}
    if(/izleme(ye| listesine)? ekle/.test(p)){const w=words.find(x=>/^[A-Z.]{1,6}$/.test(x)&&!['IZLEMEYE','EKLE','LISTESINE'].includes(x));if(w){go='#/piyasa/enstruman';S.wPrefill=w;hit=true;done.push(w+' izleme formuna yazıldı')}}
    if(!hit){const U=Object.keys((S.univ&&S.univ.data)||{});const w=words.find(x=>/^[A-Z]{1,5}$/.test(x)&&U.includes(x)&&!L.includes(x));miss.push(w?`${w} (grafik verisi yok; “${w} izlemeye ekle” yaz)`:p)}}
  S.cmdLog=[{q:raw,done,miss,at:Date.now()}].concat(S.cmdLog||[]).slice(0,6);
  if(go){location.hash=go}else if(t!==t0){location.hash='#/teknik/grafik/'+encodeURIComponent(t)}else render(false);
  if(shot)setTimeout(()=>chartPNG($('#cTech'),t),400);
  toast(done.length?('✓ '+done.join(' · ')):('Anlaşılamadı: '+miss.join(', ')))}
function cmdBox(t){const H=(S.cmdLog||[])[0];return `<form class="cmdf card" id="cmdF"><span class="cmd-i">⌘</span><input name="c" autocomplete="off" placeholder="Komut yaz: ör. “NVDA haftalık, 1 yıl, fibonacci ve bollinger aç” · “560'a alarm” · “destek ve direnç çiz” · “SMH SOXX oran karşılaştır” · “görüntü al”"><button class="btn sm" type="submit">Uygula</button>
  <button class="btn ghost sm" type="button" id="cmdShot" title="Grafiğin görüntüsünü al">📷</button><button class="btn ghost sm" type="button" id="cmdHelp">?</button></form>${H&&Date.now()-H.at<60000&&H.miss.length?`<div class="note warn" style="margin-top:6px">Anlaşılmayan kısım: ${esc(H.miss.join(', '))}</div>`:''}
  <div id="cmdH" class="note" style="display:none;margin-top:6px;font-size:13px;line-height:1.6">Komutları virgül ya da "ve" ile birleştirebilirsin.<br><b>Sembol:</b> NVDA, SMH… · <b>Zaman dilimi:</b> günlük / haftalık · <b>Aralık:</b> 1 ay, 3 ay, 6 ay, 1 yıl, 2 yıl, 3 yıl<br><b>Göstergeler:</b> ichimoku, fibonacci, bollinger, ortalama, vwap, hacim profili, hacim, rsi, macd, stokastik, adx, plan, olaylar (+ “aç” / “kapat”) · “sade görünüm”<br><b>Çizim:</b> “585 çizgi”, “560'a alarm”, “destek çiz”, “direnç çiz”, “çizimleri temizle”<br><b>Diğer:</b> “SMH SOXX oran karşılaştır”, “NVDA TSM AMD 4'lü düzen”, “görüntü al”, “PLTR izlemeye ekle”</div>`}
function afterCmd(t){const f=$('#cmdF');if(!f)return;f.onsubmit=e=>{e.preventDefault();const v=f.c.value.trim();if(v)cmdRun(v,t)};const sh=$('#cmdShot');if(sh)sh.onclick=()=>chartPNG($('#cTech'),t);const h=$('#cmdHelp');if(h)h.onclick=()=>{const x=$('#cmdH');x.style.display=x.style.display==='none'?'':'none'};
  document.addEventListener('keydown',cmdKey)}
function cmdKey(e){if(e.key==='/'&&!/input|textarea|select/i.test((e.target.tagName||''))){const i=$('#cmdF input');if(i){e.preventDefault();i.focus()}}}

/* ================= çoklu grafik ================= */
function miniChart(el,t,rg){const a0=S.tf==='W'?toWeekly(candles(t)):candles(t);if(a0.length<30){el.innerHTML='<div class="empty">Veri yok</div>';return}
  const n={'1A':22,'3A':63,'6A':126,'1Y':252,'2Y':504,'3Y':756}[rg]||126;const nn=S.tf==='W'?Math.ceil(n/5):n;const cl=a0.map(x=>x.c);const s50=smaS(cl,50),s200=smaS(cl,200);const st=Math.max(0,a0.length-nn);const a=a0.slice(st);
  const W=el.clientWidth||500,H=el.clientHeight||280,pr=52,pl=4,pt=22;let P=null;try{P=tradePlan(t)}catch(e){}
  let mn=Math.min(...a.map(x=>x.l)),mx=Math.max(...a.map(x=>x.h));const pad=(mx-mn)*.05;mn-=pad;mx+=pad;const Y=v=>pt+(1-(v-mn)/(mx-mn))*(H-pt-18);const cw=(W-pl-pr)/a.length;const X=i=>pl+(i+.5)*cw;const bw=Math.max(1,cw*.66);let s='';
  niceTicks(mn,mx,4).forEach(v=>{if(v<mn||v>mx)return;s+=`<line class="gridl" x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${W-pr+4}" y="${Y(v)+4}">${nf(v,v>=1000?0:2)}</text>`});
  if(P&&P.zone.lo>mn&&P.zone.hi<mx)s+=`<rect x="${pl}" y="${Y(P.zone.hi)}" width="${W-pl-pr}" height="${Math.max(2,Y(P.zone.lo)-Y(P.zone.hi))}" fill="rgba(92,211,255,.12)"/>`;
  const ln=(arr,c)=>{let d='';for(let i=st;i<a0.length;i++){if(arr[i]==null)continue;d+=`${d?'L':'M'}${X(i-st).toFixed(1)},${Y(arr[i]).toFixed(1)}`}return d?`<path d="${d}" fill="none" stroke="${c}" stroke-width="1.2"/>`:''};s+=ln(s50,'#5cd3ff')+ln(s200,'#ff6fd0');
  a.forEach((c,i)=>{const up=c.c>=c.o,col=up?'var(--up)':'var(--down)';s+=`<line x1="${X(i)}" x2="${X(i)}" y1="${Y(c.h)}" y2="${Y(c.l)}" stroke="${col}"/><rect x="${X(i)-bw/2}" y="${Y(Math.max(c.o,c.c))}" width="${bw}" height="${Math.max(1,Math.abs(Y(c.o)-Y(c.c)))}" fill="${col}"/>`});
  const q=quote(t);const ch=(a[a.length-1].c/a[0].c-1)*100;s+=`<text x="${pl+4}" y="15" style="font:700 13px var(--mono);fill:var(--text)">${esc(dispT(t))} <tspan style="fill:var(--muted);font-weight:500">${pxf(t,q.price)}</tspan> <tspan style="fill:${ch>=0?'var(--up)':'var(--down)'}">${pct(ch,1)} (${rg})</tspan></text>`;
  el.innerHTML=`<svg width="${W}" height="${H}" class="tchart">${s}</svg>`}
function viewMulti(){const L=techTickers();const n=S.mcN||4;S.mcT=(S.mcT||[]).filter(x=>L.includes(x));const def=['SMH','SOXX','AMD','ASML','VRT','DELL'].filter(x=>L.includes(x));while(S.mcT.length<n)S.mcT.push(def.concat(L).find(x=>!S.mcT.includes(x))||L[0]);S.mcT=S.mcT.slice(0,n);const rg=S.mcR||'6A';
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Çoklu grafik</h2><p>Aynı anda ${n} grafik · mavi bant plan alım bölgesi · mavi/pembe çizgi 50/200 günlük ortalama</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><div class="filters" id="mcN" style="margin:0">${[2,4].map(k=>`<button data-n="${k}" class="${n===k?'on':''}">${k}'li</button>`).join('')}</div><div class="filters" id="mcR" style="margin:0">${['1A','3A','6A','1Y','3Y'].map(k=>`<button data-r="${k}" class="${rg===k?'on':''}">${k}</button>`).join('')}</div><button class="btn ghost sm" id="mcShot">📷 Görüntü</button></div></div>
  <div class="mcgrid n${n}" id="mcG">${S.mcT.map((t,i)=>`<section class="card mcc"><select data-mc="${i}">${L.map(x=>`<option ${x===t?'selected':''}>${esc(x)}</option>`).join('')}</select><div class="mcch" id="mc${i}"></div><a class="muted" href="#/teknik/grafik/${encodeURIComponent(t)}" style="font-size:12px">Panelde aç →</a></section>`).join('')}</div></div>`}
function afterMulti(){const rg=S.mcR||'6A';(S.mcT||[]).forEach((t,i)=>{const el=$('#mc'+i);if(el)miniChart(el,t,rg)});
  $$('#mcN button').forEach(b=>b.onclick=()=>{S.mcN=+b.dataset.n;render(false)});$$('#mcR button').forEach(b=>b.onclick=()=>{S.mcR=b.dataset.r;render(false)});
  $$('[data-mc]').forEach(s=>s.onchange=()=>{S.mcT[+s.dataset.mc]=s.value;render(false)});const sh=$('#mcShot');if(sh)sh.onclick=()=>chartPNG($('#mcG'),'coklu')}

/* ================= grafik görüntüsü (PNG) ================= */
function resolveVars(svgStr){const cs=getComputedStyle(document.documentElement);return svgStr.replace(/var\((--[\w-]+)\)/g,(m,v)=>(cs.getPropertyValue(v).trim()||'#888').replace(/"/g,"'"))}
async function chartPNG(el,name){if(!el){toast('Grafik bulunamadı');return}const svgs=[...el.querySelectorAll('svg')].filter(s=>s.getBoundingClientRect().width>100);if(!svgs.length){toast('Grafik bulunamadı');return}
  const box=el.getBoundingClientRect();const scale=2;const cv=document.createElement('canvas');cv.width=box.width*scale;cv.height=(box.height+30)*scale;const ctx=cv.getContext('2d');ctx.scale(scale,scale);
  const cs=getComputedStyle(document.documentElement);ctx.fillStyle=cs.getPropertyValue('--bg').trim()||'#0b0e13';ctx.fillRect(0,0,box.width,box.height+30);
  const css=`<style>.gridl{stroke:${cs.getPropertyValue('--line').trim()};stroke-width:1}.ax{font:500 10.5px monospace;fill:${cs.getPropertyValue('--muted').trim()}}</style>`;
  for(const s of svgs){const r=s.getBoundingClientRect();const c=s.cloneNode(true);c.setAttribute('xmlns','http://www.w3.org/2000/svg');c.setAttribute('width',r.width);c.setAttribute('height',r.height);
    let str=new XMLSerializer().serializeToString(c);str=str.replace(/<svg([^>]*)>/,`<svg$1>${css}`);str=resolveVars(str);
    await new Promise(res=>{const img=new Image();img.onload=()=>{ctx.drawImage(img,r.left-box.left,r.top-box.top,r.width,r.height);res()};img.onerror=res;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(str)})}
  ctx.fillStyle=cs.getPropertyValue('--muted').trim()||'#888';ctx.font='12px system-ui';ctx.fillText(`Portföy Defteri · ${dispT(name)} · ${new Date().toLocaleString('tr-TR')}`,8,box.height+20);
  cv.toBlob(async b=>{if(!b){toast('Görüntü oluşturulamadı');return}const fn=`grafik-${String(name).replace(/[^A-Za-z0-9]/g,'')}-${new Date().toISOString().slice(0,10)}.png`;const file=new File([b],fn,{type:'image/png'});
    try{if(navigator.canShare&&navigator.canShare({files:[file]})&&/Mobi/i.test(navigator.userAgent)){await navigator.share({files:[file],title:fn});return}}catch(e){}
    const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=fn;a.click();toast('Görüntü indirildi')},'image/png')}
