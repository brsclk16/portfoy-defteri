/* Portföy Defteri service worker: kabuk önbellekte, veri önce ağdan */
const V='pd-v17';
const SHELL=['./','index.html','style.css?v=17','analiz.js?v=17','ekler.js?v=17','teknik.js?v=17','strateji.js?v=17','duzen.js?v=17','arac.js?v=17','lab.js?v=17','ileri.js?v=17','kural.js?v=17','kontrol.js?v=17','pro.js?v=17','icgoru.js?v=17','deger.js?v=17','komut.js?v=17','orion.js?v=17','dogrula.js?v=17','app.js?v=17','manifest.webmanifest','icon-192.png','icon-512.png'];
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
