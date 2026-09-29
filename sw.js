/* Portföy Defteri service worker: kabuk önbellekte, veri önce ağdan */
const V='pd-v13';
const SHELL=['./','index.html','style.css?v=13','analiz.js?v=13','ekler.js?v=13','teknik.js?v=13','strateji.js?v=13','duzen.js?v=13','arac.js?v=13','lab.js?v=13','ileri.js?v=13','kural.js?v=13','kontrol.js?v=13','pro.js?v=13','app.js?v=13','manifest.webmanifest','icon-192.png','icon-512.png'];
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
