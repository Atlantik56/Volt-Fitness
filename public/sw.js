const CACHE = "ritmovis-media-v18";
const OFFLINE = "/offline.html";
const ASSETS = [OFFLINE, "/icon-192.png?v=ritmovis-20260905", "/icon-512.png?v=ritmovis-20260905", "/icon-maskable-192.png?v=ritmovis-20260905", "/icon-maskable-512.png?v=ritmovis-20260905"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    await cache.add(OFFLINE);
    await Promise.allSettled(ASSETS.slice(1).map(asset => cache.add(asset)));
  }));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => /^(volt-media-v|ritmovis-media-v)/.test(key) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Never cache authenticated HTML or API responses. Offline contains no user data.
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(async () => (await caches.match(OFFLINE)) || new Response("Нет соединения", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })));
    return;
  }
  if (!ASSETS.includes(url.pathname + url.search) && !/^\/(backgrounds|exercises|workouts)\//.test(url.pathname)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(event.request);
    if (hit) return hit;
    const response = await fetch(event.request);
    if (response.ok && response.type === "basic") {
      const copy = response.clone();
      event.waitUntil(cache.put(event.request, copy).catch(() => {}));
    }
    return response;
  }));
});
self.addEventListener("push",e=>{let data={title:"RITMOVIS",body:"Пора двигаться."};try{data=e.data.json()}catch{}e.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:"/icon-192.png?v=ritmovis-20260905",badge:"/icon-192.png?v=ritmovis-20260905",tag:"volt-reminder"}))});
self.addEventListener("notificationclick",e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:"window"}).then(list=>{for(const c of list)if("focus" in c)return c.focus();if(self.clients.openWindow)return self.clients.openWindow("/")}))});
