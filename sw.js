/* Portföy Defteri service worker: kabuk önbellekte, veri önce ağdan */
const V='pd-v22';
const SHELL=['./','index.html','style.css?v=21','analiz.js?v=21','ekler.js?v=21','teknik.js?v=21','strateji.js?v=21','duzen.js?v=21','arac.js?v=21','lab.js?v=21','ileri.js?v=21','kural.js?v=21','kontrol.js?v=21','pro.js?v=21','icgoru.js?v=21','deger.js?v=21','komut.js?v=21','orion.js?v=21','dogrula.js?v=21','dis.js?v=21','stream.js?v=21','quant.js?v=21','bugun.js?v=21','app.js?v=21','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
  if(u.pathname.includes('/data/')){
    const key=u.origin+u.pathname;
    e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(V).then(ca=>ca.put(key,c));return r}).catch(()=>caches.match(key)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const c=res.clone();caches.open(V).then(ca=>ca.put(e.request,c));return res})).catch(()=>caches.match('index.html')));
});
