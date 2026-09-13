/**
 * Servis çalışanı — uygulamayı çevrimdışı kullanılabilir kılar.
 *
 * İki katman:
 *  - Uygulama kabuğu (html/css/js) kurulumda önbelleğe alınır, ağdan önce
 *    önbellekten sunulur ve arka planda tazelenir.
 *  - Sözlük (6,8 MB) ilk kullanıldığında önbelleğe alınır. Kurulumda
 *    indirmek, uygulamayı ilk açışta gereksiz yere bekletirdi.
 */

const VERSION = 'v1';
const SHELL = `inkwell-shell-${VERSION}`;
const DATA = `inkwell-data-${VERSION}`;

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

  // Kabuk: önce önbellek, arkada tazeleme.
  e.respondWith(
    caches.open(SHELL).then(async (cache) => {
      const hit = await cache.match(request, { ignoreSearch: true });
      const net = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit ?? net;
    })
  );
});
