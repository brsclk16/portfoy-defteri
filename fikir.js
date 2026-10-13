/* Portföy Defteri — Günün fikirleri: kanıta dayalı günlük hisse ve ETF adayları (data/ideas.json, tools/ideas.py).
   Özet sayfasında 3 fikirlik kart (neden, metrik, kanıt, ekle / ilgilenmiyorum) + Piyasa → Günün fikirleri tam sayfa. */
"use strict";
let fkLoading=null;
function fkLoad(cb){if(S.ideas!==undefined||fkLoading)return;fkLoading=fetch('data/ideas.json?t='+Math.floor(Date.now()/600000)).then(r=>r.ok?r.json():null).catch(()=>null).then(j=>{S.ideas=j;fkLoading=null;if(cb)cb()})}
function fkNo(){return (S.settings&&S.settings.ideasNo)||{}}
function fkHidden(t){const d=fkNo()[t];return d&&(Date.now()-new Date(d+'T12:00:00Z'))<90*864e5}
function fkWatched(t){return ((S.watch&&S.watch.tickers)||[]).some(w=>w.t===t)||!!(S.data.instruments[t])}
function fkSig(v,d=1){return isNum(v)?`${v>0?'+':v<0?'−':''}${nf(Math.abs(v),d)}`:'—'}
function fkPct(v,d=1){return isNum(v)?`${v>0?'+':v<0?'−':''}%${nf(Math.abs(v),d)}`:'—'}
// yöntemin geçmişteki kanıtı (aynı evrenin eşit ağırlıklısına göre) — tek cümle
function fkEvidence(kind){const B=S.ideas&&S.ideas.backtest&&S.ideas.backtest[kind];if(!B)return null;
  const gap=B.cagr-B.cagrEW;const sig=isNum(B.t)&&B.t>=2;
  const neg=isNum(B.t)&&B.t<=-2;
  if(neg)return {B,gap,sig:false,neg,txt:`Dikkat: bu yöntem ${B.from.slice(0,4)}'den beri aynı evrenin eşit ağırlıklı halinin gerisinde kaldı (yılda ${fkSig(gap)} puan, t=${nf(B.t,1)}). Test evreni bugünün şirketlerinden oluştuğu için oynak kazananları kayırıyor ve düşük oynaklık tercihini cezalandırıyor; yine de bu listeyi alım sinyali olarak değil, inceleme listesi olarak gör.`};
  const post=kind==='stock'&&(S.ideas.methodV||1)>=2?' Ancak bu sürüm test sonuçları görüldükten sonra seçildi ve test evreni (bugünün şirketleri) momentumu kayırıyor; gerçek fark muhtemelen daha küçük, asıl hakem canlı karne.':'';
  return {B,gap,sig,txt:sig?`Geriye dönük testte bu yöntem ${B.from.slice(0,4)}'den beri aynı evrenin eşit ağırlıklı haline göre yılda ${fkSig(gap)} puan önde (t=${nf(B.t,1)}, ayların %${B.hitMonths}'ında).${post}`
    :`Bu yöntem ${B.from.slice(0,4)}'den beri aynı evrenin eşit ağırlıklı halinden istatistiksel olarak ayırt edilemedi (yılda ${fkSig(gap)} puan, t=${nf(B.t,1)}). Bir inceleme listesi olarak gör, alım sinyali değil.`}}
function fkWhy(x,kind,of){
  const p=[`puanda ${of} ${kind==='etf'?'ETF':'hisse'} içinde ${x.rank}. sıra`,`12-1 ay momentum ${fkPct(x.mom,0)}`];
  if(kind==='stock'&&isNum(x.vol))p.push(`yıllık oynaklık %${nf(x.vol,0)}`);
  p.push(`200 günlük ortalamanın %${nf(x.trend,0)} üstünde`);
  if(x.list==='haftalik'&&isNum(x.persist))p.push(`son 5 işlem gününün ${x.persist}'inde ilk 15'te`);
  if(isNum(x.pe)&&x.pe>0)p.push(`F/K ${nf(x.pe,1)}`);
  return p.join(' · ');
}
function fkVolChip(x){return isNum(x.vol)&&x.vol>=60?`<span class="chip down" style="font-size:11.5px">çok oynak: yıllık %${nf(x.vol,0)} · küçük pozisyon</span>`:''}
function fkFit(x){
  if(!isNum(x.corr))return '';
  const c=x.corr;const t=c<0.3?['up','portföyünü belirgin çeşitlendirir']:c<0.5?['up','portföyünü çeşitlendirir']:c<0.75?['n','portföyünle orta düzeyde birlikte hareket eder']:['down','mevcut riskine benzer: aynı yöne bahis'];
  return `<span class="chip ${t[0]}" style="font-size:11.5px">korelasyon ${nf(c,2)} · ${t[1]}</span>`;
}
function fkHV(x){const H=(x.hv||[]).filter(h=>h.pos.length||h.neg.length);if(!H.length)return '';
  return `<div style="margin-top:6px;font-size:12.5px"><span class="muted">Büyük yöneticiler:</span> ${H.map(h=>`<b>${esc(h.n)}</b> ${h.pos.length?`<span class="up">▲ ${h.pos.map(esc).join(', ')}</span>`:''}${h.pos.length&&h.neg.length?' · ':''}${h.neg.length?`<span class="down">▼ ${h.neg.map(esc).join(', ')}</span>`:''}`).join(' &nbsp;|&nbsp; ')}</div>`}
function fkNews(x){const N=x.news||[];if(!N.length)return '';
  return `<div style="margin-top:6px;font-size:12.5px">${N.slice(0,2).map(n=>`<div>📰 <a href="${esc(n.url||'#')}" target="_blank" rel="noopener">${esc(n.title)}</a> <span class="muted">${esc(n.src||'')} · ${esc(n.d?trDate(n.d+'T12:00:00Z',{day:'numeric',month:'short'}):'')}</span></div>`).join('')}</div>`}
function fkInFunds(x){return (x.inFunds||[]).length?`<span class="muted" style="font-size:12px">zaten ${x.inFunds.map(f=>`${esc(f.t)} içinde %${nf(f.w,1)}`).join(', ')}</span>`:''}
// kart için 3 fikir: güçlü hisse, çeşitlendirici hisse, ETF (önce çeşitlendirici)
function fkPick(){const L=S.ideas&&S.ideas.lists;if(!L)return [];const ok=x=>!fkHidden(x.t)&&!fkWatched(x.t);const out=[];
  const take=(arr,kind,lab)=>{const x=(arr||[]).find(y=>ok(y)&&!out.some(o=>o.x.t===y.t));if(x)out.push({x,kind,lab})};
  take(L.stock&&L.stock.guclu,'stock','Güçlü aday');take(L.stock&&L.stock.cesit,'stock','Çeşitlendirici');
  take(L.etf&&L.etf.cesit,'etf','ETF · çeşitlendirici');if(out.length<3)take(L.etf&&L.etf.guclu,'etf','ETF');
  return out.slice(0,3)}
function fkItem(f,full){const x=f.x;const of=x.of;
  return `<div class="fk-i" style="padding:12px 0;border-bottom:1px solid var(--line)">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline"><div><span class="tag">${esc(f.lab)}</span> <b style="font-size:16px">${esc(x.t)}</b> <span class="muted">${esc(x.n||'')}${x.sec&&x.sec!=='ETF'?' · '+esc(x.sec):''}</span>${x.new?' <span class="chip up" style="font-size:11px">yeni</span>':''}</div>
      <span class="num">${usd(x.px,2)}</span></div>
    ${x.issuer?`<div class="muted" style="font-size:12.5px;margin-top:2px">${esc(x.issuer)} · ${esc(x.basis||'')}</div>`:''}
    <div style="margin-top:4px;font-size:13.5px">${esc(fkWhy(x,f.kind,of))}</div>
    ${fkHV(x)}${fkNews(x)}
    <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">${fkVolChip(x)}${fkFit(x)}${fkInFunds(x)}</div>
    <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><span class="muted" style="font-size:13px;align-self:center">Portföyüne eklemek ister misin?</span>
      <button class="btn" data-fkw="${esc(x.t)}">İzleme listesine ekle</button><button class="btn" data-fkp="${esc(x.t)}">Portföyüme ekle</button><button class="lnk2" data-fkn="${esc(x.t)}">İlgilenmiyorum</button></div></div>`}
function ideasCard(){
  if(S.ideas===undefined){fkLoad(()=>{if(!location.hash||/^#\/?(ozet)?$/.test(location.hash))render(false)});return ''}
  if(!S.ideas)return '';const F=fkPick();if(!F.length)return '';
  const ev=fkEvidence('stock');
  return `<section class="card sec fk"><h3>Günün fikirleri <span class="r muted" style="font-size:12px">${esc(trDate(S.ideas.asOf+'T12:00:00Z',{day:'numeric',month:'short'}))} kapanışıyla · ${S.ideas.weekly?`<a href="#/piyasa/fikirler">haftanın listesi (${esc(S.ideas.weekly.week)}) →</a>`:`<a href="#/piyasa/fikirler">tümü ve kanıt →</a>`}</span></h3>
    ${F.map(f=>fkItem(f)).join('')}
    ${ev?`<p class="muted" style="font-size:12px;margin:10px 0 0;line-height:1.5">${esc(ev.txt)} Yatırım tavsiyesi değildir.</p>`:''}</section>`}
async function fkAddWatch(t,note){const cur=(S.watch&&S.watch.tickers)||[];if(cur.some(w=>w.t===t)||S.data.instruments[t])return true;
  const list=cur.concat({t,note:note||'Günün fikirleri',added:new Date().toISOString().slice(0,10)});S.watch={...(S.watch||{}),tickers:list};S.settings.watchLocal=list;
  let ok=true;try{if(typeof ghWatchSave==='function'&&(S.settings.ghToken||'').trim())await ghWatchSave(list);else ok=false}catch(e){ok=false}
  await saveSettings();return ok}
function afterIdeas(){
  $$('[data-fkw]').forEach(b=>b.onclick=async()=>{const t=b.dataset.fkw;const ok=await fkAddWatch(t);toast(ok?`${t} izleme listesine eklendi · verileri toplanıyor`:`${t} bu cihazda izleme listesine eklendi (veri toplama için Ayarlar'a GitHub anahtarı gir)`);render(false)});
  $$('[data-fkp]').forEach(b=>b.onclick=async()=>{const t=b.dataset.fkp;await fkAddWatch(t,'Günün fikirleri · portföy');location.hash='#/portfoy/pozisyon';
    setTimeout(()=>{const s=$('#lotForm [name=t]');if(s){if(![...s.options].some(o=>o.value===t))s.add(new Option(t,t));s.value=t;const q=$('#lotForm [name=q]');if(q)q.focus();s.closest('section').scrollIntoView({behavior:'smooth',block:'center'})}},400)});
  $$('[data-fkn]').forEach(b=>b.onclick=async()=>{const t=b.dataset.fkn;S.settings.ideasNo={...fkNo(),[t]:new Date().toISOString().slice(0,10)};await saveSettings();toast(`${t} 90 gün önerilmeyecek`);render(false)});
}
/* ---------- tam sayfa ---------- */
function fkTable(rows,kind){if(!rows||!rows.length)return '<div class="muted">Aday yok</div>';
  return `<div class="tscroll"><table class="tbl"><thead><tr><th>#</th><th>${kind==='etf'?'ETF':'Şirket'}</th><th class="r">Puan</th><th class="r">12-1 ay</th>${kind==='stock'?'<th class="r">Oynaklık</th>':''}<th class="r">200g üstü</th><th class="r">Portföyle kor.</th>${kind==='stock'?'<th class="r">F/K</th>':''}<th></th></tr></thead><tbody>
  ${rows.map(x=>`<tr><td class="num">${x.rank}</td><td><b>${esc(x.t)}</b> <span class="muted" style="font-size:12px">${esc(x.n||'')}</span>${x.held?' <span class="tag">portföyde</span>':''}${fkHidden(x.t)?' <span class="muted" style="font-size:11px">(gizlendi)</span>':''}</td><td class="r num">${nf(x.score,0)}</td><td class="r num ${cls(x.mom)}">${fkPct(x.mom,0)}</td>${kind==='stock'?`<td class="r num">%${nf(x.vol,0)}</td>`:''}<td class="r num">%${nf(x.trend,0)}</td><td class="r num ${isNum(x.corr)&&x.corr<0.5?'up':isNum(x.corr)&&x.corr>0.75?'down':''}">${isNum(x.corr)?nf(x.corr,2):'—'}</td>${kind==='stock'?`<td class="r num">${isNum(x.pe)&&x.pe>0?nf(x.pe,1):'—'}</td>`:''}<td>${x.held||fkWatched(x.t)?'':`<button class="lnk2" data-fkw="${esc(x.t)}">izle</button>`}</td></tr>`).join('')}</tbody></table></div>`}
function fkBT(kind,label){const B=S.ideas.backtest&&S.ideas.backtest[kind];if(!B)return `<p class="muted">Geriye dönük test henüz yok.</p>`;const ev=fkEvidence(kind);
  const yrs=Object.keys(B.years).sort();
  return `<div class="grid g3"><div class="kpi mini"><div class="l">Yıllık getiri · yöntem</div><div class="v ${cls(B.cagr)}">${fkPct(B.cagr)}</div><div class="s">ilk ${TOPN_TXT[kind]}, aylık</div></div>
    <div class="kpi mini"><div class="l">Aynı evren, eşit ağırlık</div><div class="v ${cls(B.cagrEW)}">${fkPct(B.cagrEW)}</div><div class="s">SPY ${fkPct(B.cagrSPY)}</div></div>
    <div class="kpi mini"><div class="l">En sert düşüş</div><div class="v down">${fkPct(B.mdd)}</div><div class="s">evren ${fkPct(B.mddEW)} · SPY ${fkPct(B.mddSPY)}</div></div></div>
    <p style="margin:10px 0 0" class="${ev&&ev.sig?'':ev&&ev.neg?'down':'muted'}">${esc(ev?ev.txt:'')}</p>
    <div id="fkC_${kind}" style="height:240px;margin-top:10px"></div>
    <details style="margin-top:8px"><summary class="muted" style="cursor:pointer">Yıl yıl (yöntem · evren · SPY)</summary><div class="tscroll"><table class="tbl"><thead><tr><th></th>${yrs.map(y=>`<th class="r">${y}</th>`).join('')}</tr></thead><tbody>
      ${['Yöntem','Evren','SPY'].map((l,k)=>`<tr><td><b>${l}</b></td>${yrs.map(y=>{const v=B.years[y][k];return `<td class="r num ${cls(v)}"${k===0&&v>=B.years[y][1]?' style="font-weight:700"':''}>${fkPct(v,0)}</td>`}).join('')}</tr>`).join('')}</tbody></table></div></details>`}
const TOPN_TXT={stock:'10 hisse',etf:'5 ETF'};
function fkLive(){const L=S.ideas.live||{};const rows=[['stock|haftalik','Hisse · haftalık'],['stock|guclu','Hisse · günlük güçlü'],['stock|cesit','Hisse · günlük çeşitlendirici'],['etf|haftalik','ETF · haftalık'],['etf|guclu','ETF · günlük güçlü'],['etf|cesit','ETF · günlük çeşitlendirici']];
  return `<div class="tscroll"><table class="tbl"><thead><tr><th>Liste</th><th class="r">Öneri</th>${[5,21,63].map(h=>`<th class="r">${{5:'1 hafta',21:'1 ay',63:'3 ay'}[h]} SPY üstü</th>`).join('')}</tr></thead><tbody>
  ${rows.map(([k,l])=>{const g=L[k]||{n:0};return `<tr><td><b>${l}</b></td><td class="r num">${g.n}</td>${[5,21,63].map(h=>{const x=g[h];return x?`<td class="r num ${cls(x.avg)}">${fkSig(x.avg)} <span class="muted" style="font-size:11px">%${x.hit} · ${x.n}</span></td>`:'<td class="r muted">bekliyor</td>'}).join('')}</tr>`}).join('')}</tbody></table></div>
  <p class="muted" style="font-size:12px;margin:6px 0 0">Her gün listeye yeni giren ilk 3 güçlü ve 2 çeşitlendirici aday o günün kapanış fiyatıyla kaydedilir (aynı aday 30 gün içinde tekrar sayılmaz). Sayı: ortalama SPY üstü getiri (puan), küçük: SPY'ı geçen oran ve vaka sayısı.</p>`}
let hvLoading=null;
function hvLoad(cb){if(S.hv!==undefined||hvLoading)return;hvLoading=fetch('data/house_views.json?t='+Math.floor(Date.now()/600000)).then(r=>r.ok?r.json():null).catch(()=>null).then(j=>{S.hv=j;hvLoading=null;if(cb)cb()})}
function fkHouses(){const H=S.ideas.houses;if(!H||!H.card)return '';
  if(S.hv===undefined){hvLoad(()=>{const el=$('#fkHV');if(el)el.outerHTML=fkHouses()});return '<div id="fkHV"></div>'}
  const HV=S.hv||{houses:[]};const C=H.consensus||{};const st=v=>v>0?'<span class="up">▲ olumlu</span>':v<0?'<span class="down">▼ olumsuz</span>':'<span class="muted">● nötr</span>';
  const th=Object.entries(C).sort((a,b)=>b[1].score-a[1].score);
  const consTbl=`<div class="tscroll"><table class="tbl"><thead><tr><th>Tema</th><th class="r">Uzlaşı</th><th>Olumlu</th><th>Olumsuz</th></tr></thead><tbody>
    ${th.map(([k,c])=>`<tr><td><b>${esc(c.n)}</b></td><td class="r num ${cls(c.score)}">${c.score>0?'+':''}${c.score}</td><td style="font-size:12.5px;white-space:normal">${c.pos.map(x=>`<span class="${x.stale?'muted':''}" title="${esc(x.why)}">${esc(x.h)}${x.stale?' (eski)':''}</span>`).join(', ')||'—'}</td><td style="font-size:12.5px;white-space:normal">${c.neg.map(x=>`<span class="${x.stale?'muted':''}" title="${esc(x.why)}">${esc(x.h)}${x.stale?' (eski)':''}</span>`).join(', ')||'—'}</td></tr>`).join('')}</tbody></table></div>`;
  const cards=HV.houses.map(h=>{const K=H.card[h.id]||{rows:[]};const R=Object.fromEntries((K.rows||[]).map(r=>[r.th,r]));
    return `<details style="border-top:1px solid var(--line);padding:10px 0"><summary style="cursor:pointer"><b>${esc(h.n)}</b> <span class="muted" style="font-size:12.5px">${esc(h.brand)} · ${esc(trDate(h.date+'T12:00:00Z',{day:'numeric',month:'short',year:'numeric'}))}${K.stale?' · <span class="down">eski</span>':''}${K.calls?` · isabet ${K.hits}/${K.calls}`:''}${(K.past||[]).length?` · ${K.past.length} eski görüş dahil`:''}${h.auto?' · <span class="muted">otomatik</span>':''}</span></summary>
      <div style="font-size:13px;margin-top:6px"><div class="muted">${esc(h.pub)} · ${esc(h.type)} · ufuk: ${esc(h.horizon||'')} · <a href="${esc(h.url)}" target="_blank" rel="noopener">kaynak</a></div>
      ${h.context?`<p style="margin:6px 0">${esc(h.context)}</p>`:''}
      ${Object.keys(h.views||{}).length?`<div class="tscroll"><table class="tbl"><thead><tr><th>Tema</th><th>Duruş</th><th>Gerekçe</th><th class="r">Yayından beri</th></tr></thead><tbody>${Object.entries(h.views).map(([k,[v,why]])=>{const r=R[k]||{};const ok=v!==0&&isNum(r.ex)?((r.ex>0)===(v>0)):null;
        return `<tr><td>${esc((HV.themes[k]||{}).n||k)}</td><td>${st(v)}</td><td style="white-space:normal;font-size:12.5px">${esc(why)}</td><td class="r num ${cls(r.ex)}">${isNum(r.ex)?`${fkSig(r.ex)} <span class="muted" style="font-size:11px">${esc(r.etf)}−${esc(r.bench)}</span>${ok===null?'':ok?' ✓':' ✗'}`:'<span class="muted">bekliyor</span>'}</td></tr>`}).join('')}</tbody></table></div>`:''}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:8px"><div><b class="up">Güçlü yanlar</b><ul style="margin:4px 0;padding-left:18px">${(h.strengths||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div><b class="down">Riskler</b><ul style="margin:4px 0;padding-left:18px">${(h.risks||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div></div></details>`}).join('');
  return `<section class="card sec"><h3>Büyük yöneticiler ne diyor?<span class="r muted" style="font-size:12px">${HV.houses.length} kurum · güncelleme ${esc(trDate((HV.updatedAt||H.updatedAt)+'T12:00:00Z',{day:'numeric',month:'short'}))}${HV.autoRun?` · otomatik kontrol ${esc(trDate(HV.autoRun.at,{day:'numeric',month:'short'}))} (her cuma)`:' · her cuma otomatik kontrol'}</span></h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 8px">Uzlaşı: geçerli (ufku dolmamış) olumlu görüş sayısı − olumsuz görüş sayısı. Satırın üstüne gelince gerekçe görünür.</p>${consTbl}
    <h4 style="margin:16px 0 4px">Kurum kurum: görüş, gerekçe ve karne</h4>${cards}
    <p class="muted" style="font-size:12px;margin:8px 0 0;line-height:1.5"><b>Karne:</b> her görüşün yayın tarihinden bu yana temanın ETF'si karşılaştırma ölçütüne göre ne yaptı (✓ görüş yönünde, ✗ tersi). Büyük kurumların kısa vadeli görünümleri sık yanılır; uzlaşı bir bağlamdır, alım sinyali değil. BlackRock ve Vanguard'ın 13F bildirimleri çoğunlukla endeks fonlarından oluştuğu için "neyi alıyorlar" sorusu piyasa ağırlığını izlemekten farksızdır; bu yüzden görüşleri, yayımladıkları görünümlerden alındı.</p></section>`}
function fkWeekly(){const W=S.ideas&&S.ideas.weekly;if(!W)return `<section class="card sec"><h3>Haftanın listesi</h3><p class="muted">İlk haftalık liste cumartesi sabahı (cuma kapanışıyla) yayımlanacak.</p></section>`;
  const L=W.lists||{};const lab={guclu:'Haftalık · güçlü',cesit:'Haftalık · çeşitlendirici'};
  const part=(kind,title)=>{const g=(L[kind]&&L[kind].guclu)||[],c=(L[kind]&&L[kind].cesit)||[];
    return `<h4 style="margin:14px 0 2px">${title}</h4>${g.map(x=>fkItem({x,kind,lab:lab.guclu})).join('')||'<div class="muted">Kalıcı aday yok</div>'}${c.length?`<div class="muted" style="font-size:12.5px;margin-top:10px">Portföyünü çeşitlendirenler (korelasyon &lt; 0,5)</div>${c.map(x=>fkItem({x,kind,lab:lab.cesit})).join('')}`:''}`};
  return `<section class="card sec"><h3>Haftanın listesi · ${esc(W.week)}<span class="r muted" style="font-size:12px">${esc(trDate(W.date+'T12:00:00Z',{day:'numeric',month:'long'}))} kapanışıyla · hafta boyunca sabit</span></h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 4px">${esc(W.rule)}. Günlük liste her sabah değişebilir; bu liste yalnızca istikrarlı adayları tutar.</p>
    ${part('stock','Hisseler')}${part('etf','ETF\'ler')}</section>`}
function viewIdeas(){
  if(S.ideas===undefined){fkLoad(()=>{if(/fikirler/.test(location.hash))render(false)});return '<div class="muted">Yükleniyor…</div>'}
  const I=S.ideas;if(!I)return `<div class="empty"><b>Fikir listesi henüz oluşmadı</b>Her iş günü sabahı (TR ~07:15) güncellenir.</div>`;const L=I.lists;
  const sec=(kind,lab)=>`<section class="card sec"><h3>${lab} · güçlü adaylar<span class="r muted" style="font-size:12px">${I.universe[kind]} ${kind==='etf'?'ETF':'hisse'} arasından</span></h3>${(L[kind].guclu||[]).map(x=>fkItem({x,kind,lab:'Güçlü aday'})).join('')||'<div class="muted">Yok</div>'}
    <h4 style="margin:16px 0 4px">Portföyünü çeşitlendirenler (korelasyon &lt; 0,5)</h4>${(L[kind].cesit||[]).map(x=>fkItem({x,kind,lab:'Çeşitlendirici'})).join('')||'<div class="muted">Şu an trend filtresini geçen düşük korelasyonlu aday yok.</div>'}
    <details style="margin-top:12px"><summary class="muted" style="cursor:pointer">İlk 30 sıralama</summary>${fkTable(L[kind].all,kind)}</details></section>`;
  return `<div class="fade"><div class="sec-t" style="margin-top:0"><div><h2>Günün fikirleri</h2><p>Kanıta dayalı günlük hisse ve ETF adayları · ${esc(trDate(I.asOf+'T12:00:00Z',{day:'numeric',month:'long'}))} kapanışıyla · portföydekiler hariç</p></div></div>
  ${fkWeekly()}
  ${sec('stock','Hisseler')}${sec('etf','ETF\'ler')}
  <section class="card sec"><h3>Kanıt: hisse yöntemi 2011'den bu yana</h3>${fkBT('stock')}</section>
  ${(()=>{const P=I.backtest&&I.backtest.stockParts;if(!P)return '';return `<section class="card sec"><h3>Denenip bırakılanlar<span class="r muted" style="font-size:12px">şeffaflık için</span></h3><div class="tscroll"><table class="tbl"><thead><tr><th>Etken</th><th class="r">Yıllık</th><th class="r">Evren</th><th class="r">Fark</th><th class="r">t</th><th class="r">En sert düşüş</th></tr></thead><tbody>
    ${[['eskiBilesik','Sürüm 1: momentum %60 + düşük oynaklık %40 (reddedildi)'],['dusukOynaklik','Yalnızca düşük oynaklık']].map(([k,l])=>{const x=P[k];return x?`<tr><td><b>${l}</b></td><td class="r num">${fkPct(x.cagr)}</td><td class="r num">${fkPct(x.cagrEW)}</td><td class="r num ${cls(x.cagr-x.cagrEW)}">${fkSig(x.cagr-x.cagrEW)}</td><td class="r num">${nf(x.t,1)}</td><td class="r num down">${fkPct(x.mdd)}</td></tr>`:''}).join('')}</tbody></table></div>
    ${(I.methodLog||[]).map(m=>`<p style="font-size:12.5px;margin:8px 0 0"><b>Sürüm ${m.v}</b> (${esc(m.from)}, ${esc(m.status)}): ${esc(m.stock)}. ${esc(m.result||m.why||'')}</p>`).join('')}<p class="muted" style="font-size:12px;margin:8px 0 0">Bugünün şirketlerinden kurulan evren oynak kazananları içerdiği için düşük oynaklık burada olduğundan kötü, momentum olduğundan iyi görünür. Yöntem değişikliği tarihiyle kayıtlıdır; canlı karne yalnızca geçerli sürümün önerilerini sayar.</p></section>`})()}
  <section class="card sec"><h3>Kanıt: ETF yöntemi 2011'den bu yana</h3>${fkBT('etf')}</section>
  ${fkHouses()}
  <section class="card sec"><h3>Canlı karne<span class="r muted" style="font-size:12px">bu listeler gerçekte ne yapıyor</span></h3>${fkLive()}</section>
  <section class="card sec"><h3>Yöntem</h3><div class="note" style="line-height:1.65">
    <p><b>Hisse:</b> ${esc(I.method.stock)}. <b>ETF:</b> ${esc(I.method.etf)}. Yöntem önceden sabitlendi; puanlanan ne ise geriye dönük test edilen de o.</p>
    <p><b>Neden bu etkenler?</b> Momentum (son 12 ayın kazananlarının bir süre daha iyi gitme eğilimi), düşük oynaklık ve trend, akademik literatürde farklı ülke ve dönemlerde en çok tekrar edilmiş bulgular arasında (Jegadeesh &amp; Titman 1993; Asness, Moskowitz &amp; Pedersen 2013; Frazzini &amp; Pedersen 2014; Moskowitz, Ooi &amp; Pedersen 2012). Bu bir ortalama eğilim; tek tek hisselerde ve kısa dönemlerde sık sık çalışmaz, momentum sert dönüşlerde ani kayıplar verebilir.</p>
    <p><b>Kanıtı nasıl okumalı?</b> Evren bugünkü şirketlerden oluştuğu için (geçmişte batanlar yok) hem yöntemin hem eşit ağırlıklı evrenin getirisi şişer; anlamlı olan ikisi arasındaki <b>fark</b>. 10 hisselik seçki, 200 hisselik evrenden doğal olarak daha oynaktır.</p>
    <p><b>Sana özel:</b> ${esc(I.method.fit)}. Riskin büyük kısmı tek temadaysa çeşitlendirici adaylar portföy riskini dağıtmaya daha çok yarar. Yatırım tavsiyesi değildir; son karar senin.</p></div></section></div>`}
function afterIdeasPage(){afterIdeas();const I=S.ideas;if(!I||typeof lineChart!=='function')return;
  ['stock','etf'].forEach(k=>{const B=I.backtest&&I.backtest[k];const el=$('#fkC_'+k);if(!B||!el)return;
    const ser=[['Yöntem','#b8f25c',1],['Evren (eşit ağırlık)','#c6ceda',2],['SPY','#8b7bff',3]].map(([n,c,j])=>({name:n,color:c,pts:B.curve.map(p=>[p[0],Math.log10(p[j]*100)])}));
    try{lineChart(el,ser,{fmt:v=>nf(Math.pow(10,v),0),xfmt:d=>d.slice(0,4)})}catch(e){console.error(e)}})}
