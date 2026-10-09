/* Portföy Defteri — strateji doğrulama döngüsü:
   hipotez → kural → backtest → ret/iyileştir → stres → saklı dönem.
   Kabul kriterleri ilk denemeden önce kilitlenir; her deneme sayılır ve Sharpe deneme sayısına göre düzeltilir (deflated Sharpe);
   son dönem (saklı) geliştirme sırasında hiç kullanılmaz ve yalnızca bir kez açılır. Sadece fiyat faktörleri: o tarihte bilinmeyen veri yok. */
"use strict";
const VF=[
  ['mom61','Momentum 6-1','Son 6 ayın getirisi, son 1 ay hariç (kısa vadeli geri dönüşü dışlar)',126],
  ['mom121','Momentum 12-1','Son 12 ayın getirisi, son 1 ay hariç',252],
  ['mom3','Momentum 3 ay','Son 3 ayın getirisi',63],
  ['lowvol','Düşük oynaklık','Son 60 günün günlük oynaklığı ne kadar düşükse o kadar iyi',60],
  ['trend','Trend','Fiyatın 200 günlük ortalamaya uzaklığı',200],
  ['high','52 hafta zirveye yakınlık','Fiyat / son 1 yılın en yükseği',252],
  ['qual','Nakit akışı kalitesi','Son 4 çeyrek faaliyet nakit akışı / toplam varlık. Yalnızca o tarihte SEC\'e dosyalanmış bilançolar kullanılır; ETF\'ler ve dosyalama tarihi olmayan veriler dışarıda kalır',0]];
const VCRIT_DEF={excess:0,excess2x:0,maxdd:30,sharpe:1,top:40,alpha:0,dsr:90};
const VCRIT_TXT={excess:['SPY\'ı maliyet sonrası geçmeli','puan'],excess2x:['2x maliyette de SPY\'ı geçmeli','puan'],maxdd:['En büyük düşüş en fazla','%'],sharpe:['Sharpe (yıllık, Fed faizine göre) en az',''],top:['Tek enstrümanın getiriye katkısı en fazla','%'],alpha:['Beta düzeltmeli alfa (yıllık) en az','%'],dsr:['Deneme sayısına göre düzeltilmiş Sharpe güveni en az','%']};
const RF=0.04;
/* risksiz faiz: o günkü Fed politika faizi (FRED FEDFUNDS); veri yoksa %4 */
function vRf(d){const s=S.fred&&S.fred.series&&S.fred.series.FEDFUNDS;if(!s||!s.length||!d)return RF;if(d<s[0][0])return RF;let v=null;for(const p of s){if(p[0]>d)break;v=p[1]}return v==null?RF:v/100}

/* ---------- veri ---------- */
function vData(){const key=(S.longpx&&S.longpx.updatedAt)+'|'+(S.ohlc&&S.ohlc.SPY&&S.ohlc.SPY.length);if(S._vd&&S._vd.k===key)return S._vd.v;const v=vDataBuild();S._vd={k:key,v};return v}
/* uzun geçmiş (Yahoo, 2010'dan) varsa onu kullan; son günleri günlük ohlc'den tamamla */
function vDataBuild(){const Lp=S.longpx;if(Lp&&Lp.dates&&Lp.px&&Lp.px.SPY){const dates=Lp.dates.slice();const O=S.ohlc||{};const last=dates[dates.length-1];
    (O.SPY||[]).forEach(r=>{if(r[0]>last)dates.push(r[0])});const idx=Object.fromEntries(dates.map((d,i)=>[d,i]));const px={};
    Object.keys(Lp.px).forEach(t=>{const a=Lp.px[t].concat(new Array(dates.length-Lp.dates.length).fill(null));(O[t]||[]).forEach(r=>{const i=idx[r[0]];if(i!=null&&r[0]>last&&r[4]>0)a[i]=r[4]});px[t]=a});
    Object.keys(O).forEach(t=>{if(px[t]||!Array.isArray(O[t]))return;const a=new Array(dates.length).fill(null);O[t].forEach(r=>{const i=idx[r[0]];if(i!=null&&r[4]>0)a[i]=r[4]});px[t]=a});
    Object.values(px).forEach(a=>{let seen=false;for(let i=0;i<a.length;i++){if(a[i]!=null)seen=true;else if(seen&&i>0)a[i]=a[i-1]}});return {dates,px}}
  return vDataOhlc()}
function vDataOhlc(){const O=S.ohlc||{};const spy=O.SPY||[];if(spy.length<300)return null;const dates=spy.map(r=>r[0]);const idx=Object.fromEntries(dates.map((d,i)=>[d,i]));
  const px={};Object.keys(O).forEach(t=>{if(t==='updatedAt'||!Array.isArray(O[t]))return;const a=new Array(dates.length).fill(null);O[t].forEach(r=>{const i=idx[r[0]];if(i!=null&&r[4]>0)a[i]=r[4]});
    for(let i=1;i<a.length;i++)if(a[i]==null&&a[i-1]!=null&&O[t][0][0]<=dates[i])a[i]=a[i-1];px[t]=a});return {dates,px}}
function vUniverse(){const D=vData();if(!D)return [];return Object.keys(D.px).filter(t=>t!=='SPY'&&D.px[t].filter(v=>v!=null).length>=300)}

/* ---------- faktörler (yalnızca i gününe kadarki kapanışlar) ---------- */
function vFactor(k,a,i,t,d){const c=a[i];if(c==null)return null;
  if(k==='qual'){const F=typeof fundOf==='function'?fundOf(t):null;if(!F||!F.q||!d)return null;const Q=F.q.filter(x=>x.f&&x.f<=d);if(Q.length<4)return null;const L4=Q.slice(-4);if(!L4.every(x=>isNum(x.ocf)))return null;const A=Q[Q.length-1].assets;return isNum(A)&&A>0?L4.reduce((s,x)=>s+x.ocf,0)/A:null}const at=j=>j>=0?a[j]:null;
  if(k==='mom61'){const x=at(i-21),y=at(i-126);return x&&y?x/y-1:null}
  if(k==='mom121'){const x=at(i-21),y=at(i-252);return x&&y?x/y-1:null}
  if(k==='mom3'){const y=at(i-63);return y?c/y-1:null}
  if(k==='lowvol'){if(i<61)return null;const r=[];for(let j=i-59;j<=i;j++){if(!a[j]||!a[j-1])return null;r.push(Math.log(a[j]/a[j-1]))}const m=r.reduce((s,x)=>s+x,0)/r.length;return -Math.sqrt(r.reduce((s,x)=>s+(x-m)**2,0)/r.length)}
  if(k==='trend'){if(i<199)return null;let s=0;for(let j=i-199;j<=i;j++){if(!a[j])return null;s+=a[j]}return c/(s/200)-1}
  if(k==='high'){if(i<251)return null;let h=0;for(let j=i-251;j<=i;j++){if(!a[j])return null;h=Math.max(h,a[j])}return c/h}
  return null}
function vRanks(vals){const e=Object.entries(vals).filter(([,v])=>v!=null).sort((x,y)=>x[1]-y[1]);const n=e.length;const out={};e.forEach(([t],r)=>out[t]=n>1?r/(n-1):0.5);return out}

/* ---------- backtest motoru ---------- */
function vWarm(cfg){return Math.max(60,...VF.filter(f=>(cfg.w[f[0]]||0)>0).map(f=>f[3]))+1}
function vBacktest(cfg,from,to,opt={}){const D=vData();if(!D)return null;const {dates,px}=D;const costM=(opt.costMult||1);const bps=(cfg.cost||15)*costM/1e4;
  const U=(cfg.uni||[]).filter(t=>px[t]&&!(opt.exclude||[]).includes(t));const fk=VF.map(f=>f[0]).filter(k=>(cfg.w[k]||0)>0);if(!U.length||!fk.length)return null;
  const wsum=fk.reduce((s,k)=>s+cfg.w[k],0);const N=Math.max(1,Math.min(cfg.topN||3,U.length));
  let hold={};let eq=1,spyEq=1;const curve=[],spyCurve=[],rets=[],spyR=[],rfs=[],contrib={};let turn=0,costTot=0,rebs=0,cashDays=0;let lastM=null;
  const isReb=i=>{if(cfg.reb==='w')return (i-from)%5===0;const m=dates[i].slice(0,7);if(m!==lastM){lastM=m;return true}return false};
  let pending=null;
  for(let i=from;i<=to;i++){
    if(i>from){let r=0;const nh={};let tot=0;Object.entries(hold).forEach(([t,w])=>{const a=px[t];const ri=a[i]&&a[i-1]?a[i]/a[i-1]-1:0;r+=w*ri;contrib[t]=(contrib[t]||0)+w*ri;nh[t]=w*(1+ri);tot+=w*(1+ri)});
      const rfd=vRf(dates[i])/252;const cashW=1-Object.values(hold).reduce((s,w)=>s+w,0);r+=cashW*rfd;tot+=cashW*(1+rfd);
      if(tot>0)Object.keys(nh).forEach(t=>nh[t]/=tot);hold=nh;if(cashW>0.99)cashDays++;
      const sr=px.SPY[i]/px.SPY[i-1]-1;
      if(pending){const all=new Set(Object.keys(hold).concat(Object.keys(pending)));let tv=0;all.forEach(t=>tv+=Math.abs((pending[t]||0)-(hold[t]||0)));const cst=tv*bps;r-=cst;costTot+=cst;turn+=tv;hold=pending;pending=null;rebs++}
      eq*=1+r;spyEq*=1+sr;rets.push(r);spyR.push(sr);rfs.push(rfd)}
    curve.push([dates[i],eq*100]);spyCurve.push([dates[i],spyEq*100]);
    if(i<to&&isReb(i)){const sc={};const R={};fk.forEach(k=>{const v={};U.forEach(t=>v[t]=vFactor(k,px[t],i,t,dates[i]));R[k]=vRanks(v)});
      U.forEach(t=>{if(fk.some(k=>R[k][t]==null))return;sc[t]=fk.reduce((s,k)=>s+R[k][t]*cfg.w[k],0)/wsum});
      let order=opt.rand?vShuffle(Object.keys(sc),opt.rand):Object.entries(sc).sort((x,y)=>y[1]-x[1]).map(x=>x[0]);
      if(cfg.regF&&typeof regimeAt==='function'&&S.fred&&regimeAt(dates[i]).score<=-2)order=[];
      if(cfg.trendF)order=order.filter(t=>{const v=vFactor('trend',px[t],i);return v!=null&&v>0});
      let pick=order.slice(0,N);const band=cfg.band||0;
      if(band>0){const keep=Object.keys(hold).filter(t=>order.indexOf(t)>-1&&order.indexOf(t)<N+band);pick=keep.slice(0,N);for(const t of order){if(pick.length>=N)break;if(!pick.includes(t))pick.push(t)}}
      const tw={};pick.forEach(t=>tw[t]=1/N);pending=tw}}
  return {curve,spyCurve,rets,spyR,rfs,contrib,turn,costTot,rebs,cashDays,from:dates[from],to:dates[to],days:rets.length}}

function vShuffle(a,rnd){const b=a.slice();for(let i=b.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function vTot(B){return B&&B.curve.length?(B.curve[B.curve.length-1][1]/100-1)*100:null}
function vExcess(B){return B&&B.curve.length?vTot(B)-(B.spyCurve[B.spyCurve.length-1][1]/100-1)*100:null}
/* en iyi ay çıkarılınca: getirinin tek bir iyi aydan gelip gelmediği */
function vDropBestMonth(B){const M={};B.rets.forEach((r,k)=>{const m=B.curve[k+1][0].slice(0,7);(M[m]=M[m]||{s:1,b:1,ks:[]});M[m].s*=1+r;M[m].b*=1+B.spyR[k];M[m].ks.push(k)});
  const best=Object.entries(M).sort((a,b)=>(b[1].s-b[1].b)-(a[1].s-a[1].b))[0];if(!best)return null;const drop=new Set(best[1].ks);let s=1,b=1;B.rets.forEach((r,k)=>{if(!drop.has(k)){s*=1+r;b*=1+B.spyR[k]}});
  return {m:best[0],mEx:(best[1].s-best[1].b)*100,tot:(s-1)*100,spy:(b-1)*100}}
/* parametre kararlılığı: komşu ayarlar da çalışıyor mu? */
function vGrid(cfg,from,to){const U=cfg.uni.length;const tops=[cfg.topN-1,cfg.topN,cfg.topN+1].filter(x=>x>=1&&x<=U);const bands=[0,1,2];const out={tops,bands,cells:{}};
  ['m','w'].forEach(rb=>tops.forEach(tn=>bands.forEach(bd=>{const c={...cfg,topN:tn,band:bd,reb:rb};out.cells[rb+'|'+tn+'|'+bd]=vExcess(vBacktest(c,from,to))})));
  const wp=[];VF.forEach(f=>{const w=cfg.w[f[0]]||0;if(!w)return;[0.5,1.5].forEach(m=>{const c={...cfg,w:{...cfg.w,[f[0]]:Math.round(w*m)}};wp.push({n:f[1],m,ex:vExcess(vBacktest(c,from,to))})})});
  out.wp=wp;const all=Object.values(out.cells).concat(wp.map(x=>x.ex)).filter(isNum);out.share=all.filter(x=>x>0).length/all.length*100;out.med=all.slice().sort((a,b)=>a-b)[Math.floor(all.length/2)];return out}
/* aynı evren, aynı kurallar, rastgele seçim: şans dağılımı */
function vRandom(cfg,from,to,N=300){const seed=hashStr(JSON.stringify(cfg.uni)+cfg.topN+cfg.reb);const rnd=rng(seed);const xs=[];for(let i=0;i<N;i++){const e=vExcess(vBacktest(cfg,from,to,{rand:rnd}));if(isNum(e))xs.push(e)}return xs.sort((a,b)=>a-b)}
function vHist(xs,mark){if(xs.length<20)return '';const lo=Math.min(xs[0],mark),hi=Math.max(xs[xs.length-1],mark);const nb=24,w=(hi-lo)/nb||1;const bins=new Array(nb).fill(0);xs.forEach(x=>bins[Math.min(nb-1,Math.floor((x-lo)/w))]++);
  const mx=Math.max(...bins);const W=600,H=120;const bx=W/nb;const X=v=>(v-lo)/(hi-lo||1)*W;const z0=X(0);
  return `<svg class="vhist" viewBox="0 0 ${W} ${H+18}" preserveAspectRatio="none">${bins.map((c,i)=>`<rect x="${i*bx+1}" y="${H-c/mx*H}" width="${bx-2}" height="${c/mx*H}" fill="var(--line2,#3a4252)"/>`).join('')}
   ${lo<0&&hi>0?`<line x1="${z0}" x2="${z0}" y1="0" y2="${H}" stroke="var(--muted)" stroke-dasharray="3 3"/>`:''}<line x1="${X(mark)}" x2="${X(mark)}" y1="0" y2="${H}" stroke="var(--accent)" stroke-width="3"/>
   <text x="2" y="${H+14}" fill="var(--muted)" font-size="11">${nf(lo,0)} puan</text><text x="${W-2}" y="${H+14}" fill="var(--muted)" font-size="11" text-anchor="end">${nf(hi,0)} puan</text></svg>`}
/* bugün yeniden dengelense hangi enstrümanlar seçilirdi */
function vCurrentPick(cfg){const D=vData();if(!D)return [];const {dates,px}=D;const i=dates.length-1;const U=(cfg.uni||[]).filter(t=>px[t]);const fk=VF.map(f=>f[0]).filter(k=>(cfg.w[k]||0)>0);if(!U.length||!fk.length)return [];
  const wsum=fk.reduce((s,k)=>s+cfg.w[k],0);const R={};fk.forEach(k=>{const v={};U.forEach(t=>v[t]=vFactor(k,px[t],i,t,dates[i]));R[k]=vRanks(v)});const sc={};U.forEach(t=>{if(fk.some(k=>R[k][t]==null))return;sc[t]=fk.reduce((s,k)=>s+R[k][t]*cfg.w[k],0)/wsum});
  let order=Object.entries(sc).sort((x,y)=>y[1]-x[1]).map(x=>x[0]);if(cfg.regF&&typeof regimeAt==='function'&&S.fred&&regimeAt(dates[i]).score<=-2)order=[];if(cfg.trendF)order=order.filter(t=>{const v=vFactor('trend',px[t],i);return v!=null&&v>0});
  return order.slice(0,Math.max(1,Math.min(cfg.topN||3,U.length)))}
/* ---------- istatistik ---------- */
function vMean(a){return a.reduce((s,x)=>s+x,0)/(a.length||1)}
function vStd(a){const m=vMean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/Math.max(1,a.length-1))}
function normCdf(x){const t=1/(1+0.2316419*Math.abs(x));const d=0.3989423*Math.exp(-x*x/2);const p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p}
function normInv(p){if(p<=0)return -Infinity;if(p>=1)return Infinity;const a=[-39.69683028665376,220.9460984245205,-275.9285104469687,138.357751867269,-30.66479806614716,2.506628277459239],b=[-54.47609879822406,161.5858368580409,-155.6989798598866,66.80131188771972,-13.28068155288572],c=[-0.007784894002430293,-0.3223964580411365,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783],d=[0.007784695709041462,0.3224671290700398,2.445134137142996,3.754408661907416];
  const q=p<0.02425?Math.sqrt(-2*Math.log(p)):p>1-0.02425?Math.sqrt(-2*Math.log(1-p)):null;
  if(q!=null&&p<0.5)return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  if(q!=null)return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  const r=p-0.5,s=r*r;return (((((a[0]*s+a[1])*s+a[2])*s+a[3])*s+a[4])*s+a[5])*r/(((((b[0]*s+b[1])*s+b[2])*s+b[3])*s+b[4])*s+1)}
function vStats(B){if(!B||B.rets.length<20)return null;const r=B.rets,s=B.spyR,n=r.length;const rf=B.rfs&&B.rfs.length===n?B.rfs:r.map(()=>RF/252);const ex=r.map((x,i)=>x-rf[i]);const mrf=vMean(rf);
  const tot=(B.curve[B.curve.length-1][1]/100-1)*100,spy=(B.spyCurve[B.spyCurve.length-1][1]/100-1)*100;const yrs=n/252;
  const sd=vStd(r);const m=vMean(ex),sdx=vStd(ex)||1e-9;const srD=m/sdx;
  const sk=ex.reduce((a,x)=>a+((x-m)/sdx)**3,0)/n,ku=ex.reduce((a,x)=>a+((x-m)/sdx)**4,0)/n;
  const ms=vMean(s),mr=vMean(r);let cov=0,vs=0;for(let i=0;i<n;i++){cov+=(r[i]-mr)*(s[i]-ms);vs+=(s[i]-ms)**2}const beta=vs?cov/vs:null;
  const alpha=beta!=null?((vMean(r)-mrf)-beta*(ms-mrf))*252*100:null;
  let pk=-Infinity,dd=0;B.curve.forEach(p=>{pk=Math.max(pk,p[1]);dd=Math.min(dd,p[1]/pk-1)});
  const C=Object.entries(B.contrib);const pos=C.reduce((a,x)=>a+Math.max(0,x[1]),0);const topE=C.sort((x,y)=>y[1]-x[1])[0];
  return {tot,spy,excess:tot-spy,cagr:(Math.pow(1+tot/100,1/yrs)-1)*100,vol:sd*Math.sqrt(252)*100,sharpe:srD*Math.sqrt(252),srD,sk,ku,n,beta,alpha,maxdd:dd*100,
    top:topE&&pos>0?Math.max(0,topE[1])/pos*100:null,topT:topE?topE[0]:null,turnY:B.turn/yrs,costPct:B.costTot*100,rebs:B.rebs}}
/* Bailey & López de Prado (2014) deflated Sharpe: N deneme içinden en iyisini seçmenin şans payını düşer */
function vDSR(st,trialSR){if(!st)return null;const N=Math.max(1,trialSR.length);let sr0=0;
  if(N>1){const V=vStd(trialSR)**2;const g=0.5772156649;sr0=Math.sqrt(V)*((1-g)*normInv(1-1/N)+g*normInv(1-1/(N*Math.E)))}
  const den=Math.sqrt(Math.max(1e-9,1-st.sk*st.srD+(st.ku-1)/4*st.srD**2));return normCdf((st.srD-sr0)*Math.sqrt(st.n-1)/den)*100}

/* ---------- çalışma durumu (Ayarlar'da, gizli) ---------- */
function vStudy(){if(!S.settings.vstudy)S.settings.vstudy={id:Date.now().toString(36),created:new Date().toISOString(),crit:{...VCRIT_DEF},hold:126,trials:[],opened:null};return S.settings.vstudy}
function vCfgDefault(){const U=vUniverse();return {uni:U,w:{mom61:60,lowvol:25,trend:15},topN:3,reb:'m',band:1,cost:15,trendF:false}}
function vCfg(){if(!S.vcfg)S.vcfg=(S.settings.vcfg&&S.settings.vcfg.uni)?JSON.parse(JSON.stringify(S.settings.vcfg)):vCfgDefault();return S.vcfg}
function vHash(c){return String(hashStr(JSON.stringify([c.uni.slice().sort(),VF.map(f=>c.w[f[0]]||0),c.topN,c.reb,c.band,c.cost,!!c.trendF,!!c.regF])))}
function vCfgTxt(c){return VF.filter(f=>(c.w[f[0]]||0)>0).map(f=>f[1]+' '+c.w[f[0]]).join(' + ')+` · ilk ${c.topN} · ${c.reb==='w'?'haftalık':'aylık'}${c.band?` · bant ${c.band}`:''}${c.trendF?' · trend filtresi':''}${c.regF?' · rejim filtresi':''} · ${c.cost} bp · ${c.uni.length} enstrüman`}
function vPeriods(cfg){const D=vData();if(!D)return null;const n=D.dates.length;const st=vStudy();const warm=vWarm(cfg);const hEnd=n-1,hStart=n-1-st.hold;return {warm,devFrom:warm,devTo:hStart,hFrom:hStart,hTo:hEnd,dates:D.dates}}
function vEvaluate(cfg){if((cfg.w.qual||0)>0&&!cfg.uni.some(t=>{const F=typeof fundOf==='function'?fundOf(t):null;return F&&F.q&&F.q.some(x=>x.f)}))return {err:'Nakit akışı kalitesi faktörü için SEC\'e dosyalama tarihli bilanço gerekiyor; SEC kaynağı açılınca (SEC_UA ayarı) kullanılabilir. Bu faktörün ağırlığını 0 yap.'};
  const P=vPeriods(cfg);if(!P||P.devTo-P.devFrom<120)return {err:'Geliştirme dönemi çok kısa: faktör ısınma süresi + saklı dönem veriyi tüketiyor. Daha kısa bakışlı faktör ya da daha kısa saklı dönem seç.'};
  const B=vBacktest(cfg,P.devFrom,P.devTo);const st=vStats(B);if(!st)return {err:'Backtest çalışmadı (evren ya da faktör seçimi boş).'};
  const B2=vBacktest(cfg,P.devFrom,P.devTo,{costMult:2});const st2=vStats(B2);
  const Bx=st.topT?vBacktest(cfg,P.devFrom,P.devTo,{exclude:[st.topT]}):null;const stx=vStats(Bx);
  const mid=Math.floor((P.devFrom+P.devTo)/2);const h1=vStats(vBacktest(cfg,P.devFrom,mid)),h2=vStats(vBacktest(cfg,mid,P.devTo));
  const eps=(typeof stressEpisodes==='function'?stressEpisodes(6):[]).filter(e=>e.peak>=P.dates[P.devFrom]&&e.trough<=P.dates[P.devTo]);
  const epR=eps.map(e=>{const i0=P.dates.indexOf(e.peak),i1=P.dates.indexOf(e.trough);if(i0<0||i1<=i0)return null;const c=B.curve;const f=c.find(p=>p[0]===e.peak),g=c.find(p=>p[0]===e.trough);return f&&g?{name:e.name,spy:e.spy,s:(g[1]/f[1]-1)*100}:null}).filter(Boolean);
  const bm=vDropBestMonth(B);const G=vGrid(cfg,P.devFrom,P.devTo);const RX=vRandom(cfg,P.devFrom,P.devTo);const rp=RX.length?RX.filter(x=>x<st.excess).length/RX.length*100:null;
  return {P,B,st,st2,stx,h1,h2,epR,bm,G,RX,rp}}
function vChecks(E,crit,dsr){const s=E.st;const c=[];const add=(k,val,ok)=>c.push({k,val,ok});
  add('excess',s.excess,s.excess>crit.excess);add('excess2x',E.st2?E.st2.excess:null,E.st2&&E.st2.excess>crit.excess2x);add('maxdd',-s.maxdd,-s.maxdd<=crit.maxdd);
  add('sharpe',s.sharpe,s.sharpe>=crit.sharpe);add('top',s.top,s.top!=null&&s.top<=crit.top);add('alpha',s.alpha,s.alpha!=null&&s.alpha>=crit.alpha);add('dsr',dsr,dsr!=null&&dsr>=crit.dsr);return c}

/* ---------- sayfa ---------- */
function viewDogrula(){const U=vUniverse();if(!U.length)return `<div class="empty"><b>Fiyat geçmişi yok</b>Doğrulama için data/ohlc.json gerekli.</div>`;
  const st=vStudy(),cfg=vCfg(),locked=st.trials.length>0;const E=S.vEval;const trSR=st.trials.map(t=>t.srD).filter(isNum);
  const dsr=E&&E.st?vDSR(E.st,trSR.length?trSR:[E.st.srD]):null;const chk=E&&E.st?vChecks(E,st.crit,dsr):null;const allOk=chk&&chk.every(x=>x.ok);
  const P=vPeriods(cfg);const fmt=d=>trDate(d+'T12:00:00Z',{day:'numeric',month:'short',year:'2-digit'});
  const cur=E&&E.hash===vHash(cfg);
  return `<div class="fade">
  <div class="sec-t" style="margin-top:0"><div><h2>Strateji doğrulama</h2><p>Hipotez → kural → backtest → ret ya da iyileştir → stres testi → saklı dönem. Kriterleri önce sen koyarsın; kararı backtest verir.</p></div></div>
  <section class="card sec"><h3>1 · Kabul kriterleri ${locked?'<span class="chip n">🔒 kilitli</span>':'<span class="chip up">düzenlenebilir</span>'} <span class="r muted" style="font-size:12px">çalışma ${esc(trDT(st.created))} · ${st.trials.length} deneme</span></h3>
   <div class="vcrit">${Object.keys(VCRIT_DEF).map(k=>`<label><span>${esc(VCRIT_TXT[k][0])}</span><input type="number" step="any" data-crit="${k}" value="${st.crit[k]}" ${locked?'disabled':''}><em>${esc(VCRIT_TXT[k][1])}</em></label>`).join('')}
   <label><span>Saklı dönem (geliştirmede hiç kullanılmaz)</span><select data-hold ${locked?'disabled':''}>${[[63,'3 ay'],[126,'6 ay'],[189,'9 ay'],[252,'12 ay']].map(x=>`<option value="${x[0]}" ${st.hold===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select><em></em></label></div>
   <p class="muted" style="font-size:12px;margin:8px 0 0">Kriterler ilk denemeden sonra kilitlenir; sonuç görüp kriteri gevşetmek, stratejiyi sonuca uydurmanın en yaygın yolu. Değiştirmek için yeni çalışma başlat (deneme sayacı sıfırlanır, eski günlük silinir).</p>
   <button class="btn ghost sm" id="vNew">Yeni çalışma başlat</button></section>

  <section class="card sec"><h3>2 · Strateji</h3>
   <div class="muted" style="font-size:12.5px;margin-bottom:6px">Evren (portföy ve izleme listesinde fiyat geçmişi olanlar):</div>
   <div class="vuni">${U.map(t=>`<label class="chip ${cfg.uni.includes(t)?'up':'n'}"><input type="checkbox" data-uni="${t}" ${cfg.uni.includes(t)?'checked':''}> ${esc(dispT(t))}</label>`).join('')}</div>
   <div class="vfac">${VF.map(f=>`<label title="${esc(f[2])}"><span>${esc(f[1])}</span><input type="number" min="0" max="100" step="5" data-w="${f[0]}" value="${cfg.w[f[0]]||0}"><em>ağırlık</em></label>`).join('')}</div>
   <div class="vfac">
    <label><span>Tutulacak enstrüman</span><input type="number" min="1" max="${U.length}" data-p="topN" value="${cfg.topN}"><em>eşit ağırlık</em></label>
    <label><span>Yeniden dengeleme</span><select data-p="reb"><option value="m" ${cfg.reb==='m'?'selected':''}>aylık</option><option value="w" ${cfg.reb==='w'?'selected':''}>haftalık</option></select><em></em></label>
    <label><span>İşlem yapmama bandı</span><input type="number" min="0" max="5" data-p="band" value="${cfg.band}"><em>sıra payı</em></label>
    <label><span>Maliyet + kayma</span><input type="number" min="0" max="200" data-p="cost" value="${cfg.cost}"><em>bp / işlem</em></label>
    <label class="vchk"><input type="checkbox" data-p="trendF" ${cfg.trendF?'checked':''}> <span>Mutlak trend filtresi (200G altı → nakit)</span></label>${S.fred?`<label class="vchk"><input type="checkbox" data-p="regF" ${cfg.regF?'checked':''}> <span>Makro rejim filtresi (risk kapalı → nakit)</span></label>`:''}</div>
   ${P?`<p class="muted" style="font-size:12px;margin:6px 0">Geliştirme dönemi: <b>${fmt(P.dates[P.devFrom])} – ${fmt(P.dates[P.devTo])}</b> (${P.devTo-P.devFrom} gün; ilk ${P.warm} gün faktör ısınması) · Saklı dönem: <b>${fmt(P.dates[P.hFrom])} – ${fmt(P.dates[P.hTo])}</b> ${st.opened?'<span class="chip warnc">açıldı</span>':'<span class="chip n">🔒 kapalı</span>'}</p>`:''}
   <button class="btn" id="vRun">Geliştirme döneminde test et</button> <span class="muted" style="font-size:12px">Her farklı ayar bir deneme sayılır.</span></section>

  ${E&&E.err?`<section class="card"><p class="warnc">${esc(E.err)}</p></section>`:''}
  ${E&&E.st?`<section class="card sec"><h3>3 · Sonuç ${cur?'':'<span class="chip n">ayar değişti, yeniden test et</span>'} <span class="r">${allOk?'<span class="chip up">KABUL</span>':chk.filter(x=>x.ok).length>=4?'<span class="chip warnc">KISMİ</span>':'<span class="chip down">RED</span>'}</span></h3>
   <div class="chart" id="cV" style="height:240px"></div>
   <div class="tscroll"><table class="tbl"><tbody>${chk.map(x=>`<tr><td>${x.ok?'✅':'❌'} ${esc(VCRIT_TXT[x.k][0])} ${x.k==='maxdd'?'%'+st.crit.maxdd:x.k==='dsr'?'%'+st.crit.dsr:x.k==='top'?'%'+st.crit.top:st.crit[x.k]}</td><td class="r num">${x.val==null?'—':x.k==='sharpe'?nf(x.val,2):x.k==='excess'||x.k==='excess2x'||x.k==='alpha'?pct(x.val,1):'%'+nf(x.val,1)}</td></tr>`).join('')}</tbody></table></div>
   <div class="btk">${[['Getiri',pct(E.st.tot,1)],['SPY',pct(E.st.spy,1)],['Yıllık oynaklık','%'+nf(E.st.vol,1)],['Beta',nf(E.st.beta,2)],['Yıllık devir','x'+nf(E.st.turnY,1)],['Toplam maliyet','%'+nf(E.st.costPct,1)]].map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join('')}</div>
   <p class="muted" style="font-size:12px">Beta ${nf(E.st.beta,2)}: getirinin ${E.st.beta>1.1?'bir kısmı sadece piyasadan daha oynak olmaktan geliyor; alfaya bak':'piyasaya benzer ya da düşük duyarlılıkla elde edilmiş'}. Düzeltilmiş Sharpe güveni ${nf(dsr,0)}%: ${st.trials.length||1} deneme içinden şansla bu kadar iyi bir sonuç bulunmadığına dair güven.</p></section>
  <section class="card sec"><h3>4 · Stratejiyi kırmaya çalış</h3><div class="tscroll"><table class="tbl"><thead><tr><th>Test</th><th class="r">Strateji</th><th class="r">SPY</th><th>Sonuç</th></tr></thead><tbody>
   ${[['Maliyet 2 katı',E.st2&&E.st2.tot,E.st.spy,E.st2&&E.st2.excess>0],
      ['En çok katkı veren çıkarılınca ('+esc(dispT(E.st.topT||''))+')',E.stx&&E.stx.tot,E.st.spy,E.stx&&E.stx.excess>0],
      ['Dönemin ilk yarısı',E.h1&&E.h1.tot,E.h1&&E.h1.spy,E.h1&&E.h1.excess>0],['Dönemin ikinci yarısı',E.h2&&E.h2.tot,E.h2&&E.h2.spy,E.h2&&E.h2.excess>0]]
     .concat(E.bm?[['En iyi ay çıkarılınca ('+esc(E.bm.m)+', o ay '+pct(E.bm.mEx,1)+' fark)',E.bm.tot,E.bm.spy,E.bm.tot>E.bm.spy]]:[]).concat(E.epR.map(x=>['Stres: '+esc(x.name),x.s,x.spy,x.s>x.spy])).map(r=>`<tr><td>${r[0]}</td><td class="r num ${cls(r[1])}">${pct(r[1],1)}</td><td class="r num">${pct(r[2],1)}</td><td>${r[3]?'✅ dayandı':'❌ kırıldı'}</td></tr>`).join('')}</tbody></table></div>
   <div class="vcon">${Object.entries(E.B.contrib).sort((a,b)=>b[1]-a[1]).map(([t,v])=>`<div><span>${esc(dispT(t))}</span><i class="${v>=0?'up':'down'}" style="width:${Math.min(100,Math.abs(v)/Math.max(...Object.values(E.B.contrib).map(Math.abs))*100)}%"></i><b class="num ${cls(v)}">${pct(v*100,1)}</b></div>`).join('')}</div>
   <p class="muted" style="font-size:12px">Çubuklar: her enstrümanın strateji getirisine katkısı (puan).</p></section>`:''}

  ${E&&E.G?`<section class="card sec"><h3>4b · Parametre kararlılığı <span class="r muted" style="font-size:12px">komşu ayarlarda SPY'a göre fark (puan)</span></h3>
   <div class="vgrid">${['m','w'].map(rb=>`<div><div class="muted" style="font-size:12px;margin-bottom:4px">${rb==='m'?'Aylık':'Haftalık'} dengeleme</div><table class="tbl vgt"><thead><tr><th>Tutulan · bant →</th>${E.G.bands.map(b=>`<th class="r">${b}</th>`).join('')}</tr></thead><tbody>${E.G.tops.map(tn=>`<tr><td>ilk ${tn}</td>${E.G.bands.map(bd=>{const v=E.G.cells[rb+'|'+tn+'|'+bd];const me=rb===vCfg().reb&&tn===vCfg().topN&&bd===vCfg().band;return `<td class="r num ${cls(v)}" style="background:${isNum(v)?(v>0?'rgba(47,227,154,'+Math.min(.35,Math.abs(v)/60)+')':'rgba(255,93,122,'+Math.min(.35,Math.abs(v)/60)+')'):'none'};${me?'outline:2px solid var(--accent)':''}">${isNum(v)?(v>0?'+':'')+nf(v,1):'—'}</td>`}).join('')}</tr>`).join('')}</tbody></table></div>`).join('')}
   ${E.G.wp.length?`<div><div class="muted" style="font-size:12px;margin-bottom:4px">Faktör ağırlığı yarıya / 1,5 katına</div><table class="tbl vgt"><tbody>${E.G.wp.map(x=>`<tr><td>${esc(x.n)} ×${nf(x.m,1)}</td><td class="r num ${cls(x.ex)}">${isNum(x.ex)?(x.ex>0?'+':'')+nf(x.ex,1):'—'}</td></tr>`).join('')}</tbody></table></div>`:''}</div>
   <p style="margin:8px 0 0">Komşu ayarların <b class="${E.G.share>=70?'up':E.G.share>=40?'':'down'}">%${nf(E.G.share,0)}</b>'i SPY'ı geçiyor, medyan fark <b class="${cls(E.G.med)}">${pct(E.G.med,1)}</b>. ${E.G.share>=70?'Sonuç ayara hassas değil; iyi işaret.':E.G.share>=40?'Sonuç kısmen ayara bağlı.':'Sonuç yalnızca belirli ayarlarda iyi: aşırı uyum (overfitting) şüphesi.'} <span class="muted" style="font-size:12px">Çerçeveli hücre mevcut ayar. Bu tablo deneme sayılmaz; en iyi hücreyi seçip test edersen o yeni bir deneme olur.</span></p></section>
  <section class="card sec"><h3>4c · Şansla karşılaştır <span class="r muted" style="font-size:12px">aynı evren ve kurallar, rastgele seçimle ${E.RX.length} strateji</span></h3>
   ${vHist(E.RX,E.st.excess)}
   <p style="margin:6px 0 0">Senin stratejin (yeşil çizgi) rastgele stratejilerin <b class="${E.rp>=95?'up':E.rp>=80?'':'down'}">%${nf(E.rp,0)}</b>'inden iyi. ${E.rp>=95?'Şansla açıklanması zor.':E.rp>=80?'Şansla ayırt etmek güç; daha uzun örnek gerekir.':'Rastgele seçimden belirgin şekilde iyi değil: bulunan "avantaj" büyük ihtimalle evrenin kendisinden geliyor.'} <span class="muted" style="font-size:12px">Rastgele stratejiler aynı sayıda enstrümanı, aynı dengeleme sıklığında, aynı maliyetle rastgele seçer.</span></p></section>`:''}
  <section class="card sec"><h3>5 · Saklı dönem ${st.opened?'<span class="chip warnc">açıldı</span>':''}</h3>
   ${st.opened?vOpenedHTML(st.opened):`<p class="muted" style="font-size:13px;margin:0 0 8px">Geliştirme dönemindeki tüm kriterleri geçen bir strateji, geliştirme sırasında hiç görülmemiş son dönemde <b>bir kez</b> test edilir. Açıldıktan sonra yapılan her değişiklik "saklı dönem görüldü" olarak işaretlenir; artık gerçek bir örneklem dışı test yoktur.</p>
   <button class="btn" id="vOpen" ${allOk&&cur?'':'disabled'}>Saklı dönemi aç (tek sefer)</button> ${allOk&&cur?'':'<span class="muted" style="font-size:12px">Önce tüm kriterleri geçen bir deneme gerekli.</span>'}`}
   ${st.opened&&st.opened.excess>0&&st.opened.h===vHash(cfg)?`<div style="margin-top:10px"><button class="btn" id="vPaper">Canlı takibe al</button> <span class="muted" style="font-size:12px">Bugünden itibaren gerçek günlerle izlenir.</span></div>`:''}</section>
  ${typeof paperCard==='function'?paperCard():''}

  <section class="card sec"><h3>Ret günlüğü <span class="r muted" style="font-size:12px">${st.trials.filter(t=>t.ok).length} kabul · ${st.trials.filter(t=>!t.ok).length} ret</span></h3>
   ${st.trials.length?`<div class="tscroll"><table class="tbl"><thead><tr><th>#</th><th>Ayar</th><th class="r">Fark</th><th class="r">Sharpe</th><th class="r">Düşüş</th><th>Kriterler</th><th>Karar</th></tr></thead><tbody>${st.trials.slice().reverse().map((t,i)=>`<tr><td class="muted">${st.trials.length-i}</td><td style="font-size:12.5px">${esc(t.txt)}${t.post?' <span class="chip warnc">saklı sonrası</span>':''}</td><td class="r num ${cls(t.excess)}">${pct(t.excess,1)}</td><td class="r num">${nf(t.sharpe,2)}</td><td class="r num">%${nf(-t.maxdd,1)}</td><td style="white-space:nowrap">${(t.chk||'').split('').map(c=>c==='1'?'✅':'❌').join('')}</td><td>${t.ok?'<span class="chip up">KABUL</span>':'<span class="chip down">RED</span>'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Henüz deneme yok.</p>'}</section>

  <section class="card sec"><h3>Nasıl okunur</h3><div class="prose" style="font-size:13px">
   <p><b>Neden bu kadar kural?</b> 20 rastgele strateji denersen biri tesadüfen endeksi geçer. Bu sayfa her denemeyi sayar, Sharpe'ı deneme sayısına göre düşürür (Bailey ve López de Prado'nun deflated Sharpe yöntemi) ve son dönemi sona saklar.</p>
   <p><b>Sınırlar:</b> Evren küçük (sadece fiyat geçmişi olan enstrümanlar) ve sadece fiyat faktörleri var; bilanço kalitesi gibi faktörleri o tarihte bilinen haliyle bulamadığımız için eklemedik, çünkü o test geleceği bilen bir backtest olurdu. Sinyal kapanışta hesaplanır, işlem ertesi günün kapanışında yapılır. Nakit o günkü Fed politika faizini kazanır (FRED). Vergi yok. Geçmiş sonuç gelecek garantisi değildir; bu bir araştırma aracıdır, yatırım tavsiyesi değildir.</p></div></section></div>`}
function vOpenedHTML(o){return `<div class="btk">${[['Strateji',pct(o.tot,1)],['SPY',pct(o.spy,1)],['Fark',pct(o.excess,1)],['Sharpe',nf(o.sharpe,2)],['En büyük düşüş','%'+nf(-o.maxdd,1)],['Beta',nf(o.beta,2)]].map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join('')}</div>
  <p style="margin:8px 0 0">${o.excess>0&&o.maxdd>-30?'✅ Strateji görmediği dönemde de SPY\'ı geçti.':'❌ Strateji görmediği dönemde tutmadı; geliştirme sonucu büyük ihtimalle veriye uydurulmuştu.'} <span class="muted" style="font-size:12px">${esc(o.txt)} · ${esc(trDT(o.at))}</span></p>`}
function afterDogrula(){const st=vStudy(),cfg=vCfg();const E=S.vEval;
  const saveCfg=()=>{S.settings.vcfg=JSON.parse(JSON.stringify(cfg));try{saveSettings()}catch(e){}};
  $$('[data-crit]').forEach(i=>i.onchange=()=>{st.crit[i.dataset.crit]=+i.value;try{saveSettings()}catch(e){}});
  $$('[data-hold]').forEach(s=>s.onchange=()=>{st.hold=+s.value;try{saveSettings()}catch(e){}render(false)});
  $$('[data-uni]').forEach(i=>i.onchange=()=>{const t=i.dataset.uni;cfg.uni=i.checked?cfg.uni.concat(t):cfg.uni.filter(x=>x!==t);saveCfg();render(false)});
  $$('[data-w]').forEach(i=>i.onchange=()=>{cfg.w[i.dataset.w]=Math.max(0,+i.value||0);saveCfg();render(false)});
  $$('[data-p]').forEach(i=>i.onchange=()=>{const k=i.dataset.p;cfg[k]=i.type==='checkbox'?i.checked:k==='reb'?i.value:+i.value;saveCfg();render(false)});
  const nb=$('#vNew');if(nb)nb.onclick=()=>{if(st.trials.length&&!confirm('Yeni çalışma: deneme sayacı ve ret günlüğü sıfırlanır. Devam?'))return;delete S.settings.vstudy;S.vEval=null;vStudy();try{saveSettings()}catch(e){}render(false)};
  const rb=$('#vRun');if(rb)rb.onclick=()=>{rb.disabled=true;rb.textContent='Hesaplanıyor…';setTimeout(()=>{const R=vEvaluate(cfg);R.hash=vHash(cfg);
    if(R.st){const h=R.hash;const prev=st.trials.find(t=>t.h===h);const trSR=st.trials.filter(t=>t.h!==h).map(t=>t.srD).concat([R.st.srD]);const dsr=vDSR(R.st,trSR);const chk=vChecks(R,st.crit,dsr);
      if(!prev){st.trials.push({h,at:new Date().toISOString(),txt:vCfgTxt(cfg),srD:R.st.srD,excess:R.st.excess,sharpe:R.st.sharpe,maxdd:R.st.maxdd,chk:chk.map(x=>x.ok?1:0).join(''),ok:chk.every(x=>x.ok),post:!!st.opened});
        if(st.trials.length>60)st.trials=st.trials.slice(-60);try{saveSettings()}catch(e){}}}
    S.vEval=R;render(false)},30)};
  const ob=$('#vOpen');if(ob)ob.onclick=()=>{if(!confirm('Saklı dönem yalnızca bir kez açılır. Bu ayarla açılsın mı?'))return;const P=vPeriods(cfg);const B=vBacktest(cfg,P.hFrom,P.hTo);const s=vStats(B);
    if(!s){toast('Saklı dönem hesaplanamadı');return}st.opened={at:new Date().toISOString(),h:vHash(cfg),txt:vCfgTxt(cfg),tot:s.tot,spy:s.spy,excess:s.excess,sharpe:s.sharpe,maxdd:s.maxdd,beta:s.beta,curve:B.curve.filter((_,i)=>i%2===0),spyCurve:B.spyCurve.filter((_,i)=>i%2===0)};
    try{saveSettings()}catch(e){}render(false)};
  const pb=$('#vPaper');if(pb)pb.onclick=async()=>{pb.disabled=true;const ok=await paperAdd(cfg,vCfgTxt(cfg));pb.disabled=false;if(ok)render(false)};
  if(E&&E.B){const el=$('#cV');if(el)lineChart(el,[{name:'Strateji',color:'#b8f25c',pts:E.B.curve},{name:'SPY',color:'#8b95a5',pts:E.B.spyCurve}],{fmt:(v)=>nf(v,0)})}}
