/* Portföy Defteri — laboratuvar: strateji karşılaştırma, stres testi, içeriden değerleme, işlem karnesi, düzenli alım simülatörü, sapma uyarısı, uzak alarm dosyası */
"use strict";

/* ---------- strateji laboratuvarı ---------- */
const LAB_RULES=[
  {k:'plan',n:'Plan: alım bölgesine geri çekilme',d:'Sitenin hesapladığı alım bölgesine geri çekilmede al; TP1’de sat, plan stop’unda kes.'},
  {k:'kijun',n:'Kijun’a geri çekilme',d:'Fiyat bulutun üstündeyken gün içi Kijun’a değip üstünde kapanırsa al. Stop: Kijun − 1 ATR, hedef 2R.'},
  {k:'kumo',n:'Bulut kırılımı',d:'Kapanış bulutun üstüne çıkar ve Tenkan > Kijun ise al. Stop: Kijun − 0,5 ATR, hedef 2R.'},
  {k:'rsi',n:'RSI 35 dönüşü',d:'Fiyat 200 günlük ortalamanın üstündeyken RSI 35’in altından yukarı dönerse al. Stop: 2 ATR, hedef 2R.'},
  {k:'sma50',n:'50G ortalama kesişimi',d:'50G > 200G iken kapanış 50G ortalamayı yukarı keserse al. Stop: 2 ATR, hedef 2R.'},
  {k:'brk',n:'20 günlük zirve kırılımı',d:'Kapanış son 20 günün en yükseğini aşarsa al (Donchian). Stop: 2 ATR, hedef 2R.'}];
function labSim(a,sigs){const tr=[];let busy=-1;const n=a.length;
  sigs.forEach(s=>{const i=s.i;if(i<=busy||i+1>=n)return;const e=a[i+1].o;const stop=s.stop(e),tgt=e+2*(e-stop);if(!(e>stop))return;let j=i+1,exit=null,res='süre';
    for(;j<Math.min(n,i+61);j++){const c=a[j];if(c.l<=stop){exit=j===i+1?stop:Math.min(c.o,stop);res='stop';break}if(c.h>=tgt){exit=j===i+1?tgt:Math.max(c.o,tgt);res='hedef';break}}
    if(exit==null){j=Math.min(n-1,i+60);exit=a[j].c;if(i+60>n-1)res='açık'}busy=j;tr.push({d:a[i+1].d,i:i+1,entry:e,stop,exit,res,days:j-i,r:(exit-e)/(e-stop),pct:(exit/e-1)*100})});return tr}
function labStats(tr,mid){const done=tr.filter(x=>x.res!=='açık');const n=done.length;if(!n)return {n:0};const w=done.filter(x=>x.r>0);
  const avg=arr=>arr.length?arr.reduce((s,x)=>s+x.r,0)/arr.length:null;const h1=done.filter(x=>x.d<mid),h2=done.filter(x=>x.d>=mid);
  const out={n,win:w.length/n*100,avgR:avg(done),r1:avg(h1),r2:avg(h2),n1:h1.length,n2:h2.length,sum:done.reduce((s,x)=>s*(1+x.pct/100),1)*100-100,days:done.reduce((s,x)=>s+x.days,0)/n};
  out.verdict=n<8?['Örnek az','n']:out.avgR>0.15&&(out.r1??0)>0&&(out.r2??0)>0?['Tutarlı pozitif','up']:out.avgR>0?['Pozitif ama tutarsız','warn']:['İşe yaramamış','down'];return out}
function labRun(t){
  const a=candles(t).slice();const n=a.length;if(n<260)return null;const key=t+'|'+a[n-1].d;S.labCache=S.labCache||{};if(S.labCache[key])return S.labCache[key];
  const cl=a.map(x=>x.c);const I=ichimoku(a),A=atrS(a),R=rsiS(cl),s50=smaS(cl,50),s200=smaS(cl,200);const mid=a[Math.floor((200+n)/2)].d;const out={t,from:a[200].d,to:a[n-1].d,mid,rules:{}};
  const top=i=>Math.max(I.A[i]??-Infinity,I.B[i]??-Infinity);const sig={kijun:[],kumo:[],rsi:[],sma50:[],brk:[]};
  for(let i=200;i<n-1;i++){const c=a[i],at=A[i]||c.c*0.02;
    if(c.c>top(i)&&I.K[i]&&c.l<=I.K[i]&&c.c>I.K[i]&&I.T[i]>=I.K[i])sig.kijun.push({i,stop:()=>I.K[i]-at});
    if(c.c>top(i)&&a[i-1].c<=top(i-1)&&I.T[i]>I.K[i])sig.kumo.push({i,stop:()=>Math.min(I.K[i]-at*0.5,c.c-at)});
    if(s200[i]&&c.c>s200[i]&&R[i-1]<35&&R[i]>=35)sig.rsi.push({i,stop:e=>e-2*at});
    if(s200[i]&&s50[i]>s200[i]&&a[i-1].c<=s50[i-1]&&c.c>s50[i])sig.sma50.push({i,stop:e=>e-2*at});
    let hh=-Infinity;for(let k=i-20;k<i;k++)hh=Math.max(hh,a[k].h);if(c.c>hh&&a[i-1].c<=hh)sig.brk.push({i,stop:e=>e-2*at})}
  Object.entries(sig).forEach(([k,s])=>{const tr=labSim(a,s);out.rules[k]={...labStats(tr,mid),last:tr.slice(-1)[0]||null}});
  const bt=(S.btCache||lsJSON('pd_bt',{}))[key];if(bt)out.rules.plan={n:bt.n,win:bt.win,avgR:bt.avgR,sum:bt.sum,days:bt.days,verdict:bt.n<8?['Örnek az','n']:bt.avgR>0.15?['Pozitif','up']:bt.avgR>0?['Zayıf pozitif','warn']:['İşe yaramamış','down']};
  out.hold=(a[n-1].c/a[200].c-1)*100;S.labCache[key]=out;return out;
}
function viewLab(){
  const ts=techTickers();const t=techPick(S.labT)||ts[0];S.labT=t;const L=labRun(t);
  const cell=r=>!r||!r.n?'<td class="r muted">—</td>':`<td class="r num lc ${r.avgR>0.15?'up':r.avgR<0?'down':''}" title="${r.n} işlem · kazanma %${nf(r.win,0)}">${r.avgR>0?'+':''}${nf(r.avgR,2)}<span>${r.n}</span></td>`;
  const all=ts.map(x=>labRun(x)).filter(Boolean);
  return `<div class="sec-t" style="margin-top:0"><div><h2>Strateji laboratuvarı</h2><p>6 farklı giriş kuralı, her enstrümanda son ~2,5 yılda · değerler işlem başına ortalama R</p></div></div>
  <section class="card"><div class="tscroll"><table class="tbl lab"><thead><tr><th>Enstrüman</th>${LAB_RULES.map(r=>`<th class="r" title="${esc(r.d)}">${esc(r.n)}</th>`).join('')}<th>En iyisi</th></tr></thead><tbody>
  ${all.map(o=>{const best=LAB_RULES.map(r=>[r,o.rules[r.k]]).filter(x=>x[1]&&x[1].n>=8&&x[1].verdict&&x[1].verdict[1]==='up').sort((x,y)=>y[1].avgR-x[1].avgR)[0];
    return `<tr class="${o.t===t?'sel':''}" style="cursor:pointer" data-lt="${o.t}"><td><div class="sym">${logo(o.t)}<b>${esc(dispT(o.t))}</b></div></td>${LAB_RULES.map(r=>cell(o.rules[r.k])).join('')}<td>${best?`<span class="chip up">${esc(best[0].n)}</span>`:'<span class="muted" style="font-size:12.5px">tutarlı kural yok</span>'}</td></tr>`}).join('')}</tbody></table></div>
  <p class="muted" style="font-size:12px;margin:10px 0 0;line-height:1.5">Hücrede büyük sayı ortalama R (işlem başına riske edilen tutarın katı), küçük sayı işlem adedi. “Plan” sütunu Sinyal testi sayfasında hesaplandıysa dolar. <b>Tutarlı pozitif</b> için en az 8 işlem ve dönemin iki yarısında da pozitif sonuç şartı var; bu, tesadüfen iyi çıkan kuralları elemek için. Geçmişte iyi çalışan kural gelecekte de çalışacak diye bir garanti yok.</p></section>
  ${L?`<div class="sec-t"><div><h2>${esc(dispT(t))} · kural detayı</h2><p>${esc(trDate(L.from+'T12:00:00Z',{month:'short',year:'numeric'}))} – ${esc(trDate(L.to+'T12:00:00Z',{month:'short',year:'numeric'}))} · al-tut ${pct(L.hold,0)}</p></div></div>
  <div class="grid labg">${LAB_RULES.map(r=>{const x=L.rules[r.k];return `<section class="card lr"><div class="th"><b>${esc(r.n)}</b>${x&&x.verdict?`<span class="chip ${x.verdict[1]==='warn'?'n warnc':x.verdict[1]}">${esc(x.verdict[0])}</span>`:''}</div><p class="muted" style="font-size:12.5px;margin:6px 0 10px">${esc(r.d)}</p>
    ${x&&x.n?`<div class="btk" style="margin-top:0"><div><span>İşlem</span><b>${x.n}</b></div><div><span>Kazanma</span><b>%${nf(x.win,0)}</b></div><div><span>Ort.</span><b class="${cls(x.avgR)}">${x.avgR>0?'+':''}${nf(x.avgR,2)}R</b></div><div><span>Bileşik</span><b class="${cls(x.sum)}">${pct(x.sum,0)}</b></div></div>
    ${x.r1!=null||x.r2!=null?`<div class="muted" style="font-size:12px;margin-top:8px">1. yarı: <b class="${cls(x.r1)}">${x.r1==null?'—':nf(x.r1,2)+'R'}</b> (${x.n1}) · 2. yarı: <b class="${cls(x.r2)}">${x.r2==null?'—':nf(x.r2,2)+'R'}</b> (${x.n2})</div>`:''}
    ${x.last?`<div class="muted" style="font-size:12px;margin-top:4px">Son sinyal: ${esc(trDate(x.last.d+'T12:00:00Z',{day:'numeric',month:'short',year:'2-digit'}))} · ${x.last.res==='açık'?'hâlâ açık':x.last.res==='hedef'?'hedefe ulaştı':x.last.res==='stop'?'stop oldu':'süre doldu'}</div>`:''}`:`<div class="muted" style="font-size:13px">${r.k==='plan'?'Sinyal testi sayfasında hesapla':'Bu dönemde sinyal yok'}</div>`}</section>`}).join('')}</div>`:''}`;
}
function afterLab(){$$('tr[data-lt]').forEach(r=>r.onclick=()=>{S.labT=r.dataset.lt;render(false)})}

/* ---------- tarihsel stres testi ---------- */
const STRESS_NAMES=[['2024-07','Yen carry çözülmesi'],['2024-08','Yen carry çözülmesi'],['2025-02','Tarife şoku'],['2025-03','Tarife şoku'],['2025-04','Tarife şoku'],['2025-11','Kasım 2025 AI satışı'],['2026-01','Ocak 2026 düşüşü'],['2026-02','Şubat 2026 düşüşü'],['2026-03','Mart 2026 düşüşü'],['2026-06','Haziran 2026 düşüşü'],['2026-07','Temmuz 2026 düşüşü']];
function stressEpisodes(th=6){const s=closeSeries('SPY');if(s.length<100)return [];const ep=[];let pk=0,cur=null;
  for(let i=1;i<s.length;i++){if(s[i][1]>=s[pk][1]){if(cur){cur.rec=i;ep.push(cur);cur=null}pk=i;continue}const dd=(s[i][1]/s[pk][1]-1)*100;if(dd<=-th){if(!cur)cur={pk,tr:i,dd};if(dd<cur.dd){cur.tr=i;cur.dd=dd}}}
  if(cur)ep.push(cur);return ep.map(e=>({peak:s[e.pk][0],trough:s[e.tr][0],rec:e.rec!=null?s[e.rec][0]:null,spy:e.dd,name:(STRESS_NAMES.find(n=>s[e.pk][0].startsWith(n[0])||s[e.tr][0].startsWith(n[0]))||[0,'Düşüş · '+trDate(s[e.tr][0]+'T12:00:00Z',{month:'long',year:'numeric'})])[1]}))}
function pxAt(t,d){const s=closeSeries(t);let v=null;for(const p of s){if(p[0]>d)break;v=p[1]}return v}
function stressRun(){
  const W=weights();const ws=Object.entries(W.w).filter(([t,w])=>w>0&&closeSeries(t).length>60);const sw=ws.reduce((a,x)=>a+x[1],0);if(!sw)return null;
  const eps=stressEpisodes();return {W,eps:eps.map(e=>{const per=ws.map(([t,w])=>{const a=pxAt(t,e.peak),b=pxAt(t,e.trough);return {t,w,r:a&&b?(b/a-1)*100:null}});
    const cov=per.filter(x=>x.r!=null);const cw=cov.reduce((a,x)=>a+x.w,0);const port=cov.reduce((a,x)=>a+x.w*x.r,0)/(cw||1);
    const S0=closeSeries('SPY');const dates=S0.map(p=>p[0]).filter(d=>d>=e.peak);let idx=[],minV=1,minD=e.peak,recD=null;
    for(const d of dates){let v=0;cov.forEach(x=>{const a=pxAt(x.t,e.peak),b=pxAt(x.t,d);if(a&&b)v+=x.w/cw*(b/a)});idx.push([d,v*100]);if(v<minV){minV=v;minD=d;recD=null}if(d>minD&&v>=1&&!recD&&minV<0.999)recD=d;if(recD&&idx.length>400)break}
    const bizDays=(a,b)=>dates.filter(d=>d>a&&d<=b).length;
    return {...e,per:per.sort((x,y)=>(x.r??0)-(y.r??0)),port,worst:(minV-1)*100,worstD:minD,recD,recDays:recD?bizDays(minD,recD):null,path:idx.slice(0,Math.min(idx.length,bizDays(e.peak,e.rec||dates[dates.length-1])+40))}})};
}
function viewStress(){
  const R=stressRun();if(!R||!R.eps.length)return '<div class="empty">Stres testi için yeterli veri yok</div>';const sel=Math.min(S.stSel||0,R.eps.length-1);const E=R.eps[sel];
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Tarihsel stres testi</h2><p>${esc(R.W.src)} ağırlıklarıyla, son 3 yılda S&P 500’ün %6’dan fazla düştüğü dönemler</p></div></div>
  <section class="card"><div class="tscroll"><table class="tbl"><thead><tr><th>Dönem</th><th>Zirve → dip</th><th class="r">S&P 500</th><th class="r">Portföyün</th><th class="r">Fark</th><th class="r">Portföyün en kötü noktası</th><th class="r">Toparlanma</th></tr></thead><tbody>
  ${R.eps.map((e,i)=>`<tr data-st="${i}" class="${i===sel?'sel':''}" style="cursor:pointer"><td><b>${esc(e.name)}</b></td><td class="muted" style="font-size:12.5px">${esc(trDate(e.peak+'T12:00:00Z',{day:'numeric',month:'short',year:'2-digit'}))} → ${esc(trDate(e.trough+'T12:00:00Z',{day:'numeric',month:'short',year:'2-digit'}))}</td><td class="r num down">${pct(e.spy,1)}</td><td class="r num ${cls(e.port)}">${pct(e.port,1)}</td><td class="r num ${cls(e.port-e.spy)}">${e.port-e.spy>0?'+':''}${nf(e.port-e.spy,1)} puan</td><td class="r num down">${pct(e.worst,1)}</td><td class="r num">${e.recDays!=null?e.recDays+' iş günü':'<span class="muted">toparlanmadı</span>'}</td></tr>`).join('')}</tbody></table></div>
  <p class="muted" style="font-size:12px;margin:10px 0 0">Bugünkü ağırlıklarla, düşüşün başladığı gün alınıp tutulsaydı ne olurdu. “Toparlanma”: portföyün dipten eski zirvesine dönmesi için geçen iş günü.</p></section>
  <div class="grid g-main sec" style="align-items:start"><section class="card"><h3>${esc(E.name)} · portföy yolu</h3><div class="chart" id="cStress" style="height:280px"></div><div class="leg" style="margin-top:6px"><span><i style="background:#8b7bff"></i>Portföy (başlangıç 100)</span><span><i style="background:#ff9f5c"></i>S&P 500</span></div></section>
  <section class="card"><h3>Enstrüman katkısı</h3><div class="bars">${E.per.map(x=>`<div class="bar"><span class="t"><b>${esc(dispT(x.t))}</b> <span class="muted">%${nf(x.w,0)}</span></span><div class="tr"><div class="f ${x.r<0?'neg':''}" style="width:${Math.min(100,Math.abs(x.r||0)*2.5)}%"></div></div><span class="v ${cls(x.r)}">${x.r==null?'—':pct(x.r,1)}</span></div>`).join('')}</div>
  <p class="muted" style="font-size:12px;margin:10px 0 0">Çubuk uzunluğu düşüşün büyüklüğü. En çok zarar ettiren enstrümanlar bu tür bir şokta portföyün zayıf halkası.</p></section></div></div>`;
}
function afterStress(){const R=stressRun();if(!R)return;const E=R.eps[Math.min(S.stSel||0,R.eps.length-1)];const el=$('#cStress');
  if(E&&el){const sp=closeSeries('SPY');const a=pxAt('SPY',E.peak);const spy=E.path.map(p=>[p[0],(pxAt('SPY',p[0])/a)*100]);lineChart(el,[{name:'Portföy',color:'#8b7bff',pts:E.path},{name:'S&P 500',color:'#ff9f5c',pts:spy}],{fmt:(v,ax)=>nf(v,ax?0:1)})}
  $$('tr[data-st]').forEach(r=>r.onclick=()=>{S.stSel=+r.dataset.st;render(false)})}

/* ---------- içeriden değerleme (fonların içindeki hisseler) ---------- */
const VAL_ALIAS={'NOVO.B':'NVO',RO:'RHHBY',GLEN:'GLNCY'};
function valOf(t){const V=S.valuation&&S.valuation.data;if(!V)return null;return V[VAL_ALIAS[t]||t]||null}
function lookThrough(t){const i=inst(t);if(!i)return null;
  if(i.type==='Hisse'){const v=valOf(t);return v?{pe:v.pe,fpe:v.fpe,peg:v.peg,growth:v.growth,cov:100,n:1,own:true}:{cov:0,n:0}}
  const h=(i.holdings||[]).filter(x=>x.t&&x.w>0);if(!h.length)return null;const tot=h.reduce((a,x)=>a+x.w,0);let wPE=0,sInv=0,wPEG=0,sPEG=0,cov=0,n=0;const miss=[];
  let wF=0,sF=0;h.forEach(x=>{const v=valOf(x.t);if(v&&v.fpe>0&&v.fpe<400){sF+=x.w/v.fpe;wF+=x.w}if(v&&v.pe>0&&v.pe<400){sInv+=x.w/v.pe;wPE+=x.w;cov+=x.w;n++;if(v.peg>0&&v.peg<10){wPEG+=x.w*v.peg;sPEG+=x.w}}else miss.push(x.t)});
  return {pe:wPE?wPE/sInv:null,fpe:wF?wF/sF:null,peg:sPEG?wPEG/sPEG:null,cov:cov/tot*100,n,miss:miss.slice(0,8),listed:tot}}
function viewValuation(){
  if(!S.valuation)return '<div class="empty"><b>Değerleme verisi henüz yok</b>İlk güncellemeden sonra görünecek.</div>';
  const W=weights();const rows=Object.keys(W.w).concat(tickers()).filter((x,i,a)=>a.indexOf(x)===i).map(t=>({t,w:W.w[t]||0,L:lookThrough(t)})).filter(r=>r.L);
  const pr=rows.filter(r=>r.L.pe>0&&r.w>0);const pw=pr.reduce((a,r)=>a+r.w,0);const pPE=pw?pw/pr.reduce((a,r)=>a+r.w/r.L.pe,0):null;
  const fr=rows.filter(r=>r.L.fpe>0&&r.w>0);const fw=fr.reduce((a,r)=>a+r.w,0);const pF=fw?fw/fr.reduce((a,r)=>a+r.w/r.L.fpe,0):null;const gr=rows.filter(r=>r.L.peg>0&&r.w>0);const gw=gr.reduce((a,r)=>a+r.w,0);const pPEG=gw?gr.reduce((a,r)=>a+r.w*r.L.peg,0)/gw:null;
  const V=S.valuation.data;const top=Object.entries(V).filter(([k,v])=>v.pe>0).sort((a,b)=>b[1].pe-a[1].pe);
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Değerleme · fonların içine bakış</h2><p>Fonların içindeki hisselerin F/K’sından, ağırlıklarıyla hesaplanır · ${esc(trDate(S.valuation.updatedAt))}</p></div></div>
  <div class="grid g3"><section class="card kpi mini"><div class="l">Portföyün ağırlıklı F/K</div><div class="v">${pPE?nf(pPE,1):'—'}</div><div class="s">emtia hariç, son 12 ay kârına göre${pF?` · ileri F/K <b>${nf(pF,1)}</b>`:''}</div></section>
    <section class="card kpi mini"><div class="l">Ağırlıklı PEG</div><div class="v ${pPEG>2?'down':pPEG<1?'up':''}">${pPEG?nf(pPEG,2):'—'}</div><div class="s">1’in altı büyümeye göre ucuz, 2’nin üstü pahalı sayılır</div></section>
    <section class="card kpi mini"><div class="l">Kapsama</div><div class="v">${Object.keys(V).length}</div><div class="s">hissenin verisi var · eksikler haftalık görevde tamamlanıyor</div></section></div>
  <section class="card sec"><div class="tscroll"><table class="tbl"><thead><tr><th>Enstrüman</th><th class="r">Ağırlık</th><th class="r">F/K</th><th class="r">İleri F/K</th><th class="r">PEG</th><th class="r">Veri kapsaması</th><th>Eksik büyük holdingler</th></tr></thead><tbody>
  ${rows.map(r=>`<tr onclick="location.hash='#/t/${r.t}/temel'" style="cursor:pointer"><td><div class="sym">${logo(r.t)}<b>${esc(dispT(r.t))}</b></div></td><td class="r num">%${nf(r.w,1)}</td><td class="r num">${r.L.pe?nf(r.L.pe,1):'—'}</td><td class="r num">${r.L.fpe?nf(r.L.fpe,1):'—'}</td><td class="r num ${r.L.peg>2?'down':r.L.peg<1&&r.L.peg>0?'up':''}">${r.L.peg?nf(r.L.peg,2):'—'}</td><td class="r num">${r.L.own?'hisse':'%'+nf(r.L.cov,0)}</td><td class="muted" style="font-size:12px">${(r.L.miss||[]).join(', ')}</td></tr>`).join('')}</tbody></table></div>
  <p class="muted" style="font-size:12px;margin:10px 0 0;line-height:1.5">Fon F/K’sı ağırlıklı harmonik ortalamadır (endeks sağlayıcıların kullandığı yöntem): kâr getirisi ağırlıklarla toplanıp terse çevrilir. Zarar eden ya da F/K’sı 400’ü aşan hisseler dışarıda bırakılır. Kapsama %60’ın altındaysa rakam temsili değildir. Kaynak: FMP ve Alpha Vantage ücretsiz verileri.</p></section>
  <section class="card sec"><h3>Hisse bazında <span class="r muted">${top.length} hisse</span></h3><div class="vgrid">${top.map(([k,v])=>`<div><b>${esc(k)}</b><span>F/K ${nf(v.pe,1)}${v.fpe?` · ileri ${nf(v.fpe,1)}`:''}${v.peg?` · PEG ${nf(v.peg,2)}`:''}</span></div>`).join('')}</div></section></div>`;
}

/* ---------- işlem karnesi ---------- */
function tradeLog(){
  const lots=S.lots.slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);const q={};const closed=[];
  lots.forEach(l=>{const t=l.t;q[t]=q[t]||[];const rate=+l.fx||fx()||1;const tq=isTRY(t)?rate:1;const p=+l.p/tq;
    if(l.side!=='S'){q[t].push({q:+l.q,p,date:l.date,lot:l});return}let left=+l.q;
    while(left>1e-9&&q[t].length){const b=q[t][0];const m=Math.min(left,b.q);closed.push({t,q:m,buy:b.p,sell:p,bd:b.date,sd:l.date,lot:b.lot,ret:(p/b.p-1)*100,days:Math.round((new Date(l.date)-new Date(b.date))/864e5)});b.q-=m;left-=m;if(b.q<=1e-9)q[t].shift()}});
  const open=[];Object.entries(q).forEach(([t,arr])=>arr.forEach(b=>{if(b.q>1e-9){const cv=isTRY(t)&&fx()?fx():1;const px=(quote(t).price||0)/cv;open.push({t,q:b.q,buy:b.p,bd:b.date,lot:b.lot,ret:(px/b.p-1)*100,days:Math.round((Date.now()-new Date(b.date))/864e5)})}}));
  return {closed,open};
}
function viewKarne(){
  if(!S.lots.length)return '<div class="empty"><b>Henüz işlem yok</b>Pozisyonlar sayfasından alım/satım ekledikçe karne dolar.</div>';
  const {closed,open}=tradeLog();const win=closed.filter(x=>x.ret>0),loss=closed.filter(x=>x.ret<=0);const avg=(a,k)=>a.length?a.reduce((s,x)=>s+x[k],0)/a.length:null;
  const gp=win.reduce((s,x)=>s+x.ret*x.q*x.buy,0),gl=-loss.reduce((s,x)=>s+x.ret*x.q*x.buy,0);
  const after=closed.map(x=>{const s=closeSeries(x.t);const k=s.findIndex(p=>p[0]>x.sd);if(k<0||k+20>=s.length)return null;const cv=isTRY(x.t)?1:1;return (s[k+20][1]/(x.sell*(isTRY(x.t)&&fx()?fx():1))-1)*100}).filter(v=>v!=null);
  const stopBreach=[...closed,...open].filter(x=>x.lot&&x.lot.stop>0).map(x=>{const s=closeSeries(x.t);const end=x.sd||'9999';const hit=s.find(p=>p[0]>x.bd&&p[0]<=end&&p[1]<x.lot.stop*(isTRY(x.t)&&fx()?fx():1));return hit?{...x,hit:hit[0]}:null}).filter(Boolean);
  const tgtEarly=closed.filter(x=>x.lot&&x.lot.target>0&&x.sell<x.lot.target/(isTRY(x.t)&&fx()?fx():1)&&x.ret>0);
  const ins=[];if(win.length&&loss.length){const dw=avg(win,'days'),dl=avg(loss,'days');if(dl>dw*1.3)ins.push(`Zararlı işlemleri kârlılardan ${nf(dl/dw,1)} kat uzun tutuyorsun: zararı geç, kârı erken kesme eğilimi.`);else ins.push('Kârlı ve zararlı işlemleri benzer sürelerde tutuyorsun; iyi.')}
  if(after.length){const a=avg(after.map(v=>({v})),'v');ins.push(a>3?`Sattıktan sonraki 20 işlem gününde fiyat ortalama ${pct(a,1)} daha yükselmiş: erken satıyor olabilirsin.`:a<-3?`Sattıktan sonra fiyat ortalama ${pct(a,1)} düşmüş: satış zamanlaman iyi.`:'Sattıktan sonra fiyatlar yatay seyretmiş; zamanlama nötr.')}
  if(stopBreach.length)ins.push(`${stopBreach.length} işlemde kendi belirlediğin stop’un altına inildiği halde pozisyon tutulmuş.`);
  if(tgtEarly.length)ins.push(`${tgtEarly.length} kârlı işlem hedef fiyata ulaşmadan kapatılmış.`);
  const row=x=>`<tr><td><div class="sym">${logo(x.t)}<b>${esc(dispT(x.t))}</b></div></td><td class="muted" style="font-size:12.5px">${esc(trDate(x.bd+'T12:00:00Z',{day:'numeric',month:'short',year:'2-digit'}))}${x.sd?' → '+esc(trDate(x.sd+'T12:00:00Z',{day:'numeric',month:'short',year:'2-digit'})):''}</td><td class="r num">${nf(x.q,x.q%1?3:0)}</td><td class="r num">${usd(x.buy)}</td><td class="r num">${x.sell?usd(x.sell):'—'}</td><td class="r num ${cls(x.ret)}">${pct(x.ret,1)}</td><td class="r num">${x.days} g</td><td class="muted" style="font-size:12px;max-width:260px">${esc((x.lot&&x.lot.thesis)||'')}</td></tr>`;
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>İşlem karnesi</h2><p>Kapanan işlemler FIFO ile eşleştirilir · dolar bazında</p></div></div>
  <div class="btk"><div><span>Kapanan işlem</span><b>${closed.length}</b></div><div><span>Kazanma oranı</span><b>${closed.length?'%'+nf(win.length/closed.length*100,0):'—'}</b></div><div><span>Ort. kazanç / kayıp</span><b><span class="up">${win.length?pct(avg(win,'ret'),1):'—'}</span> / <span class="down">${loss.length?pct(avg(loss,'ret'),1):'—'}</span></b></div><div><span>Kâr faktörü</span><b>${gl>0?nf(gp/gl,2):closed.length?'∞':'—'}</b><i>1’in üstü kârlı</i></div><div><span>Ort. tutma</span><b>${closed.length?nf(avg(closed,'days'),0)+' g':'—'}</b></div></div>
  ${ins.length?`<section class="card sec"><h3>Davranış notları</h3><ul class="lst">${ins.map(x=>`<li><span>${esc(x)}</span></li>`).join('')}</ul></section>`:''}
  ${closed.length?`<section class="card sec"><h3>Kapanan işlemler</h3><div class="tscroll"><table class="tbl"><thead><tr><th>Enstrüman</th><th>Tarih</th><th class="r">Adet</th><th class="r">Alış</th><th class="r">Satış</th><th class="r">Getiri</th><th class="r">Süre</th><th>Tez</th></tr></thead><tbody>${closed.slice().reverse().map(row).join('')}</tbody></table></div></section>`:''}
  <section class="card sec"><h3>Açık lotlar <span class="r muted">${open.length}</span></h3><div class="tscroll"><table class="tbl"><thead><tr><th>Enstrüman</th><th>Alış tarihi</th><th class="r">Adet</th><th class="r">Alış</th><th class="r">—</th><th class="r">Şu an</th><th class="r">Süre</th><th>Tez</th></tr></thead><tbody>${open.map(row).join('')}</tbody></table></div>
  <p class="muted" style="font-size:12px;margin:10px 0 0">İşlem eklerken “Stop” alanını doldurursan karne, stop’un altına inilip inilmediğini de takip eder.</p></section></div>`;
}

/* ---------- düzenli alım simülatörü ---------- */
function viewDca(){
  const st=S.dca||(S.dca={amt:10000,yrs:1,mode:'w',t:'SMH'});const L=techTickers();
  const R=dcaRun();
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Düzenli alım simülatörü</h2><p>Her ayın ilk işlem günü aynı TL tutarla alım yapılsaydı bugün ne olurdu</p></div></div>
  <section class="card"><div class="dcaf"><label>Aylık tutar (₺)<input id="dAmt" type="number" min="100" step="500" value="${st.amt}"></label>
    <label>Süre<select id="dYrs">${[1,2].map(y=>`<option value="${y}" ${st.yrs===y?'selected':''}>${y} yıl</option>`).join('')}</select></label>
    <label>Ne alınsın?<select id="dMode"><option value="w" ${st.mode==='w'?'selected':''}>Portföy ağırlıklarıyla (${esc(weights().src)})</option>${L.map(t=>`<option value="${t}" ${st.mode===t?'selected':''}>Sadece ${esc(dispT(t))}</option>`).join('')}</select></label></div></section>
  ${R?`<div class="grid g3 sec">${[['Yatırılan',R.inv,''],['Bugünkü değer',R.val,cls(R.val-R.inv)],['Kâr/zarar',R.val-R.inv,cls(R.val-R.inv)]].map(([l,v,c])=>`<section class="card kpi mini"><div class="l">${l}</div><div class="v ${c}">₺${nf(v,0)}</div>${l==='Kâr/zarar'?`<div class="s">${pct((R.val/R.inv-1)*100,1)} · yıllık iç getiri ${pct(R.irr,1)}</div>`:''}</section>`).join('')}</div>
  <div class="grid g-main sec" style="align-items:start"><section class="card"><h3>Birikimin seyri (₺)</h3><div class="chart" id="cDca" style="height:300px"></div><div class="leg" style="margin-top:6px">${R.lines.map(l=>`<span><i style="background:${l.c}"></i>${esc(l.n)}</span>`).join('')}</div></section>
  <section class="card"><h3>Aynı parayla alternatifler</h3><div class="ins">${R.alts.map(a=>`<div><span>${esc(a.n)}</span><b class="${cls(a.v-R.inv)}">₺${nf(a.v,0)}</b> <i class="muted" style="font-style:normal">${pct((a.v/R.inv-1)*100,1)}</i></div>`).join('')}</div>
  <p class="muted" style="font-size:12px;margin:10px 0 0;line-height:1.5">Kur: günlük USD/TRY kapanışı. Gram altın = ons × kur ÷ 31,1. Mevduat: sabit brüt %${nf(R.dep,0)} yıllık, %17,5 stopaj sonrası aylık bileşik (gerçek faizler dönem içinde değişti; kaba karşılaştırma). Komisyon ve kur makası dahil değil.</p></section></div>`:'<div class="empty">Yeterli kur/fiyat verisi yok</div>'}</div>`;
}
function dcaRun(){
  const st=S.dca;const mg=k=>{const m=new Map(((S.long&&S.long.series&&S.long.series[k])||[]).map(p=>[p[0],p[1]]));((S.hist&&S.hist[k])||[]).forEach(p=>m.set(p[0],p[1]));return [...m.entries()].sort((a,b)=>a[0]<b[0]?-1:1)};const fxS=mg('USDTRY');const au=mg('XAUUSD');if(fxS.length<60)return null;
  const W=st.mode==='w'?weights().w:{[st.mode]:100};const ws=Object.entries(W).filter(([t,w])=>w>0&&closeSeries(t).length>60);const sw=ws.reduce((a,x)=>a+x[1],0);if(!sw)return null;
  const end=fxS[fxS.length-1][0];const start=new Date(end);start.setUTCFullYear(start.getUTCFullYear()-st.yrs);const s0=start.toISOString().slice(0,10);
  const days=fxS.filter(p=>p[0]>=s0);if(!days.length)return null;const buys=[];let lastM='';days.forEach(p=>{const m=p[0].slice(0,7);if(m!==lastM){lastM=m;buys.push(p[0])}});
  const fxAtD=d=>pxAtS(fxS,d);const units={};const ua={SPY:0,USD:0,AU:0};let dep=0;const depG=(S.macro&&S.macro.deposit&&S.macro.deposit.annualGross)||42;const mr=Math.pow(1+depG*0.825/100,1/12)-1;
  const series=[],spyL=[],auL=[],usdL=[],depL=[],invL=[];let inv=0,bi=0,lastDepM='';
  days.forEach(p=>{const d=p[0],r=p[1];if(d.slice(0,7)!==lastDepM){if(lastDepM)dep*=1+mr;lastDepM=d.slice(0,7)}
    if(bi<buys.length&&buys[bi]===d){bi++;inv+=st.amt;dep+=st.amt;const usd=st.amt/r;ws.forEach(([t,w])=>{const px=pxAt(t,d);if(px)units[t]=(units[t]||0)+usd*w/sw/px});const sp=pxAt('SPY',d);if(sp)ua.SPY+=usd/sp;ua.USD+=usd;const g=pxAtS(au,d);if(g)ua.AU+=usd/g}
    const val=ws.reduce((a,[t])=>a+(units[t]||0)*(pxAt(t,d)||0),0)*r;series.push([d,val]);spyL.push([d,ua.SPY*(pxAt('SPY',d)||0)*r]);usdL.push([d,ua.USD*r]);auL.push([d,ua.AU*(pxAtS(au,d)||0)*r]);depL.push([d,dep]);invL.push([d,inv])});
  const last=a=>a[a.length-1][1];const flows=buys.map(d=>[d,-st.amt]).concat([[end,last(series)]]);
  const irr=(()=>{let lo=-0.99,hi=5;const f=r=>flows.reduce((s,[d,v])=>s+v/Math.pow(1+r,(new Date(end)-new Date(d))/31557600000*-1),0);for(let k=0;k<80;k++){const m=(lo+hi)/2;if(f(m)>0)lo=m;else hi=m}return ((lo+hi)/2)*100})();
  return {inv,val:last(series),irr,dep:depG,alts:[{n:'S&P 500 (SPY)',v:last(spyL)},{n:'Dolar (kasada)',v:last(usdL)},{n:'Gram altın',v:last(auL)},{n:'TL mevduat',v:last(depL)}],
    lines:[{n:'Senin seçimin',c:'#8b7bff',pts:series},{n:'S&P 500',c:'#ff9f5c',pts:spyL},{n:'Gram altın',c:'#ffd35c',pts:auL},{n:'Mevduat',c:'#2fe39a',pts:depL},{n:'Yatırılan',c:'#8b97a8',pts:invL}]};
}
function pxAtS(s,d){let v=null;for(const p of s){if(p[0]>d)break;v=p[1]}return v}
function afterDca(){const R=dcaRun();const el=$('#cDca');if(R&&el)lineChart(el,R.lines.map(l=>({name:l.n,color:l.c,pts:l.pts})),{fmt:(v,ax)=>'₺'+nf(ax?v/1000:v,0)+(ax?'b':'')});
  const f=()=>{S.dca={amt:+$('#dAmt').value||10000,yrs:+$('#dYrs').value,mode:$('#dMode').value};render(false)};['#dAmt','#dYrs','#dMode'].forEach(id=>{const e=$(id);if(e)e.onchange=f})}

/* ---------- hedef ağırlıktan sapma ---------- */
function driftAlerts(){const T=S.settings&&S.settings.targets||{};const P=positions();if(!(P.total>0))return [];const band=+(S.settings.driftBand||5);const out=[];
  Object.entries(T).forEach(([t,tg])=>{tg=+tg;if(!(tg>0))return;const m=P.list.find(x=>x.t===t);const w=m?m.w:0;const d=w-tg;if(Math.abs(d)>=band)out.push({lvl:2,ic:'⚖️',txt:`${dispT(t)} hedef ağırlıktan ${d>0?'+':''}${nf(d,1)} puan saptı (hedef %${nf(tg,0)}, şu an %${nf(w,1)})`,href:'#/analiz/dengeleme'})});return out}

/* ---------- uzak alarm dosyası (zamanlanmış görev telefona bildirir) ---------- */
async function ghPutJSON(path,obj,msg){const tok=(S.settings.ghToken||'').trim();if(!tok)return false;const url=`https://api.github.com/repos/${GH_REPO}/contents/${path}`;const h={Authorization:'Bearer '+tok,Accept:'application/vnd.github+json'};
  const g=await fetch(url+'?ref=main',{headers:h});let sha;if(g.ok)sha=(await g.json()).sha;const body={message:msg,content:b64utf8(JSON.stringify(obj,null,1)+'\n'),branch:'main'};if(sha)body.sha=sha;
  const p=await fetch(url,{method:'PUT',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify(body)});return p.ok}
async function syncRemoteAlarms(){const D=drawAll();const levels=[];Object.entries(D).forEach(([t,arr])=>arr.forEach(g=>{if(g.type==='h'&&g.alarm)levels.push({t,p:g.p})}));
  const obj={updatedAt:new Date().toISOString(),levels,planAlerts:S.settings.planAlerts!==false,brief:true};
  try{const ok=await ghPutJSON('data/alarms.json',obj,'Alarm seviyeleri güncellendi (site)');if(ok)toast('Alarmlar telefona bildirim için kaydedildi');return ok}catch(e){return false}}

/* ---------- sabah brifingi kartı (zamanlanmış görev yazar: data/brief.json) ---------- */
function briefCard(){const B=S.brief;if(!B||!B.publishedAt)return '';const age=(Date.now()-new Date(B.publishedAt))/36e5;if(age>30)return '';
  const open=S.briefOpen!==false;
  return `<section class="card brief"><div class="th"><h3 style="margin:0">☀️ Sabah brifingi <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${esc(trDate(B.publishedAt,{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}))}</span></h3><button class="lnk2" id="brTg" style="margin:0">${open?'Gizle':'Göster'}</button></div>
  <div class="brt">${esc(B.title||'')}</div>${open?`<div class="grid g3" style="margin-top:10px">${(B.sections||[]).map(s=>`<div class="brs"><b>${esc(s.h)}</b><ul class="lst">${(s.items||[]).map(x=>`<li><span>${esc(x)}</span></li>`).join('')}</ul></div>`).join('')}</div>`:''}</section>`}
document.addEventListener('click',e=>{if(e.target&&e.target.id==='brTg'){S.briefOpen=S.briefOpen===false;render(false)}});
