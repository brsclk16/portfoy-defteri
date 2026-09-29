/* Portföy Defteri — araçlar: çizimler, pozisyon büyüklüğü, sinyal geçmişi testi, bildirimler, karşılaştırma/oran, makro panel */
"use strict";

/* ---------- çizimler (grafiğe seviye / trend çizgisi) ---------- */
function drawAll(){if(!S.draws){const loc=lsJSON('pd_draw',null);S.draws=loc||(S.settings&&S.settings.draws)||{}}return S.draws}
function drawsFor(t){return drawAll()[t]||[]}
function drawSave(){lsSet('pd_draw',JSON.stringify(S.draws||{}));if(S.session&&S.settings){S.settings.draws=S.draws;try{saveSettings()}catch(e){}}}
function drawClick(t,d,p){
  const D=drawAll();D[t]=D[t]||[];const px=quote(t).price;
  if(S.drawMode==='h'){D[t].push({type:'h',p:+p.toFixed(p>=100?2:3),side:px>p?'up':'down'});S.drawMode=null;drawSave();toast('Seviye eklendi · 🔔 ile alarm kurabilirsin');render(false);return}
  if(S.drawMode==='t'){if(!S.drawPend||S.drawPend.t!==t){S.drawPend={t,d,p};render(false);return}
    const a=S.drawPend;const [p1,p2]=a.d<=d?[a,{d,p}]:[{d,p},a];if(p1.d===p2.d){toast('İki farklı gün seç');return}
    D[t].push({type:'t',d1:p1.d,p1:+p1.p.toFixed(3),d2:p2.d,p2:+p2.p.toFixed(3)});S.drawPend=null;S.drawMode=null;drawSave();toast('Trend çizgisi eklendi');render(false)}
}
function drawDel(t,i){const D=drawAll();const g=(D[t]||[])[i];(D[t]||[]).splice(i,1);drawSave();if(g&&g.alarm&&S.settings&&S.settings.ghToken&&typeof syncRemoteAlarms==='function')syncRemoteAlarms();render(false)}
function drawAlarm(t,i){const g=drawsFor(t)[i];if(!g)return;g.alarm=!g.alarm;g.side=quote(t).price>g.p?'up':'down';drawSave();if(typeof syncRemoteAlarms==='function'&&S.settings&&S.settings.ghToken)syncRemoteAlarms();
  if(g.alarm&&!notifOn())toast('Alarm kuruldu. Telefon/masaüstü bildirimi için Özet’teki “Bildirimleri aç” düğmesine bas.');else toast(g.alarm?'Alarm kuruldu':'Alarm kaldırıldı');render(false)}
function drawChips(t){const D=drawsFor(t);if(!D.length)return '';
  return `<div class="dchips">${D.map((g,i)=>`<span class="dchip">${g.type==='h'?`— ${esc(pxf(t,g.p))}`:`╱ ${esc(trDate(g.d1+'T12:00:00Z',{day:'numeric',month:'short'}))} → ${esc(trDate(g.d2+'T12:00:00Z',{day:'numeric',month:'short'}))}`}${g.type==='h'?`<button data-al="${i}" class="${g.alarm?'on':''}" title="Fiyat bu seviyeyi geçince bildir">🔔</button>`:''}<button data-del="${i}" title="Sil">✕</button></span>`).join('')}</div>`}

/* ---------- pozisyon büyüklüğü ---------- */
function psState(){const d={cap:null,risk:1};return {...d,...lsJSON('pd_ps',{})}}
function psCard(t){
  const P=tradePlan(t);if(!P)return '';const st=psState();const tot=positions().total;const cap=st.cap||(tot>0?Math.round(tot):10000);
  const entry=S.psEntry&&S.psEntry.t===t?S.psEntry.v:+P.entry.toFixed(2);const stop=S.psStop&&S.psStop.t===t?S.psStop.v:+P.stop.toFixed(2);
  const r=Math.max(1e-9,entry-stop);const riskAmt=cap*st.risk/100;let qty=Math.floor(riskAmt/r);const maxQ=Math.floor(cap/entry);const capped=qty>maxQ;if(capped)qty=maxQ;
  const val=qty*entry;const cur=isTRY(t)?'₺':'$';const m=v=>cur+nf(v,0);
  return `<section class="card ps"><h3>Pozisyon büyüklüğü <span class="r muted">risk bazlı</span></h3>
  <div class="psf"><label>Sermaye (${cur})<input id="psCap" type="number" min="0" step="100" value="${cap}"></label><label>İşlem başına risk (%)<input id="psRisk" type="number" min="0.1" max="10" step="0.1" value="${st.risk}"></label>
    <label>Giriş<input id="psEn" type="number" step="0.01" value="${entry}"></label><label>Stop<input id="psSt" type="number" step="0.01" value="${stop}"></label></div>
  <div class="psr"><div><span>Alınacak adet</span><b>${nf(qty,0)}</b></div><div><span>Pozisyon tutarı</span><b>${m(val)}</b><i>sermayenin %${nf(val/cap*100,1)}’i</i></div>
    <div><span>Stop’ta zarar</span><b class="down">−${m(qty*r)}</b><i>%${nf(qty*r/cap*100,2)}</i></div><div><span>TP1’de kâr</span><b class="up">+${m(qty*(P.tp1.p-entry))}</b><i>${pxf(t,P.tp1.p)}</i></div><div><span>TP2’de kâr</span><b class="up">+${m(qty*(P.tp2.p-entry))}</b><i>${pxf(t,P.tp2.p)}</i></div></div>
  ${capped?`<p class="note" style="margin:10px 0 0">Stop çok yakın olduğu için hesaplanan adet sermayeyi aşıyordu; sermayenin tamamıyla sınırlandı.</p>`:''}
  <p class="muted" style="font-size:12px;margin:10px 0 0">Kural: stop’a gelirse sermayenin en fazla %${nf(st.risk,1)}’ini kaybet. Adet = (sermaye × risk %) ÷ (giriş − stop). Giriş ve stop plan seviyelerinden gelir, değiştirebilirsin.</p></section>`;
}
function afterPs(t){const f=()=>{const st=psState();const c=+$('#psCap').value,r=+$('#psRisk').value;lsSet('pd_ps',JSON.stringify({...st,cap:c>0?c:null,risk:r>0?r:1}));
    const e=+$('#psEn').value,s=+$('#psSt').value;if(e>0)S.psEntry={t,v:e};if(s>0)S.psStop={t,v:s};render(false)};
  ['#psCap','#psRisk','#psEn','#psSt'].forEach(id=>{const el=$(id);if(el)el.onchange=f})}

/* ---------- sinyal geçmişi testi (plan kuralını geçmişe uygular) ---------- */
function backtest(t){
  const a=candles(t).slice();const n=a.length;if(n<260)return null;const key=t+'|'+a[n-1].d;S.btCache=S.btCache||lsJSON('pd_bt',{});if(S.btCache[key])return S.btCache[key];
  const trades=[];let i=200;
  while(i<n-1){const P=tradePlan(t,a.slice(0,i+1));i++;if(!P||P.rr1<1.2)continue;const prev=a[i-1].c,b=a[i];
    if(!(prev>P.zone.hi&&b.l<=P.zone.hi))continue;
    const entry=Math.min(b.o,P.zone.hi);if(entry<=P.stop)continue;const R=entry-P.stop;let exit=null,j=i,res='süre';
    for(;j<Math.min(n,i+60);j++){const c=a[j];const hitS=c.l<=P.stop,hitT=c.h>=P.tp1.p&&j>i-1;
      if(hitS){exit=j===i?P.stop:Math.min(c.o,P.stop);res='stop';break}if(hitT){exit=Math.max(c.o,P.tp1.p);if(j===i)exit=P.tp1.p;res='hedef';break}}
    if(exit==null){j=Math.min(n-1,i+59);exit=a[j].c;if(j===n-1&&i+59>n-1)res='açık'}
    trades.push({d:b.d,entry,stop:P.stop,tp:P.tp1.p,exit,res,days:j-i+1,r:(exit-entry)/R,pct:(exit/entry-1)*100});i=j+1}
  const done=trades.filter(x=>x.res!=='açık');const w=done.filter(x=>x.r>0);
  const out={t,n:done.length,open:trades.filter(x=>x.res==='açık').length,win:done.length?w.length/done.length*100:null,avgR:done.length?done.reduce((s,x)=>s+x.r,0)/done.length:null,
    avgPct:done.length?done.reduce((s,x)=>s+x.pct,0)/done.length:null,days:done.length?done.reduce((s,x)=>s+x.days,0)/done.length:null,trades:trades.slice(-12).reverse(),from:a[200].d,to:a[n-1].d,
    hold:(a[n-1].c/a[200].c-1)*100,sum:done.reduce((s,x)=>s*(1+x.pct/100),1)*100-100};
  S.btCache[key]=out;try{const k=Object.keys(S.btCache);if(k.length>40)delete S.btCache[k[0]];lsSet('pd_bt',JSON.stringify(S.btCache))}catch(e){}return out;
}
function btSection(t){
  const key=t+'|'+(candles(t).slice(-1)[0]||{}).d;const B=(S.btCache||lsJSON('pd_bt',{}))[key];
  if(!B)return `<section class="card sec"><div class="th"><h3 style="margin:0">Sinyal geçmişi testi</h3><button class="btn sm" id="btRun" data-t="${esc(t)}">Testi çalıştır</button></div><p class="muted" style="margin:10px 0 0;font-size:13.5px">Bugünkü plan kuralı (alım bölgesi, stop, TP1) son 2,5 yılın her gününe o güne kadarki veriyle uygulanır: fiyat bölgeye geri çekildiğinde alınmış sayılır, önce TP1’e mi stop’a mı gittiğine bakılır. Birkaç saniye sürer.</p></section>`;
  if(!B.n)return `<section class="card sec"><h3>Sinyal geçmişi testi</h3><p class="muted">Bu dönemde kurala uyan geri çekilme sinyali oluşmadı (${esc(B.from)} – ${esc(B.to)}).</p></section>`;
  const verdict=B.avgR>0.3&&B.win>=45?['Plan bu hissede geçmişte işe yaramış','up']:B.avgR>0?['Sınırlı ama pozitif sonuç','']:['Plan bu hissede geçmişte zarar ettirmiş','down'];
  return `<section class="card sec"><div class="th"><h3 style="margin:0">Sinyal geçmişi testi <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${esc(trDate(B.from+'T12:00:00Z',{month:'short',year:'numeric'}))} – ${esc(trDate(B.to+'T12:00:00Z',{month:'short',year:'numeric'}))}</span></h3><span class="chip ${verdict[1]||'n'}">${verdict[0]}</span></div>
  <div class="btk"><div><span>İşlem</span><b>${B.n}</b>${B.open?`<i>+${B.open} açık</i>`:''}</div><div><span>Kazanma oranı</span><b class="${B.win>=50?'up':B.win<40?'down':''}">%${nf(B.win,0)}</b></div><div><span>Ortalama sonuç</span><b class="${cls(B.avgR)}">${B.avgR>0?'+':''}${nf(B.avgR,2)} R</b><i>${pct(B.avgPct,1)} / işlem</i></div><div><span>Ortalama süre</span><b>${nf(B.days,0)} gün</b></div><div><span>Tüm işlemler bileşik</span><b class="${cls(B.sum)}">${pct(B.sum,0)}</b><i>al-tut: ${pct(B.hold,0)}</i></div></div>
  <div class="tscroll" style="margin-top:12px"><table class="tbl"><thead><tr><th>Sinyal</th><th class="r">Giriş</th><th class="r">Stop</th><th class="r">TP1</th><th>Sonuç</th><th class="r">Gün</th><th class="r">Getiri</th></tr></thead><tbody>
  ${B.trades.map(x=>`<tr><td>${esc(trDate(x.d+'T12:00:00Z',{day:'numeric',month:'short',year:'2-digit'}))}</td><td class="r num">${pxf(t,x.entry)}</td><td class="r num">${pxf(t,x.stop)}</td><td class="r num">${pxf(t,x.tp)}</td><td><span class="chip ${x.res==='hedef'?'up':x.res==='stop'?'down':'n'}">${x.res==='hedef'?'TP1’e ulaştı':x.res==='stop'?'Stop oldu':x.res==='açık'?'Açık':'60 gün doldu'}</span></td><td class="r num">${x.days}</td><td class="r num ${cls(x.pct)}">${pct(x.pct,1)}</td></tr>`).join('')}</tbody></table></div>
  <p class="muted" style="font-size:12px;margin:10px 0 0;line-height:1.5">R = işlemin sonucu ÷ başlangıçtaki risk (giriş − stop). +1 R, riske edilen kadar kazanç demek. Aynı gün hem stop hem hedef görüldüyse zarar sayıldı (temkinli). Komisyon ve vergi dahil değil. Geçmiş sonuç geleceği garanti etmez.</p></section>`;
}
function afterBt(){const b=$('#btRun');if(b)b.onclick=()=>{b.disabled=true;b.textContent='Hesaplanıyor…';setTimeout(()=>{try{backtest(b.dataset.t)}catch(e){console.error(e);toast('Test çalıştırılamadı')}render(false)},30)}}
function viewBtAll(){
  const ts=techTickers();const C=S.btCache||lsJSON('pd_bt',{});const rows=ts.map(t=>C[t+'|'+(candles(t).slice(-1)[0]||{}).d]).filter(Boolean);
  return `<div class="sec-t" style="margin-top:0"><div><h2>Sinyal geçmişi testi</h2><p>Teknik plan kuralı her enstrümanda son 2,5 yılda nasıl sonuç verdi</p></div><button class="btn sm" id="btAll">${rows.length<ts.length?`Tümünü hesapla (${ts.length-rows.length} kaldı)`:'Yeniden hesapla'}</button></div>
  <section class="card">${rows.length?`<div class="tscroll"><table class="tbl"><thead><tr><th>Enstrüman</th><th class="r">İşlem</th><th class="r">Kazanma</th><th class="r">Ort. sonuç</th><th class="r">Ort. süre</th><th class="r">Bileşik</th><th class="r">Al-tut</th></tr></thead><tbody>
  ${rows.sort((x,y)=>(y.avgR??-9)-(x.avgR??-9)).map(B=>`<tr style="cursor:pointer" onclick="location.hash='#/teknik/grafik/${B.t}'"><td><div class="sym">${logo(B.t)}<b>${esc(dispT(B.t))}</b></div></td><td class="r num">${B.n}</td><td class="r num ${B.win>=50?'up':B.win<40?'down':''}">${B.win==null?'—':'%'+nf(B.win,0)}</td><td class="r num ${cls(B.avgR)}">${B.avgR==null?'—':(B.avgR>0?'+':'')+nf(B.avgR,2)+' R'}</td><td class="r num">${B.days==null?'—':nf(B.days,0)+' g'}</td><td class="r num ${cls(B.sum)}">${pct(B.sum,0)}</td><td class="r num ${cls(B.hold)}">${pct(B.hold,0)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="muted">Henüz hesaplanmadı. Düğmeye bas; her enstrüman birkaç saniye sürer.</div>'}
  <p class="muted" style="font-size:12px;margin:10px 0 0">Kural: fiyat alım bölgesinin üstündeyken bölgeye geri çekilince al, TP1’de sat, stop’ta kes, 60 gün dolunca kapat. R/R 1,2’nin altındaki sinyaller alınmaz.</p></section>`;
}
function afterBtAll(){const b=$('#btAll');if(!b)return;b.onclick=()=>{const ts=techTickers();const C=S.btCache||{};const redo=b.textContent.startsWith('Yeniden');let k=0;
  const step=()=>{if(k>=ts.length){render(false);return}const t=ts[k++];const key=t+'|'+(candles(t).slice(-1)[0]||{}).d;if(redo&&S.btCache)delete S.btCache[key];b.textContent=`Hesaplanıyor: ${dispT(t)} (${k}/${ts.length})`;b.disabled=true;setTimeout(()=>{try{backtest(t)}catch(e){console.error(e)}step()},20)};step()}}

/* ---------- bildirimler ---------- */
function notifOn(){return lsGet('pd_notif')==='1'&&'Notification' in window&&Notification.permission==='granted'}
async function notifEnable(){if(!('Notification' in window)){toast('Bu tarayıcı bildirimleri desteklemiyor');return}
  const p=await Notification.requestPermission();if(p==='granted'){lsSet('pd_notif','1');toast('Bildirimler açık');notify('Portföy Defteri','Bildirimler çalışıyor. Seviye alarmları ve önemli uyarılar buraya gelecek.','test'+Date.now())}else{lsSet('pd_notif','0');toast('Bildirim izni verilmedi')}render(false)}
function notify(title,body,tag){try{if(navigator.serviceWorker&&navigator.serviceWorker.controller){navigator.serviceWorker.ready.then(r=>r.showNotification(title,{body,tag,icon:'icon-192.png',badge:'icon-192.png'}))}else new Notification(title,{body,tag,icon:'icon-192.png'})}catch(e){}}
function checkNotify(){
  if(!notifOn())return;const now=Date.now();if(S._nLast&&now-S._nLast<60000)return;S._nLast=now;
  const sent=lsJSON('pd_notified',{});const day=new Date().toISOString().slice(0,10);let changed=false;
  const D=drawAll();Object.entries(D).forEach(([t,arr])=>arr.forEach(g=>{if(g.type!=='h'||!g.alarm)return;const px=quote(t).price;if(!(px>0))return;const side=px>g.p?'up':'down';
    if(g.side&&side!==g.side){notify(`${dispT(t)} ${side==='up'?'yukarı':'aşağı'} kırdı`,`Fiyat ${pxf(t,px)}, alarm seviyesi ${pxf(t,g.p)}`,'lv'+t+g.p);changed=true}g.side=side}));
  if(changed)drawSave();
  alerts().filter(a=>a.lvl>=2).forEach(a=>{const k=day+'|'+a.txt;if(sent[k])return;sent[k]=1;notify('Portföy Defteri',a.txt,k)});
  Object.keys(sent).forEach(k=>{if(!k.startsWith(day))delete sent[k]});lsSet('pd_notified',JSON.stringify(sent));
}

/* ---------- karşılaştırma ve oran ---------- */
const CMP_PRESETS=[['SLV','IAU','Gümüş / altın'],['SMH','SPY','Çip / S&P 500'],['SOXX','SMH','SOXX / SMH'],['XBI','SPY','Biyotek / S&P 500'],['COPX','IAU','Bakır / altın (risk iştahı)'],['AMD','SMH','AMD / çip sektörü'],['CRDO','SMH','CRDO / çip sektörü'],['ASML','SMH','ASML / çip sektörü'],['VRT','SPY','VRT / S&P 500']];
function closeSeries(t){const o=S.ohlc&&S.ohlc[t];if(o&&o.length>60)return o.map(r=>[r[0],r[4]]);return (S.hist&&S.hist[t])||series(t)}
function cmpTickers(){return techTickers().concat(['SPY']).filter((x,i,a)=>a.indexOf(x)===i)}
function viewCmp(){
  const L=cmpTickers();const st=S.cmp||(S.cmp={a:'SLV',b:'IAU',mode:'oran',rg:'1Y'});if(!L.includes(st.a))st.a=L[0];if(!L.includes(st.b))st.b='SPY';
  const opt=v=>L.map(x=>`<option value="${x}" ${x===v?'selected':''}>${esc(dispT(x))}</option>`).join('');
  const R=cmpData();
  return `<div class="fade"><div class="cmpbar"><select id="cA">${opt(st.a)}</select><button class="icon" id="cSw" title="Yer değiştir">⇄</button><select id="cB">${opt(st.b)}</select>
    <div class="seg2" id="cMode"><button data-m="oran" class="${st.mode==='oran'?'on':''}">Oran A / B</button><button data-m="norm" class="${st.mode==='norm'?'on':''}">Aynı başlangıç (100)</button></div>
    <div class="seg2" id="cRg">${['3A','6A','1Y','2Y','3Y'].map(r=>`<button data-r="${r}" class="${st.rg===r?'on':''}">${r}</button>`).join('')}</div></div>
  <div class="cpre">${CMP_PRESETS.filter(p=>L.includes(p[0])&&L.includes(p[1])).map(p=>`<button data-a="${p[0]}" data-b="${p[1]}" class="${st.a===p[0]&&st.b===p[1]?'on':''}">${esc(p[2])}</button>`).join('')}</div>
  ${R?`<div class="grid g-main" style="align-items:start"><section class="card"><h3>${esc(dispT(st.a))} ${st.mode==='oran'?'/':'ve'} ${esc(dispT(st.b))}</h3><div class="chart" id="cCmp" style="height:340px"></div>
    ${st.mode==='oran'?`<div class="leg" style="margin-top:6px"><span><i style="background:#8b7bff"></i>Oran</span><span><i style="background:#ffd35c"></i>50 günlük ortalama</span></div>`:`<div class="leg" style="margin-top:6px"><span><i style="background:#5cd3ff"></i>${esc(dispT(st.a))}</span><span><i style="background:#ff9f5c"></i>${esc(dispT(st.b))}</span></div>`}</section>
    <section class="card"><h3>Ne söylüyor?</h3><div class="ins">
      <div><span>Dönem getirisi</span><b><span class="${cls(R.ra)}">${esc(dispT(st.a))} ${pct(R.ra,1)}</span><br><span class="${cls(R.rb)}">${esc(dispT(st.b))} ${pct(R.rb,1)}</span></b></div>
      <div><span>Fark</span><b class="${cls(R.ra-R.rb)}">${R.ra-R.rb>0?'+':''}${nf(R.ra-R.rb,1)} puan ${R.ra>R.rb?esc(dispT(st.a))+' önde':esc(dispT(st.b))+' önde'}</b></div>
      <div><span>Oran şu an</span><b>${nf(R.last,4)}</b></div><div><span>50 günlük ortalamaya göre</span><b class="${cls(R.vsMa)}">${pct(R.vsMa,1)}</b></div>
      <div><span>Dönem içindeki konumu</span><b>%${nf(R.posPct,0)}</b> <i style="font-style:normal" class="muted">(0 = en düşük, 100 = en yüksek)</i></div><div><span>Z-skoru (1 yıl)</span><b class="${Math.abs(R.z)>=2?'warn':''}">${nf(R.z,2)}</b></div>
      <div><span>Günlük getiri korelasyonu</span><b>${nf(R.corr,2)}</b></div></div>
      <p class="plan-msg" style="margin:14px 0 0">${esc(R.msg)}</p></section></div>`:'<div class="empty">Yeterli ortak veri yok</div>'}</div>`;
}
function cmpData(){const st=S.cmp;const A=closeSeries(st.a),B=closeSeries(st.b);const mb=new Map(B);const J=A.filter(p=>mb.has(p[0])).map(p=>[p[0],p[1],mb.get(p[0])]);if(J.length<60)return null;
  const ratio=J.map(p=>[p[0],p[1]/p[2]]);const ma=smaS(ratio.map(p=>p[1]),50);const n={'3A':63,'6A':126,'1Y':252,'2Y':504,'3Y':756}[st.rg]||252;const s=Math.max(0,J.length-n);
  const seg=ratio.slice(s),mseg=ma.slice(s);const last=ratio[ratio.length-1][1];const lo=Math.min(...seg.map(p=>p[1])),hi=Math.max(...seg.map(p=>p[1]));
  const y1=ratio.slice(-252).map(p=>p[1]);const m=y1.reduce((a,b)=>a+b,0)/y1.length;const sd=Math.sqrt(y1.reduce((a,b)=>a+(b-m)**2,0)/y1.length);const z=(last-m)/(sd||1);
  const ra=(J[J.length-1][1]/J[s][1]-1)*100,rb=(J[J.length-1][2]/J[s][2]-1)*100;const vsMa=(last/ma[ma.length-1]-1)*100;
  const rA=[],rB=[];for(let i=Math.max(1,J.length-252);i<J.length;i++){rA.push(J[i][1]/J[i-1][1]-1);rB.push(J[i][2]/J[i-1][2]-1)}const mA=rA.reduce((a,b)=>a+b,0)/rA.length,mB=rB.reduce((a,b)=>a+b,0)/rB.length;
  let cv=0,va=0,vb=0;rA.forEach((x,i)=>{cv+=(x-mA)*(rB[i]-mB);va+=(x-mA)**2;vb+=(rB[i]-mB)**2});const corr=cv/Math.sqrt(va*vb||1);
  const a=dispT(st.a),b=dispT(st.b);const trend=vsMa>2?`Oran 50 günlük ortalamasının üzerinde: ${a}, ${b}’ye göre güç kazanıyor.`:vsMa<-2?`Oran 50 günlük ortalamasının altında: ${b}, ${a}’ya göre daha güçlü.`:`Oran ortalamasına yakın; belirgin bir üstünlük yok.`;
  const ext=z>=2?` Oran son 1 yılın ortalamasından ${nf(z,1)} standart sapma yukarıda; ${a} göreli olarak pahalılaşmış, ortalamaya dönüş riski var.`:z<=-2?` Oran son 1 yılın ortalamasının ${nf(-z,1)} standart sapma altında; ${a} göreli olarak ucuz görünüyor.`:'';
  return {ratio:seg,ma:seg.map((p,i)=>[p[0],mseg[i]]).filter(p=>p[1]!=null),norm:[J.slice(s).map(p=>[p[0],p[1]/J[s][1]*100]),J.slice(s).map(p=>[p[0],p[2]/J[s][2]*100])],last,lo,hi,posPct:(last-lo)/((hi-lo)||1)*100,z,ra,rb,vsMa,corr,msg:trend+ext};
}
function afterCmp(){const st=S.cmp;const R=cmpData();const el=$('#cCmp');
  if(R&&el){if(st.mode==='oran')lineChart(el,[{name:'Oran',color:'#8b7bff',pts:R.ratio},{name:'50G ort.',color:'#ffd35c',pts:R.ma}],{fmt:(v,ax)=>nf(v,ax?3:4)});
    else lineChart(el,[{name:dispT(st.a),color:'#5cd3ff',pts:R.norm[0]},{name:dispT(st.b),color:'#ff9f5c',pts:R.norm[1]}],{fmt:(v,ax)=>nf(v,ax?0:1)})}
  const set=(k,v)=>{st[k]=v;render(false)};$('#cA').onchange=e=>set('a',e.target.value);$('#cB').onchange=e=>set('b',e.target.value);$('#cSw').onclick=()=>{const x=st.a;st.a=st.b;st.b=x;render(false)};
  $$('#cMode button').forEach(b=>b.onclick=()=>set('mode',b.dataset.m));$$('#cRg button').forEach(b=>b.onclick=()=>set('rg',b.dataset.r));$$('.cpre button').forEach(b=>b.onclick=()=>{st.a=b.dataset.a;st.b=b.dataset.b;render(false)})}

/* ---------- makro panel ---------- */
const MK_DEF={VIX:{n:'VIX · korku endeksi',u:'',d:2,chg:'pct',hint:v=>v>=30?'Panik seviyesi':v>=20?'Gergin piyasa':v<=14?'Çok sakin, rehavet':'Normal'},
  US10Y:{n:'ABD 10 yıllık faiz',u:'%',d:2,chg:'bp'},US2Y:{n:'ABD 2 yıllık faiz',u:'%',d:2,chg:'bp'},US3M:{n:'ABD 3 aylık bono',u:'%',d:2,chg:'bp',hint:()=>'Fed politika faizine en yakın piyasa göstergesi'},
  UUP:{n:'Dolar endeksi (UUP fonu)',u:'$',d:2,chg:'pct'}};
function mkS(k){return (S.markets&&S.markets.series&&S.markets.series[k])||[]}
function mkChg(k,n){const s=mkS(k);if(s.length<n+1)return null;const a=s[s.length-1][1],b=s[s.length-1-n][1];return MK_DEF[k].chg==='bp'?(a-b)*100:(a/b-1)*100}
function factorBetas(){
  const ps=portfolioSeries().pts;if(!ps||ps.length<60)return null;const pr=new Map();for(let i=1;i<ps.length;i++)pr.set(ps[i][0],ps[i][1]/ps[i-1][1]-1);
  const out={};['VIX','US10Y','UUP'].forEach(k=>{const s=mkS(k);const xs=[],ys=[];for(let i=1;i<s.length;i++){const r=pr.get(s[i][0]);if(r==null)continue;const x=k==='US10Y'?(s[i][1]-s[i-1][1])*100:(s[i][1]/s[i-1][1]-1)*100;xs.push(x);ys.push(r*100)}
    if(xs.length<40)return;const mx=xs.reduce((a,b)=>a+b,0)/xs.length,my=ys.reduce((a,b)=>a+b,0)/ys.length;let c=0,vx=0,vy=0;xs.forEach((x,i)=>{c+=(x-mx)*(ys[i]-my);vx+=(x-mx)**2;vy+=(ys[i]-my)**2});
    out[k]={beta:c/(vx||1),corr:c/Math.sqrt(vx*vy||1),n:xs.length}});
  const inst={};allTickers().forEach(t=>{const s=series(t);if(s.length<60)return;const m=new Map();for(let i=1;i<s.length;i++)m.set(s[i][0],s[i][1]/s[i-1][1]-1);inst[t]={};
    ['VIX','US10Y','UUP'].forEach(k=>{const f=mkS(k);const xs=[],ys=[];for(let i=1;i<f.length;i++){const r=m.get(f[i][0]);if(r==null)continue;xs.push(k==='US10Y'?(f[i][1]-f[i-1][1])*100:(f[i][1]/f[i-1][1]-1)*100);ys.push(r*100)}
      if(xs.length<40)return;const mx=xs.reduce((a,b)=>a+b,0)/xs.length,my=ys.reduce((a,b)=>a+b,0)/ys.length;let c=0,vx=0,vy=0;xs.forEach((x,i)=>{c+=(x-mx)*(ys[i]-my);vx+=(x-mx)**2;vy+=(ys[i]-my)**2});inst[t][k]={beta:c/(vx||1),corr:c/Math.sqrt(vx*vy||1)}})});
  return {port:out,inst};
}
function viewMakro(){
  if(!S.markets)return '<div class="empty"><b>Makro verisi henüz yok</b>İlk güncellemeden sonra görünecek.</div>';
  const last=k=>{const s=mkS(k);return s.length?s[s.length-1][1]:null};const v10=last('US10Y'),v2=last('US2Y'),v3=last('US3M');
  const card=k=>{const D=MK_DEF[k];const v=last(k);const s=mkS(k).slice(-252);const vals=s.map(p=>p[1]);const lo=Math.min(...vals),hi=Math.max(...vals);const c1=mkChg(k,21),c3=mkChg(k,63);const u=D.chg==='bp'?' bp':'%';
    return `<section class="card mk"><div class="l">${esc(D.n)}</div><div class="v">${D.u==='$'?'$':''}${nf(v,D.d)}${D.u==='%'?'%':''}</div>
      <div class="s"><span class="${cls(k==='UUP'?c1:-c1)}">1A ${c1>0?'+':''}${nf(c1,D.chg==='bp'?0:1)}${u}</span> · <span>3A ${c3>0?'+':''}${nf(c3,D.chg==='bp'?0:1)}${u}</span></div>
      <div class="meter" style="margin-top:10px"><i style="left:${(v-lo)/((hi-lo)||1)*100}%"></i></div><div class="meter-l"><span>${nf(lo,D.d)}</span><span>52 hafta</span><span>${nf(hi,D.d)}</span></div>
      ${D.hint?`<div class="muted" style="font-size:12px;margin-top:6px">${esc(D.hint(v))}</div>`:''}<div class="chart spark2" id="mk_${k}"></div></section>`};
  const sp1=(v10-v2)*100,sp2=(v2-v3)*100;
  const fed=sp2<-15?`2 yıllık faiz 3 aylık bononun ${nf(-sp2,0)} baz puan altında: piyasa önümüzdeki 1-2 yılda Fed’den faiz İNDİRİMİ fiyatlıyor.`:sp2>15?`2 yıllık faiz 3 aylık bononun ${nf(sp2,0)} baz puan üzerinde: piyasa faizlerin YÜKSEK kalacağını ya da artacağını fiyatlıyor.`:`2 yıllık faiz ile 3 aylık bono birbirine yakın (${nf(sp2,0)} bp): piyasa Fed’den belirgin bir değişiklik beklemiyor.`;
  const curve=sp1<0?`Getiri eğrisi ters (10Y − 2Y = ${nf(sp1,0)} bp). Tarihsel olarak resesyon öncesi görülen bir işaret.`:`Getiri eğrisi pozitif (10Y − 2Y = +${nf(sp1,0)} bp), normal görünüm.`;
  const F=factorBetas();const P=F&&F.port;
  const sens=P?[['US10Y',`10 yıllık faiz 10 baz puan artınca`,10],['VIX',`VIX %10 yükselince`,10],['UUP',`dolar endeksi %1 güçlenince`,1]].filter(x=>P[x[0]]).map(([k,txt,m])=>{const b=P[k].beta*m;return `<div><span>${txt}</span><b class="${cls(b)}">${pct(b,2)}</b> <i class="muted" style="font-style:normal">korelasyon ${nf(P[k].corr,2)}</i></div>`}).join(''):'';
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Makro panel</h2><p>Faiz, dolar ve piyasa korkusu · ${esc(trDate(S.markets.updatedAt))}</p></div></div>
  <div class="grid mkg">${['VIX','US10Y','US2Y','US3M','UUP'].map(card).join('')}</div>
  <div class="grid g2 sec" style="align-items:start"><section class="card"><h3>Fed beklentisi ve getiri eğrisi</h3>
    <div class="ins"><div><span>10Y − 2Y</span><b class="${sp1<0?'down':''}">${sp1>0?'+':''}${nf(sp1,0)} bp</b></div><div><span>2Y − 3 ay</span><b>${sp2>0?'+':''}${nf(sp2,0)} bp</b></div></div>
    <p class="plan-msg" style="margin:12px 0 0">${esc(fed)} ${esc(curve)}</p><div class="chart" id="cCurve" style="height:170px;margin-top:10px"></div><div class="leg"><span><i style="background:#8b7bff"></i>10Y − 2Y</span><span><i style="background:#ffd35c"></i>2Y − 3 ay</span></div></section>
    <section class="card"><h3>Portföyün makro duyarlılığı <span class="r muted">son 1 yıl, günlük</span></h3>${sens?`<div class="ins">${sens}</div>`:'<div class="muted">Yeterli veri yok</div>'}
    <p class="muted" style="font-size:12px;margin:10px 0 0">Ortalama tepki (regresyon betası). Korelasyon 0’a yakınsa ilişki zayıf, tahmin güvenilmez.</p></section></div>
  ${F?`<div class="sec-t"><div><h2>Enstrüman bazında duyarlılık</h2><p>Faiz, korku ve dolara karşı ortalama günlük tepki</p></div></div>
  <section class="card"><div class="tscroll"><table class="tbl"><thead><tr><th>Enstrüman</th><th class="r">10Y +10 bp</th><th class="r">VIX +%10</th><th class="r">Dolar +%1</th><th class="r">VIX korelasyonu</th></tr></thead><tbody>
  ${Object.entries(F.inst).map(([t,x])=>`<tr onclick="location.hash='#/t/${t}'" style="cursor:pointer"><td><div class="sym">${logo(t)}<b>${esc(dispT(t))}</b></div></td>${[['US10Y',10],['VIX',10],['UUP',1]].map(([k,m])=>x[k]?`<td class="r num ${cls(x[k].beta*m)}">${pct(x[k].beta*m,2)}</td>`:'<td class="r">—</td>').join('')}<td class="r num">${x.VIX?nf(x.VIX.corr,2):'—'}</td></tr>`).join('')}</tbody></table></div></section>`:''}</div>`;
}
function afterMakro(){if(!S.markets)return;['VIX','US10Y','US2Y','US3M','UUP'].forEach(k=>{const el=$('#mk_'+k);if(el)lineChart(el,[{name:k,color:k==='VIX'?'#ff9f5c':'#8b7bff',pts:mkS(k).slice(-252)}],{fmt:(v,ax)=>nf(v,ax?1:2),noAxis:true})});
  const a=mkS('US10Y'),b=new Map(mkS('US2Y')),c=new Map(mkS('US3M'));const s1=[],s2=[];a.slice(-504).forEach(p=>{if(b.has(p[0]))s1.push([p[0],(p[1]-b.get(p[0]))*100]);if(b.has(p[0])&&c.has(p[0]))s2.push([p[0],(b.get(p[0])-c.get(p[0]))*100])});
  const el=$('#cCurve');if(el)lineChart(el,[{name:'10Y−2Y',color:'#8b7bff',pts:s1},{name:'2Y−3A',color:'#ffd35c',pts:s2}],{fmt:(v,ax)=>nf(v,0)+(ax?'':' bp')})}
