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
 *   notes   { id, deckId, hanzi, trad, pinyin, meaning, createdAt, updatedAt, deleted }
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

/** Aynı karakter havuzda var mı? Yinelenen kart eklemeyi önlemek için. */
export async function findByHanzi(hanzi) {
  const rows = await tx(['notes'], 'readonly', (s) => asArray(s.index('hanzi'), hanzi));
  return live(rows)[0] ?? null;
}

/**
 * Kayıt ekler ve istenen türler için kartlarını üretir.
 * Kartlar "yeni" durumunda başlar; sıraya girme anı ilk çalışmada belirlenir.
 */
export async function addNote({ deckId, hanzi, trad = '', pinyin, meaning }, types) {
  const now = Date.now();
  const note = {
    id: uid(), deckId, hanzi, trad, pinyin, meaning,
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
  types: ['read', 'pinyin', 'recall'],
  newPerDay: 15,
  maxReviews: 150,
  tts: false,
  lastDeck: null,
};

export async function getSettings() {
  const rows = await tx(['meta'], 'readonly', (s) => asArray(s));
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULTS, ...stored };
}

export async function setSetting(key, value) {
  return tx(['meta'], 'readwrite', (s) => s.put({ key, value }));
}

/* ───────────────────────── yedek ───────────────────────── */

export async function exportAll() {
  const [decks, notes, cards, reviews, meta] = await Promise.all([
    tx(['decks'], 'readonly', (s) => asArray(s)),
    tx(['notes'], 'readonly', (s) => asArray(s)),
    tx(['cards'], 'readonly', (s) => asArray(s)),
    tx(['reviews'], 'readonly', (s) => asArray(s)),
    tx(['meta'], 'readonly', (s) => asArray(s)),
  ]);
  return {
    app: 'inkwell',
    version: 1,
    exportedAt: new Date().toISOString(),
    decks, notes, cards, reviews, meta,
  };
}

/**
 * İçe aktarma birleştiricidir, silici değil: aynı id'den iki sürüm varsa
 * `updatedAt` değeri büyük olan kazanır. Böylece iki cihazın yedeklerini
 * üst üste yüklemek veri kaybettirmez.
 */
export async function importAll(data) {
  if (data?.app !== 'inkwell') throw new Error('Bu dosya bir Inkwell yedeği değil.');
  const stats = { decks: 0, notes: 0, cards: 0, reviews: 0 };

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
  await tx(['meta'], 'readwrite', (s) => {
    for (const row of data.meta ?? []) s.put(row);
  });

  return stats;
}
