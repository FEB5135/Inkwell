/**
 * Küçük bir statik sunucu.
 *
 * Tarayıcı, `file://` ile açılan sayfalara modül yüklemeye ve dosya okumaya
 * izin vermediği için uygulamanın bir http adresinden servis edilmesi gerekir.
 * Dışarıdan bağımlılık istemesin diye Node'un kendi http modülüyle yazıldı.
 *
 * Yalnız 127.0.0.1'i dinler: ağdaki başka cihazlar erişemez.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] ?? '.');
const PORT = Number(process.env.PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith('/')) path += 'index.html';

  // Dizin dışına çıkma girişimlerini engelle.
  const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bulunamadı');
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    // Sözlük büyük ve hiç değişmiyor; kalanı her açılışta tazelensin.
    'cache-control': file.endsWith('cedict.tsv') ? 'public, max-age=604800' : 'no-cache',
    'service-worker-allowed': '/',
  });
  createReadStream(file).pipe(res);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Zaten çalışıyor: http://localhost:${PORT}`);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Inkwell çalışıyor: http://localhost:${PORT}`);
  console.log('Kapatmak için bu pencereyi kapat.');
});
