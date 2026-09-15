/**
 * Aralıklı tekrar — SM-2 türevi, öğrenme adımlarıyla.
 *
 * Neden bu: bir kartı ne zaman tekrar göreceğin, onu en son ne kadar
 * zorlandığına bağlı olarak katlanarak uzar. Bildiğin karakter aylarca
 * karşına çıkmaz, takıldığın her gün çıkar. Yüzlerce hanzi'yi günde
 * yirmi dakikada taşımayı mümkün kılan tek şey bu.
 *
 * Durumlar:  new → learning → review  (hata ederse → relearning → review)
 */

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

export const LEARN_STEPS = [1 * MIN, 10 * MIN];
export const RELEARN_STEPS = [10 * MIN];

const GRADUATE_IVL = 1;      // gün
const EASY_IVL = 4;          // gün
const MIN_EASE = 1.3;
const MAX_IVL = 365 * 5;

export const AGAIN = 1, HARD = 2, GOOD = 3, EASY = 4;

/** Aynı kartın hep aynı güne yığılmaması için aralığa ±%5 serpiştirme. */
function fuzz(days) {
  if (days < 2.5) return days;
  const spread = Math.max(1, days * 0.05);
  return days + (Math.random() * 2 - 1) * spread;
}

const clampIvl = (d) => Math.min(MAX_IVL, Math.max(1, Math.round(d)));

/**
 * Kartın bir değerlendirme sonrası alacağı yeni hali.
 * Kartı değiştirmez; yeni bir nesne döndürür.
 */
export function schedule(card, grade, now = Date.now()) {
  const c = { ...card };
  c.reps += 1;
  c.lastReview = now;

  const isLearning = c.state === 'new' || c.state === 'learning';
  const isRelearning = c.state === 'relearning';

  if (isLearning || isRelearning) {
    const steps = isRelearning ? RELEARN_STEPS : LEARN_STEPS;

    if (grade === AGAIN) {
      c.state = isRelearning ? 'relearning' : 'learning';
      c.step = 0;
      c.due = now + steps[0];
      return c;
    }

    if (grade === EASY) {
      c.state = 'review';
      c.step = 0;
      c.ivl = clampIvl(isRelearning ? Math.max(EASY_IVL, c.ivl) : EASY_IVL);
      c.due = now + c.ivl * DAY;
      return c;
    }

    // HARD: aynı adımı tekrar et. GOOD: bir sonraki adıma geç.
    const nextStep = grade === HARD ? c.step : c.step + 1;

    if (nextStep >= steps.length) {
      c.state = 'review';
      c.step = 0;
      // Hatadan dönen kart sıfırdan başlamaz; eski aralığının yarısını korur.
      c.ivl = clampIvl(isRelearning ? Math.max(GRADUATE_IVL, c.ivl * 0.5) : GRADUATE_IVL);
      c.due = now + c.ivl * DAY;
      return c;
    }

    c.state = isRelearning ? 'relearning' : 'learning';
    c.step = nextStep;
    c.due = now + steps[nextStep];
    return c;
  }

  // ── review ──
  if (grade === AGAIN) {
    c.lapses += 1;
    c.ease = Math.max(MIN_EASE, c.ease - 0.2);
    c.state = 'relearning';
    c.step = 0;
    c.ivl = clampIvl(c.ivl * 0.5);
    c.due = now + RELEARN_STEPS[0];
    return c;
  }

  let ivl;
  if (grade === HARD) {
    c.ease = Math.max(MIN_EASE, c.ease - 0.15);
    ivl = c.ivl * 1.2;
  } else if (grade === GOOD) {
    ivl = c.ivl * c.ease;
  } else {
    c.ease = c.ease + 0.15;
    ivl = c.ivl * c.ease * 1.3;
  }

  c.ivl = clampIvl(fuzz(Math.max(c.ivl + 1, ivl)));
  c.state = 'review';
  c.step = 0;
  c.due = now + c.ivl * DAY;
  return c;
}

/** Havuz ekranında "ne zaman çıkacak" bilgisi. */
export function dueLabel(card, now = Date.now()) {
  if (card.state === 'new') return 'yeni';
  const ms = card.due - now;
  if (ms <= 0) return 'şimdi';
  if (ms < DAY) return `${Math.max(1, Math.round(ms / (60 * MIN)))} sa`;
  const days = Math.round(ms / DAY);
  if (days < 31) return `${days} gün`;
  if (days < 365) return `${Math.round(days / 30)} ay`;
  return `${(days / 365).toFixed(1)} yıl`;
}

/**
 * Bir oturumun kart sırası.
 *
 * Havuzun tamamı karıştırılır ve baştan sona çalışılır — vade ya da günlük
 * sınır gözetilmez. Zamanlama verisi arka planda yine birikir (her cevap
 * kartın aralığını günceller) ama hangi kartın çıkacağına karışmaz.
 *
 * Aynı kaydın farklı türdeki kartları arka arkaya gelmez: birini görmek
 * diğerinin cevabını verir, o yüzden araları açılır.
 */
export function buildQueue(cards) {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return spreadSiblings(shuffled);
}

/**
 * Aynı noteId'ye ait kartları birbirinden uzaklaştırır.
 *
 * Uygun adaylar arasından **rastgele** seçiyor. Önceden ilk uygun kartı
 * alıyordu; bu, karıştırmayı bozup küçük havuzları katı bir devre çeviriyordu
 * — üç karakterli bir destede sıra her seferinde A B C A B C olarak çıkıyordu.
 *
 * Kartı az kalmış kaydı sona bırakmamak için, eşit şartlarda elinde daha çok
 * kart kalan kayıt öne alınıyor. Her kaydın kart sayısı aynı olduğunda (olağan
 * durum) bu koşul hep berabere biter ve seçim saf rastgeleye iner; işe yalnız
 * kartlar dengesizken karışıyor. Böylesi olmadan, sona kalan tek kaydın
 * kartları arka arkaya yığılıyordu: her oturum aynı karakteri üç kez üst üste
 * sorarak bitiyordu.
 */
function spreadSiblings(queue) {
  const out = [];
  const pending = [...queue];
  const GAP = 3;

  const remaining = new Map();
  for (const c of pending) remaining.set(c.noteId, (remaining.get(c.noteId) ?? 0) + 1);

  // Aralık en az iki aday bırakmalı: `size - 1` seçilirse her adımda tek bir
  // kayıt uygun kalıyor ve sıra kendini tekrar eden katı bir devre dönüşüyor —
  // dört karakterli destede oturum boyunca aynı dördül geliyordu. `size - 2`
  // ile her adımda hep bir seçenek fazlası var.
  const gap = remaining.size <= 1 ? 0 : Math.max(1, Math.min(GAP, remaining.size - 2));

  while (pending.length) {
    const recent = gap > 0 ? out.slice(-gap).map((c) => c.noteId) : [];

    let pool = pending.map((_, i) => i).filter((i) => !recent.includes(pending[i].noteId));
    if (!pool.length) pool = pending.map((_, i) => i);

    // Kalan kart sayısına göre ağırlıklı rastgele seçim. Kartların hepsi eşit
    // dağılmışken bu düpedüz eşit olasılık demek; biriken kayıt oldukça o
    // kaydın çekilme şansı artıyor ve sona yığılmıyor. Ağırlığı görmezden
    // gelip "en çok kalanı" seçmek ise sırayı yine katı bir devre çeviriyor.
    let total = 0;
    for (const i of pool) total += remaining.get(pending[i].noteId);
    let tick = Math.random() * total;
    let picked = pool[pool.length - 1];
    for (const i of pool) {
      tick -= remaining.get(pending[i].noteId);
      if (tick <= 0) { picked = i; break; }
    }

    const card = pending.splice(picked, 1)[0];
    remaining.set(card.noteId, remaining.get(card.noteId) - 1);
    if (!remaining.get(card.noteId)) remaining.delete(card.noteId);
    out.push(card);
  }
  return out;
}

/** Gün sınırlarını yerel saate göre hesaplar (gece yarısı = gün başı). */
export function startOfToday(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
