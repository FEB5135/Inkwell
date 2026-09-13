/**
 * Strok verisi — kalemle yazma pratiği için.
 *
 * data/strokes.txt satır başına bir karakter tutar (bkz. tools/build-strokes.mjs).
 * Dosya 25 MB olduğu için:
 *   - yalnız ilk yazma oturumunda yüklenir,
 *   - bellekte satır dizini olarak durur, ayrıştırma karakter başına yapılır,
 *   - ayrıştırılan karakterler önbelleğe alınır.
 *
 * Android sürümünde dosya uygulamanın içinde olduğu için yükleme anlıktır;
 * web sürümünde bir kez indirilip servis çalışanı önbelleğine girer.
 */

let index = null;              // char -> satır
const parsed = new Map();      // char -> { strokes, medians }
let loading = null;

export const isLoaded = () => index !== null;
export const size = () => index?.size ?? 0;

export function load(onProgress) {
  if (loading) return loading;

  loading = (async () => {
    onProgress?.('Strok verisi yükleniyor…');
    const res = await fetch('data/strokes.txt');
    if (!res.ok) throw new Error(`Strok verisi okunamadı (${res.status})`);
    const text = await res.text();

    onProgress?.('Hazırlanıyor…');
    index = new Map();
    let start = 0;
    while (start < text.length) {
      let end = text.indexOf('\n', start);
      if (end === -1) end = text.length;
      // Satırın ilk karakteri anahtardır; gerisini şimdilik ayrıştırmıyoruz.
      const char = text[start];
      if (char && char !== '\t') index.set(char, text.slice(start, end));
      start = end + 1;
    }
    onProgress?.(null);
    return index.size;
  })();

  return loading;
}

/** Karakterin strok verisi var mı? */
export const has = (char) => !!index?.has(char);

/**
 * HanziWriter'ın beklediği biçimde veri döndürür.
 * Veri yoksa null döner — arayüz o zaman yazma kartını elle doğrulamaya düşürür.
 */
export function charData(char) {
  if (parsed.has(char)) return parsed.get(char);
  const line = index?.get(char);
  if (!line) return null;

  const [, strokeBlob, medianBlob] = line.split('\t');
  if (!strokeBlob || !medianBlob) return null;

  const data = {
    strokes: strokeBlob.split(';'),
    medians: medianBlob
      .split(';')
      .map((m) => m.split(' ').filter(Boolean).map((p) => p.split(',').map(Number))),
  };
  parsed.set(char, data);
  return data;
}

/** Bir sözcüğün bütün karakterleri çizilebiliyor mu? */
export function canWrite(word) {
  if (!index) return false;
  return [...String(word)].every((ch) => index.has(ch));
}
