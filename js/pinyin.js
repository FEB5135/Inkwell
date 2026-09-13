/**
 * Pinyin yardımcıları.
 *
 * Temel varsayım: kullanıcıda İngilizce klavye var. Yani hiçbir yerde ton
 * işaretini doğrudan yazması beklenmez — "hao3" yazar, biz "hǎo" gösteririz.
 * Cevap denetiminde de her iki yazım kabul edilir.
 */

const MARKS = {
  a: 'aāáǎà', e: 'eēéěè', i: 'iīíǐì',
  o: 'oōóǒò', u: 'uūúǔù', ü: 'üǖǘǚǜ',
};

// Ton işaretli harften çıplak harf + ton numarasına.
const FROM_MARK = new Map();
for (const [base, forms] of Object.entries(MARKS)) {
  [...forms].forEach((ch, tone) => FROM_MARK.set(ch, [base, tone]));
}

/** Bir hecede ton işaretinin hangi sesliye konacağını bulur. */
function toneSeat(syl) {
  const i = syl.indexOf('a');
  if (i >= 0) return i;
  const o = syl.indexOf('o');
  if (o >= 0) return o;
  const e = syl.indexOf('e');
  if (e >= 0) return e;
  // Kalan durumlar (iu, ui, i, u, ü): işaret son sesliye gider.
  for (let k = syl.length - 1; k >= 0; k--) {
    if ('iuü'.includes(syl[k])) return k;
  }
  return -1;
}

/** "nv3" / "nu:3" gibi ü yazımlarını tek biçime indirger. */
function unifyU(s) {
  return s.replace(/u:/g, 'ü').replace(/v/g, 'ü').replace(/V/g, 'Ü');
}

/**
 * "ni3 hao3" -> "nǐ hǎo".  Sayısız metni olduğu gibi bırakır, yani zaten
 * işaretli girdiler de güvenle bu fonksiyondan geçirilebilir.
 */
export function toMarks(input) {
  if (!input) return '';
  return unifyU(String(input)).replace(/([a-zA-ZüÜ]+)([1-5])/g, (all, letters, tone) => {
    const t = Number(tone);
    if (t === 5) return letters; // hafif ton: işaret yok
    const lower = letters.toLowerCase();
    const seat = toneSeat(lower);
    if (seat < 0) return letters;
    const base = lower[seat];
    const marked = MARKS[base]?.[t];
    if (!marked) return letters;
    const out = letters.slice(0, seat) + marked + letters.slice(seat + 1);
    // Baş harf büyükse koru (Bei3jing1 -> Běijīng)
    return letters[0] === letters[0].toUpperCase() && /[a-zA-Z]/.test(letters[0])
      ? out[0].toUpperCase() + out.slice(1)
      : out;
  });
}

/** Ton işaretli metni "ni3hao3" biçimine çevirir. */
export function toNumbers(input) {
  if (!input) return '';
  let out = '';
  let pendingTone = '';
  for (const ch of unifyU(String(input))) {
    const hit = FROM_MARK.get(ch.toLowerCase());
    if (hit && hit[1] > 0) {
      out += hit[0];
      pendingTone = String(hit[1]);
      continue;
    }
    if (/[a-zA-ZüÜ]/.test(ch)) {
      out += ch.toLowerCase();
      continue;
    }
    // hece sınırı: bekleyen tonu buraya bırak
    if (pendingTone) { out += pendingTone; pendingTone = ''; }
    out += ch;
  }
  if (pendingTone) out += pendingTone;
  return out;
}

/** Aramada kullanılan biçim: ton yok, boşluk yok, küçük harf. */
export function toneless(input) {
  return toNumbers(input).replace(/[1-5]/g, '').replace(/[^a-zü]/g, '');
}

/**
 * Cevap denetimi için kanonik biçim: boşluksuz, küçük harf, tonlar sayıya
 * çevrilmiş. Hafif ton (5) yazılmamış sayılır ki "de" ile "de5" eşit olsun.
 */
export function canonical(input) {
  return toNumbers(input)
    .toLowerCase()
    .replace(/[^a-zü1-5]/g, '')
    .replace(/5/g, '');
}

/** Kullanıcının yazdığı cevap doğru mu? */
export function answerMatches(given, expected) {
  const g = canonical(given);
  if (!g) return false;
  return g === canonical(expected);
}

/** Ton yok sayılırsa doğru muydu? "Sadece tonu kaçırdın" demek için. */
export function matchesButTone(given, expected) {
  return toneless(given) === toneless(expected) && toneless(given) !== '';
}

/** Tek bir hecenin pinyin gibi görünüp görünmediği — toplu yapıştırma ayrıştırıcısı için. */
const SYLLABLE = /^(?:[bpmfdtnlgkhjqxrzcsyw]|zh|ch|sh)?(?:i|u|ü|v|a|o|e)[a-zü:]*[1-5]?$/i;
export function looksLikePinyin(token) {
  const t = unifyU(token.toLowerCase()).replace(/[.,;:!?]/g, '');
  if (!t) return false;
  // "er", "n", "ng" gibi istisnalar
  if (/^(er|r|n|ng|hm|hng|m)[1-5]?$/.test(t)) return true;
  return SYLLABLE.test(t);
}
