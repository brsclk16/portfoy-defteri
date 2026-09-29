/* Portföy Defteri — ücretsiz dış kaynaklar: makro rejim (FRED), spekülatör pozisyonu (CFTC), opsiyon beklenen hareket + VIX vade yapısı (CBOE),
   olay olasılıkları (Polymarket), açığa satış hacmi (FINRA), TL mevduat (TCMB EVDS), kâğıt üzerinde canlı takip, veri kaynağı durumu */
"use strict";
function lastOf(a){return a&&a.length?a[a.length-1]:null}
function valAt(a,d){let v=null;for(const p of a||[]){if(p[0]>d)break;v=p[1]}return v}
function pctRank(arr,v){const a=arr.filter(isNum);if(!a.length||!isNum(v))return null;return a.filter(x=>x<=v).length/a.length*100}

/* ================= TL mevduat (EVDS) ================= */
function depRateFn(){const E=S.evds&&S.evds.series;const s=E&&((E.m3&&E.m3.length?E.m3:null)||(E.m1&&E.m1.length?E.m1:null));
  const user=(S.settings.depositRate!=null&&S.settings.depositRate!=='')?+S.settings.depositRate:null;
  if(user!=null||!s)return {fn:()=>(user!=null?user:((S.macro&&S.macro.deposit&&S.macro.deposit.annualGross)||40)),src:user!=null?'ayarlardaki sabit oran':'sabit varsayım',last:user!=null?user:((S.macro&&S.macro.deposit&&S.macro.deposit.annualGross)||40)};
  const name=(S.evds.names&&S.evds.names[E.m3&&E.m3.length?'m3':'m1'])||'TCMB TL mevduat';
  return {fn:d=>{const v=valAt(s,d);return v!=null?v:s[0][1]},src:'TCMB EVDS · '+name,last:lastOf(s)[1],asOf:lastOf(s)[0]}}

/* ================= makro rejim (FRED) ================= */
function fredS(id){return (S.fred&&S.fred.series&&S.fred.series[id])||[]}
function regimeAt(d){const lag=x=>{const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()-x);return t.toISOString().slice(0,10)};const dl=lag(7);
  const hy=fredS('BAMLH0A0HYM2'),nf_=fredS('NFCI'),vix=fredS('VIXCLS'),sahm=fredS('SAHMREALTIME'),cur=fredS('T10Y3M'),usd=fredS('DTWEXBGS');
  const v=(s,dd)=>valAt(s,dd||dl);const hyNow=v(hy),hy13=v(hy,lag(98));const usdNow=v(usd),usd13=v(usd,lag(98));
  const C=[];const add=(k,n,val,score,txt)=>C.push({k,n,val,score,txt});
  if(hyNow!=null){const ch=hy13!=null?(hyNow-hy13)*100:null;add('hy','Yüksek getirili tahvil spreadi',hyNow,hyNow>5.5||(ch!=null&&ch>100)?-1:hyNow<3.5&&(ch==null||ch<25)?1:0,`%${nf(hyNow,2)}${ch!=null?` · 13 haftada ${ch>0?'+':''}${nf(ch,0)} bp`:''}`)}
  const nfc=v(nf_);if(nfc!=null)add('nfci','Finansal koşullar (Chicago Fed)',nfc,nfc>0?-1:nfc<-0.35?1:0,`${nf(nfc,2)} ${nfc>0?'(sıkı)':nfc<-0.35?'(gevşek)':'(normal)'}`);
  const vx=v(vix,lag(1));if(vx!=null)add('vix','VIX',vx,vx>25?-1:vx<16?1:0,nf(vx,1));
  const sh=v(sahm,lag(35));if(sh!=null)add('sahm','Sahm kuralı (işsizlik)',sh,sh>=0.5?-1:sh<0.2?1:0,`${nf(sh,2)} ${sh>=0.5?'· resesyon sinyali':''}`);
  const cv=v(cur);if(cv!=null)add('curve','Getiri eğrisi 10Y−3A',cv,cv<-0.25?-1:0,`${cv>0?'+':''}${nf(cv*100,0)} bp`);
  if(usdNow!=null&&usd13){const ch=(usdNow/usd13-1)*100;add('usd','Geniş dolar endeksi 13 hafta',ch,ch>3?-1:ch<-2?1:0,pct(ch,1))}
  const sc=C.reduce((s,x)=>s+x.score,0);return {C,score:sc,label:sc>=2?'Risk iştahı açık':sc<=-2?'Risk iştahı kapalı':'Nötr',cls:sc>=2?'up':sc<=-2?'down':'n'}}
function regimeHist(){if(S._rh&&S._rh.k===(S.fred&&S.fred.updatedAt))return S._rh.v;const w=fredS('NFCI').map(p=>p[0]).filter(d=>d>='2017-01-01');
  const v=w.map(d=>[d,regimeAt(d).score]);S._rh={k:S.fred&&S.fred.updatedAt,v};return v}
function regimeCard(){if(!S.fred)return '';const R=regimeAt(new Date().toISOString().slice(0,10));if(!R.C.length)return '';
  const H=regimeHist();const hyN=fredS('BAMLH0A0HYM2').length;const tk=allTickers().filter(t=>!inst(t)||!inst(t).watchlist).concat(['SPY']).filter((t,i,a)=>a.indexOf(t)===i&&closeSeries(t).length>200);
  const fwd=(t,d)=>{const s=closeSeries(t);const a=valAt(s,d);const t2=new Date(d+'T12:00:00Z');t2.setUTCDate(t2.getUTCDate()+28);const b=valAt(s,t2.toISOString().slice(0,10));return a&&b&&t2<new Date()?(b/a-1)*100:null};
  const rows=tk.map(t=>{const g={on:[],neu:[],off:[]};H.forEach(([d,sc])=>{const r=fwd(t,d);if(r==null)return;(sc>=2?g.on:sc<=-2?g.off:g.neu).push(r)});const m=a=>a.length>=6?a.reduce((s,x)=>s+x,0)/a.length:null;return {t,on:m(g.on),neu:m(g.neu),off:m(g.off),n:[g.on.length,g.neu.length,g.off.length]}});
  const cnt=[H.filter(x=>x[1]>=2).length,H.filter(x=>x[1]>-2&&x[1]<2).length,H.filter(x=>x[1]<=-2).length];
  return `<section class="card sec"><h3>Makro rejim <span class="chip ${R.cls}">${R.label}</span> <span class="r muted" style="font-size:12px">skor ${R.score>0?'+':''}${R.score} · FRED, ${esc(trDT(S.fred.updatedAt))}</span></h3>
  <table class="tbl wrap"><tbody>${R.C.map(c=>`<tr><td>${c.score>0?'🟢':c.score<0?'🔴':'⚪'} ${esc(c.n)}</td><td class="r num">${esc(c.txt)}</td></tr>`).join('')}</tbody></table>
  <div class="spark-reg">${spark(H.map(x=>[x[0],x[1]]),600,40,'#8b95a5')}</div>
  <h4 style="margin:14px 0 6px">Rejime göre sonraki 4 haftanın ortalama getirisi <span class="muted" style="font-weight:400;font-size:12px">(2017'den beri; açık ${cnt[0]} · nötr ${cnt[1]} · kapalı ${cnt[2]} hafta; 6 haftadan az örnekte —)</span></h4>
  <div class="tscroll"><table class="tbl"><thead><tr><th>Enstrüman</th><th class="r">Risk açık</th><th class="r">Nötr</th><th class="r">Risk kapalı</th></tr></thead><tbody>
  ${rows.map(r=>`<tr><td><b>${esc(dispT(r.t))}</b></td>${['on','neu','off'].map(k=>`<td class="r num ${cls(r[k])}">${r[k]==null?'—':pct(r[k],1)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
  <p class="muted" style="font-size:12px;margin:8px 0 0">Her gösterge +1 / 0 / −1 puan; toplam +2 ve üstü "açık", −2 ve altı "kapalı". Veriler yayın gecikmesine karşı 1 hafta geriden okunur. Tahvil spreadi FRED'de yalnızca son 3 yıl için yayımlandığından daha eski haftalar diğer 5 göstergeyle puanlanır. Geçmiş rejim ortalamaları örnek sayısı az olduğu için kaba bir yön gösterir, tahmin değildir.</p></section>`}

/* ================= CFTC ================= */
const COT_MAP={IAU:'GOLD',GLD:'GOLD',SLV:'SILVER',COPX:'COPPER',CPER:'COPPER'};const COT_N={GOLD:'Altın',SILVER:'Gümüş',COPPER:'Bakır'};
function cotInfo(k){const a=S.cot&&S.cot.data&&S.cot.data[k];if(!a||a.length<60)return null;const L=a[a.length-1],P=a[a.length-2];const w=a.slice(-156).map(x=>x[1]);
  const idx=(L[1]-Math.min(...w))/((Math.max(...w)-Math.min(...w))||1)*100;return {d:L[0],net:L[1],chg:P?L[1]-P[1]:null,oi:L[2],pctOI:L[1]/L[2]*100,idx,spark:a.slice(-104).map(x=>[x[0],x[1]])}}
function cotCard(t){const k=COT_MAP[t];if(!k)return '';const c=cotInfo(k);if(!c)return '';
  const msg=c.idx>=85?'Spekülatörler 3 yılın en uzun pozisyonlarına yakın: kalabalık işlem, olumsuz haberde hızlı çözülme riski.':c.idx<=15?'Spekülatörler 3 yılın en kısa pozisyonlarına yakın: kötü haber büyük ölçüde fiyatlanmış olabilir.':'Pozisyonlanma aşırı uçta değil.';
  return `<section class="card sec"><h3>${COT_N[k]} vadelilerinde spekülatör pozisyonu <span class="r muted" style="font-size:12px">CFTC · ${esc(c.d)}</span></h3>
  <div class="btk"><div><span>Net uzun (kontrat)</span><b>${nf(c.net,0)}</b></div><div><span>Haftalık değişim</span><b class="${cls(c.chg)}">${c.chg>0?'+':''}${nf(c.chg,0)}</b></div><div><span>Açık pozisyona oranı</span><b>%${nf(c.pctOI,0)}</b></div><div><span>3 yıllık endeks</span><b>${nf(c.idx,0)}/100</b></div></div>
  <div style="margin-top:6px">${spark(c.spark,600,36,'#ffc35c')}</div><p class="muted" style="font-size:12.5px;margin:6px 0 0">${msg}</p></section>`}
function cotSummary(){if(!S.cot)return '';const L=Object.keys(COT_N).map(k=>[k,cotInfo(k)]).filter(x=>x[1]);if(!L.length)return '';
  return `<section class="card sec"><h3>Emtia pozisyonlanması <span class="r muted" style="font-size:12px">CFTC haftalık · spekülatör net pozisyonu, 3 yıllık aralıkta nerede</span></h3>
  ${L.map(([k,c])=>`<div class="th" style="display:grid;grid-template-columns:70px 1fr 60px;gap:8px;align-items:center;margin:6px 0"><span>${COT_N[k]}</span><span class="meter"><i style="left:${c.idx}%"></i></span><b class="num">${nf(c.idx,0)}</b></div>`).join('')}
  <p class="muted" style="font-size:12px;margin:6px 0 0">0 = son 3 yılın en az uzun, 100 = en çok uzun. 85 üstü kalabalık, 15 altı terk edilmiş.</p></section>`}

/* ================= CBOE opsiyon ================= */
function optOf(t){return S.options&&S.options.data&&S.options.data[t]}
function emFor(t,dateISO){const O=optOf(t);if(!O)return null;const d=dateISO.slice(0,10);const e=O.exp.find(x=>x[0]>=d);return e?{exp:e[0],em:e[1],iv:e[2],dte:e[3]}:null}
function optCard(t){const O=optOf(t);if(!O)return '';const w=O.exp.find(x=>x[3]>=5)||O.exp[0],m=O.exp.find(x=>x[3]>=25)||O.exp[O.exp.length-1];
  const ne=(typeof upcomingEarnings==='function'?upcomingEarnings(60):[]).find(e=>e.t===t);const em=ne?emFor(t,ne.date):null;const st=ne&&typeof earnStats==='function'?earnStats(t):null;
  return `<section class="card sec"><h3>Opsiyon piyasası ne bekliyor <span class="r muted" style="font-size:12px">CBOE gecikmeli · ${esc(S.options.asOf||'')}</span></h3>
  <div class="btk">${w?`<div><span>~1 hafta (${esc(w[0])})</span><b>±%${nf(w[1],1)}</b></div>`:''}${m?`<div><span>~1 ay (${esc(m[0])})</span><b>±%${nf(m[1],1)}</b></div>`:''}<div><span>Ima oynaklık (ATM)</span><b>%${nf((m||w)[2],0)}</b></div>${O.pcrOI!=null?`<div><span>Put/call (açık poz.)</span><b>${nf(O.pcrOI,2)}</b></div>`:''}${O.skew25!=null?`<div><span>Put çarpıklığı</span><b>${O.skew25>0?'+':''}${nf(O.skew25,1)} puan</b></div>`:''}</div>
  ${em?`<p style="margin:8px 0 0">📅 Bilanço (${esc(new Date(ne.date).toLocaleDateString('tr-TR',{day:'numeric',month:'short'}))}) sonrası ilk vade <b>${esc(em.exp)}</b>: opsiyonlar <b>±%${nf(em.em,1)}</b> hareket fiyatlıyor${st?`; son ${st.n} bilançoda ilk gün ortalama <b>±%${nf(st.avgAbs,1)}</b> oldu → ${em.em>st.avgAbs*1.25?'piyasa geçmişten <b>büyük</b> bir hareket bekliyor':em.em<st.avgAbs*0.8?'piyasa geçmişten <b>küçük</b> bir hareket bekliyor':'beklenti geçmişe yakın'}`:''}. <span class="muted" style="font-size:12px">(vade bilançodan sonraki birkaç günü de içerir)</span></p>`:''}
  <p class="muted" style="font-size:12px;margin:6px 0 0">Beklenen hareket: vadeye en yakın başa-baş alım + satım opsiyonunun (straddle) fiyatı / hisse fiyatı. Put çarpıklığı: %25 delta put ile call oynaklık farkı; yüksekse piyasa düşüşe karşı korunmaya para ödüyor.</p></section>`}
function vixTermCard(){const V=S.options&&S.options.vix;if(!V||!V.VIX)return '';const r=V.VIX3M?V.VIX/V.VIX3M:null;
  const pts=[['9 gün',V.VIX9D],['30 gün',V.VIX],['3 ay',V.VIX3M],['6 ay',V.VIX6M]].filter(x=>x[1]);const mx=Math.max(...pts.map(x=>x[1]));
  return `<section class="card sec"><h3>VIX vade yapısı <span class="r muted" style="font-size:12px">CBOE · ${esc(S.options.asOf||'')}</span></h3>
  <div class="vixt">${pts.map(p=>`<div><i style="height:${p[1]/mx*100}%"></i><b class="num">${nf(p[1],1)}</b><span>${p[0]}</span></div>`).join('')}</div>
  <p style="margin:8px 0 0">${r==null?'':r>=1?`<b class="down">Ters yapı</b> (VIX/VIX3M ${nf(r,2)}): kısa vadeli korku uzun vadeliden yüksek; tarihsel olarak stres anlarında görülür.`:r>0.9?`<b>Düzleşmiş</b> (VIX/VIX3M ${nf(r,2)}): tedirginlik artıyor.`:`<b class="up">Normal yapı</b> (VIX/VIX3M ${nf(r,2)}): piyasa sakin.`}${V.VVIX?` VVIX ${nf(V.VVIX,0)}${V.VVIX>110?' (oynaklığın oynaklığı yüksek)':''}.`:''}</p></section>`}

/* ================= Polymarket ================= */
function pmCard(limit){const P=S.pm&&S.pm.events;if(!P||!P.length)return '';const H=S.pm.hist||{};
  const ch=id=>{const h=H[id]||[];if(h.length<2)return null;const L=h[h.length-1];const d7=new Date(L[0]+'T12:00:00Z');d7.setUTCDate(d7.getUTCDate()-7);const p=valAt(h,d7.toISOString().slice(0,10));return p!=null?(L[1]-p)*100:null};
  return `<section class="card sec"><h3>Olasılıklar (tahmin piyasası) <span class="r muted" style="font-size:12px">Polymarket · gerçek parayla fiyatlanan olasılıklar</span></h3>
  ${P.slice(0,limit||10).map(e=>{const M=e.markets.slice().sort((a,b)=>b.yes-a.yes).slice(0,e.markets.length>2?4:1);
    return `<div class="pmi"><div class="pmt"><a href="https://polymarket.com/event/${esc(e.slug)}" target="_blank" rel="noopener">${esc(e.title)}</a> <span class="muted" style="font-size:11.5px">$${nf(e.vol/1e6,1)} mn hacim${e.end?' · '+esc(e.end):''}</span></div>
    ${M.map(m=>{const c=ch(m.id);return `<div class="pmo"><span>${esc(m.label||(e.markets.length===1?'Evet':m.q))}</span><span class="meter pm"><i style="width:${m.yes*100}%"></i></span><b class="num">%${nf(m.yes*100,m.yes<0.1?1:0)}</b><span class="num muted ${c==null?'':c>0?'up':c<0?'down':''}" style="font-size:11.5px">${c==null||Math.abs(c)<0.5?'':(c>0?'+':'')+nf(c,0)+' puan/7g'}</span></div>`}).join('')}</div>`}).join('')}
  <p class="muted" style="font-size:12px;margin:6px 0 0">Olasılık = pazarda "Evet" payının fiyatı. Düşük hacimli pazarlar yanıltıcı olabilir; bilgi amaçlıdır.</p></section>`}

/* ================= FINRA açığa satış hacmi ================= */
function svInfo(t){const a=S.shortvol&&S.shortvol.data&&S.shortvol.data[t==='NOVO.B'?'NVO':t];if(!a||a.length<25)return null;const r=a.map(x=>x[2]?x[1]/x[2]*100:null).filter(isNum);
  const m=(arr)=>arr.reduce((s,x)=>s+x,0)/arr.length;const r5=m(r.slice(-5)),r60=m(r.slice(-60));const sd=Math.sqrt(m(r.slice(-60).map(x=>(x-r60)**2)));return {r5,r60,z:sd?(r5-r60)/sd*Math.sqrt(5):null,d:a[a.length-1][0]}}

/* ================= kâğıt üzerinde canlı takip ================= */
async function ghGetJSON(path){const tok=(S.settings.ghToken||'').trim();if(!tok)return null;const r=await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${path}?ref=main`,{headers:{Authorization:'Bearer '+tok,Accept:'application/vnd.github.raw+json'}});return r.ok?r.json():null}
async function paperAdd(cfg,txt){if(!(S.settings.ghToken||'').trim()){toast('Önce Ayarlar\'a GitHub anahtarını gir');return false}
  let P=null;try{P=await ghGetJSON('data/paper.json')}catch(e){}P=P||{items:[]};const D=vData();const start=D.dates[D.dates.length-1];
  const it={id:Date.now().toString(36),txt,cfg:JSON.parse(JSON.stringify(cfg)),start,createdAt:new Date().toISOString()};P.items=(P.items||[]).concat(it);P.updatedAt=it.createdAt;
  const ok=await ghPutJSON('data/paper.json',P,'Kâğıt üzerinde takip: yeni strateji');if(ok){S.paper=P;toast('Canlı takibe alındı · başlangıç '+start)}else toast('Kaydedilemedi');return ok}
function paperCard(){const L=(S.paper&&S.paper.items)||[];const D=vData();
  return `<section class="card sec"><h3>Kâğıt üzerinde canlı takip <span class="r muted" style="font-size:12px">backtest değil: başlangıçtan sonraki gerçek günler</span></h3>
  ${L.length&&D?`<div class="tscroll"><table class="tbl"><thead><tr><th>Strateji</th><th>Başlangıç</th><th class="r">Gün</th><th class="r">Getiri</th><th class="r">SPY</th><th class="r">Fark</th></tr></thead><tbody>${L.map(p=>{const i0=D.dates.indexOf(p.start);const i1=D.dates.length-1;
    if(i0<0||i1-i0<1)return `<tr><td style="font-size:12.5px">${esc(p.txt)}</td><td>${esc(p.start)}</td><td class="r">0</td><td colspan="3" class="muted">ilk işlem günü bekleniyor</td></tr>`;
    const B=vBacktest(p.cfg,i0,i1);const s=B&&B.curve.length?{tot:(B.curve[B.curve.length-1][1]/100-1)*100,spy:(B.spyCurve[B.spyCurve.length-1][1]/100-1)*100}:null;
    return `<tr><td style="font-size:12.5px">${esc(p.txt)}</td><td>${esc(p.start)}</td><td class="r num">${i1-i0}</td><td class="r num ${cls(s&&s.tot)}">${s?pct(s.tot,1):'—'}</td><td class="r num">${s?pct(s.spy,1):'—'}</td><td class="r num ${cls(s&&s.tot-s.spy)}">${s?pct(s.tot-s.spy,1):'—'}</td></tr>`}).join('')}</tbody></table></div>`:'<p class="muted">Henüz canlı takipte strateji yok. Doğrulamadan geçen bir stratejiyi "Canlı takibe al" ile ekle.</p>'}
  <p class="muted" style="font-size:12px;margin:6px 0 0">Kayıt herkese açık depoya tarih damgalı commit olarak yazılır; sonradan değiştirilemez. Bu, geriye dönük uydurmanın mümkün olmadığı tek test: aylar içinde stratejinin gerçekten çalışıp çalışmadığını gösterir.</p></section>`}

/* ================= veri kaynakları durumu ================= */
const DS_N={edgar:['SEC EDGAR','bilanço (dosyalama tarihli)'],fred:['FRED','makro rejim'],cot:['CFTC','emtia pozisyonları'],cboe:['CBOE','opsiyon + VIX'],pm:['Polymarket','olay olasılıkları'],finra:['FINRA','açığa satış hacmi'],evds:['TCMB EVDS','TL mevduat faizi']};
function sourcesCard(){const D=S.diag;if(!D)return '';
  return `<section class="card sec"><h3>Ücretsiz veri kaynakları <span class="r muted" style="font-size:12px">GitHub Actions, her iş günü</span></h3>
  <table class="tbl wrap"><tbody>${Object.entries(DS_N).map(([k,[n,d]])=>{const x=D[k];const sk=x&&x.info&&x.info.skipped;return `<tr><td><b>${n}</b> <span class="muted" style="font-size:12px">${d}</span></td><td>${!x?'<span class="muted">henüz çalışmadı</span>':sk?`<span class="chip warnc">ayar bekliyor</span> <span class="muted" style="font-size:12px">${esc(sk)}</span>`:x.ok?`<span class="chip up">çalışıyor</span> <span class="muted" style="font-size:12px">${esc(trDT(x.at))}</span>`:`<span class="chip down">hata</span> <span class="muted" style="font-size:12px">${esc(x.err||'')}</span>`}</td></tr>`}).join('')}</tbody></table>
  <details class="qa"><summary class="qq">Anahtar gerektirenleri açma (EVDS, SEC, Telegram)</summary><div class="prose" style="font-size:13px">
   <p>Anahtarlar sitede değil, GitHub'da gizli ayar olarak saklanır: github.com/brsclk16/portfoy-defteri → <b>Settings → Secrets and variables → Actions → New repository secret</b>.</p>
   <p><b>EVDS_KEY</b>: evds3.tcmb.gov.tr → üye ol → profil → API anahtarı.<br><b>SEC_UA</b>: <code>Ad Soyad eposta@adresin.com</code> (SEC gerçek iletişim bilgisi istiyor; sadece istek başlığında gider).<br><b>TG_TOKEN</b>: Telegram'da @BotFather → /newbot → verilen token. <b>TG_CHAT</b>: botuna bir mesaj at, sonra @userinfobot'tan kendi sohbet numaranı öğren.</p>
   <p>Telegram ayarlanınca alarm seviyeleri, iz süren stoplar ve kurallar ABD seansında 15 dakikada bir (CBOE 15 dk gecikmeli fiyatla) kontrol edilir; tetiklenen anında telefonuna gelir.</p></div></details></section>`}
