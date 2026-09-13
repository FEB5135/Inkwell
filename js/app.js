/**
 * Inkwell — arayüz ve oturum akışı.
 */
import * as db from './store.js';
import * as dict from './dict.js';
import { toMarks, toNumbers, answerMatches, matchesButTone, looksLikePinyin } from './pinyin.js';
import { schedule, previewLabel, dueLabel, buildQueue, startOfToday, AGAIN, GOOD } from './srs.js';

const $ = (id) => document.getElementById(id);
const el = (sel, root = document) => root.querySelector(sel);
const els = (sel, root = document) => [...root.querySelectorAll(sel)];

const TYPE_LABEL = {
  read:   'Tanıma',
  pinyin: 'Okunuş',
  recall: 'Üretim',
};

const state = {
  settings: null,
  decks: [],
  cards: [],
  notes: new Map(),
  screen: 'study',
  session: null,
};

/* ═══════════════════ önyükleme ═══════════════════ */

async function init() {
  state.settings = await db.getSettings();

  state.decks = await db.allDecks();
  if (!state.decks.length) {
    await db.addDeck('Genel');
    state.decks = await db.allDecks();
  }

  bindNav();
  bindStudy();
  bindAdd();
  bindBrowse();
  bindSettings();
  bindKeys();

  await refresh();
  registerServiceWorker();
}

async function refresh() {
  state.cards = await db.allCards();
  const notes = await db.allNotes();
  state.notes = new Map(notes.map((n) => [n.id, n]));
  fillDeckSelects();
  renderStudyHome();
  renderBrowse();
  renderDeckList();
}

/* ═══════════════════ gezinme ═══════════════════ */

function bindNav() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-goto]');
    if (btn) go(btn.dataset.goto);
  });
}

function go(screen) {
  if (state.session && screen !== 'study') endSession(true);
  state.screen = screen;
  els('.screen').forEach((s) => (s.hidden = s.dataset.screen !== screen));
  els('.tabbar-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.goto === screen));
  window.scrollTo(0, 0);
  if (screen === 'browse') renderBrowse();
  if (screen === 'settings') renderDeckList();
}

/* ═══════════════════ çalışma ═══════════════════ */

function bindStudy() {
  $('btn-start').addEventListener('click', startSession);
  $('btn-quit').addEventListener('click', () => endSession(true));
  $('btn-reveal').addEventListener('click', revealOrCheck);
  $('btn-done-back').addEventListener('click', () => {
    $('study-done').hidden = true;
    $('study-home').hidden = false;
    renderStudyHome();
  });
  els('.grade').forEach((b) =>
    b.addEventListener('click', () => grade(Number(b.dataset.grade)))
  );
  $('study-deck').addEventListener('change', (e) => {
    db.setSetting('lastDeck', e.target.value);
    state.settings.lastDeck = e.target.value;
    renderStudyHome();
  });
  $('answer-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); revealOrCheck(); }
  });
}

/** Seçili destenin kartları (tümü seçiliyse hepsi). */
function scopedCards() {
  const deckId = state.settings.lastDeck;
  if (!deckId || deckId === 'all') return state.cards;
  return state.cards.filter((c) => state.notes.get(c.noteId)?.deckId === deckId);
}

async function seenNewToday() {
  const rows = await db.reviewsSince(startOfToday());
  return rows.filter((r) => r.wasNew).length;
}

async function renderStudyHome() {
  const now = Date.now();
  const cards = scopedCards();

  const fresh = cards.filter((c) => c.state === 'new');
  const learning = cards.filter((c) => c.state === 'learning' || c.state === 'relearning');
  const due = cards.filter((c) => c.state === 'review' && c.due <= now);

  const usedNew = await seenNewToday();
  const newLeft = Math.max(0, Math.min(fresh.length, state.settings.newPerDay - usedNew));

  $('count-new').textContent = newLeft;
  $('count-learn').textContent = learning.length;
  $('count-due').textContent = due.length;

  const total = newLeft + learning.length + Math.min(due.length, state.settings.maxReviews);
  $('btn-start').disabled = total === 0;
  $('btn-start').textContent = total ? `Çalışmaya başla · ${total}` : 'Sırada kart yok';
  $('study-empty').hidden = total !== 0 || cards.length === 0;

  const badge = $('tab-badge');
  badge.hidden = total === 0;
  badge.textContent = total > 99 ? '99+' : total;

  const reviewsToday = (await db.reviewsSince(startOfToday())).length;
  const noteCount = new Set(cards.map((c) => c.noteId)).size;
  const mature = cards.filter((c) => c.ivl >= 21).length;
  $('mini-stats').innerHTML = cards.length
    ? `<div>Havuzda <b>${noteCount}</b> kayıt, <b>${cards.length}</b> kart.</div>
       <div>Bugün <b>${reviewsToday}</b> tekrar yapıldı.</div>
       <div><b>${mature}</b> kart yerleşmiş sayılıyor (3 haftadan uzun aralık).</div>`
    : `<div>Havuz boş. Başlamak için birkaç karakter ekle.</div>`;

  if (!cards.length) {
    $('study-empty').hidden = false;
  }
}

async function startSession() {
  const usedNew = await seenNewToday();
  const queue = buildQueue(scopedCards(), {
    newPerDay: state.settings.newPerDay,
    maxReviews: state.settings.maxReviews,
    seenNewToday: usedNew,
  });
  if (!queue.length) return;

  state.session = { queue, total: queue.length, done: 0, again: 0 };
  $('study-home').hidden = true;
  $('study-done').hidden = true;
  $('study-session').hidden = false;
  nextCard();
}

function endSession(silent = false) {
  const s = state.session;
  state.session = null;
  $('study-session').hidden = true;
  if (silent) {
    $('study-home').hidden = false;
    renderStudyHome();
    return;
  }
  $('done-summary').textContent =
    `${s.done} kart çalışıldı · ${s.again} tanesinde takıldın.`;
  $('study-done').hidden = false;
  refresh();
}

function nextCard() {
  const s = state.session;
  if (!s) return;

  if (!s.queue.length) return endSession(false);

  const card = s.queue[0];
  const note = state.notes.get(card.noteId);
  if (!note) { s.queue.shift(); return nextCard(); }

  s.current = card;
  s.revealed = false;

  $('progress-fill').style.width = `${(s.done / s.total) * 100}%`;
  $('session-left').textContent = s.queue.length;
  $('card-type').textContent = TYPE_LABEL[card.type];

  const front = $('card-front');
  const back = $('card-back');
  back.hidden = true;
  $('grade-row').hidden = true;
  $('btn-reveal').hidden = false;
  $('answer-verdict').hidden = true;

  const answerBox = $('answer-box');
  answerBox.hidden = card.type !== 'pinyin';

  if (card.type === 'recall') {
    front.innerHTML = `<p class="prompt-meaning">${escapeHtml(note.meaning)}</p>
      <p class="prompt-sub">Hangi karakter?</p>`;
    $('btn-reveal').textContent = 'Göster';
  } else {
    front.innerHTML = `<p class="hanzi">${escapeHtml(note.hanzi)}</p>`;
    if (card.type === 'pinyin') {
      const input = $('answer-input');
      input.value = '';
      input.disabled = false;
      $('btn-reveal').textContent = 'Kontrol et';
      setTimeout(() => input.focus(), 30);
    } else {
      $('btn-reveal').textContent = 'Göster';
    }
  }
}

function revealOrCheck() {
  const s = state.session;
  if (!s || s.revealed) return;
  const card = s.current;
  const note = state.notes.get(card.noteId);

  if (card.type === 'pinyin') {
    const given = $('answer-input').value;
    if (!given.trim()) return;
    const ok = answerMatches(given, note.pinyin);
    const nearMiss = !ok && matchesButTone(given, note.pinyin);

    const verdict = $('answer-verdict');
    verdict.hidden = false;
    verdict.className = `answer-verdict ${ok ? 'is-ok' : 'is-bad'}`;
    verdict.innerHTML = ok
      ? 'Doğru'
      : nearMiss
        ? `Ton yanlış<small>yazdığın: ${escapeHtml(toMarks(given))}</small>`
        : `Yanlış<small>yazdığın: ${escapeHtml(toMarks(given))}</small>`;

    $('answer-input').disabled = true;
    s.autoGrade = ok ? GOOD : AGAIN;
  }

  reveal(note);
}

function reveal(note) {
  const s = state.session;
  s.revealed = true;

  const back = $('card-back');
  const card = s.current;
  const pinyin = toMarks(note.pinyin);

  let html = '';
  if (card.type === 'recall') {
    html = `<p class="hanzi">${escapeHtml(note.hanzi)}</p>
            <p class="back-pinyin">${escapeHtml(pinyin)}</p>`;
  } else {
    html = `<p class="back-pinyin">${escapeHtml(pinyin)}</p>
            <p class="back-meaning">${escapeHtml(note.meaning)}</p>`;
  }
  if (note.trad && note.trad !== note.hanzi) {
    html += `<p class="back-extra">geleneksel: ${escapeHtml(note.trad)}</p>`;
  }
  back.innerHTML = html;
  back.hidden = false;

  $('btn-reveal').hidden = true;
  $('grade-row').hidden = false;

  const now = Date.now();
  for (const g of [1, 2, 3, 4]) $(`ivl-${g}`).textContent = previewLabel(card, g, now);

  if (state.settings.tts) speak(note.hanzi);
}

async function grade(g) {
  const s = state.session;
  if (!s || !s.revealed) return;

  const card = s.current;
  const wasNew = card.state === 'new';
  const updated = schedule(card, g);

  await db.putCard(updated);
  await db.logReview({
    cardId: card.id, noteId: card.noteId,
    ts: Date.now(), rating: g, ivl: updated.ivl, wasNew,
  });

  // yerel kopyayı da tazele
  const i = state.cards.findIndex((c) => c.id === card.id);
  if (i >= 0) state.cards[i] = updated;

  s.queue.shift();
  s.done++;
  if (g === AGAIN) s.again++;

  // Öğrenme aşamasındaki kart kısa süre sonra tekrar sıraya girer.
  if (updated.state === 'learning' || updated.state === 'relearning') {
    const insertAt = Math.min(s.queue.length, 3);
    s.queue.splice(insertAt, 0, updated);
  }

  s.autoGrade = null;
  nextCard();
}

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    if (!state.session || state.screen !== 'study') return;
    const typing = document.activeElement === $('answer-input') && !$('answer-input').disabled;

    if (e.key === ' ' && !typing) {
      e.preventDefault();
      if (state.session.revealed) grade(GOOD);
      else revealOrCheck();
      return;
    }
    if (e.key === 'Enter' && state.session.revealed) {
      e.preventDefault();
      grade(state.session.autoGrade ?? GOOD);
      return;
    }
    if (!typing && ['1', '2', '3', '4'].includes(e.key) && state.session.revealed) {
      e.preventDefault();
      grade(Number(e.key));
    }
  });
}

/* ═══════════════════ seslendirme ═══════════════════ */

function chineseVoice() {
  const voices = speechSynthesis.getVoices?.() ?? [];
  return voices.find((v) => /^zh[-_]?(CN|Hans)?/i.test(v.lang)) ?? null;
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const voice = chineseVoice();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  if (voice) u.voice = voice;
  u.rate = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

/* ═══════════════════ ekleme ═══════════════════ */

function bindAdd() {
  els('[data-addtab]').forEach((tab) =>
    tab.addEventListener('click', () => {
      els('[data-addtab]').forEach((t) => t.classList.toggle('is-active', t === tab));
      for (const pane of ['search', 'bulk', 'manual']) {
        $(`addpane-${pane}`).hidden = pane !== tab.dataset.addtab;
      }
      if (tab.dataset.addtab !== 'manual') ensureDict();
    })
  );

  const q = $('dict-q');
  let timer;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(runSearch, 160);
  });
  q.addEventListener('focus', ensureDict);

  // Enter: listedeki ilk sonucu doğrudan ekle ve bir sonrakini yazmaya hazırla.
  // Böylece "ni3 <Enter> hao3 <Enter>" diye kesintisiz giriş yapılabilir.
  q.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(timer);
    quickAdd();
  });

  $('btn-new-deck').addEventListener('click', async () => {
    const name = prompt('Yeni deste adı (örn. "Bölüm 5")');
    if (!name?.trim()) return;
    const deck = await db.addDeck(name.trim());
    state.decks = await db.allDecks();
    state.settings.lastDeck = deck.id;
    await db.setSetting('lastDeck', deck.id);
    fillDeckSelects();
    toast(`"${deck.name}" oluşturuldu`);
  });

  $('add-deck').addEventListener('change', (e) => {
    state.settings.lastDeck = e.target.value;
    db.setSetting('lastDeck', e.target.value);
  });

  $('btn-bulk-preview').addEventListener('click', previewBulk);
  $('btn-bulk-add').addEventListener('click', commitBulk);
  $('btn-manual-add').addEventListener('click', addManual);
}

async function ensureDict() {
  if (dict.isLoaded()) return;
  const status = $('dict-status');
  try {
    await dict.load((msg) => (status.textContent = msg));
  } catch (err) {
    status.textContent =
      'Sözlük yüklenemedi. Dosyadan açıyorsan yerel bir sunucu gerekiyor (README).';
    console.error(err);
  }
}

/**
 * Arama kutusunda Enter'a basıldığında en üstteki sonucu ekler.
 *
 * Ton verilmişse (ni3) önce tam okunuş eşleşmesi aranır; sıradan arama
 * "ni3" için önek eşleşmelerini de getirdiğinden, Enter'ın yanlışlıkla
 * "ni3 hao3" gibi uzun bir kaydı eklemesini bu önler.
 */
async function quickAdd() {
  const raw = $('dict-q').value.trim();
  if (!raw) return;
  await ensureDict();
  if (!dict.isLoaded()) return;

  const exact = dict.byPinyin(raw, 1);
  const hit = exact[0] ?? dict.search(raw)[0];
  if (!hit) { toast('Eşleşme yok'); return; }

  const dup = await db.findByHanzi(hit.hanzi);
  if (dup) { toast(`${hit.hanzi} zaten havuzda`); return; }

  await db.addNote(
    {
      deckId: currentDeck(),
      hanzi: hit.hanzi,
      trad: hit.trad,
      pinyin: hit.pinyin,
      meaning: hit.meaning.replace(/;/g, '; '),
    },
    state.settings.types
  );
  toast(`${hit.hanzi} ${toMarks(hit.pinyin)} eklendi`);
  $('dict-q').value = '';
  $('dict-results').innerHTML = '';
  $('dict-status').textContent = '';
  await refresh();
}

async function runSearch() {
  const q = $('dict-q').value;
  const list = $('dict-results');
  if (!q.trim()) { list.innerHTML = ''; return; }
  await ensureDict();
  if (!dict.isLoaded()) return;

  const hits = dict.search(q);
  if (!hits.length) {
    list.innerHTML = '';
    $('dict-status').textContent = 'Eşleşme yok.';
    return;
  }
  $('dict-status').textContent = `${hits.length} sonuç`;

  const existing = new Set([...state.notes.values()].map((n) => n.hanzi));
  list.innerHTML = hits
    .map(
      (h, i) => `
      <li><button class="result ${existing.has(h.hanzi) ? 'is-dupe' : ''}" data-hit="${i}">
        <span class="result-hanzi">${escapeHtml(h.hanzi)}</span>
        <span class="result-body">
          <span class="result-pinyin">${escapeHtml(h.pinyinMarks)}</span>
          <span class="result-meaning">${escapeHtml(h.meaning.replace(/;/g, ' · '))}</span>
        </span>
        ${existing.has(h.hanzi)
          ? '<span class="result-flag">havuzda</span>'
          : '<span class="result-plus">+</span>'}
      </button></li>`
    )
    .join('');

  els('[data-hit]', list).forEach((btn) =>
    btn.addEventListener('click', () => addFromDict(hits[Number(btn.dataset.hit)], btn))
  );
}

async function addFromDict(hit, btn) {
  const dup = await db.findByHanzi(hit.hanzi);
  if (dup) { toast(`${hit.hanzi} zaten havuzda`); return; }

  await db.addNote(
    {
      deckId: currentDeck(),
      hanzi: hit.hanzi,
      trad: hit.trad,
      pinyin: hit.pinyin,
      meaning: hit.meaning.replace(/;/g, '; '),
    },
    state.settings.types
  );
  btn.classList.add('is-dupe');
  el('.result-plus', btn)?.replaceWith(Object.assign(document.createElement('span'), {
    className: 'result-flag', textContent: 'eklendi',
  }));
  toast(`${hit.hanzi} eklendi`);
  await refresh();
}

const currentDeck = () => state.settings.lastDeck && state.settings.lastDeck !== 'all'
  ? state.settings.lastDeck
  : state.decks[0].id;

/* ── toplu yapıştırma ── */

const CJK_RUN = /^[㐀-鿿豈-﫿]+/;

/** Ton taşıyor mu — sayıyla (hao3) ya da işaretle (hǎo)? */
function hasTone(token) {
  return /[1-5]/.test(token) || /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i.test(token);
}

/** Bir tokenin kaç pinyin hecesi taşıdığını tahmin eder (0 = pinyin değil). */
function syllableCount(token) {
  const t = toNumbers(token.replace(/[.,;:!?()]/g, ''));
  if (!t) return 0;
  const tones = (t.match(/[1-5]/g) ?? []).length;
  if (tones > 0 && /^[a-zA-Zü:1-5]+$/.test(t)) return tones;
  return looksLikePinyin(t) ? 1 : 0;
}

/**
 * "好 hao3 iyi" → { hanzi, pinyin, meaning }
 *
 * Kural: pinyin olarak yalnızca ton taşıyan tokenlar kabul edilir. Aksi halde
 * "好 iyi" gibi satırlarda anlam yanlışlıkla pinyin sanılırdı. Ton yoksa
 * pinyin sözlükten tamamlanır.
 */
function parseBulkLine(raw) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) return null;

  // Açık ayraç varsa ona güven.
  if (/[\t|]/.test(line)) {
    const [hanzi = '', pinyin = '', ...rest] = line.split(/[\t|]+/).map((s) => s.trim());
    return { hanzi, pinyin, meaning: rest.join(' ').trim() };
  }

  const m = CJK_RUN.exec(line);
  if (!m) {
    // Çince karakter yok: satırın başındaki pinyin hecelerini karaktere
    // çevirmeyi dene. "ni3 hao3" ya da "ni3hao3 merhaba" gibi satırlar.
    const tokens = line.split(/\s+/);
    const syllables = [];
    let i = 0;
    while (i < tokens.length && hasTone(tokens[i]) && syllableCount(tokens[i])) {
      syllables.push(tokens[i]);
      i++;
    }
    if (!syllables.length) {
      return { hanzi: '', pinyin: '', meaning: line, error: 'Karakter ya da tonlu pinyin yok' };
    }
    return {
      hanzi: '',
      pinyin: syllables.join(' '),
      meaning: tokens.slice(i).join(' '),
      fromPinyin: true,
    };
  }

  const hanzi = m[0];
  const rest = line.slice(hanzi.length).trim();
  if (!rest) return { hanzi, pinyin: '', meaning: '' };

  const tokens = rest.split(/\s+/);
  const toned = [];
  let i = 0;
  let budget = hanzi.length;
  while (i < tokens.length && budget > 0) {
    const t = tokens[i];
    if (!hasTone(t)) break;
    const n = syllableCount(t);
    if (!n || n > budget) break;
    toned.push(t);
    budget -= n;
    i++;
  }

  if (toned.length) {
    return { hanzi, pinyin: toned.join(' '), meaning: tokens.slice(i).join(' ') };
  }
  return { hanzi, pinyin: '', meaning: rest };
}

let bulkParsed = [];

async function previewBulk() {
  await ensureDict();
  const lines = $('bulk-text').value.split('\n');
  const out = [];

  for (const line of lines) {
    const parsed = parseBulkLine(line);
    if (!parsed) continue;

    if (parsed.fromPinyin) {
      const hits = dict.byPinyin(parsed.pinyin);
      if (hits.length) {
        parsed.options = hits;
        applyOption(parsed, 0);
      } else {
        parsed.error = 'Bu okunuşta kayıt yok';
      }
    }

    if (parsed.hanzi && (!parsed.pinyin || !parsed.meaning)) {
      const hit = dict.lookupExact(parsed.hanzi);
      if (hit) {
        parsed.pinyin ||= hit.pinyin;
        parsed.meaning ||= hit.meaning.replace(/;/g, '; ');
        parsed.trad = hit.trad;
        parsed.filled = true;
      }
    }
    parsed.dupe = !!(await db.findByHanzi(parsed.hanzi));
    if (!parsed.hanzi) parsed.error ||= 'Karakter yok';
    else if (!parsed.pinyin) parsed.error ||= 'Pinyin bulunamadı';
    out.push(parsed);
  }

  bulkParsed = out;
  const usable = out.filter((p) => !p.error && !p.dupe);
  $('btn-bulk-add').disabled = usable.length === 0;
  $('btn-bulk-add').textContent = usable.length ? `${usable.length} kaydı ekle` : 'Ekle';

  $('bulk-preview').innerHTML = out
    .map((p, i) => {
      const alt =
        p.options?.length > 1
          ? `<select class="alt-pick" data-alt="${i}" aria-label="Başka karakter seç">${p.options
              .map(
                (o, k) =>
                  `<option value="${k}"${k === (p.chosen ?? 0) ? ' selected' : ''}>${escapeHtml(
                    `${o.hanzi} · ${o.meaning.split(';')[0].slice(0, 28)}`
                  )}</option>`
              )
              .join('')}</select>`
          : '';
      const flag = p.error
        ? escapeHtml(p.error)
        : p.dupe
          ? 'havuzda'
          : p.fromPinyin
            ? 'okunuştan'
            : p.filled
              ? 'sözlükten'
              : '';
      return `<li><div class="result ${p.error || p.dupe ? 'is-dupe' : ''}">
        <span class="result-hanzi">${escapeHtml(p.hanzi || '—')}</span>
        <span class="result-body">
          <span class="result-pinyin">${escapeHtml(toMarks(p.pinyin))}</span>
          <span class="result-meaning">${escapeHtml(p.meaning || '')}</span>
          ${alt}
        </span>
        <span class="result-flag">${flag}</span>
      </div></li>`;
    })
    .join('');

  els('[data-alt]', $('bulk-preview')).forEach((sel) =>
    sel.addEventListener('change', async () => {
      const row = bulkParsed[Number(sel.dataset.alt)];
      applyOption(row, Number(sel.value));
      row.dupe = !!(await db.findByHanzi(row.hanzi));
      previewBulk();
    })
  );
}

/** Pinyin'den çözülen bir satıra seçilen adayı uygular. */
function applyOption(row, index) {
  const hit = row.options[index];
  row.chosen = index;
  row.hanzi = hit.hanzi;
  row.trad = hit.trad;
  row.pinyin = hit.pinyin;
  // Kullanıcı kendi anlamını yazdıysa ona dokunma.
  if (!row.userMeaning) row.userMeaning = row.meaning || '';
  row.meaning = row.userMeaning || hit.meaning.replace(/;/g, '; ');
  row.error = null;
}

async function commitBulk() {
  const usable = bulkParsed.filter((p) => !p.error && !p.dupe);
  for (const p of usable) {
    await db.addNote(
      { deckId: currentDeck(), hanzi: p.hanzi, trad: p.trad ?? '', pinyin: p.pinyin, meaning: p.meaning },
      state.settings.types
    );
  }
  toast(`${usable.length} kayıt eklendi`);
  $('bulk-text').value = '';
  $('bulk-preview').innerHTML = '';
  $('btn-bulk-add').disabled = true;
  bulkParsed = [];
  await refresh();
}

async function addManual() {
  const hanzi = $('m-hanzi').value.trim();
  const pinyin = $('m-pinyin').value.trim();
  const meaning = $('m-meaning').value.trim();
  if (!hanzi || !meaning) { toast('Karakter ve anlam gerekli'); return; }
  if (await db.findByHanzi(hanzi)) { toast('Bu karakter zaten havuzda'); return; }

  await db.addNote({ deckId: currentDeck(), hanzi, pinyin, meaning }, state.settings.types);
  $('m-hanzi').value = $('m-pinyin').value = $('m-meaning').value = '';
  toast(`${hanzi} eklendi`);
  await refresh();
}

/* ═══════════════════ havuz ═══════════════════ */

function bindBrowse() {
  $('browse-deck').addEventListener('change', renderBrowse);
  $('browse-q').addEventListener('input', renderBrowse);
}

function renderBrowse() {
  const deckId = $('browse-deck').value;
  const q = $('browse-q').value.trim().toLowerCase();

  let notes = [...state.notes.values()];
  if (deckId && deckId !== 'all') notes = notes.filter((n) => n.deckId === deckId);
  if (q) {
    notes = notes.filter(
      (n) =>
        n.hanzi.includes(q) ||
        n.pinyin.toLowerCase().includes(q) ||
        n.meaning.toLowerCase().includes(q)
    );
  }
  notes.sort((a, b) => b.createdAt - a.createdAt);

  $('browse-count').textContent = `${notes.length} kayıt`;
  $('browse-empty').hidden = notes.length > 0;

  const byNote = new Map();
  for (const c of state.cards) {
    if (!byNote.has(c.noteId)) byNote.set(c.noteId, []);
    byNote.get(c.noteId).push(c);
  }

  $('notes-list').innerHTML = notes
    .slice(0, 300)
    .map((n) => {
      const cards = byNote.get(n.id) ?? [];
      const soonest = cards.reduce((a, c) => (!a || c.due < a.due ? c : a), null);
      return `<li class="note" data-note="${n.id}">
        <span class="note-hanzi">${escapeHtml(n.hanzi)}</span>
        <span class="note-body">
          <span class="note-pinyin">${escapeHtml(toMarks(n.pinyin))}</span>
          <span class="note-meaning">${escapeHtml(n.meaning)}</span>
        </span>
        <span class="note-due">${soonest ? escapeHtml(dueLabel(soonest)) : '—'}<br>${cards.length} kart</span>
        <button class="icon-btn" data-del="${n.id}" aria-label="Sil">✕</button>
      </li>`;
    })
    .join('');

  els('[data-del]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const note = state.notes.get(btn.dataset.del);
      if (!confirm(`"${note.hanzi}" silinsin mi? Tekrar geçmişi de gider.`)) return;
      await db.removeNote(note.id);
      toast('Silindi');
      await refresh();
    })
  );
}

/* ═══════════════════ ayarlar ═══════════════════ */

function bindSettings() {
  const s = state.settings;
  $('opt-type-read').checked = s.types.includes('read');
  $('opt-type-pinyin').checked = s.types.includes('pinyin');
  $('opt-type-recall').checked = s.types.includes('recall');
  $('opt-new').value = s.newPerDay;
  $('opt-max').value = s.maxReviews;
  $('opt-tts').checked = s.tts;

  const syncTypes = async () => {
    const types = [];
    if ($('opt-type-read').checked) types.push('read');
    if ($('opt-type-pinyin').checked) types.push('pinyin');
    if ($('opt-type-recall').checked) types.push('recall');
    if (!types.length) { toast('En az bir tür açık kalmalı'); $('opt-type-read').checked = true; return; }
    state.settings.types = types;
    await db.setSetting('types', types);
    const added = await db.backfillCards(types);
    if (added) toast(`${added} yeni kart üretildi`);
    await refresh();
  };
  ['opt-type-read', 'opt-type-pinyin', 'opt-type-recall'].forEach((id) =>
    $(id).addEventListener('change', syncTypes)
  );

  $('opt-new').addEventListener('change', async (e) => {
    const v = Math.max(0, Number(e.target.value) || 0);
    state.settings.newPerDay = v;
    await db.setSetting('newPerDay', v);
    renderStudyHome();
  });
  $('opt-max').addEventListener('change', async (e) => {
    const v = Math.max(10, Number(e.target.value) || 150);
    state.settings.maxReviews = v;
    await db.setSetting('maxReviews', v);
    renderStudyHome();
  });
  $('opt-tts').addEventListener('change', async (e) => {
    state.settings.tts = e.target.checked;
    await db.setSetting('tts', e.target.checked);
    if (e.target.checked) speak('你好');
    updateTtsStatus();
  });

  $('btn-export').addEventListener('click', exportBackup);
  $('btn-import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', importBackup);

  updateTtsStatus();
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = updateTtsStatus;
}

function updateTtsStatus() {
  const node = $('tts-status');
  if (!('speechSynthesis' in window)) {
    node.textContent = 'Bu tarayıcı seslendirmeyi desteklemiyor.';
    return;
  }
  const v = chineseVoice();
  node.textContent = v
    ? `Kullanılan ses: ${v.name}`
    : 'Cihazda Çince ses paketi bulunamadı — sistem ayarlarından eklemen gerekebilir.';
}

async function exportBackup() {
  const data = await db.exportAll();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `inkwell-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  $('backup-status').textContent =
    `Son yedek: ${new Date().toLocaleString('tr')} · ${data.notes.length} kayıt`;
}

async function importBackup(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const stats = await db.importAll(data);
    state.settings = await db.getSettings();
    state.decks = await db.allDecks();
    await refresh();
    toast(`${stats.notes} kayıt birleştirildi`);
  } catch (err) {
    toast(err.message ?? 'Dosya okunamadı');
  }
  e.target.value = '';
}

function renderDeckList() {
  const counts = new Map();
  for (const n of state.notes.values()) {
    counts.set(n.deckId, (counts.get(n.deckId) ?? 0) + 1);
  }
  $('deck-list').innerHTML = state.decks
    .map(
      (d) => `<li class="deck-row">
        <span>${escapeHtml(d.name)}</span>
        <em>${counts.get(d.id) ?? 0} kayıt</em>
        <button class="icon-btn" data-deck-rename="${d.id}" aria-label="Yeniden adlandır">✎</button>
        ${state.decks.length > 1 ? `<button class="icon-btn" data-deck-del="${d.id}" aria-label="Sil">✕</button>` : ''}
      </li>`
    )
    .join('');

  els('[data-deck-rename]').forEach((b) =>
    b.addEventListener('click', async () => {
      const deck = state.decks.find((d) => d.id === b.dataset.deckRename);
      const name = prompt('Yeni ad', deck.name);
      if (!name?.trim()) return;
      await db.renameDeck(deck.id, name.trim());
      state.decks = await db.allDecks();
      await refresh();
    })
  );
  els('[data-deck-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const deck = state.decks.find((d) => d.id === b.dataset.deckDel);
      const n = [...state.notes.values()].filter((x) => x.deckId === deck.id).length;
      if (!confirm(`"${deck.name}" ve içindeki ${n} kayıt silinsin mi?`)) return;
      await db.removeDeck(deck.id);
      state.decks = await db.allDecks();
      if (state.settings.lastDeck === deck.id) {
        state.settings.lastDeck = state.decks[0]?.id ?? null;
        await db.setSetting('lastDeck', state.settings.lastDeck);
      }
      await refresh();
    })
  );
}

/* ═══════════════════ ortak ═══════════════════ */

function fillDeckSelects() {
  const opts = state.decks.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
  const all = `<option value="all">Tüm desteler</option>`;

  const study = $('study-deck');
  study.innerHTML = all + opts;
  study.value = state.settings.lastDeck ?? 'all';
  if (!study.value) study.value = 'all';

  const add = $('add-deck');
  add.innerHTML = opts;
  add.value = currentDeck();

  const browse = $('browse-deck');
  const keep = browse.value;
  browse.innerHTML = all + opts;
  browse.value = keep && [...browse.options].some((o) => o.value === keep) ? keep : 'all';
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return; // dosyadan açıldığında çalışmaz

  // Android sürümünde dosyalar zaten uygulamanın içinde. Orada bir de servis
  // çalışanı önbelleği tutmak, uygulama güncellendiğinde eski sürümün
  // sunulmasına yol açardı.
  if (window.Capacitor?.isNativePlatform?.() || location.protocol === 'capacitor:') return;

  navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
