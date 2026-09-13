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

/** Düğmelerin altında gösterilen "bir sonraki tekrar" önizlemesi. */
export function previewLabel(card, grade, now = Date.now()) {
  const next = schedule(card, grade, now);
  const ms = next.due - now;
  if (ms < 45 * MIN) return `${Math.max(1, Math.round(ms / MIN))} dk`;
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))} sa`;
  const days = ms / DAY;
  if (days < 30) return `${Math.round(days)} gün`;
  if (days < 365) return `${(days / 30).toFixed(days < 60 ? 1 : 0)} ay`;
  return `${(days / 365).toFixed(1)} yıl`;
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
 * Sıralama kuralları:
 *  - Vadesi gelmiş tekrarlar önce (birikmemeleri için),
 *  - öğrenme aşamasındakiler zamanı geldikçe araya girer,
 *  - yeni kartlar günlük sınıra kadar sona eklenir.
 *
 * Aynı kaydın farklı türdeki kartları arka arkaya gelmez: birini görmek
 * diğerinin cevabını verir, o yüzden araları açılır.
 */
export function buildQueue(cards, { newPerDay, maxReviews, seenNewToday = 0 }, now = Date.now()) {
  const due = [];
  const learning = [];
  const fresh = [];

  for (const c of cards) {
    if (c.state === 'new') fresh.push(c);
    else if (c.state === 'learning' || c.state === 'relearning') learning.push(c);
    else if (c.due <= now) due.push(c);
  }

  due.sort((a, b) => a.due - b.due);
  learning.sort((a, b) => a.due - b.due);
  fresh.sort((a, b) => a.due - b.due);

  const newBudget = Math.max(0, newPerDay - seenNewToday);
  const queue = [
    ...learning,
    ...due.slice(0, maxReviews),
    ...fresh.slice(0, newBudget),
  ];

  return spreadSiblings(queue);
}

/** Aynı noteId'ye ait kartları birbirinden uzaklaştırır. */
function spreadSiblings(queue) {
  const out = [];
  const pending = [...queue];
  const GAP = 3;

  while (pending.length) {
    let picked = -1;
    for (let i = 0; i < pending.length; i++) {
      const recent = out.slice(-GAP);
      if (!recent.some((c) => c.noteId === pending[i].noteId)) { picked = i; break; }
    }
    if (picked < 0) picked = 0; // başka seçenek yok
    out.push(pending.splice(picked, 1)[0]);
  }
  return out;
}

/** Gün sınırlarını yerel saate göre hesaplar (gece yarısı = gün başı). */
export function startOfToday(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
