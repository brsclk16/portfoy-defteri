/* Portföy Defteri — sinyal karnesi: sitenin kendi ürettiği sinyallerin canlı kaydı ve 5 / 21 / 63 işlem günü sonraki sonucu.
   Veri: data/signals.json (tools/signal_log.mjs, her iş günü kapanıştan sonra GitHub Actions'ta). */
"use strict";
const SK_H=[5,21,63],SK_HL={5:'1 hafta',21:'1 ay',63:'3 ay'};
function skVerdict(x){
  if(!x||!x.n)return ['n','Sonuç bekleniyor'];
  if(x.n<20)return ['n',`Veri birikiyor (${x.n}/20)`];
  if(x.t==null||x.vsBase==null)return ['n','Taban oran yok'];
  if(x.vsBase>0&&x.t>=2)return ['up','İşe yarıyor'];
  if(x.vsBase<0&&x.t<=-2)return ['down','Ters çalışıyor'];
  return ['warnc','Rastgeleden ayırt edilemez'];
}
function skSigned(v,d=1){return isNum(v)?`${v>0?'+':v<0?'−':''}${nf(Math.abs(v),d)}`:'—'}
function skCell(x){
  if(!x||!x.n)return '<td class="r muted">—</td>';
  return `<td class="r"><div class="num ${cls(x.vsBase)}" style="font-weight:600">${skSigned(x.vsBase)}</div>
    <div class="muted" style="font-size:11.5px;line-height:1.4">sinyal ${skSigned(x.edge)} · rastgele ${skSigned(x.base)}<br>isabet %${nf(x.hit,0)} · ${x.n} olay</div></td>`;
}
function skTable(rows,title,sub){
  if(!rows.length)return '';
  return `<section class="card sec"><h3>${esc(title)}<span class="r muted" style="font-size:12px">${esc(sub)}</span></h3><div class="tscroll"><table class="tbl"><thead><tr>
    <th>Sinyal</th><th class="r">Olay</th>${SK_H.map(h=>`<th class="r">${SK_HL[h]} katkı</th>`).join('')}<th>Karar (1 ay)</th></tr></thead><tbody>
    ${rows.map(g=>{const [c,txt]=skVerdict(g.h['21']);return `<tr><td><b>${esc(g.name)}</b></td><td class="r num">${g.n}</td>${SK_H.map(h=>skCell(g.h[h])).join('')}<td><span class="chip ${c}">${esc(txt)}</span></td></tr>`}).join('')}
    </tbody></table></div></section>`;
}
function skEvents(L){
  const ev=(L.events||[]).filter(e=>e.src==='canli').slice(0,40);
  if(!ev.length)return `<section class="card sec"><h3>Son canlı sinyaller</h3><div class="empty"><b>Henüz canlı sinyal yok</b>Kayıt her iş günü kapanıştan sonra yapılır; ilk sinyaller durum değiştikçe düşer.</div></section>`;
  const cell=(e,h)=>{const r=e.r&&e.r[h];if(!r)return '<td class="r muted" style="font-size:12px">bekliyor</td>';
    const v=e.dir?e.dir*r.ex:null;return `<td class="r num ${cls(v)}">${e.dir?skSigned(v):skSigned(r.ex)}</td>`};
  return `<section class="card sec"><h3>Son canlı sinyaller<span class="r muted" style="font-size:12px">sinyal yönünde SPY üstü getiri (puan)</span></h3><div class="tscroll"><table class="tbl"><thead><tr>
    <th>Tarih</th><th>Enstrüman</th><th>Sinyal</th><th class="r">Fiyat</th>${SK_H.map(h=>`<th class="r">${SK_HL[h]}</th>`).join('')}</tr></thead><tbody>
    ${ev.map(e=>`<tr><td class="num">${esc(trDate(e.d+'T12:00:00Z',{day:'numeric',month:'short'}))}</td><td><a href="#/t/${esc(e.t)}"><b>${esc(e.t)}</b></a></td>
      <td><span title="${esc(e.title||'')}">${e.dir>0?'▲':e.dir<0?'▼':'•'} ${esc(e.lbl)}</span></td><td class="r num">${nf(e.px)}</td>${SK_H.map(h=>cell(e,h)).join('')}</tr>`).join('')}
    </tbody></table></div></section>`;
}
function viewSinyalKarne(L){
  const sum=L.summary||[];const live=sum.filter(g=>g.src==='canli'),back=sum.filter(g=>g.src==='geri');
  const evL=(L.events||[]).filter(e=>e.src==='canli');const scored=evL.filter(e=>e.r&&e.r['21']).length;
  const first=evL.length?evL[evL.length-1].d:null;
  return `<div class="sec-t" style="margin-top:0"><div><h2>Sinyal karnesi</h2><p>Sitenin verdiği sinyaller tarih ve fiyatıyla kaydedilir, 1 hafta, 1 ay ve 3 ay sonra puanlanır · son kayıt ${esc(trDate((L.asOf||'')+'T12:00:00Z',{day:'numeric',month:'short'}))}</p></div></div>
  <div class="grid g3"><div class="card kpi"><div class="l">Canlı sinyal</div><div class="v">${evL.length}</div><div class="s">${first?'ilk kayıt '+esc(trDate(first+'T12:00:00Z',{day:'numeric',month:'short'})):'kayıt yeni başladı'}</div></div>
    <div class="card kpi"><div class="l">1 ayı dolan</div><div class="v">${scored}</div><div class="s">karar için sinyal türü başına en az 20</div></div>
    <div class="card kpi"><div class="l">Geriye dönük olay</div><div class="v">${(L.events||[]).length-evL.length}</div><div class="s">bugünkü kodla geçmişe uygulandı</div></div></div>
  ${skTable(live,'Canlı karne','o gün kaydedilen sinyaller · sonradan değiştirilemez')}
  ${skEvents(L)}
  ${skTable(back,'Geriye dönük karne','aynı kod geçmiş günlere uygulandı · karşılaştırma için')}
  <section class="card sec"><h3>Nasıl okunur?</h3><div class="note" style="line-height:1.65">
    <p><b>Katkı</b> asıl sayı: sinyalden sonraki getirinin SPY'dan farkı, <b>aynı hissede rastgele bir günün</b> aynı farkından ne kadar iyi? Bu hisseler son yıllarda SPY'ı zaten geçtiği için "sinyalden sonra SPY'ı geçti" demek tek başına bir şey kanıtlamaz; rastgele bir günde alsan da geçecektin.</p>
    <p><b>Sinyal</b>: sinyal yönünde SPY üstü getiri (alım sinyalinde hisse − SPY, ısınma ve stop kırılımında SPY − hisse). <b>Rastgele</b>: aynı hisselerde sıradan bir günün aynı yöndeki ortalaması. <b>İsabet</b>: sinyalin yönünde sonuçlanan olay oranı.</p>
    <p><b>Karar</b>: en az 20 olay ve katkının istatistiksel olarak sıfırdan ayrışması (t ≥ 2) gerekir. Olaylar vadede iç içe geçebildiği için bu ölçüt bile iyimserdir; "ayırt edilemez" sinyale para bağlamak, yazı tura atmaktan farksızdır.</p>
    <p><b>Stop kırılımı</b>: kapanışın bir önceki günün plan stopunun altına inmesi. <b>Canlı</b> kayıtlar herkese açık depoya o gün yazılır; <b>geriye dönük</b> karne bugünkü kodla üretildiği için iyimser olabilir. Giriş fiyatı sinyal günü kapanışıdır.</p>
  </div></section>`;
}
async function karneMount(){
  const el=$('#skr');if(!el)return;
  if(!S.sigCard)S.sigCard=await fetch('data/signals.json?t='+Math.floor(Date.now()/600000)).then(r=>r.ok?r.json():null).catch(()=>null);
  el.innerHTML=S.sigCard?viewSinyalKarne(S.sigCard):`<div class="empty"><b>Karne henüz oluşmadı</b>İlk kayıt her iş günü kapanıştan sonra (TR ~01:00) yapılır.</div>`;
}

/* ================= olay sonrası tarihsel oranlar (data/events.json, tools/build_events.py) ================= */
const EV_B=[['bp','Büyük olumlu tepki'],['p','Olumlu tepki'],['n','Olumsuz tepki'],['bn','Büyük olumsuz tepki']];
let evLoading=null;
function evLoad(rerender){
  if(S.events!==undefined||evLoading)return;
  evLoading=fetch('data/events.json?t='+Math.floor(Date.now()/600000)).then(r=>r.ok?r.json():null).catch(()=>null).then(j=>{S.events=j;evLoading=null;if(j&&rerender)rerender()});
}
function evOf(t){const E=S.events&&S.events.tickers;return E?(E[t==='NOVO.B'?'NVO':t]||null):null}
// yön kovaya göre okunur: olumlu tepkide t>0 devam, olumsuz tepkide t<0 devam
function evVerdict(x,pos){
  if(!x||!x.n)return ['n','Veri yok'];
  if(x.n<8)return ['n',`Az veri (${x.n})`];
  if(x.t==null||Math.abs(x.t)<2)return ['warnc','Rastgeleden ayırt edilemez'];
  return (x.t>0)===pos?['up','Hareket sürüyor']:['down','Hareket geri dönüyor'];
}
function skPct(v,d=1){return isNum(v)?`${v>0?'+':v<0?'−':''}%${nf(Math.abs(v),d)}`:'—'}
function evCellH(x){
  if(!x||!x.n)return '<td class="r muted">—</td>';
  return `<td class="r"><div class="num ${cls(x.vsBase)}" style="font-weight:600">${skSigned(x.vsBase)}</div>
    <div class="muted" style="font-size:11.5px;line-height:1.4">medyan ${skSigned(x.med)} · SPY'ı geçen %${nf(x.up,0)}<br>${x.n} vaka</div></td>`;
}
function evStockCard(t,T){
  const E=T.earn||{},ev=E.events||[];const I=T.ins||{};
  const rows=EV_B.map(([b,l])=>{const B=(E.buckets||{})[b]||{};const [c,txt]=evVerdict(B['21'],b==='bp'||b==='p');
    return `<tr><td><b>${l}</b></td>${SK_H.map(h=>evCellH(B[h])).join('')}<td><span class="chip ${c}">${esc(txt)}</span></td></tr>`}).join('');
  const last=ev.slice(-8).reverse();
  const insStats=(()=>{const L=I.events||[];if(!L.length)return `<p class="muted" style="margin:6px 0 0">${I.pending?`Form 4 taraması sürüyor (${I.pending} dosya kaldı, birkaç gecede tamamlanır). `:''}${I.since?`${esc(trDate(I.since+'T12:00:00Z',{month:'short',year:'numeric'}))} sonrasında `:''}yönetici ya da YK üyesinden kümelenmiş açık piyasa alımı bulunmadı${I.buys?` (${I.buys} tekil alım var, eşiğin altında)`:''}. Büyük şirketlerde içeriden alım nadirdir; çoğu işlem hisse ödülü ve satıştır.</p>`;
    const xs=L.map(e=>e.f['21']).filter(isNum),b21=(T.base||{})['21'];const avg=xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
    return `${avg!=null?`<p style="margin:4px 0 8px">${L.length} alım kümesi · 1 ay sonra SPY'a göre ortalama <b class="${cls(avg)}">${skSigned(avg)}</b> puan, rastgele gün ${skSigned(b21)} · katkı <b class="${cls(avg-(b21||0))}">${skSigned(avg-(b21||0))}</b>${xs.length<8?' <span class="muted">(az vaka, karar için yetersiz)</span>':''}</p>`:''}<div class="tscroll"><table class="tbl"><thead><tr><th>Açıklanma</th><th class="r">Kişi</th><th class="r">Tutar</th>${SK_H.map(h=>`<th class="r">${SK_HL[h]}</th>`).join('')}</tr></thead><tbody>${L.slice().reverse().map(e=>`<tr><td class="num">${esc(trDate(e.filed+'T12:00:00Z'))}</td><td class="r num">${e.people}</td><td class="r num">${usd(e.usd,0)}</td>${SK_H.map(h=>`<td class="r num ${cls(e.f[h])}">${e.f[h]==null?'—':skSigned(e.f[h])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`})();
  return `<section class="card sec"><h3>Olaylardan sonra ne oldu? <span class="r muted" style="font-size:12px">${esc(T.name||t)} · ${ev.length?ev.length+' bilanço · ilk '+esc(ev[0].d.slice(0,4)):'bilanço verisi yok'}</span></h3>
    ${ev.length?`<div class="grid g3"><div class="kpi mini"><div class="l">Tipik bilanço tepkisi</div><div class="v">±%${nf(E.medAbs,1)}</div><div class="s">SPY'a göre, mutlak medyan</div></div>
      <div class="kpi mini"><div class="l">Yukarı tepki</div><div class="v">%${nf(E.upShare,0)}</div><div class="s">bilançoların</div></div>
      <div class="kpi mini"><div class="l">Son tepki</div><div class="v ${cls(ev[ev.length-1].ex)}">${skPct(ev[ev.length-1].ex)}</div><div class="s">${esc(trDate(ev[ev.length-1].d+'T12:00:00Z'))}</div></div></div>
    <div class="tscroll" style="margin-top:12px"><table class="tbl"><thead><tr><th>Bilanço tepkisinden sonra</th>${SK_H.map(h=>`<th class="r">${SK_HL[h]} katkı</th>`).join('')}<th>1 ay sonucu</th></tr></thead><tbody>${rows}</tbody></table></div>
    <details style="margin-top:10px"><summary class="muted" style="cursor:pointer">Son 8 bilanço</summary><div class="tscroll"><table class="tbl"><thead><tr><th>Tepki günü</th><th class="r">Tepki</th>${SK_H.map(h=>`<th class="r">sonraki ${SK_HL[h]}</th>`).join('')}</tr></thead><tbody>
      ${last.map(e=>`<tr><td class="num">${esc(trDate(e.d+'T12:00:00Z'))}</td><td class="r num ${cls(e.ex)}">${skPct(e.ex)}</td>${SK_H.map(h=>`<td class="r num ${cls(e.f[h])}">${e.f[h]==null?'bekliyor':skSigned(e.f[h])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`
    :`<p class="muted">${esc(E.note||'Bilanço verisi yok.')}</p>`}
    <h4 style="margin:16px 0 6px">İçeriden alım kümeleri</h4>${insStats}
    <p class="muted" style="font-size:12px;margin:10px 0 0;line-height:1.5"><b>Katkı</b>: olaydan sonraki getirinin SPY'dan farkı eksi aynı hissede rastgele bir günün aynı farkı (puan). "Büyük" tepki: bu hissenin geçmiş tepkilerinin mutlak medyanından büyük. Karar için en az 8 vaka ve istatistiksel ayrışma (t ≥ 2) gerekir. Kaynak: SEC EDGAR (8-K Item 2.02, Form 4), Yahoo Finance.</p></section>`;
}
function evFundCard(t){
  const H=((S.data.instruments[t]||{}).holdings||[]).slice().sort((a,b)=>(b.w||0)-(a.w||0)).slice(0,8).map(h=>({...h,T:evOf(h.t)})).filter(h=>h.T&&h.T.earn&&(h.T.earn.events||[]).length);
  if(!H.length)return '';
  const v=(T,b)=>{const x=((T.earn.buckets||{})[b]||{})['21'];const [c,txt]=evVerdict(x,b==='bp');return `<td class="r num ${cls(x&&x.vsBase)}">${x&&x.n?skSigned(x.vsBase):'—'}</td><td><span class="chip ${c}">${esc(txt)}</span></td>`};
  return `<section class="card sec"><h3>Büyük holdinglerin bilanço davranışı <span class="r muted" style="font-size:12px">fonu en çok etkileyen şirketler</span></h3><div class="tscroll"><table class="tbl"><thead><tr><th>Şirket</th><th class="r">Ağırlık</th><th class="r">Tipik tepki</th><th class="r">Büyük olumlu → 1 ay</th><th></th><th class="r">Büyük olumsuz → 1 ay</th><th></th></tr></thead><tbody>
    ${H.map(h=>`<tr><td><b>${esc(h.t)}</b></td><td class="r num">%${nf(h.w,1)}</td><td class="r num">±%${nf(h.T.earn.medAbs,1)}</td>${v(h.T,'bp')}${v(h.T,'bn')}</tr>`).join('')}</tbody></table></div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">Katkı: bilanço tepkisinden sonraki 1 ayda SPY'a göre fark eksi rastgele gün (puan). Ayrıntı için şirketin sayfasına bak.</p></section>`;
}
function evMount(t){
  const el=$('#evc');if(!el)return;
  if(S.events===undefined){el.innerHTML='<div class="muted" style="margin-top:12px">Olay geçmişi yükleniyor…</div>';evLoad(()=>evMount(t));return}
  if(!S.events){el.innerHTML='';return}
  const T=evOf(t);el.innerHTML=T?evStockCard(t,T):evFundCard(t);
}
// bilanço yaklaşıyor kartı için tek satır
function evEarnLine(t){
  if(S.events===undefined){evLoad(()=>{if(/takvim|ozet|^#?\/?$/.test(location.hash)||!location.hash)render(false)});return ''}
  const T=evOf(t);const E=T&&T.earn;if(!E||!(E.events||[]).length)return '';
  const bp=((E.buckets||{}).bp||{})['21'],bn=((E.buckets||{}).bn||{})['21'];
  const part=(x,b,l)=>{if(!x||x.n<8)return '';const [c,txt]=evVerdict(x,b==='bp');return `<span>${l} sonrası 1 ay <b class="${cls(x.vsBase)}">${skSigned(x.vsBase)}</b> <span class="chip ${c}" style="font-size:11px;padding:1px 7px">${esc(txt)}</span></span>`};
  const s=[part(bp,'bp','Büyük olumlu tepki'),part(bn,'bn','büyük olumsuz tepki')].filter(Boolean);
  return s.length?`<div class="ep-k" style="margin-top:4px">${s.join('')}<span class="muted">${E.events.length} bilanço · rastgele güne göre</span></div>`:'';
}
