/**
 * Uygulama dosyalarını www/ altında toplar.
 *
 * Kaynak dosyalar depo kökünde durur; kök aynı zamanda doğrudan bir statik
 * sunucuyla servis edilebilir (web sürümü böyle çalışır). Capacitor ise tek
 * bir klasörü Android varlıklarına kopyaladığı için ona ayrı bir çıktı
 * klasörü veriyoruz.
 */
import { cp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const OUT = 'www';

const ENTRIES = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'css',
  'js',
  'data',
  'icons',
];

if (!existsSync('data/cedict.tsv')) {
  console.error('data/cedict.tsv yok — önce `node tools/build-dict.mjs` çalıştır.');
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const entry of ENTRIES) {
  await cp(entry, `${OUT}/${entry}`, { recursive: true });
}

console.log(`www/ hazır (${ENTRIES.length} girdi).`);
