/**
 * Gömülü CC-CEDICT araması.
 *
 * Dosya (data/cedict.tsv) yaygınlıktan nadire doğru sıralı olduğu için
 * arama basitçe baştan tarar ve ilk N eşleşmeyi döndürür; ayrıca bir sıklık
 * verisi tutmaya gerek kalmaz.
 *
 * Sözlük ilk arama denemesinde yüklenir — uygulamanın açılışını yavaşlatmaz.
 */
import { toneless, toMarks, canonical } from './pinyin.js';

const CJK = /[㐀-鿿豈-﫿]/;
const LIMIT = 60;

let rows = null;       // [simp, trad, pinyin, meaning] dizileri
let pinyinKey = null;  // tonsuz, boşluksuz pinyin
let tonedKey = null;   // tonlu, boşluksuz pinyin ("ni3hao3")
let meaningKey = null; // küçük harfe indirilmiş anlam
let loading = null;

export const isLoaded = () => rows !== null;

export function load(onProgress) {
  if (loading) return loading;

  loading = (async () => {
    onProgress?.('Sözlük yükleniyor…');
    const res = await fetch('data/cedict.tsv');
    if (!res.ok) throw new Error(`Sözlük dosyası okunamadı (${res.status})`);
    const text = await res.text();

    onProgress?.('Sözlük hazırlanıyor…');
    const lines = text.split('\n');
    rows = new Array(lines.length);
    pinyinKey = new Array(lines.length);
    tonedKey = new Array(lines.length);
    meaningKey = new Array(lines.length);

    let n = 0;
    for (const line of lines) {
      if (!line) continue;
      const parts = line.split('\t');
      if (parts.length < 4) continue;
      rows[n] = parts;
      pinyinKey[n] = toneless(parts[2]);
      tonedKey[n] = canonical(parts[2]);
      meaningKey[n] = parts[3].toLowerCase();
      n++;
    }
    rows.length = pinyinKey.length = tonedKey.length = meaningKey.length = n;

    onProgress?.(`${n.toLocaleString('tr')} kayıt hazır.`);
    return n;
  })();

  return loading;
}

function pack(i) {
  const [simp, trad, pinyin, meaning] = rows[i];
  return { hanzi: simp, trad, pinyin, pinyinMarks: toMarks(pinyin), meaning };
}

/**
 * Tek bir sorgu üç girdi biçimini de karşılar:
 *   好      → karakterin kendisi
 *   hao3    → tonlu pinyin (tam eşleşme öne çıkar)
 *   good    → İngilizce anlam
 */
export function search(query) {
  if (!rows) return [];
  const q = query.trim();
  if (!q) return [];

  if (CJK.test(q)) {
    const out = [];
    for (let i = 0; i < rows.length && out.length < LIMIT; i++) {
      if (rows[i][0].includes(q)) out.push(pack(i));
    }
    return out;
  }

  const lower = q.toLowerCase();
  const isPinyinish = /^[a-zü][a-zü1-5\s':]*$/i.test(q);

  if (isPinyinish) {
    const keyed = toneless(q);
    const hasTone = /[1-5]/.test(q);
    const exact = hasTone ? q.toLowerCase().replace(/\s+/g, '') : null;

    const starts = [];
    const contains = [];
    const tonedHits = [];

    for (let i = 0; i < rows.length; i++) {
      const k = pinyinKey[i];
      if (!k.startsWith(keyed)) {
        if (contains.length < LIMIT && k.includes(keyed)) contains.push(i);
        continue;
      }
      if (exact && rows[i][2].toLowerCase().replace(/\s+/g, '') === exact) tonedHits.push(i);
      else starts.push(i);

      if (tonedHits.length + starts.length >= LIMIT * 2) break;
    }

    // Tonu da tutan kayıtlar en üstte; sonra önek eşleşmeleri.
    const merged = [...tonedHits, ...starts, ...contains].slice(0, LIMIT);
    return merged.map(pack);
  }

  // İngilizce anlam araması: tam sözcük eşleşmesi öne alınır.
  const word = new RegExp(`(^|[^a-z])${lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`);
  const strong = [];
  const weak = [];
  for (let i = 0; i < rows.length; i++) {
    const m = meaningKey[i];
    if (!m.includes(lower)) continue;
    if (word.test(m)) strong.push(i);
    else if (weak.length < LIMIT) weak.push(i);
    if (strong.length >= LIMIT) break;
  }
  return [...strong, ...weak].slice(0, LIMIT).map(pack);
}

/**
 * Pinyin'den karaktere çözümleme.
 *
 * "ni3hao3" -> 你好. Aynı okunuşa sahip birden çok karakter olabileceği için
 * (ni3: 你, 拟, 泥…) bir liste döner; ilk sıradaki en yaygın olandır, çünkü
 * sözlük dosyası yaygınlığa göre sıralıdır.
 *
 * Ton verilmişse önce tonu da tutan kayıtlar aranır; hiç eşleşme yoksa ton
 * yok sayılarak tekrar denenir.
 */
export function byPinyin(query, max = 8) {
  if (!rows) return [];
  const toned = canonical(query);
  if (!toned) return [];

  const exact = [];
  for (let i = 0; i < rows.length && exact.length < max; i++) {
    if (tonedKey[i] === toned) exact.push(pack(i));
  }
  if (exact.length) return exact;

  const bare = toneless(query);
  const loose = [];
  for (let i = 0; i < rows.length && loose.length < max; i++) {
    if (pinyinKey[i] === bare) loose.push(pack(i));
  }
  return loose;
}

/** Toplu yapıştırmada "sadece karakter verilmiş" satırları tamamlamak için. */
export function lookupExact(hanzi) {
  if (!rows) return null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === hanzi) return pack(i);
  }
  return null;
}
