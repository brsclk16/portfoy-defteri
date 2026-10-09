/* Portföy Defteri — "Bugün ne yapmalıyım": tüm sinyalleri öncelik puanıyla 3-5 maddeye indirir.
   Tamamen tarayıcıda, mevcut hesaplardan (plan, iz süren stop, kural, sapma, bilanço + opsiyon, kırmızı bayrak, kendine özgü hareket, rejim, CFTC, canlı takip, ORION). */
"use strict";
function bgSafe(f,d){try{return f()}catch(e){return d}}
function todayItems(){const I=[];const add=(score,ic,title,why,href,key)=>I.push({score,ic,title,why,href,key:key||title});
  const P=positions();const real=P.total>0;const held=P.list.filter(m=>m.qty>0);const W={};held.forEach(m=>W[m.t]=m.w);const heldT=held.map(m=>m.t);
  const scope=heldT.length?heldT:tickers();
  // 1) stop / iz süren stop
  heldT.forEach(t=>{const pl=bgSafe(()=>tradePlan(t));if(pl&&pl.state==='Destek kırıldı')add(95,'⛔',`${dispT(t)} plan stopunun altında`,`Fiyat ${pxf(t,pl.px)}, stop ${pxf(t,pl.stop)}. Pozisyon portföyün %${nf(W[t]||0,0)}'i. Planın bu durumda ne dediğini kontrol et.`,`#/t/${t}/plan`,'stop|'+t);
    const tr=bgSafe(()=>trailFor(t));if(tr&&tr.on){if(tr.hit)add(92,'📉',`${dispT(t)} iz süren stopunu kırdı`,`Stop ${pxf(t,tr.lvl)} (zirve ${pxf(t,tr.hi)} − ${tr.k}×ATR), fiyat ${pxf(t,tr.px)}. Stop seviyesi alış maliyetine göre ${pct(tr.lock,1)}.`,'#/portfoy','trail|'+t);
      else if(tr.dist<2)add(68,'⚠️',`${dispT(t)} iz süren stopa çok yakın`,`Stopa %${nf(tr.dist,1)} mesafe (stop ${pxf(t,tr.lvl)}).`,'#/portfoy','trail|'+t)}});
  // 2) kurallar ve alarm seviyeleri
  bgSafe(()=>ruleAlerts(),[]).forEach(a=>add(75,'🎯','Kuralın tetiklendi',a.txt,a.href,'rule|'+a.txt));
  const D=bgSafe(()=>drawAll(),{});Object.entries(D).forEach(([t,arr])=>(arr||[]).forEach(g=>{if(g.type!=='h'||!g.alarm)return;const q=quote(t);if(!isNum(q.price))return;const d=(q.price/g.p-1)*100;
    if(Math.abs(d)<1)add(62,'🔔',`${dispT(t)} alarm seviyene %${nf(Math.abs(d),1)} yakın`,`Seviye ${pxf(t,g.p)}, fiyat ${pxf(t,q.price)}.`,`#/t/${t}/teknik`,'lvl|'+t+g.p)}));
  // 3) bilanço: yakınlık × portföydeki pay; opsiyon beklentisi vs geçmiş
  bgSafe(()=>upcomingEarnings(7),[]).forEach(e=>{const ex=bgSafe(()=>exposureTo(e.t),{usd:0});const sh=real&&P.total>0?ex.usd/P.total*100:0;if(real&&sh<2)return;
    const days=(new Date(e.date)-Date.now())/864e5;const st=bgSafe(()=>earnStats(e.t));const em=typeof emFor==='function'?emFor(e.t,e.date):null;
    const big=em&&st&&em.em>st.avgAbs*1.25;add((days<=3?80:58)+(big?6:0)+Math.min(10,sh/2),'📅',`${dispT(e.t)} bilançosu ${days<1?'bugün/yarın':Math.ceil(days)+' gün içinde'}`,
      `${real?`Portföyün %${nf(sh,1)}'i doğrudan veya fonlar üzerinden maruz. `:''}${em?`Opsiyonlar ±%${nf(em.em,1)} fiyatlıyor`:''}${st?`${em?', ':''}geçmiş 8 bilançonun ortalaması ±%${nf(st.avgAbs,1)}`:''}${big?' → piyasa olağandan büyük hareket bekliyor':''}.`,'#/piyasa/takvim','earn|'+e.t)});
  // 4) hedef ağırlık sapması
  bgSafe(()=>driftAlerts(),[]).forEach(a=>{const m=a.txt.match(/([+-]?\d+[.,]?\d*) puan/);const v=m?Math.abs(parseFloat(m[1].replace(',','.'))):5;add(52+Math.min(15,v),'⚖️','Hedef ağırlıktan sapma',a.txt,a.href,'drift|'+a.txt)});
  // 5) kırmızı bayraklar (portföydeki hisseler, sadece kırmızılar)
  const FL=heldT.filter(t=>(inst(t)||{}).type==='Hisse').map(t=>[t,bgSafe(()=>redFlagsAuto(t),[]).filter(x=>x.st==='bad')]).filter(x=>x[1].length);
  if(FL.length)add(54+Math.min(14,FL.reduce((s,x)=>s+x[1].length,0)*4),'🚩',FL.length===1?`${dispT(FL[0][0])}: ${FL[0][1].length} kırmızı bayrak`:`${FL.length} hissede kırmızı bayrak`,
    FL.map(([t,f])=>`${dispT(t)}: ${f.slice(0,2).map(x=>`${x.label.toLowerCase()} (${x.note})`).join(', ')}`).join(' · '),'#/piyasa/arastirma','flags');
  // 6) olağandışı kendine özgü hareket
  const R=bgSafe(()=>residData());if(R)R.rows.forEach(x=>{if(!scope.includes(x.t))return;const z1=x.z1,z5=x.z5;
    if(isNum(z1)&&Math.abs(z1)>=2.5)add(60,'🧭',`${dispT(x.t)} bugün piyasadan bağımsız ${z1>0?'yükseldi':'düştü'}`,`Toplam ${pct(x.today.r*100,2)}; bunun ${pct(x.today.e*100,2)}'i hisseye özgü (${nf(Math.abs(z1),1)} standart sapma). Sebebini haberlerde ara.`,`#/t/${x.t}`,'res|'+x.t);
    else if(isNum(z5)&&Math.abs(z5)>=2)add(52,'🧭',`${dispT(x.t)} 5 gündür piyasadan ayrışıyor`,`Kendine özgü 5 günlük hareket ${z5>0?'+':''}${nf(z5,1)} standart sapma. Geçmişte bu tür ayrışmalar ortalamada kısmen geri döndü; tek başına sinyal değil.`,'#/analiz/faktor','res|'+x.t)});
  // 7) büyük günlük hareket (kendine özgü açıklaması yoksa)
  scope.forEach(t=>{const q=quote(t);if(isNum(q.pct)&&Math.abs(q.pct)>=3&&!I.some(i=>i.key==='res|'+t))add(45,q.pct>0?'🚀':'📉',`${dispT(t)} ${pct(q.pct,1)}`,'Günün sert hareketlerinden.',`#/t/${t}`,'mv|'+t)});
  // 8) makro rejim değişimi ve VIX yapısı
  if(S.fred&&typeof regimeAt==='function'){const now=regimeAt(new Date().toISOString().slice(0,10));const d4=new Date();d4.setDate(d4.getDate()-28);const pr=regimeAt(d4.toISOString().slice(0,10));
    if(now.label!==pr.label)add(70,'🌦️',`Makro rejim değişti: ${pr.label} → ${now.label}`,now.C.filter(c=>c.score!==0).map(c=>`${c.n} ${c.txt}`).join(' · '),'#/analiz/makro','regime')}
  const V=S.options&&S.options.vix;if(V&&V.VIX&&V.VIX3M&&V.VIX/V.VIX3M>=1)add(72,'🌪️','VIX vade yapısı ters döndü',`VIX ${nf(V.VIX,1)} > VIX3M ${nf(V.VIX3M,1)}: kısa vadeli korku uzun vadeliden yüksek; stres dönemlerine özgü.`,'#/analiz/duyarlilik','vix');
  // 9) emtia pozisyonlanması aşırı uçta (portföydeki metaller)
  if(typeof COT_MAP!=='undefined')heldT.forEach(t=>{const k=COT_MAP[t];const c=k&&bgSafe(()=>cotInfo(k));if(c&&(c.idx>=90||c.idx<=10))add(44,'🧲',`${COT_N[k]} pozisyonlanması aşırı uçta (${nf(c.idx,0)}/100)`,c.idx>=90?`Spekülatörler 3 yılın en uzun pozisyonuna yakın; ${dispT(t)} için kalabalık işlem riski.`:`Spekülatörler çekilmiş; kötü haber fiyatlanmış olabilir.`,`#/t/${t}`,'cot|'+k)});
  // 10) canlı takip ve ORION
  ((S.paper&&S.paper.items)||[]).forEach(p=>{const s=bgSafe(()=>paperStatus(p));if(!s)return;if(s.dead)add(66,'🪦',`Canlı takip: "${p.name||'strateji'}" durdurma kuralına takıldı`,`${s.dead} tarihinde 63 günlük farkı ${pct(s.dd,1)}.`,'#/teknik/dogrula','pdead|'+p.id);
    else if(s.rebToday)add(57,'🔁',`Canlı takip: "${p.name||'strateji'}" bugün yeniden dengeleniyor`,`Yeni sepet: ${s.pick.map(dispT).join(', ')||'nakit'}${s.chg?` (değişen: ${s.chg})`:''}.`,'#/teknik/dogrula','preb|'+p.id)});
  ((S.research&&S.research.items)||[]).filter(r=>Date.now()-new Date(r.answeredAt)<36*3600e3).slice(0,2).forEach(r=>add(50,'🔭',`Yeni ORION raporu: ${r.title}`,`${r.stance?r.stance+' · ':''}${r.summary||''}`,'#/piyasa/arastirma','orion|'+r.id));
  // 11) plan alım bölgesi (izleme + portföy; tek madde)
  const zones=tickers().map(t=>[t,bgSafe(()=>tradePlan(t))]).filter(([,p])=>p&&p.state==='Fiyat alım bölgesinde');if(zones.length)add(48,'🎯',`${zones.map(z=>dispT(z[0])).join(', ')} teknik alım bölgesinde`,'Planın tanımladığı geri çekilme bölgesi. Girmeden önce işlem öncesi kontrolden geçir.',`#/t/${zones[0][0]}/plan`,'zone');
  const seen=new Set();return I.filter(i=>!seen.has(i.key)&&seen.add(i.key)).sort((a,b)=>b.score-a.score)}
function paperStatus(p){const D=vData();if(!D)return null;const i0=D.dates.indexOf(p.start),i1=D.dates.length-1;if(i0<0)return null;const B=vBacktest(p.cfg,i0,i1);if(!B)return null;
  const K=p.kill||{days:63,under:-10};let dead=null,dd=null;if(B.curve.length>K.days){for(let k=K.days;k<B.curve.length;k++){const x=(B.curve[k][1]/B.curve[k-K.days][1]-B.spyCurve[k][1]/B.spyCurve[k-K.days][1])*100;if(x<K.under){dead=B.curve[k][0];dd=x;break}}}
  const pick=typeof vCurrentPick==='function'?vCurrentPick(p.cfg):[];const reb=p.cfg.reb==='w'?((i1-i0)%5===4):(D.dates[i1].slice(0,7)!==D.dates[i1-1].slice(0,7));
  return {dead,dd,pick,rebToday:reb&&!dead,chg:''}}
function todayCard(){const L=todayItems();const top=L.slice(0,5);const rest=L.length-top.length;const other=bgSafe(()=>alerts(),[]);
  const R=S.fred&&typeof regimeAt==='function'?bgSafe(()=>regimeAt(new Date().toISOString().slice(0,10))):null;
  return `<section class="card today"><h3>Bugün ne yapmalıyım <span class="r muted" style="font-size:12px">${R?`rejim: <span class="chip ${R.cls}">${esc(R.label)}</span> · `:''}${new Date().toLocaleDateString('tr-TR',{weekday:'long',day:'numeric',month:'long'})}</span></h3>
  ${top.length?`<ol class="tdl">${top.map(i=>`<li><a href="${i.href}"><span class="ic">${i.ic}</span><span class="tx"><b>${esc(i.title)}</b><span class="muted">${esc(i.why)}</span></span><span class="sc" title="öncelik puanı">${Math.round(i.score)}</span></a></li>`).join('')}</ol>`:
   '<p style="margin:4px 0">✅ Bugün dikkat gerektiren bir şey yok: stop, alarm, yakın bilanço, sapma ya da olağandışı hareket bulunmadı.</p>'}
  ${rest>0||other.length?`<details class="qa"><summary class="qq muted" style="font-size:12.5px">${rest>0?`${rest} düşük öncelikli madde`:''}${rest>0&&other.length?' · ':''}${other.length?`${other.length} teknik sinyal (RSI, kesişim, sıkışma…)`:''}</summary>
   ${L.slice(5).map(i=>`<a class="ali l1" href="${i.href}"><span class="ic">${i.ic}</span><span>${esc(i.title)} <span class="muted">— ${esc(i.why)}</span></span></a>`).join('')}
   ${other.map(a=>`<a class="ali l${a.lvl}" href="${a.href}"><span class="ic">${a.ic}</span><span>${esc(a.txt)}</span></a>`).join('')}</details>`:''}
  <p class="muted" style="font-size:11.5px;margin:6px 0 0">Öncelik: stop ve kural ihlalleri > yakın bilanço (portföydeki payına göre) > rejim değişimi > sapma, bayrak ve olağandışı hareket. Yatırım tavsiyesi değildir; her madde ilgili sayfaya götürür.</p></section>`}
