/* Portföy Defteri service worker: kabuk önbellekte, veri önce ağdan */
const V='pd-v16';
const SHELL=['./','index.html','style.css?v=16','analiz.js?v=16','ekler.js?v=16','teknik.js?v=16','strateji.js?v=16','duzen.js?v=16','arac.js?v=16','lab.js?v=16','ileri.js?v=16','kural.js?v=16','kontrol.js?v=16','pro.js?v=16','icgoru.js?v=16','deger.js?v=16','komut.js?v=16','orion.js?v=16','app.js?v=16','manifest.webmanifest','icon-192.png','icon-512.png'];
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
