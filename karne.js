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
