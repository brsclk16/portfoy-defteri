/* Portföy Defteri — içgörüler: soru kutusu, sesli dinleme, bilanço görüşmesi özetleri, analist değişiklikleri, rakip karşılaştırması,
   fon içi değişimler, getirinin kaynağı, iz süren stop, makro olay tepkileri */
"use strict";
function paras(s){return String(s||'').split(/\n{2,}/).map(p=>`<p>${esc(p).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>')}</p>`).join('')}

/* ================= 1) soru kutusu ================= */
function askData(t){const A=((S.answers&&S.answers.items)||[]);const ans=A.filter(a=>t===undefined||(a.t||null)===(t||null));
  const pend=(S.settings.askPending||[]).filter(p=>!A.some(a=>a.id===p.id)&&(t===undefined||(p.t||null)===(t||null)));return {ans,pend}}
function askCard(t,full){const {ans,pend}=askData(t);const L=full?ans:ans.slice(0,4);
  return `<section class="card ask sec"><h3>${t?esc(dispT(t))+' hakkında sor':'Portföy asistanı'} <span class="r muted" style="font-size:12px">cevap en geç 1 saat içinde · telefona bildirim</span></h3>
  <form class="askf" data-askt="${esc(t||'')}"><textarea name="q" rows="2" maxlength="600" placeholder="${t?`ör. ${esc(dispT(t))} neden düştü? Bilanço öncesi pozisyonu küçültmek mantıklı mı?`:'ör. Çip ağırlığımı azaltsam risk nasıl değişir? Bu hafta neye dikkat etmeliyim?'}"></textarea><button class="btn" type="submit">Sor</button></form>
  <p class="muted" style="font-size:11.5px;margin:6px 0 0">Sorular ve cevaplar sitenin herkese açık deposunda saklanır; tutar veya kişisel bilgi yazma. Cevaplar değerlendirmedir, yatırım tavsiyesi değildir.</p>
  ${pend.map(p=>`<div class="qa pend"><div class="qq">❓ ${esc(p.q)}</div><div class="muted" style="font-size:12.5px">⏳ Cevap hazırlanıyor… (${esc(trDT(p.createdAt))})</div></div>`).join('')}
  ${L.map(a=>`<details class="qa" ${full?'':'open'}><summary class="qq">❓ ${esc(a.q)} ${!t&&a.t?`<span class="chip">${esc(dispT(a.t))}</span>`:''} <span class="muted" style="font-size:11.5px">${esc(trDT(a.answeredAt||a.createdAt))}</span></summary><div class="prose">${paras(a.a)}</div>${(a.sources||[]).length?`<div class="muted" style="font-size:12px">Kaynaklar: ${a.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ')}</div>`:''}</details>`).join('')}
  ${!full&&ans.length>4?`<a class="muted" href="#/analiz/asistan" style="font-size:13px">Tüm cevaplar (${ans.length}) →</a>`:''}</section>`}
function viewAsk(){return `<div class="fade">${askCard(null,true).replace('card ask sec','card ask')}${(()=>{const {ans}=askData(undefined);const other=ans.filter(a=>a.t);return other.length?`<section class="card sec"><h3>Enstrüman soruları</h3>${other.map(a=>`<details class="qa"><summary class="qq">❓ <span class="chip">${esc(dispT(a.t))}</span> ${esc(a.q)}</summary><div class="prose">${paras(a.a)}</div></details>`).join('')}</section>`:''})()}</div>`}
function afterAsk(){$$('.askf').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const q=f.q.value.trim();if(q.length<5){toast('Soruyu biraz aç');return}
  if(!(S.settings.ghToken||'').trim()){toast('Önce Ayarlar\'a GitHub anahtarını gir');return}const t=f.dataset.askt||null;const id=Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  const obj={id,t,q,createdAt:new Date().toISOString()};const b=f.querySelector('button');b.disabled=true;b.textContent='Gönderiliyor…';
  let ok=false;try{ok=await ghPutJSON('data/q/'+id+'.json',obj,'Soru (site)')}catch(err){}
  if(!ok){toast('Gönderilemedi; GitHub anahtarını kontrol et');b.disabled=false;b.textContent='Sor';return}
  S.settings.askPending=(S.settings.askPending||[]).concat(obj).slice(-30);try{await saveSettings()}catch(e){}toast('Soru gönderildi · cevap en geç 1 saat içinde');render(false)})}

/* ================= 2) sesli dinleme ================= */
function speakText(txt,btn){if(!('speechSynthesis' in window)){toast('Tarayıcın sesli okumayı desteklemiyor');return}
  if(speechSynthesis.speaking){speechSynthesis.cancel();$$('[data-speak]').forEach(b=>b.textContent='🔊 Dinle');return}
  const u=new SpeechSynthesisUtterance(txt.replace(/[%]/g,' yüzde ').replace(/\$/g,' dolar ').replace(/₺/g,' lira ').replace(/−/g,'eksi '));u.lang='tr-TR';u.rate=1.02;
  const v=speechSynthesis.getVoices().find(x=>/^tr/i.test(x.lang));if(v)u.voice=v;u.onend=()=>{if(btn)btn.textContent='🔊 Dinle'};if(btn)btn.textContent='⏹ Durdur';speechSynthesis.speak(u)}
function speakSource(k){if(k==='brief'){const B=S.brief;if(!B)return '';return [B.title].concat((B.sections||[]).flatMap(s=>[s.h+'.'].concat(s.items||[]))).join('. ')}
  if(k.startsWith('week:')){const R=((S.weekly&&S.weekly.reports)||[]).find(r=>r.id===k.slice(5));if(!R)return '';return [R.title].concat(R.summary||[],['Öne çıkanlar.'],R.highlights||[],['Gelecek hafta.'],R.nextWeek||[]).join('. ')}return ''}
document.addEventListener('click',e=>{const b=e.target&&e.target.closest&&e.target.closest('[data-speak]');if(!b)return;e.preventDefault();speakText(speakSource(b.dataset.speak),b)});

/* ================= 3) bilanço görüşmesi özetleri ================= */
function callsFor(t){return ((S.calls&&S.calls.data)||{})[t]||[]}
function callCard(t,c,showT){const tc={olumlu:'up',olumsuz:'down',temkinli:'warn'}[c.tone]||'';return `<article class="call"><div class="call-h">${showT?`<span class="sym">${logo(t)}<b>${esc(t)}</b></span>`:''}<b>${esc(c.q||'')}</b><span class="muted">${esc(c.date||'')}</span><span class="tag ${tc}">Ton: ${esc(c.tone||'—')}</span>${c.toneChg?`<span class="tag">${esc(c.toneChg)}</span>`:''}</div>
  ${c.summary?`<p style="margin:6px 0">${esc(c.summary)}</p>`:''}${c.guidance?`<p style="margin:6px 0"><b>Rehberlik:</b> ${esc(c.guidance)}</p>`:''}
  <div class="grid g3" style="gap:10px">${[['Öne çıkanlar',c.highlights],['Analistlerin sordukları',c.qa],['Riskler',c.risks]].filter(x=>(x[1]||[]).length).map(([h,L])=>`<div><div class="muted" style="font-size:12px;font-weight:600">${h}</div><ul class="lst">${L.map(x=>`<li><span>${esc(x)}</span></li>`).join('')}</ul></div>`).join('')}</div>
  ${(c.sources||[]).length?`<div class="muted" style="font-size:12px">Kaynak: ${c.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ')}</div>`:''}</article>`}
function callsSection(t){const L=callsFor(t);if(!L.length)return '';return `<section class="card sec"><h3>Bilanço görüşmesi özetleri</h3>${L.slice(0,3).map(c=>callCard(t,c)).join('')}</section>`}

/* ================= 4) analist değişiklikleri ================= */
function anFor(t){return ((S.analysts&&S.analysts.data)||{})[t]}
function analystSection(t){const A=anFor(t);if(!A)return '';const H=A.hist||[];const last=H[H.length-1];const ch=(A.changes||[]).slice(0,8);
  return `<section class="card sec"><h3>Analist görüşleri ${last?`<span class="r muted">${esc(last[0])}</span>`:''}</h3>
  ${last?`<div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))"><div class="kpi"><div class="l">Ortalama hedef</div><div class="v">${usd(last[1],0)}</div><div class="s">${quote(t).price?pct((last[1]/quote(t).price-1)*100,1)+' potansiyel':''}</div></div><div class="kpi"><div class="l">Al</div><div class="v up">${last[2]??'—'}</div></div><div class="kpi"><div class="l">Tut</div><div class="v">${last[3]??'—'}</div></div><div class="kpi"><div class="l">Sat</div><div class="v down">${last[4]??'—'}</div></div></div>`:''}
  ${H.length>2?`<div class="chart" id="cAn" style="height:170px;margin-top:10px"></div>`:''}
  ${ch.length?`<table class="tbl" style="margin-top:10px"><tbody>${ch.map(c=>`<tr><td class="num muted" style="width:90px">${esc(c.d)}</td><td><b>${esc(c.firm||'')}</b></td><td><span class="tag ${/yüksel|artır|başlat/.test(c.action||'')?'up':/düş/.test(c.action||'')?'down':''}">${esc(c.action||'')}</span></td><td class="muted">${esc([c.from,c.to].filter(Boolean).join(' → '))}</td><td class="r num">${c.ptTo?`${c.ptFrom?usd(c.ptFrom,0)+' → ':''}${usd(c.ptTo,0)}`:''}</td></tr>`).join('')}</tbody></table>`:'<p class="muted" style="font-size:13px">Son dönemde kayıtlı not değişikliği yok.</p>'}</section>`}
function afterAnalyst(t){const A=anFor(t);const el=$('#cAn');if(!A||!el)return;const H=A.hist||[];lineChart(el,[{name:'Ortalama hedef',color:'#2fe39a',pts:H.map(h=>[h[0],h[1]])},{name:'Fiyat',color:'#8b7bff',pts:sliceRange(series(t),'1Y').filter(p=>p[0]>=H[0][0])}],{fmt:(v,ax)=>'$'+nf(v,0)})}

/* ================= 5) rakip karşılaştırması ================= */
function peersSection(t){const P=((S.peers&&S.peers.data)||{})[t];if(!P||!P.length)return '';const U=(S.univ&&S.univ.data)||{};const V=(S.valuation&&S.valuation.data)||{};
  const rows=[t].concat(P).map(x=>{const u=U[x]||{},v=V[x]||{};return {t:x,n:u.n,px:u.px,m3:u.m3,ytd:u.ytd,y1:u.y1,pe:v.pe||u.pe,fpe:v.fpe,peg:v.peg,mc:u.mc,beta:u.beta}}).filter(r=>r.t===t||r.px);
  const med=k=>{const a=rows.filter(r=>r.t!==t&&isNum(r[k])).map(r=>r[k]).sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:null};const me=rows[0];
  const note=isNum(me.fpe)&&isNum(med('fpe'))?`${esc(t)} ileri F/K'da rakip medyanının %${nf(Math.abs(me.fpe/med('fpe')-1)*100,0)} ${me.fpe>med('fpe')?'üstünde (primli)':'altında (iskontolu)'}.`:'';
  return `<section class="card sec"><h3>Rakiplerle karşılaştırma</h3><div class="tscroll"><table class="tbl"><thead><tr><th>Şirket</th><th class="r">3 ay</th><th class="r">YBB</th><th class="r">1 yıl</th><th class="r">F/K</th><th class="r">İleri F/K</th><th class="r">PEG</th><th class="r">Beta</th><th class="r">Değer</th></tr></thead><tbody>
  ${rows.map(r=>`<tr class="${r.t===t?'sel':''}"><td><b>${esc(r.t)}</b> <span class="muted" style="font-size:11.5px">${esc((r.n||'').slice(0,22))}</span></td><td class="r num ${cls(r.m3)}">${pct(r.m3,1)}</td><td class="r num ${cls(r.ytd)}">${pct(r.ytd,1)}</td><td class="r num ${cls(r.y1)}">${pct(r.y1,1)}</td><td class="r num">${nf(r.pe,1)}</td><td class="r num">${nf(r.fpe,1)}</td><td class="r num">${nf(r.peg,2)}</td><td class="r num">${nf(r.beta,2)}</td><td class="r num">${r.mc?'$'+nf(r.mc/1e9,0)+' mlr':'—'}</td></tr>`).join('')}
  <tr class="muted"><td>Rakip medyanı</td><td class="r num">${pct(med('m3'),1)}</td><td class="r num">${pct(med('ytd'),1)}</td><td class="r num">${pct(med('y1'),1)}</td><td class="r num">${nf(med('pe'),1)}</td><td class="r num">${nf(med('fpe'),1)}</td><td class="r num">${nf(med('peg'),2)}</td><td class="r num">${nf(med('beta'),2)}</td><td></td></tr></tbody></table></div>
  ${note?`<p style="margin:10px 0 0;font-size:13.5px">${note}</p>`:''}<p class="muted" style="font-size:12px;margin:6px 0 0">Kaynak: Bigdata.com şirket özetleri ve değerleme verisi (haftalık).</p></section>`}

/* ================= 6) fon içi değişimler ================= */
function fundDiff(t){const F=((S.fundhold&&S.fundhold.data)||{})[t];const i=inst(t);if(!F||!F.length)return null;const cur=F[0];
  let prev=F[1];if(!prev&&i&&i.holdings&&i.holdings.length)prev={d:'profil ('+(i.updatedAt||'önceki')+')',h:i.holdings};if(!prev)return {cur,prev:null,rows:[]};
  const pm=new Map(prev.h.map(h=>[h.t,h.w])),cm=new Map(cur.h.map(h=>[h.t,h.w]));const keys=new Set([...pm.keys(),...cm.keys()]);
  const rows=[...keys].map(k=>{const a=pm.get(k),b=cm.get(k);const h=cur.h.find(x=>x.t===k)||prev.h.find(x=>x.t===k)||{};return {t:k,n:h.n,prev:a,now:b,ch:(b||0)-(a||0),st:a==null?'Yeni':b==null?'Çıktı':''}}).sort((x,y)=>Math.abs(y.ch)-Math.abs(x.ch));
  return {cur,prev,rows}}
function fundSection(t,compact){const D=fundDiff(t);if(!D||!D.prev)return '';const R=D.rows.slice(0,compact?6:15);
  return `<section class="card sec"><h3>${compact?'':esc(t)+' · '}Fon içi değişimler <span class="r muted">${esc(D.prev.d)} → ${esc(D.cur.d)}</span></h3><div class="tscroll"><table class="tbl"><thead><tr><th>Varlık</th><th class="r">Önce</th><th class="r">Şimdi</th><th class="r">Değişim</th></tr></thead><tbody>
  ${R.map(r=>`<tr><td><b>${esc(r.t)}</b> <span class="muted" style="font-size:11.5px">${esc((r.n||'').slice(0,24))}</span>${r.st?` <span class="tag ${r.st==='Yeni'?'up':'down'}">${r.st}</span>`:''}</td><td class="r num">${r.prev!=null?'%'+nf(r.prev,2):'—'}</td><td class="r num">${r.now!=null?'%'+nf(r.now,2):'—'}</td><td class="r num ${cls(r.ch)}">${r.ch>0?'+':''}${nf(r.ch,2)} puan</td></tr>`).join('')}</tbody></table></div>
  <p class="muted" style="font-size:12px;margin:8px 0 0">Ağırlık değişimi hem fiyat hareketinden hem fonun alım-satımından gelir; en büyük 10-15 varlık izlenir.</p></section>`}

/* içgörüler sayfası */
function viewInsight(){const tab=S.igTab||'calls';const C=(S.calls&&S.calls.data)||{},A=(S.analysts&&S.analysts.data)||{};const tabs={calls:'Bilanço görüşmeleri',an:'Analist değişiklikleri',fund:'Fon içi değişimler'};
  let body='';
  if(tab==='calls'){const L=Object.entries(C).flatMap(([t,a])=>a.map(c=>({t,c}))).sort((x,y)=>(y.c.date||'').localeCompare(x.c.date||''));body=L.length?L.slice(0,20).map(x=>`<section class="card sec">${callCard(x.t,x.c,true)}</section>`).join(''):'<div class="empty">Görüşme özetleri içgörü görevi çalışınca dolacak.</div>'}
  else if(tab==='an'){const L=Object.entries(A).flatMap(([t,a])=>(a.changes||[]).map(c=>({t,...c}))).sort((x,y)=>(y.d||'').localeCompare(x.d||''));const up=L.filter(c=>/yüksel|artır|başlat/.test(c.action||'')).length,dn=L.filter(c=>/düş/.test(c.action||'')).length;
    body=`<section class="card"><h3>Son değişiklikler <span class="r"><span class="up">▲ ${up}</span> · <span class="down">▼ ${dn}</span></span></h3>${L.length?`<div class="tscroll"><table class="tbl"><tbody>${L.slice(0,40).map(c=>`<tr><td class="num muted">${esc(c.d)}</td><td><a href="#/t/${esc(c.t)}/temel"><b>${esc(c.t)}</b></a></td><td>${esc(c.firm||'')}</td><td><span class="tag ${/yüksel|artır|başlat/.test(c.action||'')?'up':/düş/.test(c.action||'')?'down':''}">${esc(c.action||'')}</span></td><td class="r num">${c.ptTo?usd(c.ptTo,0):''}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Kayıt yok.</p>'}</section>`}
  else{const L=tickers().filter(t=>fundDiff(t));body=L.length?L.map(t=>fundSection(t,false)).join(''):'<div class="empty">Fon ağırlık anlık görüntüleri içgörü görevi çalışınca dolacak.</div>'}
  return `<div class="fade"><div class="filters" id="igT">${Object.entries(tabs).map(([k,l])=>`<button data-k="${k}" class="${tab===k?'on':''}">${l}</button>`).join('')}</div>${body}</div>`}
function afterInsight(){$$('#igT button').forEach(b=>b.onclick=()=>{S.igTab=b.dataset.k;render(false)})}

/* ================= 7) getirinin kaynağı ================= */
function attrib(){const R=realReturn();if(!R||!R.real)return null;const f1=fxNow();const spyS=S.hist.SPY||[];const spyNow=spyS.length?spyS[spyS.length-1][1]:null;
  const G={total:R.port.end-R.inTL,fx:R.usd.end-R.inTL,mkt:R.spy.end-R.usd.end,sel:R.port.end-R.spy.end};
  const {closed,open}=tradeLog();let timing=0;closed.forEach(c=>{const pNow=(quote(c.t).price||0)/(isTRY(c.t)&&fx()?fx():1);timing+=c.q*(c.sell-pNow)*f1});G.timing=timing;G.pick=G.sel-timing;
  const by={};const add=(t,x,cost)=>{const T=themeOf(t).name;const o=by[T]||(by[T]={n:T,c:themeOf(t).c,ex:0,cost:0,tk:{}});o.ex+=x;o.cost+=cost;o.tk[t]=(o.tk[t]||0)+x};
  const eq=(costTL,d0,d1,f)=>{const a=lastLE(spyS,d0),b=d1?lastLE(spyS,d1):spyNow;return a&&b?costTL/(a*fxAt(d0))*b*f:null};
  open.forEach(o=>{const cost=o.q*o.buy*fxAt(o.bd);const now=o.q*((quote(o.t).price||0)/(isTRY(o.t)&&fx()?fx():1))*f1;const e=eq(cost,o.bd,null,f1);if(e!=null)add(o.t,now-e,cost)});
  closed.forEach(c=>{const cost=c.q*c.buy*fxAt(c.bd);const val=c.q*c.sell*fxAt(c.sd);const e=eq(cost,c.bd,c.sd,fxAt(c.sd));if(e!=null)add(c.t,val-e,cost)});
  return {R,G,themes:Object.values(by).sort((a,b)=>b.ex-a.ex),nClosed:closed.length}}
function viewAttrib(){const A=attrib();if(!A)return '<div class="empty"><b>Getiri kaynağı için alım-satım kayıtları gerekiyor</b>Pozisyonlar sayfasından işlemlerini girdiğinde dolar.</div>';const G=A.G;const tl=v=>(v<0?'−':'+')+'₺'+nf(Math.abs(v),0);
  const parts=[['Kur etkisi (dolarda durmak)',G.fx,'Paranı hiç yatırmayıp dolar tutsaydın elde edeceğin TL kazancı'],['Piyasa etkisi (S&P 500)',G.mkt,'Aynı tarihlerde S&P 500 alsaydın dolarda durmaya göre ek kazanç'],['Seçim (enstrüman ve tema)',G.pick,'Seçtiğin fon ve hisselerin S&P 500\'e göre farkı'],['Zamanlama (satışların)',G.timing,A.nClosed?'Sattıklarının satıştan bu yana hareketi: artı = iyi zamanlama':'Henüz satış yok']];
  const mx=Math.max(...parts.map(p=>Math.abs(p[1])),1);const tmx=Math.max(...A.themes.map(t=>Math.abs(t.ex)),1);
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Getirinin kaynağı</h2><p>TL bazındaki toplam kazancın parçaları · aynı tarih ve tutarlarla alternatiflere göre</p></div><div class="bigchip ${cls(G.total)}">Toplam <b>${tl(G.total)}</b></div></div>
  <section class="card"><div class="bars">${parts.map(([l,v,h])=>{const w=Math.min(50,Math.abs(v)/mx*50);return `<div class="bar scn attr"><span class="t"><b>${esc(l)}</b><br><span class="muted" style="font-size:11.5px;white-space:normal">${esc(h)}</span></span><div class="tr mid"><div class="f ${v<0?'neg':'pos'}" style="width:${w}%;${v<0?'right:50%':'left:50%'}"></div></div><span class="v ${cls(v)}">${tl(v)}<br><span style="font-size:11px">${A.R.inTL?pct(v/A.R.inTL*100,1):''}</span></span></div>`}).join('')}</div>
   <p style="margin:14px 0 0;font-size:14px">${(()=>{const L=parts.slice().sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));const tot=Math.abs(G.fx)+Math.abs(G.mkt)+Math.abs(G.pick)+Math.abs(G.timing)||1;return `Kazancının en büyük sürücüsü <b>${esc(L[0][0].split(' (')[0].toLowerCase())}</b> (payı ~%${nf(Math.abs(L[0][1])/tot*100,0)}). ${G.pick>0?'Seçimlerin S&P 500\'ü geride bırakmış.':'Seçimlerin S&P 500\'ün gerisinde kalmış; aynı parayla endeks daha iyi yapardı.'}`})()}</p></section>
  <section class="card sec"><h3>Tema bazında S&P 500'e göre fark</h3><div class="bars">${A.themes.map(t=>{const w=Math.min(50,Math.abs(t.ex)/tmx*50);return `<div class="bar scn"><span class="t"><i class="dot" style="background:${t.c}"></i> <b>${esc(t.n)}</b><br><span class="muted" style="font-size:11px">${Object.entries(t.tk).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${esc(k)} ${tl(v)}`).join(' · ')}</span></span><div class="tr mid"><div class="f ${t.ex<0?'neg':'pos'}" style="width:${w}%;${t.ex<0?'right:50%':'left:50%'}"></div></div><span class="v ${cls(t.ex)}">${tl(t.ex)}</span></div>`}).join('')}</div>
   <p class="muted" style="font-size:12px;margin:10px 0 0">Her alış, aynı gün aynı TL tutarla S&P 500 alınmış gibi kıyaslanır (satılan kısım satış günü kapatılır). Kur etkisi iki tarafta da vardır, fark sadece seçimden gelir. Yaklaşık bir ayrıştırmadır.</p></section></div>`}

/* ================= 8) iz süren stop ================= */
function trailFor(t){const P=positions().list.find(m=>m.t===t&&m.qty>0);if(!P)return null;const {open}=tradeLog();const lots=open.filter(o=>o.t===t);if(!lots.length)return null;
  const since=lots.map(l=>l.bd).sort()[0];const a=candles(t);if(a.length<20)return null;const k=+(((S.settings.trails||{})[t]||{}).k||S.settings.trailK||3);
  const atr=atrS(a)[a.length-1];const cv=isTRY(t)&&fx()?fx():1;const seg=a.filter(x=>x.d>=since);const hi=Math.max(...(seg.length?seg:a.slice(-1)).map(x=>x.c));const lvl=hi-k*atr;const px=a[a.length-1].c;
  return {t,since,k,atr,hi,lvl,px,dist:(px/lvl-1)*100,lock:(lvl/cv/P.avg-1)*100,avg:P.avg,on:!!(((S.settings.trails||{})[t]||{}).on),hit:px<lvl}}
function viewTrail(){const L=positions().list.filter(m=>m.qty>0).map(m=>trailFor(m.t)).filter(Boolean);if(!L.length)return '';
  return `<section class="card sec trail"><h3>İz süren stop <span class="r muted">en yüksek kapanış − k × ATR(14) · k: <input id="trK" type="number" min="1" max="6" step="0.5" value="${esc(S.settings.trailK||3)}" style="width:56px"></span></h3><div class="tscroll"><table class="tbl"><thead><tr><th>Enstrüman</th><th class="r">Fiyat</th><th class="r">Alıştan beri zirve</th><th class="r">Stop</th><th class="r">Uzaklık</th><th class="r">Kilitlenen kâr</th><th>Telefona bildir</th></tr></thead><tbody>
  ${L.map(r=>`<tr><td><b>${esc(dispT(r.t))}</b> <span class="muted" style="font-size:11.5px">${esc(r.since)}'den beri</span></td><td class="r num">${pxf(r.t,r.px)}</td><td class="r num">${pxf(r.t,r.hi)}</td><td class="r num"><b>${pxf(r.t,r.lvl)}</b></td><td class="r num ${r.hit?'down':r.dist<3?'warn':''}">${r.hit?'kırıldı':'%'+nf(r.dist,1)}</td><td class="r num ${cls(r.lock)}">${pct(r.lock,1)}</td><td><label style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" data-trail="${esc(r.t)}" ${r.on?'checked':''} style="width:auto">${r.on?'açık':'kapalı'}</label></td></tr>`).join('')}</tbody></table></div>
  <p class="muted" style="font-size:12px;margin:8px 0 0">Fiyat yükseldikçe stop yukarı çekilir, düşünce geri inmez. "Kilitlenen kâr": stop çalışırsa ortalama maliyetine göre sonuç. Bildirim açık olanlar için fiyat görevi her saat kontrol eder (GitHub anahtarı gerekir).</p></section>`}
function afterTrail(){const k=$('#trK');if(k)k.onchange=async()=>{S.settings.trailK=+k.value||3;await saveSettings();if(S.settings.ghToken)syncRemoteAlarms();render(false)};
  $$('[data-trail]').forEach(c=>c.onchange=async()=>{const t=c.dataset.trail;S.settings.trails=S.settings.trails||{};S.settings.trails[t]={...(S.settings.trails[t]||{}),on:c.checked};await saveSettings();
    if(S.settings.ghToken){const ok=await syncRemoteAlarms();if(!ok)toast('Telefona gönderilemedi; GitHub anahtarını kontrol et')}else toast('Telefon bildirimi için GitHub anahtarı gerekiyor');render(false)})}
function trailPayload(){const T=S.settings.trails||{};return Object.entries(T).filter(([t,v])=>v&&v.on).map(([t,v])=>{const r=trailFor(t);return r?{t,since:r.since,k:+(v.k||S.settings.trailK||3)}:null}).filter(Boolean)}

/* ================= 9) makro olay tepkileri ================= */
function macroKey(name,c){const n=String(name||'');if(c==='TR')return /CBRT|Interest Rate/i.test(n)?'TCMB':/CPI|Consumer Price/i.test(n)?'TR-TÜFE':null;
  return /FOMC|Fed Interest Rate|Federal Funds|Interest Rate Decision/i.test(n)?'FOMC':/Core PCE|PCE/i.test(n)?'PCE':/Nonfarm|Non-Farm/i.test(n)?'NFP':/CPI|Consumer Price/i.test(n)?'CPI':/GDP/i.test(n)?'GDP':/ISM Manufacturing/i.test(n)?'ISM':null}
const MK_NAME={FOMC:'Fed faiz kararı',CPI:'ABD enflasyonu (TÜFE)',NFP:'Tarım dışı istihdam',PCE:'PCE enflasyonu',GDP:'ABD büyüme (GSYH)',ISM:'ISM imalat',TCMB:'TCMB faiz kararı','TR-TÜFE':'Türkiye TÜFE'};
function macroReact(){const C=S.labCache||(S.labCache={});if(C.mr)return C.mr;const E=(S.macroev&&S.macroev.events)||[];if(!E.length)return null;
  const keys=tickers().concat(['SPY']);const rd=(ev,s)=>{const dt=new Date(ev.dt||ev.d+'T12:30:00Z');const d=ev.d||dt.toISOString().slice(0,10);const after=dt.getUTCHours()>=20;const ds=s.map(p=>p[0]);let i=ds.findIndex(x=>after?x>d:x>=d);if(i<1)return null;return (s[i][1]/s[i-1][1]-1)*100};
  const PD=typeof portDaily==='function'?portDaily(756):null;const pm=PD?new Map(PD.dates.map((d,i)=>[d,PD.usd[i]])):null;
  const out={};E.forEach(ev=>{if(!ev.k)return;const o=out[ev.k]||(out[ev.k]={k:ev.k,n:0,by:{},port:[]});o.n++;keys.forEach(t=>{const s=t==='SPY'?(S.hist.SPY||[]):closeSeries(t);if(s.length<30)return;const r=rd(ev,s);if(r!=null)(o.by[t]=o.by[t]||[]).push(r)});
    if(pm){const s=(S.hist.SPY||[]);const dt=new Date(ev.dt||ev.d+'T12:30:00Z');const d=ev.d||dt.toISOString().slice(0,10);const after=dt.getUTCHours()>=20;const day=s.map(p=>p[0]).find(x=>after?x>d:x>=d);const v=day&&pm.get(day);if(isNum(v))o.port.push(v*100)}});
  const st=a=>a&&a.length?{abs:a.reduce((s,x)=>s+Math.abs(x),0)/a.length,avg:a.reduce((s,x)=>s+x,0)/a.length,up:a.filter(x=>x>0).length/a.length*100,n:a.length}:null;
  Object.values(out).forEach(o=>{o.st={};Object.entries(o.by).forEach(([t,a])=>o.st[t]=st(a));o.pst=st(o.port)});
  const all=[];(S.hist.SPY||[]).forEach((p,i,s)=>{if(i)all.push(Math.abs(p[1]/s[i-1][1]-1)*100)});const base=all.slice(-500).reduce((a,b)=>a+b,0)/Math.min(500,all.length||1);
  return C.mr={out,base}}
function macroTypical(name,c){const M=macroReact();const k=macroKey(name,c);if(!M||!k||!M.out[k]||!M.out[k].pst)return null;return M.out[k].pst.abs}
function viewMacroEv(){const M=macroReact();if(!M)return '<div class="empty"><b>Makro olay geçmişi henüz yok</b>İçgörü görevi ilk çalıştığında dolacak.</div>';const ks=Object.keys(M.out).filter(k=>M.out[k].n>=3);const ts=tickers().concat(['SPY']);
  const up=((S.econ&&S.econ.events)||[]).filter(e=>new Date(e.date)>Date.now()).map(e=>({...e,k:macroKey(e.name,e.c)})).filter(e=>e.k&&M.out[e.k]).slice(0,6);
  const heat=v=>{if(!isNum(v))return 'transparent';const a=Math.min(1,v/4);return `rgba(255,159,92,${.08+a*.6})`};
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Makro olay tepkileri</h2><p>Son ~2 yılda büyük veri ve faiz kararı günlerinde ortalama mutlak günlük hareket · normal bir günde S&P 500 ±%${nf(M.base,2)}</p></div></div>
  ${up.length?`<section class="card"><h3>Yaklaşan olaylar ve portföyünün tipik tepkisi</h3><div class="pairs">${up.map(e=>{const o=M.out[e.k];return `<div class="pair"><span><b>${esc(e.tr||MK_NAME[e.k])}</b> <span class="muted">${esc(new Date(e.date).toLocaleString('tr-TR',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}))}</span></span><span class="num">${o.pst?`portföy ±%${nf(o.pst.abs,2)} · ${nf(o.pst.up,0)}% yükseliş`:'—'}</span></div>`}).join('')}</div></section>`:''}
  <section class="card sec"><div class="tscroll"><table class="tbl corr-like"><thead><tr><th>Olay</th><th class="r">Sayı</th><th class="r">Portföy</th>${ts.map(t=>`<th class="r">${esc(dispT(t))}</th>`).join('')}</tr></thead><tbody>
  ${ks.map(k=>{const o=M.out[k];return `<tr><td><b>${esc(MK_NAME[k]||k)}</b></td><td class="r num muted">${o.n}</td><td class="r num" style="background:${heat(o.pst&&o.pst.abs)}"><b>${o.pst?'±%'+nf(o.pst.abs,1):'—'}</b></td>${ts.map(t=>{const s=o.st[t];return `<td class="r num" style="background:${heat(s&&s.abs)}" title="${s?`ortalama ${pct(s.avg,2)}, yükseliş %${nf(s.up,0)}, n=${s.n}`:''}">${s?'±%'+nf(s.abs,1):'—'}</td>`}).join('')}</tr>`}).join('')}</tbody></table></div>
  <p class="muted" style="font-size:12px;margin:8px 0 0">Tepki günü: açıklama ABD kapanışından sonraysa ertesi seans. Hücrenin üzerine gelince ortalama yön ve yükseliş oranı görünür. Portföy satırı bugünkü ağırlıklarınla hesaplanır. Kaynak: Bigdata.com ekonomik takvim, Twelve Data.</p></section></div>`}
