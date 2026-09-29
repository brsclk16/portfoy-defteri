/* Portföy Defteri — TradingView/Investing tarzı eklemeler: grafikte olay işaretleri, ısı haritası, geçmişi oynatma,
   geniş fikir tarayıcı, piyasa şeridi ve seans saatleri, ekonomik takvim (TR+ABD), çok zaman dilimli teknik özet, duyarlılık endeksi */
"use strict";

/* ================= 1) grafikte olay işaretleri ================= */
function chartEvents(t,all,start,X,Y,main,WK){
  const dts=all.map(x=>x.d);const idx=d=>{if(d<dts[start])return -1;let k=dts.findIndex(x=>x>=d);if(k<0)return d<=dts[dts.length-1]?dts.length-1:-1;if(WK&&k>0&&dts[k]>d&&dts[k-1]<=d)k=k;return k};
  const ev={};const add=(d,o)=>{const i=idx(d);if(i<start||i<0)return;(ev[i]=ev[i]||[]).push(o)};
  S.lots.filter(l=>l.t===t).forEach(l=>add(l.date,{k:l.side==='S'?'S':'B',txt:`${l.side==='S'?'Satış':'Alış'} ${nf(+l.q,+l.q%1?2:0)} × ${nf(+l.p,2)}`,p:+l.p}));
  const EH=S.ehist&&S.ehist.data&&S.ehist.data[t];if(EH)(EH.hist||[]).forEach(h=>add(h.rd||h.d,{k:'E',txt:`Bilanço ${h.q||''}: ilk gün ${pct(h.move,1)}`}));
  if(EH&&EH.next)add(EH.next.d,{k:'E',txt:`Sıradaki bilanço ${EH.next.d}`});
  const DV=S.divs&&S.divs.data&&S.divs.data[t];if(DV&&DV.hist)DV.hist.forEach(h=>add(h[0],{k:'D',txt:`Temettü hak ediş: $${nf(h[1],4)}`}));
  (S.data.news||[]).filter(n=>(n.importance||0)>=2&&(n.tickers||[]).includes(t)).forEach(n=>add((n.publishedAt||'').slice(0,10),{k:'N',txt:n.title,imp:n.importance}));
  let g='';const base=main.y+main.h-4;
  Object.entries(ev).forEach(([i,L])=>{i=+i;const x=X(i),c=all[i];let lane=0;
    L.forEach(o=>{if(o.k==='B'||o.k==='S'){const up=o.k==='B';const y=up?Y(c.l)+12:Y(c.h)-12;const col=up?'#2fe39a':'#ff5d7a';
        g+=`<g class="evm"><path d="${up?`M${x},${y-7} l-6,10 h12 z`:`M${x},${y+7} l-6,-10 h12 z`}" fill="${col}" stroke="#0b0e13" stroke-width="1"/><title>${esc(o.txt)}</title></g>`;
        if(o.p>0)g+=`<line x1="${x-6}" x2="${x+6}" y1="${Y(o.p)}" y2="${Y(o.p)}" stroke="${col}" stroke-width="2"/>`}
      else{const col={E:'#ffc35c',D:'#5cd3ff',N:o.imp>=3?'#ff9f5c':'#8b7bff'}[o.k];const y=base-lane*17;lane++;
        g+=`<g class="evm"><circle cx="${x}" cy="${y}" r="7" fill="${col}" stroke="#0b0e13" stroke-width="1"/><text x="${x}" y="${y+3.5}" text-anchor="middle" style="font:700 9px var(--mono);fill:#0b0e13">${o.k==='N'?'H':o.k}</text><title>${esc(o.txt)}</title></g>`}})});
  return g;
}

/* ================= 2) ısı haritası ================= */
function squarify(items,x,y,w,h){ // items: [{v,...}] v>0 → [{...,x,y,w,h}]
  const out=[];const tot=items.reduce((s,i)=>s+i.v,0);if(!(tot>0))return out;const scale=w*h/tot;
  let rest=items.map(i=>({...i,a:i.v*scale})).sort((a,b)=>b.a-a.a);
  const worst=(row,s)=>{const sum=row.reduce((p,r)=>p+r.a,0);const mx=Math.max(...row.map(r=>r.a)),mn=Math.min(...row.map(r=>r.a));return Math.max(s*s*mx/(sum*sum),sum*sum/(s*s*mn))};
  while(rest.length){const s=Math.min(w,h);let row=[rest[0]];let i=1;while(i<rest.length&&worst(row.concat(rest[i]),s)<=worst(row,s)){row.push(rest[i]);i++}
    const sum=row.reduce((p,r)=>p+r.a,0);if(w>=h){const cw=sum/h;let yy=y;row.forEach(r=>{const rh=r.a/cw;out.push({...r,x,y:yy,w:cw,h:rh});yy+=rh});x+=cw;w-=cw}
    else{const rh=sum/w;let xx=x;row.forEach(r=>{const cw=r.a/rh;out.push({...r,x:xx,y,w:cw,h:rh});xx+=cw});y+=rh;h-=rh}rest=rest.slice(i)}
  return out;
}
function heatColor(p){if(!isNum(p))return '#2a3140';const a=Math.min(1,Math.abs(p)/(S.hmP==='m1'?12:S.hmP==='d5'?6:3));return p>=0?`rgba(${Math.round(20+a*27)},${Math.round(70+a*157)},${Math.round(60+a*94)},1)`:`rgba(${Math.round(80+a*175)},${Math.round(40+a*53)},${Math.round(55+a*67)},1)`}
function instChange(t,per){const s=closeSeries(t);if(s.length<25)return null;const n={d1:1,d5:5,m1:21}[per];const a=s[s.length-1][1],b=s[s.length-1-n][1];return (a/b-1)*100}
function heatData(){
  const per=S.hmP||'d1';const U=(S.univ&&S.univ.data)||{};const P=positions();const real=P.total>0;const {w}=weights();
  const val=t=>real?((P.list.find(m=>m.t===t)||{}).value||0):10000*(w[t]||0)/100;
  return tickers().map(t=>{const v=val(t);if(!(v>0))return null;const i=inst(t);const ch=instChange(t,per);
    const kids=(i.holdings||[]).map(h=>{const u=U[h.t==='NOVO.B'?'NVO':h.t];return {t:h.t,n:h.n,v:v*h.w/100,p:u?u[per]:null,has:!!u}}).filter(k=>k.v>0);
    const known=kids.reduce((s,k)=>s+k.v,0);if(kids.length&&known<v)kids.push({t:'Diğer',n:'Diğer varlıklar',v:v-known,p:null,other:true});
    return {t,n:i.name,v,p:ch,kids:kids.length?kids:null}}).filter(Boolean);
}
function viewHeat(){
  if(!S.hmP)S.hmP='d1';const D=heatData();const U=S.univ;const pl={d1:'Gün',d5:'Hafta',m1:'Ay'};
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Isı haritası</h2><p>Kutu büyüklüğü portföydeki ağırlık, renk ${pl[S.hmP].toLowerCase()}lük değişim · fonların içi en büyük 10 varlıkla bölünmüş${U?` · şirket verisi ${esc(trDate(U.updatedAt,{day:'numeric',month:'short'}))}`:''}</p></div>
    <div class="filters" id="hmP" style="margin:0">${Object.entries(pl).map(([k,l])=>`<button data-p="${k}" class="${S.hmP===k?'on':''}">${l}</button>`).join('')}</div></div>
  <section class="card"><div id="hm" class="hm"></div><div class="hm-leg"><span>−</span><i style="background:${heatColor(-9)}"></i><i style="background:${heatColor(-3)}"></i><i style="background:${heatColor(-.6)}"></i><i style="background:#2a3140"></i><i style="background:${heatColor(.6)}"></i><i style="background:${heatColor(3)}"></i><i style="background:${heatColor(9)}"></i><span>+</span><span class="muted" style="margin-left:10px">Gri: veri yok · kutuya dokun: ayrıntı</span></div></section>
  ${!U?`<div class="note" style="margin-top:12px">Fonların içindeki şirketlerin değişimleri piyasa verisi görevi ilk çalıştığında dolacak; şimdilik fonların kendi değişimi gösteriliyor.</div>`:''}
  <section class="card sec"><h3>En çok sürükleyenler <span class="r muted">portföye $ katkı (${pl[S.hmP].toLowerCase()})</span></h3><div class="pairs" id="hmTop"></div></section></div>`;
}
function afterHeat(){
  $$('#hmP button').forEach(b=>b.onclick=()=>{S.hmP=b.dataset.p;render(false)});
  const el=$('#hm');if(!el)return;const W=el.clientWidth||900,H=Math.max(360,Math.min(640,W*.58));el.style.height=H+'px';
  const D=heatData();const R=squarify(D.map(d=>({...d,v:d.v})),0,0,W,H);let html='';const contrib=[];
  R.forEach(r=>{const col=heatColor(r.p);html+=`<div class="hm-f" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px"><span class="hm-fl">${esc(dispT(r.t))} ${pct(r.p,1)}</span>`;
    if(r.kids&&r.w>60&&r.h>50){const K=squarify(r.kids,2,18,r.w-4,r.h-20);K.forEach(k=>{const p=k.has?k.p:null;const big=k.w>46&&k.h>28;
        html+=`<div class="hm-c" style="left:${k.x}px;top:${k.y}px;width:${k.w}px;height:${k.h}px;background:${k.other?'#1d2330':heatColor(p)}" title="${esc(k.n||k.t)} ${p!=null?pct(p,2):''}">${big?`<b>${esc(k.t)}</b><span>${p!=null?pct(p,1):''}</span>`:''}</div>`;
        if(isNum(p))contrib.push({t:k.t,via:r.t,usd:k.v*p/100,p})})}
    else{html+=`<div class="hm-c" style="left:2px;top:18px;width:${r.w-4}px;height:${r.h-20}px;background:${col}"></div>`;if(isNum(r.p))contrib.push({t:r.t,via:'doğrudan',usd:r.v*r.p/100,p:r.p})}
    html+='</div>'});
  el.innerHTML=html;
  const top=$('#hmTop');if(top){const c=contrib.sort((a,b)=>Math.abs(b.usd)-Math.abs(a.usd)).slice(0,10);top.innerHTML=c.map(x=>`<div class="pair"><span><b>${esc(x.t)}</b> <span class="muted">${x.via==='doğrudan'?'doğrudan':esc(x.via)+' içinden'}</span></span><span class="num ${cls(x.usd)}">${smoney(x.usd,0)} · ${pct(x.p,1)}</span></div>`).join('')||'<p class="muted">Veri yok</p>'}
}

/* ================= 3) geçmişi oynatma ================= */
function rpState(){return S.rp||(S.rp=null)}
function rpStart(t,startIdx){const a=candles(t);if(a.length<200)return toast('Yeterli geçmiş yok');const i0=startIdx!=null?startIdx:Math.floor(160+Math.random()*(a.length-260));
  S.rp={t,a,i0,i:i0,pos:null,trades:[],done:false,planPos:null,planTrades:[]}}
function rpPlanStep(R){ // teknik plana göre mekanik strateji: bölgede al, stop/TP1'de çık
  const i=R.i,c=R.a[i];if(R.planPos){const P=R.planPos;if(c.l<=P.stop){R.planTrades.push({buy:P.px,sell:P.stop,bd:P.d,sd:c.d});R.planPos=null}else if(c.h>=P.tp){R.planTrades.push({buy:P.px,sell:P.tp,bd:P.d,sd:c.d});R.planPos=null}return}
  let P=null;try{P=tradePlan(R.t,R.a.slice(0,i+1))}catch(e){}if(P&&P.state==='Fiyat alım bölgesinde')R.planPos={px:c.c,stop:P.stop,tp:P.tp1.p,d:c.d};R.plan=P;
}
function rpAdvance(n){const R=S.rp;if(!R||R.done)return;for(let k=0;k<n&&R.i<R.a.length-1;k++){R.i++;rpPlanStep(R)}if(R.i>=R.a.length-1)rpFinish()}
function rpFinish(){const R=S.rp;if(!R)return;const c=R.a[R.i];if(R.pos){R.trades.push({buy:R.pos.px,sell:c.c,bd:R.pos.d,sd:c.d,open:true});R.pos=null}if(R.planPos){R.planTrades.push({buy:R.planPos.px,sell:c.c,bd:R.planPos.d,sd:c.d,open:true});R.planPos=null}R.done=true}
function rpStats(L){const g=L.reduce((s,x)=>s*(x.sell/x.buy),1);return {n:L.length,ret:(g-1)*100,win:L.filter(x=>x.sell>x.buy).length}}
function viewReplay(){
  const L=techTickers();const R=S.rp;
  if(!R)return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Geçmişi oynat</h2><p>Grafik geçmişte rastgele (ya da seçtiğin) bir günde durur, sonrası gizlenir. Mum mum ilerle, al-sat kararlarını ver; sonunda teknik planın mekanik sonucu ve "al-tut" ile kıyaslanır.</p></div></div>
    <section class="card"><div class="rform" style="max-width:640px"><label>Sembol<select id="rpT">${L.map(t=>`<option>${esc(t)}</option>`).join('')}</select></label><label>Başlangıç<select id="rpW"><option value="">Rastgele (sembol ve tarih gizli)</option><option value="d">Tarih seçeceğim</option></select></label>
    <label id="rpDL" style="display:none">Tarih<input type="date" id="rpD"></label></div><button class="btn" id="rpGo" style="margin-top:12px">Başlat</button>
    <p class="muted" style="font-size:12.5px;margin:12px 0 0">Kısayollar: → 1 mum, Shift+→ 5 mum, A al, S sat. Tek pozisyon, tamamıyla girilip çıkılır; komisyon yok.</p></section></div>`;
  const c=R.a[R.i];const pnl=R.pos?(c.c/R.pos.px-1)*100:null;const me=rpStats(R.trades),pl=rpStats(R.planTrades);const bh=(R.a[R.i].c/R.a[R.i0].c-1)*100;const hide=R.blind&&!R.done;
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Geçmişi oynat · ${hide?'<span class="muted">gizli sembol</span>':esc(dispT(R.t))}</h2><p>${hide?'Tarih gizli':esc(trDate(c.d+'T12:00:00Z'))} · ${R.i-R.i0}. mum${R.done?' · bitti':''}</p></div>
    <div class="rp-bt"><button class="btn ghost sm" data-rp="1">▶ 1 mum</button><button class="btn ghost sm" data-rp="5">▶▶ 5</button><button class="btn ghost sm" data-rp="20">▶▶▶ 20</button>
    ${R.done?'':R.pos?`<button class="btn sm" id="rpSell" style="background:var(--down)">Sat (${pct(pnl,1)})</button>`:`<button class="btn sm" id="rpBuy">Al</button>`}<button class="btn ghost sm" id="rpEnd">${R.done?'Yeni oyun':'Bitir'}</button></div></div>
  <section class="card"><div id="rpC" style="height:${innerWidth<760?340:460}px"></div><div class="leg" style="margin-top:6px"><span><i style="background:rgba(92,211,255,.5)"></i>Plan alım bölgesi (o güne kadarki veriyle)</span><span><i style="background:#ff5d7a"></i>Stop</span><span><i style="background:#2fe39a"></i>TP1</span></div></section>
  <div class="grid g4 sec">
    <div class="card kpi"><div class="l">Senin kararların</div><div class="v ${cls(me.ret)}">${pct(me.ret,1)}</div><div class="s">${me.n} işlem · ${me.win} kazançlı${R.pos?' · açık pozisyon '+pct(pnl,1):''}</div></div>
    <div class="card kpi"><div class="l">Teknik plan (mekanik)</div><div class="v ${cls(pl.ret)}">${pct(pl.ret,1)}</div><div class="s">${pl.n} işlem · ${pl.win} kazançlı</div></div>
    <div class="card kpi"><div class="l">Al-tut (başlangıçtan)</div><div class="v ${cls(bh)}">${pct(bh,1)}</div><div class="s">${R.i-R.i0} mum</div></div>
    <div class="card kpi"><div class="l">Plan durumu</div><div class="v" style="font-size:16px">${esc((R.plan&&R.plan.state)||'—')}</div><div class="s">${R.plan?`bölge ${nf(R.plan.zone.lo,2)}–${nf(R.plan.zone.hi,2)}`:''}</div></div>
  </div>
  ${R.done?`<section class="card sec"><h3>Sonuç · ${esc(dispT(R.t))} ${esc(R.a[R.i0].d)} → ${esc(c.d)}</h3><div class="pairs">${R.trades.map(x=>`<div class="pair"><span>Sen: ${esc(x.bd)} → ${esc(x.sd)}${x.open?' (açık kapatıldı)':''}</span><span class="num ${cls(x.sell-x.buy)}">${pct((x.sell/x.buy-1)*100,1)}</span></div>`).join('')}${R.planTrades.map(x=>`<div class="pair"><span class="muted">Plan: ${esc(x.bd)} → ${esc(x.sd)}</span><span class="num ${cls(x.sell-x.buy)}">${pct((x.sell/x.buy-1)*100,1)}</span></div>`).join('')}</div>
    <p style="margin:12px 0 0">${me.ret>pl.ret&&me.ret>bh?'Hem planı hem al-tut\'u geçtin.':me.ret>=bh?'Al-tut\'u geçtin'+(pl.ret>me.ret?', ama mekanik plan daha iyi yaptı.':'.'):pl.ret>bh?'Bu dönemde plan disiplini senden ve al-tut\'tan iyi sonuç verdi.':'Bu dönemde al-tut en iyisiydi; işlem yapmak getiri düşürdü.'}</p></section>`:''}</div>`;
}
function rpChart(el){const R=S.rp;const a=R.a.slice(Math.max(0,R.i-119),R.i+1);const W=el.clientWidth||900,H=el.clientHeight||440,pr=58,pl=6;const P=R.plan;
  let mn=Math.min(...a.map(x=>x.l)),mx=Math.max(...a.map(x=>x.h));if(P){[P.zone.lo,P.zone.hi,P.stop,P.tp1.p].forEach(v=>{if(v>mn*.8&&v<mx*1.2){mn=Math.min(mn,v);mx=Math.max(mx,v)}})}
  const pad=(mx-mn)*.05;mn-=pad;mx+=pad;const Y=v=>8+(1-(v-mn)/(mx-mn))*(H-30);const cw=(W-pl-pr)/(a.length+6);const X=i=>pl+(i+.5)*cw;const bw=Math.max(1,cw*.66);let s='';
  niceTicks(mn,mx,5).forEach(v=>{s+=`<line class="gridl" x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${W-pr+6}" y="${Y(v)+4}">${nf(v,v>=1000?0:2)}</text>`});
  if(P){s+=`<rect x="${pl}" y="${Y(P.zone.hi)}" width="${W-pl-pr}" height="${Math.max(2,Y(P.zone.lo)-Y(P.zone.hi))}" fill="rgba(92,211,255,.12)" stroke="rgba(92,211,255,.45)" stroke-dasharray="3 3"/>`;[[P.stop,'#ff5d7a'],[P.tp1.p,'#2fe39a']].forEach(([v,c])=>{if(v>mn&&v<mx)s+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="${c}" stroke-dasharray="6 3"/>`})}
  a.forEach((c,i)=>{const up=c.c>=c.o;const col=up?'var(--up)':'var(--down)';s+=`<line x1="${X(i)}" x2="${X(i)}" y1="${Y(c.h)}" y2="${Y(c.l)}" stroke="${col}"/><rect x="${X(i)-bw/2}" y="${Y(Math.max(c.o,c.c))}" width="${bw}" height="${Math.max(1,Math.abs(Y(c.o)-Y(c.c)))}" fill="${col}"/>`});
  const off=R.i-(a.length-1);const mk=(d,px,up)=>{const k=a.findIndex(x=>x.d===d);if(k<0)return;const x=X(k),y=up?Y(a[k].l)+12:Y(a[k].h)-12;s+=`<path d="${up?`M${x},${y-7} l-6,10 h12 z`:`M${x},${y+7} l-6,-10 h12 z`}" fill="${up?'#2fe39a':'#ff5d7a'}"/>`};
  R.trades.forEach(x=>{mk(x.bd,x.buy,true);if(!x.open)mk(x.sd,x.sell,false)});if(R.pos)mk(R.pos.d,R.pos.px,true);
  if(R.pos)s+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(R.pos.px)}" y2="${Y(R.pos.px)}" stroke="#ffc35c" stroke-dasharray="2 3"/>`;
  el.innerHTML=`<svg width="${W}" height="${H}" class="tchart">${s}</svg>`}
function afterReplay(){
  const go=$('#rpGo');if(go){const w=$('#rpW');w.onchange=()=>{$('#rpDL').style.display=w.value==='d'?'':'none';$('#rpT').disabled=w.value===''&&false};
    go.onclick=()=>{let t=$('#rpT').value;let si=null;const blind=w.value==='';if(blind){const L=techTickers().filter(x=>candles(x).length>=260);t=L[Math.floor(Math.random()*L.length)]}else{const d=$('#rpD').value;if(d){const a=candles(t);si=a.findIndex(x=>x.d>=d);if(si<150)si=150;if(si>a.length-20)si=a.length-20}}
      rpStart(t,si);if(S.rp){S.rp.blind=blind;rpPlanStep(S.rp)}render(false)};return}
  const el=$('#rpC');if(el&&S.rp)rpChart(el);
  $$('[data-rp]').forEach(b=>b.onclick=()=>{rpAdvance(+b.dataset.rp);render(false)});
  const bu=$('#rpBuy');if(bu)bu.onclick=()=>{const R=S.rp;const c=R.a[R.i];R.pos={px:c.c,d:c.d};render(false)};
  const se=$('#rpSell');if(se)se.onclick=()=>{const R=S.rp;const c=R.a[R.i];R.trades.push({buy:R.pos.px,sell:c.c,bd:R.pos.d,sd:c.d});R.pos=null;render(false)};
  const en=$('#rpEnd');if(en)en.onclick=()=>{if(S.rp&&!S.rp.done){rpFinish();render(false)}else{S.rp=null;render(false)}};
  document.onkeydown=e=>{if(location.hash.indexOf('teknik/oynat')<0||!S.rp||S.rp.done||/input|select|textarea/i.test(e.target.tagName))return;
    if(e.key==='ArrowRight'){rpAdvance(e.shiftKey?5:1);render(false);e.preventDefault()}else if(e.key==='a'||e.key==='A'){if(!S.rp.pos)$('#rpBuy')&&$('#rpBuy').click()}else if(e.key==='s'||e.key==='S'){if(S.rp.pos)$('#rpSell')&&$('#rpSell').click()}};
}

/* ================= 4) geniş fikir tarayıcı ================= */
const SCR_PRE=[
  {n:'Güçlü trend, geri çekilmiş',f:{a50:false,a200:true,ddMin:5,ddMax:20,rs3:0}},
  {n:'Zirveye yakın liderler',f:{a50:true,a200:true,ddMax:5,rs3:5}},
  {n:'Ucuz ve toparlanan',f:{peMax:25,a50:true,m1:0}},
  {n:'Düşük beta, pozitif trend',f:{betaMax:1,a200:true}},
  {n:'Aşırı satılmış büyükler',f:{mcMin:100,m1Max:-8,a200:true}},
  {n:'Sıfırla',f:{}}];
function scrRows(){const U=(S.univ&&S.univ.data)||{};const sp3=(()=>{const s=S.hist.SPY||[];if(s.length<64)return 0;return (s[s.length-1][1]/s[s.length-64][1]-1)*100})();
  const V=(S.valuation&&S.valuation.data)||{};
  return Object.entries(U).map(([t,u])=>({t,...u,dd:u.hi?(1-u.px/u.hi)*100:null,a50:u.s50?u.px>u.s50:null,a200:u.s200?u.px>u.s200:null,rs3:isNum(u.m3)?u.m3-sp3:null,fpe:V[t]&&V[t].fpe,inPf:!!S.data.instruments[t]}))}
function scrApply(R,f){return R.filter(r=>{
  if(f.idx&&!(r.idx||[]).includes(f.idx))return false;if(f.sec&&r.sec!==f.sec)return false;
  if(f.a50===true&&r.a50!==true)return false;if(f.a200===true&&r.a200!==true)return false;
  if(f.ddMin!=null&&!(r.dd>=f.ddMin))return false;if(f.ddMax!=null&&!(r.dd<=f.ddMax))return false;
  if(f.rs3!=null&&!(r.rs3>=f.rs3))return false;if(f.m1!=null&&!(r.m1>=f.m1))return false;if(f.m1Max!=null&&!(r.m1<=f.m1Max))return false;
  if(f.peMax!=null){const pe=r.fpe||r.pe;if(!(pe>0&&pe<=f.peMax))return false}if(f.betaMax!=null&&!(r.beta<=f.betaMax))return false;if(f.mcMin!=null&&!(r.mc>=f.mcMin*1e9))return false;return true})}
function viewScreen(){
  const U=S.univ;if(!U)return `<div class="fade"><div class="empty"><b>Fikir tarayıcı verisi henüz yok</b>Haftalık tarayıcı görevi Nasdaq-100 ve S&P 500'ün büyüklerini tarayıp dolduracak.</div></div>`;
  const f=S.scrF||(S.scrF={});const all=scrRows();const secs=Array.from(new Set(all.map(r=>r.sec).filter(Boolean))).sort();let L=scrApply(all,f);
  const sk=S.scrS||'rs3';L.sort((a,b)=>(b[sk]??-1e9)-(a[sk]??-1e9));if(S.scrAsc)L.reverse();
  const inp=(k,l,ph)=>`<label>${l}<input type="number" step="any" data-sf="${k}" value="${f[k]??''}" placeholder="${ph||''}"></label>`;
  const chk=(k,l)=>`<label class="muted" style="display:inline-flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" data-sc="${k}" ${f[k]===true?'checked':''} style="width:auto">${l}</label>`;
  const th=(k,l)=>`<th class="r" data-ss="${k}" style="cursor:pointer">${l}${sk===k?(S.scrAsc?' ▲':' ▼'):''}</th>`;const wl=new Set(((S.watch&&S.watch.tickers)||[]).map(w=>w.t));
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Fikir tarayıcı</h2><p>${Object.keys(U.data).length} şirket (Nasdaq-100, S&P 500'ün en büyükleri ve fonlarının holdingleri) · veri ${esc(trDate(U.updatedAt,{day:'numeric',month:'short'}))} · RS = 3 aylık getirinin S&P 500'den farkı</p></div></div>
  <section class="card"><div class="filters" id="scrP">${SCR_PRE.map((p,i)=>`<button data-i="${i}">${esc(p.n)}</button>`).join('')}</div>
    <div class="scr-f"><label>Endeks<select data-sf="idx"><option value="">Hepsi</option><option ${f.idx==='NDX'?'selected':''}>NDX</option><option ${f.idx==='SPX'?'selected':''}>SPX</option><option value="FON" ${f.idx==='FON'?'selected':''}>Fonlarımdaki</option></select></label>
    <label>Sektör<select data-sf="sec"><option value="">Hepsi</option>${secs.map(s=>`<option ${f.sec===s?'selected':''}>${esc(s)}</option>`).join('')}</select></label>
    ${inp('rs3','RS en az (puan)','0')}${inp('ddMin','Zirveden en az %','')}${inp('ddMax','Zirveden en çok %','')}${inp('m1','1 ay en az %','')}${inp('peMax','F/K en çok','30')}${inp('betaMax','Beta en çok','')}${inp('mcMin','Piyasa değ. en az (mlr $)','')}
    <div style="display:flex;gap:14px;align-items:end;flex-wrap:wrap">${chk('a50','50g ort. üstünde')}${chk('a200','200g ort. üstünde')}</div></div></section>
  <section class="card sec"><h3>${L.length} sonuç</h3><div class="tscroll"><table class="tbl"><thead><tr><th>Şirket</th><th>Sektör</th>${th('px','Fiyat')}${th('m1','1 ay')}${th('m3','3 ay')}${th('m6','6 ay')}${th('rs3','RS')}${th('dd','Zirveden')}${th('pe','F/K')}${th('beta','Beta')}${th('mc','Değer')}<th></th></tr></thead><tbody>
  ${L.slice(0,150).map(r=>`<tr><td><div class="sym">${logo(r.t)}<div><b>${esc(r.t)}</b>${r.inPf?' <span class="chip">portföy</span>':''}<div class="muted" style="font-size:11.5px">${esc((r.n||'').slice(0,28))}</div></div></div></td><td class="muted" style="font-size:12px">${esc(r.ind||r.sec||'')}</td>
    <td class="r num">${nf(r.px,2)}</td><td class="r num ${cls(r.m1)}">${pct(r.m1,1)}</td><td class="r num ${cls(r.m3)}">${pct(r.m3,1)}</td><td class="r num ${cls(r.m6)}">${pct(r.m6,1)}</td><td class="r num ${cls(r.rs3)}"><b>${r.rs3!=null?(r.rs3>0?'+':'')+nf(r.rs3,1):'—'}</b></td>
    <td class="r num">${r.dd!=null?'−%'+nf(r.dd,1):'—'}</td><td class="r num">${r.fpe?nf(r.fpe,1)+'<span class="muted" style="font-size:10px"> ileri</span>':r.pe?nf(r.pe,1):'—'}</td><td class="r num">${nf(r.beta,2)}</td><td class="r num">${r.mc?'$'+nf(r.mc/1e9,0)+' mlr':'—'}</td>
    <td>${r.inPf||wl.has(r.t)?'<span class="muted" style="font-size:12px">takipte</span>':`<button class="lnk2" data-wadd="${esc(r.t)}">+ izle</button>`}</td></tr>`).join('')}
  </tbody></table></div><p class="muted" style="font-size:12px;margin:10px 0 0">Kaynak: Bigdata.com şirket özetleri (haftalık). F/K: izleme verisinde ileri F/K varsa o, yoksa son 12 ay. "+ izle" sembolü izleme listesine ekler; sabah görevi analizini hazırlar. Yatırım tavsiyesi değildir.</p></section></div>`;
}
function afterScreen(){const f=S.scrF||(S.scrF={});
  $$('#scrP button').forEach(b=>b.onclick=()=>{S.scrF={...SCR_PRE[+b.dataset.i].f};render(false)});
  $$('[data-sf]').forEach(i=>i.onchange=()=>{const k=i.dataset.sf;const v=i.value;f[k]=v===''?null:(i.tagName==='SELECT'?v:+v);if(f[k]==null)delete f[k];render(false)});
  $$('[data-sc]').forEach(i=>i.onchange=()=>{if(i.checked)f[i.dataset.sc]=true;else delete f[i.dataset.sc];render(false)});
  $$('[data-ss]').forEach(h=>h.onclick=()=>{if(S.scrS===h.dataset.ss)S.scrAsc=!S.scrAsc;else{S.scrS=h.dataset.ss;S.scrAsc=false}render(false)});
  $$('[data-wadd]').forEach(b=>b.onclick=async()=>{const t=b.dataset.wadd;const cur=(S.watch&&S.watch.tickers)||[];const list=cur.concat({t,note:'Fikir tarayıcıdan',added:new Date().toISOString().slice(0,10)});
    S.watch={...(S.watch||{}),tickers:list};S.settings.watchLocal=list;try{await ghWatchSave(list);toast(t+' izleme listesine eklendi')}catch(e){toast('Yerelde eklendi: '+e.message)}await saveSettings();render(false)});
}

/* ================= 5) piyasa şeridi ve seans saatleri ================= */
function tzParts(tz){const f=new Intl.DateTimeFormat('en-US',{timeZone:tz,weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());const g=k=>(f.find(p=>p.type===k)||{}).value;return {wd:g('weekday'),m:(+g('hour')%24)*60+(+g('minute'))}}
const US_HOL=['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25','2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24'];
const TR_HOL=['2026-01-01','2026-03-20','2026-04-23','2026-05-01','2026-05-19','2026-05-26','2026-05-27','2026-05-28','2026-05-29','2026-07-15','2026-08-30','2026-10-29','2027-01-01','2027-03-09','2027-03-10','2027-04-23','2027-05-01','2027-05-19','2027-05-17','2027-05-18','2027-05-19','2027-07-15','2027-08-30','2027-10-29'];
function sessState(tz,open,close,hol){const p=tzParts(tz);const today=new Intl.DateTimeFormat('en-CA',{timeZone:tz}).format(new Date());const wkend=p.wd==='Sat'||p.wd==='Sun';const isHol=hol.includes(today);
  if(!wkend&&!isHol&&p.m>=open&&p.m<close)return {open:true,txt:`kapanışa ${fmtMin(close-p.m)}`};
  let mins;if(!wkend&&!isHol&&p.m<open)mins=open-p.m;else{let add=1;const d=new Date();for(;add<8;add++){const x=new Date(d.getTime()+add*864e5);const ds=new Intl.DateTimeFormat('en-CA',{timeZone:tz}).format(x);const wd=new Intl.DateTimeFormat('en-US',{timeZone:tz,weekday:'short'}).format(x);if(wd!=='Sat'&&wd!=='Sun'&&!hol.includes(ds))break}mins=(add-1)*1440+(1440-p.m)+open}
  return {open:false,txt:`açılışa ${fmtMin(mins)}`}}
function fmtMin(m){const d=Math.floor(m/1440),h=Math.floor(m%1440/60),mm=m%60;return d?`${d}g ${h}s`:h?`${h}s ${mm}dk`:`${mm}dk`}
function stripItems(){const Q=(S.mstrip&&S.mstrip.quotes)||{};const out=[];const lastChg=a=>a.length>1?{px:a[a.length-1][1],pct:(a[a.length-1][1]/a[a.length-2][1]-1)*100}:null;
  const pick=(k,l,fb,fmt)=>{const q=Q[k];if(q&&isNum(q.px))out.push({l,px:q.px,pct:q.pct,fmt});else if(fb){const x=fb();if(x)out.push({l,...x,fmt})}};
  pick('BIST','BIST 100',null,0);pick('SPY','S&P 500 (SPY)',()=>lastChg(S.hist.SPY||[]),2);pick('QQQ','Nasdaq 100 (QQQ)',null,2);pick('UUP','Dolar end. (UUP)',()=>lastChg(mkS('UUP')),2);
  pick('USDTRY','USD/TRY',()=>lastChg(S.hist.USDTRY||[]),4);pick('XAU','Ons altın',()=>lastChg(S.hist.XAUUSD||[]),0);pick('WTI','WTI petrol',null,2);pick('XCU','Bakır',null,3);pick('BTC','Bitcoin',null,0);
  const t=mkS('US10Y');if(t.length>1)out.push({l:'ABD 10Y',px:t[t.length-1][1],bp:(t[t.length-1][1]-t[t.length-2][1])*100,fmt:2,rate:true});
  const v=mkS('VIX');if(v.length>1)out.push({l:'VIX',px:v[v.length-1][1],pct:(v[v.length-1][1]/v[v.length-2][1]-1)*100,fmt:2,inv:true});return out}
function viewStrip(){const I=stripItems();const us=sessState('America/New_York',570,960,US_HOL),tr=sessState('Europe/Istanbul',600,1080,TR_HOL);
  const SEC=(S.mstrip&&S.mstrip.sectors)||{};const SN={XLK:'Teknoloji',XLF:'Finans',XLE:'Enerji',XLV:'Sağlık',XLY:'Tüketici (döngüsel)',XLP:'Temel tüketim',XLI:'Sanayi',XLB:'Malzeme',XLU:'Kamu hizmetleri',XLRE:'Gayrimenkul',XLC:'İletişim',SMH:'Yarı iletken'};
  const secs=Object.entries(SEC).filter(([k,v])=>isNum(v.pct)).sort((a,b)=>b[1].pct-a[1].pct);
  return `<section class="mstrip card"><div class="ms-s"><span class="sess ${us.open?'on':''}"><i></i>ABD ${us.open?'açık':'kapalı'} <span class="muted">· ${us.txt}</span></span><span class="sess ${tr.open?'on':''}"><i></i>BIST ${tr.open?'açık':'kapalı'} <span class="muted">· ${tr.txt}</span></span></div>
  <div class="ms-i">${I.map(x=>`<div class="ms-x"><span class="muted">${esc(x.l)}</span><b class="num">${x.rate?'%':''}${nf(x.px,x.fmt)}</b>${x.rate?`<span class="num ${x.bp>0?'down':x.bp<0?'up':''}">${x.bp>0?'+':''}${nf(x.bp,0)} bp</span>`:`<span class="num ${x.inv?cls(-x.pct):cls(x.pct)}">${pct(x.pct,2)}</span>`}</div>`).join('')}</div>
  ${secs.length?`<div class="ms-sec"><span class="muted" style="font-size:12px">Sektörler (dünkü seans):</span>${secs.map(([k,v])=>`<span class="chip ${cls(v.pct)}" title="${k}">${esc(SN[k]||k)} ${pct(v.pct,1)}</span>`).join('')}</div>`:''}</section>`}

/* ================= 6) ekonomik takvim (TR + ABD) ================= */
function viewEcon(){const E=S.econ&&S.econ.events;if(!E||!E.length)return '';const now=Date.now();const L=E.filter(e=>{const d=new Date(e.date).getTime();return d>now-10*864e5&&d<now+21*864e5});
  const flag={US:'🇺🇸',TR:'🇹🇷'};const star=n=>'★'.repeat(n||1)+'<span class="muted">'+'★'.repeat(3-(n||1))+'</span>';const f=(v,u)=>v==null?'—':nf(v,Math.abs(v)>=100?0:Math.abs(v)>=10?1:2)+(u==='%'?'%':'');
  let lastDay='';return `<section class="card ecal"><h3>Ekonomik takvim <span class="r muted">önceki · beklenti · açıklanan</span></h3><div class="tscroll"><table class="tbl"><tbody>${L.map(e=>{const d=new Date(e.date);const day=d.toLocaleDateString('tr-TR',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Istanbul'});const hd=day!==lastDay?`<tr class="ec-d"><td colspan="6">${esc(day)}</td></tr>`:'';lastDay=day;
    const past=d.getTime()<now;const sc=e.act!=null&&e.fc!=null?(e.better===true?'up':e.better===false?'down':e.act>e.fc?'up':e.act<e.fc?'down':''):'';
    return hd+`<tr class="${past?'ec-p':''}"><td class="num muted" style="width:60px">${d.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'})}</td><td style="width:34px">${flag[e.c]||esc(e.c)}</td><td><b>${esc(e.tr||e.name)}</b><div class="muted" style="font-size:11.5px">${star(e.imp)}${(()=>{const x=typeof macroTypical==='function'?macroTypical(e.name,e.c):null;return x?` · portföy tipik ±%${nf(x,1)}`:''})()}</div></td>
      <td class="r num muted">${f(e.prev,e.unit)}</td><td class="r num">${f(e.fc,e.unit)}</td><td class="r num"><b class="${sc}">${f(e.act,e.unit)}</b></td></tr>`}).join('')}</tbody></table></div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">Açıklanan değer beklentiden iyiyse yeşil, kötüyse kırmızı. Kaynak: Bigdata.com ekonomik takvim · ${esc(trDate(S.econ.updatedAt,{day:'numeric',month:'short'}))}</p></section>`}

/* ================= 7) çok zaman dilimli teknik özet ================= */
function resample(a,mode){const out=[];let cur=null;const key=d=>mode==='M'?d.slice(0,7):(()=>{const x=new Date(d+'T12:00:00Z');const k=new Date(x);k.setUTCDate(x.getUTCDate()-((x.getUTCDay()+6)%7));return k.toISOString().slice(0,10)})();
  a.forEach(c=>{const k=key(c.d);if(!cur||cur.k!==k){cur={k,d:c.d,o:c.o,h:c.h,l:c.l,c:c.c,v:c.v||0};out.push(cur)}else{cur.d=c.d;cur.h=Math.max(cur.h,c.h);cur.l=Math.min(cur.l,c.l);cur.c=c.c;cur.v+=c.v||0}});return out}
function emaS(v,n){const o=Array(v.length).fill(null);const k=2/(n+1);let e=null;for(let i=0;i<v.length;i++){if(i===n-1){let s=0;for(let j=0;j<n;j++)s+=v[j];e=s/n;o[i]=e}else if(i>=n){e=v[i]*k+e*(1-k);o[i]=e}}return o}
function tfVotes(a){if(a.length<15)return null;const cl=a.map(x=>x.c),i=cl.length-1,px=cl[i];const ma=[],os=[];
  [5,10,20,50,100,200].forEach(n=>{if(cl.length<n+1)return;const s=smaS(cl,n)[i],e=emaS(cl,n)[i];ma.push({k:`SMA ${n}`,v:px>s?1:px<s?-1:0,x:s});ma.push({k:`EMA ${n}`,v:px>e?1:px<e?-1:0,x:e})});
  const r=rsiS(cl)[i];if(r!=null)os.push({k:'RSI (14)',x:r,v:r<30?1:r>70?-1:0});
  const lo14=Math.min(...a.slice(-14).map(x=>x.l)),hi14=Math.max(...a.slice(-14).map(x=>x.h));const st=hi14>lo14?(px-lo14)/(hi14-lo14)*100:50;os.push({k:'Stokastik %K',x:st,v:st<20?1:st>80?-1:0});
  const wr=st-100;os.push({k:'Williams %R',x:wr,v:wr<-80?1:wr>-20?-1:0});
  if(cl.length>35){const m12=emaS(cl,12),m26=emaS(cl,26);const mac=cl.map((_,j)=>m12[j]!=null&&m26[j]!=null?m12[j]-m26[j]:null);const valid=mac.filter(x=>x!=null);const sig=emaS(valid,9);const ml=valid[valid.length-1],sl=sig[sig.length-1];os.push({k:'MACD (12,26)',x:ml,v:ml>sl?1:ml<sl?-1:0})}
  if(cl.length>21){const tp=a.map(x=>(x.h+x.l+x.c)/3);const sm=smaS(tp,20)[i];const md=tp.slice(-20).reduce((s,v)=>s+Math.abs(v-sm),0)/20;const cci=md?(tp[i]-sm)/(.015*md):0;os.push({k:'CCI (20)',x:cci,v:cci<-100?1:cci>100?-1:0})}
  if(cl.length>13){const roc=(px/cl[i-12]-1)*100;os.push({k:'ROC (12)',x:roc,v:roc>0?1:roc<0?-1:0})}
  if(typeof adxS==='function'){try{const A=adxS(a);const ad=A.adx[i],p=A.pdi[i],m=A.mdi[i];if(ad!=null)os.push({k:'ADX (14)',x:ad,v:ad<20?0:p>m?1:-1})}catch(e){}}
  const sc=L=>{const b=L.filter(x=>x.v>0).length,s=L.filter(x=>x.v<0).length;return {b,s,n:L.length-b-s,score:L.length?(b-s)/L.length:0}};const M=sc(ma),O=sc(os);const T=(M.score+O.score)/2;
  return {ma,os,M,O,score:T,label:gaugeLabel(T)}}
function gaugeLabel(v){return v>=.5?'Güçlü al':v>=.1?'Al':v<=-.5?'Güçlü sat':v<=-.1?'Sat':'Nötr'}
function gaugeSVG(v,size=150){const a=Math.PI*(1-(v+1)/2);const cx=size/2,cy=size*.58,r=size*.44;const arc=(f,t,c)=>{const p=x=>[cx+r*Math.cos(Math.PI*(1-x)),cy-r*Math.sin(Math.PI*(1-x))];const [x1,y1]=p(f),[x2,y2]=p(t);return `<path d="M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}" stroke="${c}" stroke-width="${size*.07}" fill="none"/>`};
  return `<svg width="${size}" height="${size*.66}" viewBox="0 0 ${size} ${size*.66}">${arc(0,.25,'#ff5d7a')}${arc(.25,.45,'#ff9aa9')}${arc(.45,.55,'#6b7485')}${arc(.55,.75,'#8fe8c0')}${arc(.75,1,'#2fe39a')}<line x1="${cx}" y1="${cy}" x2="${cx+r*.82*Math.cos(a)}" y2="${cy-r*.82*Math.sin(a)}" stroke="var(--text)" stroke-width="2.5" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="4" fill="var(--text)"/></svg>`}
function techSummary(t){const a=candles(t);if(a.length<60)return null;return {D:tfVotes(a),W:tfVotes(resample(a,'W')),M:tfVotes(resample(a,'M'))}}
function gaugeCard(t){const T=techSummary(t);if(!T)return '';const sel=S.gTf||'D';const X=T[sel]||T.D;const nm={D:'Günlük',W:'Haftalık',M:'Aylık'};
  return `<section class="card gcard"><h3>Teknik özet <span class="r"><span class="filters" id="gTf" style="margin:0;display:inline-flex">${Object.keys(nm).map(k=>`<button data-k="${k}" class="${sel===k?'on':''}">${nm[k]}</button>`).join('')}</span></span></h3>
  <div class="g3s">${['D','W','M'].map(k=>T[k]?`<div class="gmini ${k===sel?'on':''}">${gaugeSVG(T[k].score,110)}<div class="muted" style="font-size:11.5px">${nm[k]}</div><b class="${T[k].score>=.1?'up':T[k].score<=-.1?'down':''}">${T[k].label}</b></div>`:'').join('')}</div>
  <div class="grid g2" style="gap:14px;margin-top:10px"><div><h4 class="gh">Hareketli ortalamalar <span class="muted">Al ${X.M.b} · Sat ${X.M.s}</span></h4>${X.ma.map(m=>`<div class="pt-r"><span>${m.k}</span><span class="num">${nf(m.x,2)}</span><span></span><b class="${m.v>0?'up':m.v<0?'down':'muted'}">${m.v>0?'Al':m.v<0?'Sat':'Nötr'}</b></div>`).join('')}</div>
   <div><h4 class="gh">Osilatörler <span class="muted">Al ${X.O.b} · Sat ${X.O.s} · Nötr ${X.O.n}</span></h4>${X.os.map(m=>`<div class="pt-r"><span>${m.k}</span><span class="num">${nf(m.x,2)}</span><span></span><b class="${m.v>0?'up':m.v<0?'down':'muted'}">${m.v>0?'Al':m.v<0?'Sat':'Nötr'}</b></div>`).join('')}</div></div>
  <p class="muted" style="font-size:12px;margin:10px 0 0">Investing.com'daki teknik özete benzer oylama: fiyat ortalamanın üstündeyse "Al"; osilatörler aşırı alım/satım eşiklerine göre. Aylık görünüm son ~3 yılın verisiyle sınırlı. Yatırım tavsiyesi değildir.</p></section>`}
function afterGauge(){$$('#gTf button').forEach(b=>b.onclick=()=>{S.gTf=b.dataset.k;render(false)})}

/* ================= 8) duyarlılık endeksi ================= */
function pctRank(arr,v){const x=arr.filter(isNum);if(x.length<20||!isNum(v))return null;return x.filter(y=>y<=v).length/x.length*100}
function sentData(){
  const C=S.labCache||(S.labCache={});if(C.sent)return C.sent;
  const spy=S.hist.SPY||[];const gold=S.hist.XAUUSD||[];const vix=mkS('VIX');const uup=mkS('UUP');if(spy.length<150)return null;
  const dates=spy.map(p=>p[0]);const sm=new Map(spy),gm=new Map(gold),vm=new Map(vix),um=new Map(uup);
  const at=(m,arr,d)=>m.has(d)?m.get(d):lastLE(arr,d);const raw=dates.map((d,i)=>{if(i<125)return null;const s=spy[i][1];
    const ma=spy.slice(i-124,i+1).reduce((a,p)=>a+p[1],0)/125;const s20=spy[i-20][1];const g=at(gm,gold,d),g20=at(gm,gold,dates[i-20]);const u=at(um,uup,d),u20=at(um,uup,dates[i-20]);const vx=at(vm,vix,d);
    const hi=Math.max(...spy.slice(Math.max(0,i-251),i+1).map(p=>p[1]));
    return {d,mom:(s/ma-1)*100,vix:vx,haven:g&&g20?((s/s20)-(g/g20))*100:null,usd:u&&u20?(u/u20-1)*100:null,hi:(s/hi-1)*100}}).filter(Boolean);
  const keys={mom:1,vix:-1,haven:1,usd:-1,hi:1};const out=raw.map((r,i)=>{const win=raw.slice(Math.max(0,i-251),i+1);const comp={};let s=0,n=0;
    Object.entries(keys).forEach(([k,dir])=>{const pr=pctRank(win.map(w=>w[k]),r[k]);if(pr==null)return;const v=dir>0?pr:100-pr;comp[k]=v;s+=v;n++});return {d:r.d,v:n?s/n:null,comp,raw:r}}).filter(x=>x.v!=null);
  const U=S.univ&&S.univ.data;let breadth=null;if(U){const L=Object.values(U).filter(u=>u.s50&&u.px);if(L.length>20)breadth={a50:L.filter(u=>u.px>u.s50).length/L.length*100,a200:L.filter(u=>u.s200&&u.px>u.s200).length/L.length*100,n:L.length,hi:L.filter(u=>u.hi&&u.px>=u.hi*.97).length,lo:L.filter(u=>u.lo&&u.px<=u.lo*1.03).length}}
  return C.sent={out,breadth};
}
function sentLabel(v){return v>=75?'Aşırı açgözlülük':v>=55?'Açgözlülük':v>45?'Nötr':v>25?'Korku':'Aşırı korku'}
function viewSent(){const D=sentData();if(!D||!D.out.length)return '<div class="empty">Duyarlılık için yeterli veri yok</div>';const L=D.out;const cur=L[L.length-1];let v=cur.v;const br=D.breadth;
  if(br){v=(v*5+br.a50)/6}const ago=k=>{const x=L[Math.max(0,L.length-1-k)];return x?x.v:null};
  const CN={mom:['Piyasa momentumu','S&P 500\'ün 125 günlük ortalamaya uzaklığı',x=>pct(x.mom,1)],vix:['Oynaklık (VIX)','VIX düşükse açgözlülük',x=>nf(x.vix,1)],haven:['Güvenli liman talebi','20 günde hisse getirisi − altın getirisi',x=>(x.haven>0?'+':'')+nf(x.haven,1)+' puan'],usd:['Dolar talebi','UUP 20 günlük değişimi; güçlü dolar = korku',x=>pct(x.usd,1)],hi:['Zirveye uzaklık','S&P 500\'ün 52 hafta zirvesine uzaklığı',x=>pct(x.hi,1)]};
  const col=x=>x>=55?'up':x<=45?'down':'';
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Piyasa duyarlılık endeksi</h2><p>0 aşırı korku, 100 aşırı açgözlülük · her bileşen son 1 yıla göre yüzdelik sırası · ${esc(trDate(cur.d+'T12:00:00Z'))}</p></div></div>
  <div class="grid g-main" style="align-items:start"><section class="card" style="text-align:center">${gaugeSVG((v-50)/50,260)}<div style="font:700 42px var(--mono);margin-top:-6px" class="${col(v)}">${nf(v,0)}</div><div style="font-size:18px;font-weight:600">${sentLabel(v)}</div>
    <div class="ms-i" style="justify-content:center;margin-top:14px">${[['Dün',ago(1)],['1 hafta önce',ago(5)],['1 ay önce',ago(21)],['3 ay önce',ago(63)]].map(([l,x])=>`<div class="ms-x"><span class="muted">${l}</span><b class="num ${col(x)}">${nf(x,0)}</b><span class="muted" style="font-size:11px">${x!=null?sentLabel(x):''}</span></div>`).join('')}</div></section>
  <section class="card"><h3>Bileşenler</h3>${Object.entries(CN).map(([k,[n,d,f]])=>{const x=cur.comp[k];return x==null?'':`<div class="sent-c"><div><b>${n}</b><div class="muted" style="font-size:12px">${d} · şu an ${f(cur.raw)}</div></div><div class="sent-b"><i style="width:${x}%" class="${col(x)}"></i></div><b class="num ${col(x)}">${nf(x,0)}</b></div>`}).join('')}
   ${br?`<div class="sent-c"><div><b>Piyasa genişliği</b><div class="muted" style="font-size:12px">${br.n} büyük şirketin 50g ort. üstündeki oranı · 200g: %${nf(br.a200,0)} · zirveye yakın ${br.hi}, dibe yakın ${br.lo}</div></div><div class="sent-b"><i style="width:${br.a50}%" class="${col(br.a50)}"></i></div><b class="num ${col(br.a50)}">${nf(br.a50,0)}</b></div>`:''}</section></div>
  <section class="card sec"><h3>Son 1 yıl</h3><div class="chart" id="cSent" style="height:240px"></div></section>
  <p class="muted" style="font-size:12px;margin:10px 2px 0">CNN Korku & Açgözlülük endeksinden esinlenen sadeleştirilmiş bir ölçü: opsiyon ve yüksek getirili tahvil verisi yerine elimizdeki VIX, S&P 500, altın ve dolar serileri kullanılıyor. Aşırı uçlar tarihsel olarak ters yönlü sinyal verebilir; yatırım tavsiyesi değildir.</p></div>`}
function afterSent(){const D=sentData();const el=$('#cSent');if(D&&el)lineChart(el,[{name:'Duyarlılık',color:'#8b7bff',pts:D.out.slice(-252).map(x=>[x.d,x.v])}],{fmt:(v,ax)=>nf(v,0)})}
