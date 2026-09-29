/* Portföy Defteri — faktör notları, kar tanesi, DCF, mali tablo grafikleri, sağlık kontrolü, salt okunur paylaşım */
"use strict";
function fundOf(t){return ((S.fund&&S.fund.data)||{})[t==='NOVO.B'?'NVO':t]}
function valOf2(t){return ((S.valuation&&S.valuation.data)||{})[t]||{}}
function uniOf(t){return ((S.univ&&S.univ.data)||{})[t==='NOVO.B'?'NVO':t]||{}}
function ttm(F,k){const q=(F&&F.q)||[];if(q.length<4)return null;const v=q.slice(-4).map(x=>x[k]);return v.every(isNum)?v.reduce((a,b)=>a+b,0):null}
function fundStats(t){const F=fundOf(t);if(!F||!F.q||!F.q.length)return null;const q=F.q,L=q[q.length-1];const rev=ttm(F,'rev'),op=ttm(F,'op'),ni=ttm(F,'ni'),fcf=ttm(F,'fcf');
  const revPrev=q.length>=8?q.slice(-8,-4).reduce((a,x)=>a+(x.rev||0),0):null;
  return {rev,op,ni,fcf,opm:rev&&isNum(op)?op/rev*100:null,nim:rev&&isNum(ni)?ni/rev*100:null,fcfm:rev&&isNum(fcf)?fcf/rev*100:null,revG:revPrev?(rev/revPrev-1)*100:(q.length>=5&&q[q.length-5].rev?(L.rev/q[q.length-5].rev-1)*100:null),
    cash:L.cash,debt:L.debt,shares:L.shares,netCash:isNum(L.cash)&&isNum(L.debt)?L.cash-L.debt:null,lev:isNum(L.debt)&&op>0?L.debt/op:null}}
function stockList(){return allTickers().filter(t=>{const i=inst(t);return i&&i.type==='Hisse'})}

/* ================= 3) faktör notları ================= */
const GRADES=['F','D','C','B','A'];
function gradeFromPct(p){return p==null?null:GRADES[Math.min(4,Math.floor(p/20))]}
function pctIn(arr,v,low){const a=arr.filter(isNum);if(a.length<3||!isNum(v))return null;const r=a.filter(x=>low?x>=v:x<=v).length/a.length*100;return r}
function peerSet(t){const U=(S.univ&&S.univ.data)||{};const P=((S.peers&&S.peers.data)||{})[t]||[];const me=uniOf(t);
  const ind=Object.entries(U).filter(([k,u])=>k!==t&&me.ind&&u.ind===me.ind).sort((a,b)=>(b[1].mc||0)-(a[1].mc||0)).slice(0,12).map(x=>x[0]);return Array.from(new Set(P.concat(ind))).filter(x=>x!==t)}
function factorGrades(t){
  const peers=peerSet(t);const all=[t].concat(peers);const V=x=>valOf2(x),U=x=>uniOf(x);const fs=fundStats(t);
  const val=x=>{const v=V(x);return v.fpe||v.pe||U(x).pe};const g=x=>V(x).eg;const mom=x=>{const u=U(x);return isNum(u.m6)&&isNum(u.m3)?(u.m3+u.m6)/2:u.m3};
  const out={peers:peers.length};
  out.value={g:gradeFromPct(pctIn(all.map(val),val(t),true)),x:val(t),lbl:V(t).fpe?'ileri F/K':'F/K'};
  const peg=V(t).peg;if(out.value.g&&isNum(peg)){const pg=pctIn(all.map(x=>V(x).peg),peg,true);if(pg!=null)out.value.g=gradeFromPct((pctIn(all.map(val),val(t),true)+pg)/2)}
  out.growth={g:gradeFromPct(pctIn(all.map(g),g(t),false)),x:g(t),lbl:'beklenen EPS büyümesi %'};
  if(!out.growth.g&&fs&&isNum(fs.revG)){const r=fs.revG;out.growth={g:r>30?'A':r>15?'B':r>5?'C':r>0?'D':'F',x:r,lbl:'gelir büyümesi %'}}
  if(fs&&isNum(fs.opm)){const m=fs.opm;out.profit={g:m>30?'A':m>20?'B':m>10?'C':m>0?'D':'F',x:m,lbl:'faaliyet marjı %'}}else out.profit={g:null};
  out.momentum={g:gradeFromPct(pctIn(all.map(mom),mom(t),false)),x:mom(t),lbl:'3-6 ay getiri %'};
  const A=((S.analysts&&S.analysts.data)||{})[t];let rv=null;if(A&&A.hist&&A.hist.length>1){const H=A.hist;const last=H[H.length-1];const d0=addDays(last[0],-30);const old=H.filter(h=>h[0]<=d0).pop()||H[0];if(old[1])rv=(last[1]/old[1]-1)*100}
  out.revision={g:rv==null?null:rv>5?'A':rv>2?'B':rv>-2?'C':rv>-5?'D':'F',x:rv,lbl:'30 günde hedef fiyat değişimi %'};
  return out}
function gradeChip(g){return g?`<span class="grd g${g}">${g}</span>`:'<span class="grd gn">—</span>'}

/* ================= 4) kar tanesi ================= */
function snowflake(t){const F=factorGrades(t),fs=fundStats(t),v=valOf2(t),u=uniOf(t),D=((S.divs&&S.divs.data)||{})[t];const gs=x=>x?GRADES.indexOf(x)+1:null;
  const eg=v.eg;const fut=isNum(eg)?(eg>30?5:eg>20?4:eg>10?3:eg>3?2:1):(fs&&isNum(fs.revG)?(fs.revG>30?5:fs.revG>15?4:fs.revG>5?3:fs.revG>0?2:1):null);
  const past=fs&&isNum(fs.revG)?Math.round(((fs.revG>25?5:fs.revG>12?4:fs.revG>5?3:fs.revG>0?2:1)+(isNum(u.y1)?(u.y1>50?5:u.y1>20?4:u.y1>5?3:u.y1>-10?2:1):3))/2):(isNum(u.y1)?(u.y1>50?5:u.y1>20?4:u.y1>5?3:u.y1>-10?2:1):null);
  const health=fs?(isNum(fs.netCash)&&fs.netCash>0?5:isNum(fs.lev)?(fs.lev<1?4:fs.lev<2?3:fs.lev<4?2:1):null):null;
  const div=D?(D.pays?(D.yield>=4?5:D.yield>=3?4:D.yield>=2?3:D.yield>=1?2:1):0):null;
  return [{k:'Değer',v:gs(F.value.g)},{k:'Gelecek',v:fut},{k:'Geçmiş',v:past},{k:'Sağlık',v:health},{k:'Temettü',v:div}]}
function snowSVG(ax,size=170,col){const n=ax.length,cx=size/2,cy=size/2,R=size*.3;const pt=(i,r)=>{const a=-Math.PI/2+i*2*Math.PI/n;return [cx+Math.cos(a)*r,cy+Math.sin(a)*r]};
  const tot=ax.reduce((s,a)=>s+(a.v||0),0);const c=col||(tot>=18?'#2fe39a':tot>=13?'#b8f25c':tot>=9?'#ffc35c':'#ff5d7a');let s='';
  [1,2,3,4,5].forEach(l=>{s+=`<polygon points="${ax.map((_,i)=>pt(i,R*l/5).join(',')).join(' ')}" fill="none" stroke="var(--line2)" stroke-width="${l===5?1.2:.6}"/>`});
  s+=`<polygon points="${ax.map((a,i)=>pt(i,R*Math.max(.25,(a.v||0))/5).join(',')).join(' ')}" fill="${c}" fill-opacity=".45" stroke="${c}" stroke-width="1.5"/>`;
  ax.forEach((a,i)=>{const [x,y]=pt(i,R+14);s+=`<text x="${x}" y="${y+3}" text-anchor="middle" style="font:600 10px var(--sans,system-ui);fill:var(--muted)">${a.k}${a.v==null?'?':''}</text>`});
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="overflow:visible">${s}</svg>`}

/* notlar sayfası (3 + 4) */
function viewNotlar(){const L=stockList();if(!L.length)return '<div class="empty">Hisse yok</div>';
  const rows=L.map(t=>({t,F:factorGrades(t),ax:snowflake(t)}));
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Hisse notları</h2><p>Seeking Alpha tarzı faktör notları (rakiplerine göre) ve Simply Wall St tarzı kar tanesi · portföy ve izleme listesindeki hisseler</p></div></div>
  <section class="card"><div class="tscroll"><table class="tbl"><thead><tr><th>Hisse</th><th class="c">Değer</th><th class="c">Büyüme</th><th class="c">Kârlılık</th><th class="c">Momentum</th><th class="c">Revizyon</th><th class="r">Rakip sayısı</th></tr></thead><tbody>
  ${rows.map(r=>`<tr style="cursor:pointer" onclick="location.hash='#/t/${esc(r.t)}/temel'"><td><div class="sym">${logo(r.t)}<b>${esc(dispT(r.t))}</b>${inst(r.t).watchlist?' <span class="chip">izleme</span>':''}</div></td>${['value','growth','profit','momentum','revision'].map(k=>`<td class="c" title="${esc((r.F[k]&&r.F[k].lbl)||'')}: ${isNum(r.F[k]&&r.F[k].x)?nf(r.F[k].x,1):'—'}">${gradeChip(r.F[k]&&r.F[k].g)}</td>`).join('')}<td class="r num muted">${r.F.peers}</td></tr>`).join('')}</tbody></table></div>
  <p class="muted" style="font-size:12px;margin:8px 0 0">Değer ve büyüme, aynı sektördeki büyük şirketler ve seçilmiş rakiplerle kıyaslanır (A en iyi %20). Kârlılık faaliyet marjına, revizyon son 30 günde ortalama analist hedefinin değişimine göre verilir. Hücrenin üzerine gelince ham değer görünür.</p></section>
  <div class="snowgrid sec">${rows.map(r=>`<a class="card snowc" href="#/t/${esc(r.t)}/temel">${snowSVG(r.ax)}<b>${esc(dispT(r.t))}</b><span class="muted" style="font-size:11.5px">${r.ax.map(a=>`${a.k[0]}${a.v??'?'}`).join(' · ')}</span></a>`).join('')}</div>
  <p class="muted" style="font-size:12px;margin:8px 2px 0">Kar tanesi: her eksen 0-5. Geniş ve yeşil şekil dengeli şirket; sivri şekil tek bir güçlü yöne dayanıyor. "?" veri eksik. Yatırım tavsiyesi değildir.</p></div>`}
function notesSection(t){const i=inst(t);if(!i||i.type!=='Hisse')return '';const F=factorGrades(t),ax=snowflake(t);
  return `<section class="card sec"><h3>Notlar ve kar tanesi</h3><div class="notes2">${snowSVG(ax,190)}<div class="grid" style="gap:8px;align-content:start">${[['Değer','value'],['Büyüme','growth'],['Kârlılık','profit'],['Momentum','momentum'],['Analist revizyonu','revision']].map(([l,k])=>`<div class="pt-r"><span>${l}</span><span class="num muted" style="font-size:12px">${F[k]&&isNum(F[k].x)?nf(F[k].x,1)+' '+esc(F[k].lbl):''}</span><span></span>${gradeChip(F[k]&&F[k].g)}</div>`).join('')}</div></div></section>`}

/* ================= 5) DCF ================= */
function dcfCalc(t,o){const fs=fundStats(t);if(!fs||!isNum(fs.fcf)||!fs.shares)return null;const g1=o.g/100,tg=o.tg/100,r=o.r/100;let f=fs.fcf,pv=0;
  for(let y=1;y<=10;y++){const g=y<=5?g1:g1+(tg-g1)*(y-5)/5;f*=1+g;pv+=f/Math.pow(1+r,y)}const tv=f*(1+tg)/(r-tg);const pvtv=tv/Math.pow(1+r,10);
  const eq=pv+pvtv+(fs.netCash||0);return {fair:eq/fs.shares,pv,pvtv,fcf:fs.fcf,shares:fs.shares,netCash:fs.netCash}}
function dcfImplied(t,o,px){let lo=-20,hi=80;for(let k=0;k<40;k++){const m=(lo+hi)/2;const c=dcfCalc(t,{...o,g:m});if(!c)return null;if(c.fair<px)lo=m;else hi=m}return (lo+hi)/2}
function dcfSection(t){const fs=fundStats(t);if(!fs||!isNum(fs.fcf)||!(fs.fcf>0))return '';S.dcf=S.dcf||{};const v=valOf2(t);const d=S.dcf[t]||(S.dcf[t]={g:Math.max(3,Math.min(35,Math.round(v.eg||fs.revG||10))),tg:3,r:10});
  const px=quote(t).price;const c=dcfCalc(t,d);const imp=dcfImplied(t,d,px);const up=c?(c.fair/px-1)*100:null;const sl=(k,l,mn,mx,st,u)=>`<label class="sl"><span class="n">${l}</span><input type="range" min="${mn}" max="${mx}" step="${st}" value="${d[k]}" data-dcf="${k}" data-t="${esc(t)}"><b class="num">%${nf(d[k],1)}</b></label>`;
  return `<section class="card sec"><h3>Gerçek değer (DCF) <span class="r muted">serbest nakit akışıyla, 10 yıl</span></h3>
  <div class="sliders">${sl('g','Büyüme (1-5. yıl)',-10,60,1)}${sl('tg','Kalıcı büyüme',0,5,.5)}${sl('r','İskonto oranı',6,16,.5)}</div>
  <div class="grid g4" style="margin-top:12px"><div class="kpi"><div class="l">Tahmini gerçek değer</div><div class="v">${usd(c.fair,0)}</div></div><div class="kpi"><div class="l">Fiyat</div><div class="v">${usd(px,0)}</div></div><div class="kpi"><div class="l">${up>=0?'İskonto':'Prim'}</div><div class="v ${cls(up)}">${pct(up,1)}</div><div class="s">${up>=0?'fiyat gerçek değerin altında':'fiyat gerçek değerin üstünde'}</div></div><div class="kpi"><div class="l">Fiyatın ima ettiği büyüme</div><div class="v">${imp!=null?'%'+nf(imp,1):'—'}</div><div class="s">1-5. yıl yıllık FCF büyümesi</div></div></div>
  <p class="muted" style="font-size:12px;margin:10px 0 0">Son 4 çeyrek serbest nakit akışı ${bigN2(c.fcf)}, net nakit ${bigN2(c.netCash)}, hisse sayısı ${nf(c.shares/1e6,0)} mn. 6-10. yıllarda büyüme kalıcı orana doğru azalır. Varsayımlara çok duyarlıdır; bir aralık fikri verir, kesin değer değildir. Yatırım tavsiyesi değildir.</p></section>`}
function bigN2(v){if(!isNum(v))return '—';const a=Math.abs(v);return (v<0?'−':'')+'$'+(a>=1e9?nf(a/1e9,1)+' mlr':nf(a/1e6,0)+' mn')}
function afterDcf2(){$$('[data-dcf]').forEach(r=>{r.oninput=()=>{r.nextElementSibling.textContent='%'+nf(+r.value,1)};r.onchange=()=>{S.dcf[r.dataset.t][r.dataset.dcf]=+r.value;render(false)}})}

/* ================= 6) mali tablo grafikleri ================= */
function barsSVG(vals,labels,opt){const W=opt.w||320,H=opt.h||120,pb=18,pt=8;const mx=Math.max(...vals.filter(isNum).map(Math.abs),1e-9);const hasNeg=vals.some(v=>v<0);const zero=hasNeg?pt+(H-pt-pb)/2:H-pb;const bw=(W-8)/vals.length;
  let s='';vals.forEach((v,i)=>{if(!isNum(v))return;const h=Math.abs(v)/mx*(hasNeg?(H-pt-pb)/2:(H-pt-pb));const x=4+i*bw+bw*.15;s+=`<rect x="${x}" y="${v>=0?zero-h:zero}" width="${bw*.7}" height="${Math.max(1,h)}" rx="2" fill="${v>=0?(opt.c||'var(--accent2)'):'var(--down)'}"/>`});
  labels.forEach((l,i)=>{if(i%Math.ceil(labels.length/6)===0||i===labels.length-1)s+=`<text x="${4+i*bw+bw/2}" y="${H-4}" text-anchor="middle" style="font:500 9px var(--mono);fill:var(--muted)">${esc(l)}</text>`});
  const last=vals[vals.length-1];return `<svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">${s}<line x1="0" x2="${W}" y1="${zero}" y2="${zero}" stroke="var(--line2)"/></svg><div class="num" style="font-size:12px;text-align:right">${opt.fmt(last)}</div>`}
function statementsSection(t){const F=fundOf(t);if(!F||!F.q||F.q.length<3)return '';const q=F.q.slice(-12);const lab=q.map(x=>x.p||x.d.slice(2,7));
  const m=(a,b)=>q.map(x=>isNum(x[a])&&x[b]?x[a]/x[b]*100:null);
  const P=[['Gelir',q.map(x=>x.rev),v=>bigN2(v)],['Faaliyet marjı',m('op','rev'),v=>isNum(v)?'%'+nf(v,1):'—'],['Net kâr',q.map(x=>x.ni),v=>bigN2(v)],['Serbest nakit akışı',q.map(x=>x.fcf),v=>bigN2(v)],['Nakit − borç',q.map(x=>isNum(x.cash)&&isNum(x.debt)?x.cash-x.debt:null),v=>bigN2(v)],['Hisse sayısı (mn)',q.map(x=>x.shares?x.shares/1e6:null),v=>nf(v,0)]];
  return `<section class="card sec"><h3>Mali tablolar <span class="r muted">son ${q.length} çeyrek · ${esc(F.src||'Bigdata.com')}</span></h3><div class="stgrid">${P.map(([n,v,f])=>`<div><div class="muted" style="font-size:12px;font-weight:600">${n}</div>${barsSVG(v,lab,{fmt:f,c:n.includes('marj')?'var(--accent)':undefined})}</div>`).join('')}</div>
  <p class="muted" style="font-size:12px;margin:8px 0 0">Hisse sayısının düşmesi geri alımı, artması seyrelmeyi gösterir.</p></section>`}

/* ================= 8) sağlık kontrolü ================= */
function healthItems(){const W=weights();const w=W.w;const ws=Object.values(w).reduce((a,b)=>a+b,0)||1;const out=[];const it=(n,v,st,txt)=>out.push({n,v,st,txt});
  const top=Object.entries(w).sort((a,b)=>b[1]-a[1])[0];if(top){const x=top[1]/ws*100;it('En büyük pozisyon',`${dispT(top[0])} %${nf(x,0)}`,x<20?'g':x<35?'y':'r','Tek pozisyon portföyün %20\'sini aşmamalı; %35 üstü tek bir hisseye/fona bağımlılık demek.')}
  let M=null;try{M=riskModel()}catch(e){}
  if(M){const th={};M.contrib.forEach(c=>{const T=themeOf(c.t).name;th[T]=(th[T]||0)+c.rc});const tt=Object.entries(th).sort((a,b)=>b[1]-a[1])[0];if(tt)it('Tema risk yoğunluğu',`${tt[0]} riskin %${nf(tt[1],0)}'i`,tt[1]<50?'g':tt[1]<70?'y':'r','Portföy oynaklığının yarısından fazlası tek temadan geliyorsa o tema kötü giderse her şey birlikte düşer.');
    const spy=(M.rows.find(r=>r.k==='SPY')||{}).vol||stats((M.R.SPY||[]))&&stats(M.R.SPY).sd*Math.sqrt(252)*100;const ratio=spy?M.P.vol/spy:null;if(ratio)it('Oynaklık',`S&P 500'ün ${nf(ratio,1)} katı (%${nf(M.P.vol,0)})`,ratio<1.3?'g':ratio<1.8?'y':'r','S&P 500\'ün 1,8 katından oynak portföyde %20\'lik piyasa düşüşü ~%36 kayıp demektir.');
    const div=M.wavgVol-M.P.vol;it('Çeşitlendirme etkisi',`−${nf(Math.max(0,div),1)} puan oynaklık`,div>6?'g':div>3?'y':'r','Pozisyonların birlikte tutulması oynaklığı ne kadar düşürüyor; düşükse pozisyonlar aynı yöne hareket ediyor.');
    it('Son 1 yılda en büyük düşüş',pct(M.P.mdd,1),M.P.mdd>-15?'g':M.P.mdd>-25?'y':'r','Zirveden %25\'ten büyük düşüşler çoğu yatırımcının dayanma eşiğidir.')}
  try{const E=lookThroughExp()[0];if(E)it('Tek şirket maruziyeti',`${E.t} %${nf(E.tot,1)} (fonlar dahil)`,E.tot<10?'g':E.tot<20?'y':'r','Fonların içi dahil tek bir şirkete %20\'den fazla bağlıysan o şirketin bilançosu portföyünü tek başına sallar.')}catch(e){}
  try{const U=upcomingEarnings(14);let x=0;Object.entries(w).forEach(([t,v])=>{const i=inst(t);const rel=[t].concat(((i&&i.holdings)||[]).filter(h=>h.w>=5).map(h=>h.t));if(U.some(e=>rel.includes(e.t)))x+=v/ws*100});it('Yaklaşan bilanço yoğunluğu',`portföyün %${nf(x,0)}'i 14 gün içinde`,x<25?'g':x<50?'y':'r','Portföyün yarısı aynı iki haftada bilanço açıklayan şirketlere bağlıysa sert bir haftaya hazırlıklı ol.')}catch(e){}
  let br=0;Object.keys(w).forEach(t=>{try{const P=tradePlan(t);if(P&&P.state==='Destek kırıldı')br++}catch(e){}});it('Stop seviyesinin altındaki pozisyonlar',`${br} pozisyon`,br===0?'g':br===1?'y':'r','Teknik planın stop seviyesinin altına inmiş pozisyonlar yeniden değerlendirilmeli.');
  let er=0,ew=0;Object.entries(w).forEach(([t,v])=>{const m=((inst(t)||{}).metrics||[]).find(x=>/gider oran/i.test(x.label));if(m){const r=parseFloat(String(m.value).replace('%','').replace(',','.'));if(isFinite(r)){er+=r*v;ew+=v}}});if(ew)it('Ortalama fon gideri',`%${nf(er/ew,2)} / yıl`,er/ew<.4?'g':er/ew<.7?'y':'r','Fon giderleri her yıl getiriden düşer; %0,7 üstü uzun vadede belirgin fark yaratır.');
  const T=S.settings.targets||{};const tsum=Object.values(T).reduce((a,b)=>a+(+b||0),0);if(tsum>0&&W.real){let mx=0,mt='';Object.keys({...w,...T}).forEach(t=>{const d=Math.abs((w[t]||0)/ws*100-(+T[t]||0)/tsum*100);if(d>mx){mx=d;mt=t}});it('Hedef ağırlıktan sapma',`${dispT(mt)} ${nf(mx,1)} puan`,mx<5?'g':mx<10?'y':'r','Hedeften 10 puandan fazla sapma dengelemenin zamanı geldiğini gösterir.')}
  it('Kur yapısı','Varlıkların tamamı dolar bazlı','i','TL bazında düşünürsen dolar/TL yükselişi portföyünü destekler; TL\'nin reel değer kazandığı dönemlerde TL getirin dolar getirinin gerisinde kalır.');
  return out}
function viewHealth(){const L=healthItems();const sc=L.filter(x=>x.st!=='i');const score=sc.length?Math.round(sc.reduce((s,x)=>s+({g:2,y:1,r:0}[x.st]),0)/(sc.length*2)*100):null;const lab=score>=75?'Sağlıklı':score>=50?'Dikkat':'Riskli';
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Portföy sağlık kontrolü</h2><p>${esc(weights().src)} · yoğunlaşma, oynaklık, tek şirket riski, bilanço yoğunluğu, maliyet</p></div><div class="bigchip ${score>=75?'up':score>=50?'':'down'}">Skor <b>${score??'—'}</b> · ${lab}</div></div>
  <section class="card"><div class="hlist">${L.map(x=>`<div class="hitem h${x.st}"><i></i><div><b>${esc(x.n)}</b><div class="muted" style="font-size:12.5px">${esc(x.txt)}</div></div><span class="num">${esc(x.v)}</span></div>`).join('')}</div>
  <p class="muted" style="font-size:12px;margin:10px 0 0">Yeşil sorun yok, sarı dikkat, kırmızı müdahale düşün. Eşikler genel kabul görmüş kurallardır; kişisel risk toleransına göre değerlendir. Yatırım tavsiyesi değildir.</p></section></div>`}

/* ================= 7) salt okunur paylaşım ================= */
function b64url(s){return btoa(unescape(encodeURIComponent(s))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function shareLink(){const W=weights();const ws=Object.values(W.w).reduce((a,b)=>a+b,0)||1;const P=positions();const R=(()=>{try{return realReturn()}catch(e){return null}})();
  const pos={};Object.entries(W.w).forEach(([t,v])=>{const m=P.list.find(x=>x.t===t);pos[dispT(t)]=[+(v/ws*100).toFixed(1),m&&isNum(m.pnlPct)?+m.pnlPct.toFixed(1):null,themeOf(t).name]});
  const obj={v:1,d:new Date().toISOString().slice(0,10),src:W.src,pos,tl:R&&R.real?+R.port.ret.toFixed(1):null,real:R&&R.real?+R.realVsCpi.toFixed(1):null,vsSpy:R&&R.real?+((R.port.end/R.spy.end-1)*100).toFixed(1):null,vsGold:R&&R.real?+((R.port.end/R.gold.end-1)*100).toFixed(1):null,name:S.settings.shareName||''};
  return location.origin+location.pathname.replace(/index\.html$/,'')+'share.html#'+b64url(JSON.stringify(obj))}
function viewShareCard(){return `<section class="card sec"><h3>Salt okunur paylaşım bağlantısı</h3><p class="muted" style="font-size:13px;margin:0 0 10px">Sadece yüzdeleri gösterir: ağırlıklar, pozisyon getirileri, temalar ve TL bazında getiri. Tutar, adet ve maliyet görünmez. Bağlantı verinin anlık kopyasıdır; sunucuya bir şey kaydedilmez.</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="shName" placeholder="Başlık (ops.) ör. Barış'ın portföyü" value="${esc(S.settings.shareName||'')}" style="flex:1;min-width:180px"><button class="btn" id="shMake">Bağlantıyı kopyala</button><button class="btn ghost" id="shOpen">Önizle</button></div></section>`}
function afterShareCard(){const n=$('#shName');if(n)n.onchange=async()=>{S.settings.shareName=n.value.trim();try{await saveSettings()}catch(e){}};
  const m=$('#shMake');if(m)m.onclick=async()=>{S.settings.shareName=($('#shName')||{}).value||'';const u=shareLink();try{if(navigator.share&&/Mobi/i.test(navigator.userAgent))await navigator.share({title:'Portföy',url:u});else{await navigator.clipboard.writeText(u);toast('Bağlantı kopyalandı')}}catch(e){prompt('Bağlantı:',u)}};
  const o=$('#shOpen');if(o)o.onclick=()=>window.open(shareLink(),'_blank')}
