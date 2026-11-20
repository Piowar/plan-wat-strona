// Service worker strony "Plany zajęć WAT": działanie bez internetu.
// - strona i ikony: najpierw sieć (żeby od razu było widać aktualizacje), bez sieci - kopia,
// - dane (dane/*.js): najpierw sieć z limitem czasu (słaby zasięg w budynkach),
//   potem ostatnia zapisana kopia; klucz kopii bez ?v=..., więc działa każda wersja.
// Pliki .ics nie są tu obsługiwane - kalendarze w telefonie pobierają je same.

var WERSJA = "planwat-1";
var POWLOKA = ["./", "index.html", "manifest.webmanifest", "ikony/ikona-192.png", "ikony/ikona-512.png", "ikony/ikona.svg"];
var DANE_STARTOWE = ["dane/indeks.js", "dane/wf.js", "dane/rok.js"];
var LIMIT_MS = 4000;

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(WERSJA).then(function (c) {
    return c.addAll(POWLOKA).then(function () {
      return Promise.all(DANE_STARTOWE.map(function (u) {
        return fetch(u, { cache: "no-cache" }).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {});
      }));
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== WERSJA; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function kluczKopii(req) {
  var u = new URL(req.url);
  if (req.mode === "navigate") return new URL("index.html", self.registration.scope).href;
  return u.origin + u.pathname;          // bez ?v=...
}

function zKopii(klucz) {
  return caches.open(WERSJA).then(function (c) { return c.match(klucz); });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var u = new URL(req.url);
  if (u.origin !== self.location.origin || /\.ics$/.test(u.pathname)) return;
  var klucz = kluczKopii(req);
  var limit = /\/dane\//.test(u.pathname) ? LIMIT_MS : LIMIT_MS * 2;
  var siec = fetch(req).then(function (r) {
    if (r && r.ok) {
      var kopia = r.clone();
      caches.open(WERSJA).then(function (c) { return c.put(klucz, kopia); });
    }
    return r;
  });
  e.waitUntil(siec.catch(function () {}));
  e.respondWith(new Promise(function (ok) {
    var gotowe = false;
    function oddaj(r) { if (!gotowe && r) { gotowe = true; ok(r); } }
    // słaba sieć: po limicie czasu oddaj zapisaną kopię (jeśli jest), inaczej czekaj dalej
    var t = setTimeout(function () { zKopii(klucz).then(oddaj); }, limit);
    siec.then(function (r) { clearTimeout(t); oddaj(r); }, function () {
      clearTimeout(t);
      zKopii(klucz).then(function (r) {
        oddaj(r || new Response("// brak połączenia i brak zapisanej kopii\n", {
          status: 503, headers: { "Content-Type": req.mode === "navigate" ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8" }
        }));
      });
    });
  }));
});
