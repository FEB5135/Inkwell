/**
 * Servis çalışanı — uygulamayı çevrimdışı kullanılabilir kılar.
 *
 * İki katman:
 *  - Uygulama kabuğu (html/css/js) kurulumda önbelleğe alınır, ağdan önce
 *    önbellekten sunulur ve arka planda tazelenir.
 *  - Sözlük (6,8 MB) ilk kullanıldığında önbelleğe alınır. Kurulumda
 *    indirmek, uygulamayı ilk açışta gereksiz yere bekletirdi.
 */

// Kabuk ile veri ayrı sürümleniyor: kabuk değiştiğinde 6,8 MB'lık sözlüğü
// yeniden indirtmenin anlamı yok.
const SHELL = 'inkwell-shell-v2';
const DATA = 'inkwell-data-v1';

const SHELL_FILES = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/store.js',
  'js/srs.js',
  'js/dict.js',
  'js/pinyin.js',
  'js/grade.js',
  'js/i18n.js',
  'js/strokes.js',
  'js/syllables.js',
  'js/vendor/hanzi-writer.min.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // Sözlük ve strok verisi: bir kez indir, sonra hep önbellekten.
  if (url.pathname.endsWith('/data/cedict.tsv') || url.pathname.endsWith('/data/strokes.txt')) {
    e.respondWith(
      caches.open(DATA).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  // Kabuk: önce ağ, olmazsa önbellek.
  //
  // Önce önbellekten sunuyordu, tazeleme arkada kalıyordu: güncelleme hep bir
  // açılış gecikmeli geliyor, hızlı yeniden yüklemelerde ise sayfa kapanınca
  // `cache.put` yarıda kaldığı için hiç gelmiyordu. Bu uygulamada "ağ" ya
  // yerel sunucu ya da APK'nın kendi varlıkları — pratikte hep hazır, o yüzden
  // önce ağa gitmek maliyetsiz, çevrimdışılık da önbellek yedeğiyle duruyor.
  e.respondWith(
    caches.open(SHELL).then(async (cache) => {
      try {
        const res = await fetch(request);
        // waitUntil: yazma bitene kadar servis çalışanı ayakta kalsın, yoksa
        // sayfa yenilenirken önbellek güncellemesi yarıda kalıyor.
        if (res.ok) e.waitUntil(cache.put(request, res.clone()));
        return res;
      } catch (err) {
        const hit = await cache.match(request, { ignoreSearch: true });
        if (hit) return hit;
        throw err;
      }
    })
  );
});
