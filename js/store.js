/**
 * Veri katmanı — IndexedDB.
 *
 * Her kayıt `updatedAt` ve `deleted` taşır. Bugün tek cihazda çalışıyoruz ama
 * ileride tablet ↔ bilgisayar eşitlemesi eklendiğinde kayıtları veri kaybı
 * olmadan birleştirebilmek için gereken iki alan bunlar: silinen kayıt fiziksen
 * silinmez, mezar taşı bırakır; çakışma "son yazan kazanır" ile çözülebilir.
 *
 * Şemalar
 *   decks   { id, name, createdAt, updatedAt, deleted }
 *   notes   { id, deckId, hanzi, trad, pinyin, meaning, learnedAt,
 *             createdAt, updatedAt, deleted }
 *   cards   { id, noteId, type, due, ivl, ease, reps, lapses, state, step,
 *             lastReview, updatedAt, deleted }
 *   reviews { id, cardId, noteId, ts, rating, ivl }
 *   meta    { key, value }
 */

const DB_NAME = 'inkwell';
const DB_VERSION = 1;

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;

      const decks = db.createObjectStore('decks', { keyPath: 'id' });
      decks.createIndex('updatedAt', 'updatedAt');

      const notes = db.createObjectStore('notes', { keyPath: 'id' });
      notes.createIndex('deckId', 'deckId');
      notes.createIndex('hanzi', 'hanzi');
      notes.createIndex('updatedAt', 'updatedAt');

      const cards = db.createObjectStore('cards', { keyPath: 'id' });
      cards.createIndex('noteId', 'noteId');
      cards.createIndex('due', 'due');
      cards.createIndex('updatedAt', 'updatedAt');

      const reviews = db.createObjectStore('reviews', { keyPath: 'id' });
      reviews.createIndex('ts', 'ts');
      reviews.createIndex('cardId', 'cardId');

      db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(stores, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(stores, mode);
        let result;
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
        result = fn(...stores.map((s) => t.objectStore(s)));
        if (result instanceof Promise) {
          result.then((v) => (result = v));
        }
      })
  );
}

const asArray = (store, query) =>
  new Promise((resolve, reject) => {
    const req = query ? store.getAll(query) : store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

const live = (rows) => rows.filter((r) => !r.deleted);

/* ───────────────────────── desteler ───────────────────────── */

export async function allDecks() {
  const rows = await tx(['decks'], 'readonly', (s) => asArray(s));
  return live(await rows).sort((a, b) => a.createdAt - b.createdAt);
}

export async function addDeck(name) {
  const deck = { id: uid(), name, createdAt: Date.now(), updatedAt: Date.now(), deleted: false };
  await tx(['decks'], 'readwrite', (s) => s.put(deck));
  return deck;
}

export async function renameDeck(id, name) {
  return tx(['decks'], 'readwrite', (s) => {
    const req = s.get(id);
    req.onsuccess = () => {
      const d = req.result;
      if (!d) return;
      d.name = name;
      d.updatedAt = Date.now();
      s.put(d);
    };
  });
}

/** Desteyi ve içindeki her şeyi mezar taşı bırakarak siler. */
export async function removeDeck(id) {
  const notes = (await allNotes()).filter((n) => n.deckId === id);
  for (const n of notes) await removeNote(n.id);
  return tx(['decks'], 'readwrite', (s) => {
    const req = s.get(id);
    req.onsuccess = () => {
      const d = req.result;
      if (!d) return;
      d.deleted = true;
      d.updatedAt = Date.now();
      s.put(d);
    };
  });
}

/* ───────────────────────── kayıtlar ───────────────────────── */

export async function allNotes() {
  return live(await tx(['notes'], 'readonly', (s) => asArray(s)));
}

export async function notesInDeck(deckId) {
  const rows = await tx(['notes'], 'readonly', (s) => asArray(s.index('deckId'), deckId));
  return live(rows);
}

/**
 * Aynı karakter bu destede var mı?
 *
 * Denetim desteye bakıyor, havuzun tamamına değil: aynı karakter ders
 * kitabında birden çok bölümde geçebiliyor ve her bölümün destesinde kendi
 * kaydı olabilmeli. `deckId` verilmezse havuzun tamamına bakar.
 */
export async function findByHanzi(hanzi, deckId = null) {
  const rows = await tx(['notes'], 'readonly', (s) => asArray(s.index('hanzi'), hanzi));
  const canli = live(rows);
  return (deckId ? canli.filter((n) => n.deckId === deckId) : canli)[0] ?? null;
}

/**
 * Kayıt ekler ve istenen türler için kartlarını üretir.
 * Kartlar "yeni" durumunda başlar; sıraya girme anı ilk çalışmada belirlenir.
 */
export async function addNote({ deckId, hanzi, trad = '', pinyin, meaning }, types) {
  const now = Date.now();
  const note = {
    id: uid(), deckId, hanzi, trad, pinyin, meaning,
    learnedAt: null,
    createdAt: now, updatedAt: now, deleted: false,
  };
  const cards = types.map((type) => ({
    id: uid(), noteId: note.id, type,
    due: now, ivl: 0, ease: 2.5, reps: 0, lapses: 0,
    state: 'new', step: 0, lastReview: 0,
    updatedAt: now, deleted: false,
  }));

  await tx(['notes', 'cards'], 'readwrite', (nStore, cStore) => {
    nStore.put(note);
    cards.forEach((c) => cStore.put(c));
  });
  return { note, cards };
}

export async function updateNote(id, patch) {
  return tx(['notes'], 'readwrite', (s) => {
    const req = s.get(id);
    req.onsuccess = () => {
      const n = req.result;
      if (!n) return;
      Object.assign(n, patch, { updatedAt: Date.now() });
      s.put(n);
    };
  });
}

/**
 * Kaydı "öğrenildi" olarak işaretler ya da işareti kaldırır.
 *
 * Kartlar ve zamanlama silinmez, yalnız normal kuyruğun dışına çıkar: karakter
 * öğrenildi diye unutulmaz, kendi kategorisinden istendiği zaman çalışılır.
 * Alan eksikse (eski kayıtlar) yokluğu "öğrenilmedi" demektir.
 */
export async function setLearned(ids, on) {
  const now = Date.now();
  return tx(['notes'], 'readwrite', (s) => {
    for (const id of ids) {
      const req = s.get(id);
      req.onsuccess = () => {
        const n = req.result;
        if (!n) return;
        n.learnedAt = on ? now : null;
        n.updatedAt = now;
        s.put(n);
      };
    }
  });
}

/** Kayıtları başka desteye taşır. Kartlar ve zamanlama olduğu gibi kalır. */
export async function moveNotes(ids, deckId) {
  const now = Date.now();
  return tx(['notes'], 'readwrite', (s) => {
    for (const id of ids) {
      const req = s.get(id);
      req.onsuccess = () => {
        const n = req.result;
        if (!n) return;
        n.deckId = deckId;
        n.updatedAt = now;
        s.put(n);
      };
    }
  });
}

export async function removeNote(id) {
  const cards = await cardsOfNote(id);
  return tx(['notes', 'cards'], 'readwrite', (nStore, cStore) => {
    const req = nStore.get(id);
    req.onsuccess = () => {
      const n = req.result;
      if (n) {
        n.deleted = true;
        n.updatedAt = Date.now();
        nStore.put(n);
      }
    };
    for (const c of cards) {
      c.deleted = true;
      c.updatedAt = Date.now();
      cStore.put(c);
    }
  });
}

/**
 * Ayarlarda yeni bir kart türü açılırsa mevcut kayıtlar o türden yoksun kalır.
 * Bu, eksik kartları tamamlar.
 */
export async function backfillCards(types) {
  const notes = await allNotes();
  const cards = await allCards();
  const have = new Set(cards.map((c) => `${c.noteId}:${c.type}`));
  const now = Date.now();
  const missing = [];
  for (const n of notes) {
    for (const type of types) {
      if (!have.has(`${n.id}:${type}`)) {
        missing.push({
          id: uid(), noteId: n.id, type,
          due: now, ivl: 0, ease: 2.5, reps: 0, lapses: 0,
          state: 'new', step: 0, lastReview: 0,
          updatedAt: now, deleted: false,
        });
      }
    }
  }
  if (missing.length) {
    await tx(['cards'], 'readwrite', (s) => missing.forEach((c) => s.put(c)));
  }
  return missing.length;
}

/* ───────────────────────── kartlar ───────────────────────── */

export async function allCards() {
  return live(await tx(['cards'], 'readonly', (s) => asArray(s)));
}

export async function cardsOfNote(noteId) {
  const rows = await tx(['cards'], 'readonly', (s) => asArray(s.index('noteId'), noteId));
  return live(rows);
}

export async function putCard(card) {
  card.updatedAt = Date.now();
  return tx(['cards'], 'readwrite', (s) => s.put(card));
}

/* ───────────────────────── tekrar kaydı ───────────────────────── */

export async function logReview(entry) {
  const row = { id: uid(), ...entry };
  return tx(['reviews'], 'readwrite', (s) => s.put(row));
}

export async function reviewsSince(ts) {
  const rows = await tx(['reviews'], 'readonly', (s) =>
    asArray(s.index('ts'), IDBKeyRange.lowerBound(ts))
  );
  return rows;
}

/* ───────────────────────── ayarlar ───────────────────────── */

const DEFAULTS = {
  lang: null,            // null = cihazın diline bak
  types: ['pinyin', 'meaning', 'recall'],
  mode: 'all',
  tts: false,
  theme: 'system',
  // lastDeck: yeni kaydın gideceği deste. studyDeck: çalışılan deste.
  // Tek ayar olduklarında yeni deste açmak çalışma kuyruğunu sessizce
  // boşaltıyordu; ayrıldılar.
  lastDeck: null,
  studyDeck: 'all',
  // Havuz büyüdüğünde bir kez gösterilen uyarı; gösterildiyse bir daha çıkmaz.
  poolWarned: false,
};

export async function getSettings() {
  const rows = await tx(['meta'], 'readonly', (s) => asArray(s));
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const settings = { ...DEFAULTS, ...stored };

  // Eski 'read' türü (汉 → anlamı kafandan söyle, kendin not ver) yerini
  // yazdıran 'meaning' türüne bıraktı. Eski kartlar silinmez, sadece sıraya
  // girmez; kullanıcı isterse ayarlardan geri açabilir.
  if (settings.types.includes('read')) {
    settings.types = [...new Set(settings.types.map((t) => (t === 'read' ? 'meaning' : t)))];
    await setSetting('types', settings.types);
  }
  return settings;
}

export async function setSetting(key, value) {
  return tx(['meta'], 'readwrite', (s) => s.put({ key, value }));
}

/* ───────────────────────── yedek ───────────────────────── */

/**
 * Tekrar geçmişi yalnız "bugün kaç kart" sayacı için okunuyor ama hiç
 * budanmıyordu: her cevap sonsuza kadar duruyor. Ölçüldü — 500 karakter ve
 * kart başına 50 tekrarda yedeğin 8,7 MB'ının 8,3 MB'ı tekrar kayıtlarıydı.
 * Bu pencere dışındakiler hem yedekten hem veritabanından düşüyor.
 */
export const REVIEW_KEEP_DAYS = 90;

/** Pencere dışındaki tekrar kayıtlarını siler; silinen sayısını döner. */
export async function pruneReviews(days = REVIEW_KEEP_DAYS, now = Date.now()) {
  const kes = now - days * 86400000;
  const rows = await tx(['reviews'], 'readonly', (s) => asArray(s));
  const eski = rows.filter((r) => (r.ts ?? 0) < kes);
  if (!eski.length) return 0;
  await tx(['reviews'], 'readwrite', (s) => {
    for (const r of eski) s.delete(r.id);
  });
  return eski.length;
}

export async function exportAll() {
  const [decks, notes, cards, reviews, meta] = await Promise.all([
    tx(['decks'], 'readonly', (s) => asArray(s)),
    tx(['notes'], 'readonly', (s) => asArray(s)),
    tx(['cards'], 'readonly', (s) => asArray(s)),
    tx(['reviews'], 'readonly', (s) => asArray(s)),
    tx(['meta'], 'readonly', (s) => asArray(s)),
  ]);
  const kes = Date.now() - REVIEW_KEEP_DAYS * 86400000;
  return {
    app: 'inkwell',
    version: 1,
    exportedAt: new Date().toISOString(),
    decks, notes, cards, meta,
    // Kartların zamanlaması kendi içinde duruyor; geçmiş yalnız günlük sayaç
    // için, o yüzden yedeğe son pencere giriyor.
    reviews: reviews.filter((r) => (r.ts ?? 0) >= kes),
  };
}

/** İçe aktarmada korunan, cihaza özgü ayarlar. */
const DEVICE_LOCAL = new Set(['lang', 'theme', 'lastDeck', 'studyDeck', 'mode']);

/**
 * Aynı karakterin iki cihazda ayrı ayrı eklenmiş kopyalarını birleştirir.
 *
 * Birleştirme `id` üzerinden yapılıyor; aynı karakteri iki cihazda elle
 * eklersen iki ayrı `id` oluşur ve yedekler üst üste binince havuzda iki 猫
 * belirir. Ekleme akışındaki `findByHanzi` bunu yalnız tek cihazda önlüyor.
 *
 * Kural her iki cihazda da aynı sonucu vermeli, yoksa yedekler gidip gelirken
 * yakınsamaz: kazanan, karakterin **en eski** kaydı (eşitlikte küçük `id`).
 * Kartlarda ise tür tür en çok çalışılmış olan tutulur — kopyalardan biri
 * bilgisayarda, diğeri tablette çalışılmış olabilir, geçmişin çok olanı
 * saklamak öğrenmeyi bozmaz.
 *
 * Saf işlev: aynı girdi her yerde aynı planı üretir, sınanabilir.
 */
export function planDedupe(notes, cards) {
  const liveNotes = (notes ?? []).filter((n) => !n.deleted);
  const liveCards = (cards ?? []).filter((c) => !c.deleted);

  // Anahtar deste + karakter: aynı karakterin farklı destelerdeki kopyaları
  // artık kasıtlı, birleştirilmemeli. Yalnız *aynı* destede iki kez belirmesi
  // kaza sayılıyor — iki cihazda aynı desteye elle eklemek gibi.
  const byHanzi = new Map();
  for (const n of liveNotes) {
    const hanzi = String(n.hanzi ?? '').trim();
    if (!hanzi) continue;
    const key = `${n.deckId}
${hanzi}`;
    if (!byHanzi.has(key)) byHanzi.set(key, []);
    byHanzi.get(key).push(n);
  }

  const cardsOf = new Map();
  for (const c of liveCards) {
    if (!cardsOf.has(c.noteId)) cardsOf.set(c.noteId, []);
    cardsOf.get(c.noteId).push(c);
  }

  // Daha çok çalışılmış kart: tekrar sayısı, sonra son görülme, sonra aralık.
  // Son ölçüt `id`, yalnız berabereliği deterministik bozmak için.
  const stronger = (a, b) =>
    (b.reps ?? 0) - (a.reps ?? 0) ||
    (b.lastReview ?? 0) - (a.lastReview ?? 0) ||
    (b.ivl ?? 0) - (a.ivl ?? 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const older = (a, b) =>
    (a.createdAt ?? 0) - (b.createdAt ?? 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const plan = { keeps: [], droppedNotes: [], movedCards: [], droppedCards: [] };

  for (const group of byHanzi.values()) {
    if (group.length < 2) continue;

    const [winner, ...losers] = [...group].sort(older);
    plan.keeps.push(winner.id);
    plan.droppedNotes.push(...losers.map((n) => n.id));

    const candidates = group.flatMap((n) => cardsOf.get(n.id) ?? []);
    const byType = new Map();
    for (const c of candidates) {
      if (!byType.has(c.type)) byType.set(c.type, []);
      byType.get(c.type).push(c);
    }

    for (const sameType of byType.values()) {
      const [best, ...rest] = [...sameType].sort(stronger);
      if (best.noteId !== winner.id) plan.movedCards.push({ id: best.id, noteId: winner.id });
      plan.droppedCards.push(...rest.map((c) => c.id));
    }
  }
  return plan;
}

/**
 * Havuzu tarayıp aynı destedeki mükerrer kayıtları tekler; birleştirilen kayıt
 * sayısını döner. İçe aktarmadan sonra ve kayıt taşındıktan sonra çağrılıyor —
 * ikisi de aynı destede iki kopya bırakabilen işlemler.
 */
export async function dedupeAll() {
  const [notes, cards] = await Promise.all([
    tx(['notes'], 'readonly', (s) => asArray(s)),
    tx(['cards'], 'readonly', (s) => asArray(s)),
  ]);
  return applyDedupe(planDedupe(notes, cards));
}

/** planDedupe'un çıkardığı planı yazar; birleştirilen kayıt sayısını döner. */
export async function applyDedupe(plan) {
  if (!plan.droppedNotes.length) return 0;
  const now = Date.now();

  await tx(['cards'], 'readwrite', (s) => {
    for (const { id, noteId } of plan.movedCards) {
      const req = s.get(id);
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        c.noteId = noteId;
        c.updatedAt = now;
        s.put(c);
      };
    }
    for (const id of plan.droppedCards) {
      const req = s.get(id);
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        c.deleted = true;
        c.updatedAt = now;
        s.put(c);
      };
    }
  });

  await tx(['notes'], 'readwrite', (s) => {
    for (const id of plan.droppedNotes) {
      const req = s.get(id);
      req.onsuccess = () => {
        const n = req.result;
        if (!n) return;
        n.deleted = true;
        n.updatedAt = now;
        s.put(n);
      };
    }
  });

  return plan.droppedNotes.length;
}

/**
 * İçe aktarma birleştiricidir, silici değil: aynı id'den iki sürüm varsa
 * `updatedAt` değeri büyük olan kazanır. Böylece iki cihazın yedeklerini
 * üst üste yüklemek veri kaybettirmez.
 */
export async function importAll(data) {
  // Arayüz çevirisini veri katmanına taşımamak için kod fırlatılıyor.
  if (data?.app !== 'inkwell') throw new Error('notBackup');
  const stats = { decks: 0, notes: 0, cards: 0, reviews: 0, merged: 0 };

  const mergeInto = (storeName, rows, counter) =>
    tx([storeName], 'readwrite', (s) => {
      for (const row of rows ?? []) {
        const req = s.get(row.id);
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur || (row.updatedAt ?? 0) >= (cur.updatedAt ?? 0)) {
            s.put(row);
            stats[counter]++;
          }
        };
      }
    });

  await mergeInto('decks', data.decks, 'decks');
  await mergeInto('notes', data.notes, 'notes');
  await mergeInto('cards', data.cards, 'cards');
  await tx(['reviews'], 'readwrite', (s) => {
    for (const row of data.reviews ?? []) {
      s.put(row);
      stats.reviews++;
    }
  });
  // Cihaza ait tercihler yedekten gelmez: bilgisayarın yedeğini tablete
  // yüklemek tabletin dilini, temasını ya da baktığın desteyi değiştirmemeli.
  // Yedeğin işi kartları taşımak.
  await tx(['meta'], 'readwrite', (s) => {
    for (const row of data.meta ?? []) {
      if (DEVICE_LOCAL.has(row.key)) continue;
      s.put(row);
    }
  });

  // Birleşme bittikten sonra: aynı karakterin iki cihazdan gelen kopyaları
  // ancak her ikisi de havuzdayken görülebilir.
  stats.merged = await dedupeAll();

  return stats;
}
