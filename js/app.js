/**
 * Inkwell — arayüz ve oturum akışı.
 */
import * as db from './store.js';
import * as dict from './dict.js';
import { toMarks, toNumbers, answerMatches, matchesButTone, looksLikePinyin } from './pinyin.js';
import { schedule, dueLabel, buildQueue, startOfToday, AGAIN, GOOD } from './srs.js';
import { comparePinyin, compareMeaning, suggestGrade } from './grade.js';
import { t, setLang, getLang, detect, applyDom, LANGUAGES } from './i18n.js';
import * as strokes from './strokes.js';

const $ = (id) => document.getElementById(id);
const el = (sel, root = document) => root.querySelector(sel);
const els = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Kart türleri.
 *
 * Üçü de cevabı yazdırır: kafadan cevaplayıp kendi kendine not vermek
 * güvenilir değil — insan bildiğini sanır. Yazılan cevap ölçülebilir.
 *
 * 'read' eski, kendi not verilen türdür. Artık üretilmez; mevcut kartları
 * bozulmasın diye gösterimi duruyor.
 */
const TYPES = {
  pinyin:  { answer: 'pinyin' },
  meaning: { answer: 'meaning' },
  recall:  { answer: 'pinyin' },
  write:   { answer: 'write' },
  read:    { answer: null },
};
const typeLabel = (type) => t(`type.${type}`);

const state = {
  settings: null,
  decks: [],
  cards: [],
  notes: new Map(),
  picked: new Set(),
  screen: 'study',
  session: null,
};

/* ═══════════════════ önyükleme ═══════════════════ */

async function init() {
  state.settings = await db.getSettings();
  setLang(state.settings.lang ?? detect());
  applyTheme(state.settings.theme ?? 'system');

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
  bindWrite();
  bindKeys();

  await refresh();
  registerServiceWorker();

  // Eskiyen tekrar kayıtları yedeği şişiriyordu; açılışta bir kez budanıyor.
  db.pruneReviews().catch(() => {});
}

async function refresh() {
  state.cards = await db.allCards();
  const notes = await db.allNotes();
  state.notes = new Map(notes.map((n) => [n.id, n]));
  applyDom();
  renderColophon();
  fillDeckSelects();
  renderModes();
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
  $('btn-next').addEventListener('click', advance);
  $('btn-learned').addEventListener('click', markLearned);
  $('study-deck').addEventListener('change', (e) => {
    db.setSetting('studyDeck', e.target.value);
    state.settings.studyDeck = e.target.value;
    // Kategori rozetleri de desteye bağlı; yalnız renderStudyHome çağrılınca
    // düğme yeni desteyi, rozetler eski desteyi gösteriyordu.
    renderModes();
    renderStudyHome();
  });
  // Enter'ı yalnız bindKeys dinliyor. Burada ikinci bir dinleyici daha vardı:
  // tek basışta önce bu kontrol ediyor, ardından belgeye ulaşan aynı olay
  // kartı "zaten açılmış" görüp geçiyordu — sonuç paneli göz açıp kapayana
  // kadar kayboluyordu.
}

/** Seçili destenin kartları (tümü seçiliyse hepsi). */
/**
 * Sıraya girecek kartlar: açık türler, seçili deste ve seçili kategori.
 *
 * Kategori ayrı tutuluyor çünkü çalışma biçimleri birbirinden farklı işler:
 * karakteri tanımaya çalışmakla kalemle yazmak aynı oturumda karışınca
 * ikisi de yarım kalıyor. "Karışık" isteyen için o seçenek de duruyor.
 */
function scopedCards() {
  const deckId = state.settings.studyDeck;
  const mode = state.settings.mode ?? 'all';
  const enabled = new Set(state.settings.types);
  const hepsi = !deckId || deckId === 'all';

  const kartlar = state.cards.filter((c) => {
    if (!enabled.has(c.type)) return false;
    const note = state.notes.get(c.noteId);
    if (!note) return false;
    // Öğrenildi işaretli kayıtlar normal kuyruktan çıkar; kendi kategorisi
    // seçiliyse de yalnız onlar kalır.
    if (isLearned(note) !== (mode === LEARNED)) return false;
    if (mode !== 'all' && mode !== LEARNED && c.type !== mode) return false;
    return hepsi || note.deckId === deckId;
  });

  return hepsi ? tekleştir(kartlar) : kartlar;
}

/**
 * "Tüm desteler"de aynı karakterin kopyalarından yalnız biri gelir.
 *
 * Aynı karakter birkaç bölümün destesinde durabiliyor; tek deste çalışırken bu
 * doğru, ama hepsini birden çalışırken 猫'yu üç kez sormanın anlamı yok.
 * Kazanan en eski kayıt (eşitlikte küçük `id`) — `planDedupe` ile aynı kural,
 * böylece hangi kopyanın "asıl" sayıldığı her yerde tutarlı.
 *
 * Eleme süzgeçten **sonra** yapılıyor: kopyalardan biri öğrenildi işaretliyse o
 * zaten elenmiş oluyor ve geriye çalışılabilir olan kalıyor.
 */
function tekleştir(kartlar) {
  const asil = new Map();
  for (const c of kartlar) {
    const note = state.notes.get(c.noteId);
    const key = String(note.hanzi ?? '').trim();
    if (!key) continue;
    const cur = asil.get(key);
    if (!cur ||
        (note.createdAt ?? 0) < (cur.createdAt ?? 0) ||
        ((note.createdAt ?? 0) === (cur.createdAt ?? 0) && note.id < cur.id)) {
      asil.set(key, note);
    }
  }
  const secili = new Set([...asil.values()].map((n) => n.id));
  return kartlar.filter((c) => secili.has(c.noteId));
}

/** Kategori değeri; kart türü değil, kuyruğun hangi havuzdan geleceği. */
const LEARNED = 'learned';
const isLearned = (note) => Boolean(note?.learnedAt);

/**
 * Kategori düğmeleri; her birinin yanında o kategoriyi seçersen kaç kart
 * geleceği yazar.
 *
 * Eskiden burada "vadesi gelmiş" kart sayılıyordu, oysa oturum vadeye
 * bakmadan havuzun tamamını veriyor: rozetteki sayı ile "Çalışmaya başla"
 * düğmesindeki sayı tutmuyordu. Artık ikisi aynı şeyi sayıyor.
 */
function renderModes() {
  const deckId = state.settings.studyDeck;
  const enabled = state.settings.types;
  const current = state.settings.mode ?? 'all';

  const inDeck = (c) =>
    !deckId || deckId === 'all' || state.notes.get(c.noteId)?.deckId === deckId;

  // Sayım scopedCards ile aynı kuralları izlemeli — "Tüm desteler"deki
  // kopya elemesi dahil. Yoksa rozet 15 derken düğme 9 diyor.
  const hepsi = !deckId || deckId === 'all';
  const countFor = (type) => {
    const kartlar = state.cards.filter((c) => {
      const note = state.notes.get(c.noteId);
      if (!note || !inDeck(c)) return false;
      if (!enabled.includes(c.type)) return false;
      if (isLearned(note) !== (type === LEARNED)) return false;
      if (type !== 'all' && type !== LEARNED && c.type !== type) return false;
      return true;
    });
    return (hepsi ? tekleştir(kartlar) : kartlar).length;
  };

  const options = [['all', t('mode.all')], ...enabled.map((type) => [type, typeLabel(type)])];
  // Kategori ancak işaretlenmiş kayıt varken görünür; boşken gereksiz duruyor.
  if (state.cards.some((c) => isLearned(state.notes.get(c.noteId)))) {
    options.push([LEARNED, t('mode.learned')]);
  }

  $('modes').innerHTML = options
    .map(([value, label]) => {
      const n = countFor(value);
      return `<button class="mode ${value === current ? 'is-active' : ''}${n ? '' : ' is-empty'}"
              data-mode="${value}"${n ? '' : ' disabled'}>
        ${escapeHtml(label)}<em>${n}</em>
      </button>`;
    })
    .join('');

  els('[data-mode]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      state.settings.mode = btn.dataset.mode;
      await db.setSetting('mode', btn.dataset.mode);
      renderModes();
      renderStudyHome();
    })
  );
}

async function renderStudyHome() {
  const cards = scopedCards();
  const reviewsToday = (await db.reviewsSince(startOfToday())).length;
  const mature = cards.filter((c) => c.ivl >= 21).length;
  const notes = new Set(cards.map((c) => c.noteId)).size;

  $('count-pool').textContent = cards.length;
  $('count-today').textContent = reviewsToday;
  $('count-mature').textContent = mature;

  $('btn-start').disabled = cards.length === 0;
  $('btn-start').textContent = cards.length
    ? t('study.startN', { n: cards.length })
    : t('study.noCards');
  $('study-empty').hidden = cards.length > 0;
  $('study-empty').innerHTML = t('study.emptyNote', {
    link: `<button class="linkish" data-goto="add">${t('study.emptyLink')}</button>`,
  });

  const badge = $('tab-badge');
  badge.hidden = cards.length === 0;
  badge.textContent = cards.length > 99 ? '99+' : cards.length;

  $('mini-stats').innerHTML = cards.length
    ? `<div>${t('study.poolInfo', { notes, cards: cards.length })}</div>
       <div>${t('study.matureInfo', { n: mature })}</div>`
    : `<div>${t('study.empty')}</div>`;
}

async function startSession() {
  const queue = buildQueue(scopedCards());
  if (!queue.length) return;

  state.session = { queue, total: queue.length, done: 0, correct: 0 };
  $('study-home').hidden = true;
  $('study-done').hidden = true;
  $('study-session').hidden = false;
  nextCard();
}

function endSession(silent = false) {
  const s = state.session;
  state.session = null;
  teardownWriters();
  $('study-session').hidden = true;
  if (silent) {
    $('study-home').hidden = false;
    // Oturum içinde "öğrenildi" işaretlenmiş olabilir: kategoriler de tazelenmeli,
    // yoksa yeni kategori ancak bir sonraki tam yenilemede beliriyor.
    renderModes();
    renderStudyHome();
    return;
  }
  $('done-summary').textContent = t('study.summary', { done: s.done, correct: s.correct });
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
  $('card-type').textContent = typeLabel(card.type);

  const front = $('card-front');
  const back = $('card-back');
  back.hidden = true;
  $('btn-next').hidden = true;
  $('btn-reveal').hidden = false;
  $('btn-learned').hidden = true;
  $('answer-verdict').hidden = true;

  const answer = TYPES[card.type]?.answer ?? null;
  $('answer-box').hidden = answer !== 'pinyin' && answer !== 'meaning';
  $('write-box').hidden = answer !== 'write';
  el('.write-actions').hidden = false;
  teardownWriters();

  if (card.type === 'write') {
    front.innerHTML = `<p class="prompt-meaning">${escapeHtml(note.meaning)}</p>
      <p class="prompt-sub">${escapeHtml(toMarks(note.pinyin))}</p>`;
  } else if (card.type === 'meaning') {
    // Yalnız okunuş gösterilir: ses ile anlam arasındaki bağı sınar,
    // karakteri görmek cevabı ele vermesin.
    front.innerHTML = `<p class="prompt-pinyin">${escapeHtml(toMarks(note.pinyin))}</p>
      <p class="prompt-sub">${t('card.whichMeaning')}</p>`;
  } else if (card.type === 'recall') {
    front.innerHTML = `<p class="prompt-meaning">${escapeHtml(note.meaning)}</p>
      <p class="prompt-sub">${t('card.recallPrompt')}</p>`;
  } else {
    front.innerHTML = `<p class="hanzi">${escapeHtml(note.hanzi)}</p>`;
  }

  if (answer === 'write') {
    $('btn-reveal').hidden = true;
    setupWriters(note);
    return;
  }

  if (answer) {
    const input = $('answer-input');
    input.value = '';
    input.disabled = false;
    if (answer === 'pinyin') {
      // Kutunun içinde örnek yazmıyoruz: altındaki ipucu zaten ton yazımını
      // söylüyor, ikisi birden cevabın durduğu yeri kalabalıklaştırıyordu.
      input.placeholder = '';
      input.className = 'answer-input answer-input--pinyin';
      $('answer-hint').innerHTML = t('card.tonehint');
    } else {
      input.placeholder = t('card.meaningPh');
      input.className = 'answer-input answer-input--text';
      $('answer-hint').textContent = t('card.meaninghint');
    }
    $('btn-reveal').textContent = t('study.check');
    setTimeout(() => input.focus(), 30);
  } else {
    $('btn-reveal').textContent = t('study.reveal');
  }
}

function revealOrCheck() {
  const s = state.session;
  if (!s || s.revealed) return;
  const card = s.current;
  const note = state.notes.get(card.noteId);
  const answer = TYPES[card.type]?.answer ?? null;

  // Yazma kartı kendi kendine biter (son strok çizilince), burada işi yok.
  if (answer === 'write') return;

  if (answer) {
    const given = $('answer-input').value;

    // Boş bırakıp geçmek "bilmiyorum" demektir; kart yanlış sayılır.
    const result = !given.trim()
      ? { level: 'wrong' }
      : answer === 'pinyin'
        ? comparePinyin(given, note.pinyin)
        : compareMeaning(given, note.meaning);

    renderVerdict(result, given, answer === 'pinyin' ? note.pinyin : note.meaning);
    $('answer-input').disabled = true;
    s.autoGrade = suggestGrade(result.level);
    s.wasCorrect = result.level === 'exact';
  }

  renderLearnButton(note);
  reveal(note);
}

/**
 * Cevabın neden o notu aldığını gösterir.
 *
 * Ton hatasında hangi hecenin kaçtığı işaretlenir: "yanlış" demek öğretmez,
 * "üçüncü ton yerine ikinci yazdın" öğretir.
 */
function renderVerdict(result, given, expected) {
  const verdict = $('answer-verdict');
  verdict.hidden = false;
  verdict.className =
    'answer-verdict ' +
    (result.level === 'exact' ? 'is-ok' : result.level === 'wrong' ? 'is-bad' : 'is-close');

  let detail = '';
  if (result.syllables && result.level === 'tone') {
    detail = result.syllables
      .map(
        (x) =>
          `<span class="syl ${x.ok ? '' : 'syl--miss'}">${escapeHtml(
            toMarks(x.base + (x.tone || 5))
          )}${x.ok ? '' : `<i>${x.given ? x.given : '–'}→${x.tone}</i>`}</span>`
      )
      .join('');
  } else if (result.level !== 'exact') {
    detail = `<small>${t('verdict.youWrote', { x: escapeHtml(given) })}</small>`;
  }

  verdict.innerHTML = `${t(`verdict.${result.level}`)}${detail ? `<div class="verdict-detail">${detail}</div>` : ''}`;
}

/**
 * "Öğrenildi" düğmesi yalnız doğru cevaptan sonra çıkar — bir karakteri
 * havuzdan çekme kararı, bildiğini gösterdikten sonra anlamlı. Yazma kartı
 * kendi kendine değerlendirildiği için orada da doğru sayılır.
 */
function renderLearnButton(note) {
  const btn = $('btn-learned');
  const show = state.session?.wasCorrect && !isLearned(note);
  btn.hidden = !show;
  if (show) btn.textContent = t('study.markLearned');
}

async function markLearned() {
  const s = state.session;
  if (!s) return;
  const note = state.notes.get(s.current.noteId);
  if (!note) return;

  await db.setLearned([note.id], true);
  note.learnedAt = Date.now();
  // Aynı karakterin kuyrukta bekleyen diğer kartları da düşer; az önce
  // "biliyorum" dediğin karakteri iki kart sonra tekrar sormak tuhaf olurdu.
  s.queue = s.queue.filter((c, i) => i === 0 || c.noteId !== note.id);
  s.total = s.done + s.queue.length;

  $('btn-learned').hidden = true;
  toast(t('toast.learned', { x: note.hanzi }));
}

function reveal(note) {
  const s = state.session;
  s.revealed = true;

  const back = $('card-back');
  const card = s.current;
  const pinyin = toMarks(note.pinyin);

  let html = '';
  if (card.type === 'recall') {
    // Karakteri klavyeyle yazdıramadığımız için doğrulaması sende: karakteri
    // hatırlamadıysan okunuşu bilsen de düşük not vermelisin.
    html = `<p class="hanzi">${escapeHtml(note.hanzi)}</p>
            <p class="back-pinyin">${escapeHtml(pinyin)}</p>
            <p class="back-note">${t('card.recallNote')}</p>`;
  } else if (card.type === 'meaning') {
    html = `<p class="hanzi">${escapeHtml(note.hanzi)}</p>
            <p class="back-meaning">${escapeHtml(note.meaning)}</p>`;
  } else {
    html = `<p class="back-pinyin">${escapeHtml(pinyin)}</p>
            <p class="back-meaning">${escapeHtml(note.meaning)}</p>`;
  }
  if (note.trad && note.trad !== note.hanzi) {
    html += `<p class="back-extra">${t('card.traditional', { x: escapeHtml(note.trad) })}</p>`;
  }
  back.innerHTML = html;
  back.hidden = false;

  $('btn-reveal').hidden = true;
  $('btn-next').hidden = false;
  $('btn-next').focus();

  if (state.settings.tts) speak(note.hanzi);
}

/**
 * Kartı bitirir ve sıradakine geçer.
 *
 * Not artık kullanıcıdan sorulmuyor: cevap zaten yazılıp ölçüldüğü için
 * doğruya yakınlıktan türetiliyor. Zamanlama verisi arka planda birikmeye
 * devam ediyor, ama çalışma akışına karışmıyor.
 */
async function advance() {
  const s = state.session;
  if (!s || !s.revealed) return;

  const card = s.current;
  const g = s.autoGrade ?? GOOD;
  const wasNew = card.state === 'new';
  const updated = schedule(card, g);

  await db.putCard(updated);
  await db.logReview({
    cardId: card.id, noteId: card.noteId,
    ts: Date.now(), rating: g, ivl: updated.ivl, wasNew,
  });

  const i = state.cards.findIndex((c) => c.id === card.id);
  if (i >= 0) state.cards[i] = updated;

  s.queue.shift();
  s.done++;
  if (s.wasCorrect) s.correct++;

  s.autoGrade = null;
  s.wasCorrect = false;
  nextCard();
}

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    if (!state.session || state.screen !== 'study') return;
    const typing = document.activeElement === $('answer-input') && !$('answer-input').disabled;

    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
      if (e.key === ' ' && typing) return;   // cevap yazarken boşluk gerekebilir
      e.preventDefault();
      if (state.session.revealed) advance();
      else revealOrCheck();
    }
  });
}

/* ═══════════════════ kalemle yazma ═══════════════════ */

let writers = [];

function teardownWriters() {
  for (const w of writers) {
    try { w.cancelQuiz?.(); } catch {}
  }
  writers = [];
  $('write-grid').innerHTML = '';
}

/**
 * hanzi-writer renkleri CSS'ten okuyor; olmayan bir belirteç boş dize döner ve
 * kalem görünmez olur — hata da vermez. Yedek renk bunu görünür kılıyor.
 */
const cssVar = (name, fallback = '#000000') =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/**
 * Yazma kartını kurar.
 *
 * Karakterin taslağı gösterilmez: gösterilse bu bir üzerinden geçme alıştırması
 * olurdu, oysa sınanan şey karakteri hatırlamak. Üç hatadan sonra o strok
 * ipucu olarak belirir, yoksa kart kilitlenirdi.
 *
 * Çok karakterli sözcüklerde karakterler sırayla çalışılır; hatalar toplanır.
 */
async function setupWriters(note) {
  const status = $('write-status');
  const grid = $('write-grid');

  if (!strokes.isLoaded()) {
    status.textContent = t('write.loading');
    try {
      await strokes.load();
    } catch {
      return writeUnavailable(t('write.loadFail'));
    }
  }

  // Oturum bu arada değişmiş olabilir.
  const s = state.session;
  if (!s || s.current?.noteId !== note.id) return;

  const chars = [...note.hanzi];
  if (!chars.every((ch) => strokes.has(ch))) {
    return writeUnavailable(t('write.noData'));
  }

  status.textContent = t('write.status');
  grid.innerHTML = chars.map(() => '<div class="write-cell"></div>').join('');

  const cells = els('.write-cell', grid);
  const size = Math.min(240, Math.floor(grid.clientWidth / chars.length) - 8);

  s.writeMistakes = 0;
  s.writeIndex = 0;

  writers = cells.map((cell, i) =>
    HanziWriter.create(cell, chars[i], {
      width: size,
      height: size,
      padding: 6,
      showCharacter: false,
      showOutline: false,
      showHintAfterMisses: 3,
      // Kalem de mürekkep rengiyle çiziyor: çizdiğin strok tamamlanmış
      // strokla aynı renk, karakter tek renkte birikiyor. Koyu temada
      // "siyah" düz siyah olamaz — zemin zaten siyah; --ink orada beyaza
      // döndüğü için kalem görünür kalıyor.
      strokeColor: cssVar('--ink'),
      drawingColor: cssVar('--ink'),
      outlineColor: cssVar('--rule-2'),
      highlightColor: cssVar('--amber'),
      drawingWidth: 22,
      charDataLoader: (char, onComplete) => onComplete(strokes.charData(char)),
    })
  );

  startQuizAt(0, chars);
}

function startQuizAt(i, chars) {
  const s = state.session;
  if (!s || i >= writers.length) return;

  s.writeIndex = i;
  els('.write-cell').forEach((c, k) => c.classList.toggle('is-active', k === i));
  if (chars.length > 1) {
    $('write-status').textContent = t('write.progress', { i: i + 1, n: chars.length });
  }

  writers[i].quiz({
    onMistake: () => {
      s.writeMistakes = (s.writeMistakes ?? 0) + 1;
    },
    onComplete: () => {
      if (i + 1 < writers.length) startQuizAt(i + 1, chars);
      else finishWrite(s.writeMistakes ?? 0);
    },
  });
}

/** Hata sayısından not önerisi. */
function finishWrite(mistakes) {
  const s = state.session;
  if (!s) return;
  const level = mistakes === 0 ? 'exact' : mistakes <= 2 ? 'near' : 'wrong';

  const verdict = $('answer-verdict');
  verdict.hidden = false;
  verdict.className =
    'answer-verdict ' + (level === 'exact' ? 'is-ok' : level === 'wrong' ? 'is-bad' : 'is-close');
  verdict.innerHTML =
    level === 'exact'
      ? t('write.flawless')
      : `${t(`verdict.${level}`)}<div class="verdict-detail"><small>${t('write.mistakes', { n: mistakes })}</small></div>`;

  s.wasCorrect = level === 'exact';
  $('write-status').textContent = '';
  el('.write-actions').hidden = true;
  els('.write-cell').forEach((c) => c.classList.remove('is-active'));
  s.autoGrade = suggestGrade(level);
  const note = state.notes.get(s.current.noteId);
  renderLearnButton(note);
  reveal(note);
}

/** Strok verisi yoksa kart elle değerlendirmeye düşer. */
function writeUnavailable(message) {
  $('write-status').textContent = message;
  $('write-grid').innerHTML = '';
  $('btn-reveal').hidden = false;
  $('btn-reveal').textContent = t('study.reveal');
}

function bindWrite() {
  $('btn-write-hint').addEventListener('click', () => {
    const s = state.session;
    const w = writers[s?.writeIndex ?? 0];
    if (!w) return;
    // İpucu bedava değil: bir hata sayılır.
    s.writeMistakes = (s.writeMistakes ?? 0) + 1;
    w.highlightStroke?.(w._quiz?._currentStrokeIndex ?? 0);
  });

  $('btn-write-give').addEventListener('click', () => {
    const s = state.session;
    if (!s || !writers.length) return;
    for (const w of writers) {
      try { w.cancelQuiz(); } catch {}
      w.showCharacter();
    }
    finishWrite(99);
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

  const newDeck = async () => {
    const name = await askText(t('prompt.newDeck'), '', { ok: t('dialog.create') });
    if (!name) return;
    const deck = await db.addDeck(name);
    state.decks = await db.allDecks();
    state.settings.lastDeck = deck.id;
    await db.setSetting('lastDeck', deck.id);
    await refresh();
    toast(t('toast.deckCreated', { x: deck.name }));
  };
  $('btn-new-deck').addEventListener('click', newDeck);
  $('btn-new-deck-compact').addEventListener('click', newDeck);

  $('add-deck').addEventListener('change', (e) => {
    state.settings.lastDeck = e.target.value;
    db.setSetting('lastDeck', e.target.value);
    // "Zaten var" işaretleri artık desteye bağlı; deste değişince ekrandaki
    // liste ve önizleme bayatlıyor.
    if (bulkParsed.length) previewBulk();
    if ($('dict-q').value.trim()) runSearch();
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
      t('add.dictFail');
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
  if (!hit) { toast(t('toast.noMatch')); return; }

  const dup = await db.findByHanzi(hit.hanzi, currentDeck());
  if (dup) { toast(t('toast.dupe', { x: hit.hanzi })); return; }

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
  toast(t('toast.added', { x: `${hit.hanzi} ${toMarks(hit.pinyin)}` }));
  $('dict-q').value = '';
  $('dict-results').innerHTML = '';
  $('dict-status').textContent = '';
  await refresh();
  await maybeWarnPool();
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
    $('dict-status').textContent = t('add.noMatch');
    return;
  }
  $('dict-status').textContent = t('add.results', { n: hits.length });

  // "Zaten var" işareti de eklenecek desteye göre.
  const hedef = currentDeck();
  const existing = new Set(
    [...state.notes.values()].filter((n) => n.deckId === hedef).map((n) => n.hanzi)
  );
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
          ? `<span class="result-flag">${t('add.inPool')}</span>`
          : '<span class="result-plus">+</span>'}
      </button></li>`
    )
    .join('');

  els('[data-hit]', list).forEach((btn) =>
    btn.addEventListener('click', () => addFromDict(hits[Number(btn.dataset.hit)], btn))
  );
}

async function addFromDict(hit, btn) {
  const dup = await db.findByHanzi(hit.hanzi, currentDeck());
  if (dup) { toast(t('toast.dupe', { x: hit.hanzi })); return; }

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
    className: 'result-flag', textContent: t('add.added'),
  }));
  toast(t('toast.added', { x: hit.hanzi }));
  await refresh();
  await maybeWarnPool();
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
        parsed.error = t('add.errNoReading');
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
    parsed.dupe = !!(await db.findByHanzi(parsed.hanzi, currentDeck()));
    if (!parsed.hanzi) parsed.error ||= t('add.errNoHanzi');
    else if (!parsed.pinyin) parsed.error ||= t('add.errNoPinyin');
    out.push(parsed);
  }

  bulkParsed = out;
  const usable = out.filter((p) => !p.error && !p.dupe);
  $('btn-bulk-add').disabled = usable.length === 0;
  $('btn-bulk-add').textContent = usable.length ? t('add.addN', { n: usable.length }) : t('add.add');

  $('bulk-preview').innerHTML = out
    .map((p, i) => {
      const alt =
        p.options?.length > 1
          ? `<select class="alt-pick" data-alt="${i}" aria-label="${t('add.pickOther')}">${p.options
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
          ? t('add.inPool')
          : p.fromPinyin
            ? t('add.fromPinyin')
            : p.filled
              ? t('add.fromDict')
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
      row.dupe = !!(await db.findByHanzi(row.hanzi, currentDeck()));
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
  toast(t('toast.bulkAdded', { n: usable.length }));
  $('bulk-text').value = '';
  $('bulk-preview').innerHTML = '';
  $('btn-bulk-add').disabled = true;
  bulkParsed = [];
  await refresh();
  await maybeWarnPool();
}

async function addManual() {
  const hanzi = $('m-hanzi').value.trim();
  const pinyin = $('m-pinyin').value.trim();
  const meaning = $('m-meaning').value.trim();
  if (!hanzi || !meaning) { toast(t('toast.needFields')); return; }
  if (await db.findByHanzi(hanzi, currentDeck())) { toast(t('toast.dupe', { x: hanzi })); return; }

  await db.addNote({ deckId: currentDeck(), hanzi, pinyin, meaning }, state.settings.types);
  $('m-hanzi').value = $('m-pinyin').value = $('m-meaning').value = '';
  toast(t('toast.added', { x: hanzi }));
  await refresh();
  await maybeWarnPool();
}

/**
 * Havuz büyüdüğünde bir kez uyarır.
 *
 * Oturum başına kart sınırı denendi ve kaldırıldı: 59 kartla 60 kart arasında
 * keyfi bir davranış farkı yaratıyordu. Havuzun tamamı hâlâ tek oturumda
 * geliyor — sadece eşiği ilk geçtiğinde bunun ne demek olduğu söyleniyor ve
 * havuzu daraltmanın yolları hatırlatılıyor. Bir daha çıkmıyor.
 */
const POOL_WARN_AT = 100;

async function maybeWarnPool() {
  if (state.settings.poolWarned) return;

  // Sayım **eklenen destenin** kayıtları üzerinde. Oturum zaten seçili desteyle
  // sınırlı; toplamı saymak, kırk kayıtlık yeni bir bölüme eklerken bile uyarı
  // çıkarıyordu. Birim de kart değil kayıt: eklediğin şey bir karakter ve
  // anlamı, açık tür sayısı kadar kart değil.
  const deckId = currentDeck();
  const deck = state.decks.find((d) => d.id === deckId);
  const n = [...state.notes.values()].filter((x) => x.deckId === deckId).length;
  if (n < POOL_WARN_AT) return;

  // Bayrak genel: mesaj uygulamanın nasıl çalıştığını anlatıyor, bir kez
  // okunması yeter — her deste için tekrarlamasının anlamı yok.
  state.settings.poolWarned = true;
  await db.setSetting('poolWarned', true);
  await askConfirm(t('pool.warnTitle', { x: deck?.name ?? '', n }), t('pool.warnText'), {
    ok: t('dialog.gotIt'),
    cancel: false,
  });
}

/* ═══════════════════ havuz ═══════════════════ */

function bindBrowse() {
  $('browse-deck').addEventListener('change', () => { state.picked.clear(); renderBrowse(); });
  $('browse-q').addEventListener('input', renderBrowse);

  $('btn-browse-clear').addEventListener('click', () => { state.picked.clear(); renderBrowse(); });
  $('btn-browse-all').addEventListener('click', () => {
    // Listede o an ne görünüyorsa onu seçer: süzgeç neyse seçim de odur.
    const shown = visibleNotes();
    const all = shown.every((n) => state.picked.has(n.id));
    shown.forEach((n) => (all ? state.picked.delete(n.id) : state.picked.add(n.id)));
    renderBrowse();
  });
  $('btn-browse-move').addEventListener('click', movePicked);
  $('btn-browse-learn').addEventListener('click', toggleLearnedPicked);
}

/** Seçilenlerin tamamı işaretliyse işareti kaldırır, değilse işaretler. */
async function toggleLearnedPicked() {
  const ids = [...state.picked];
  if (!ids.length) return;
  const notes = ids.map((id) => state.notes.get(id)).filter(Boolean);
  const on = !notes.every(isLearned);
  await db.setLearned(ids, on);
  state.picked.clear();
  toast(t(on ? 'toast.learnedN' : 'toast.unlearnedN', { n: ids.length }));
  await refresh();
}

async function movePicked() {
  const ids = [...state.picked];
  const deckId = $('browse-move').value;
  if (!ids.length || !deckId) return;
  await db.moveNotes(ids, deckId);
  // Hedef destede aynı karakter zaten varsa taşıma orada iki kopya bırakır —
  // bu, kuralımıza göre kaza. Birleştirici aynı destedeki kopyaları tekliyor.
  const birlesen = await db.dedupeAll();
  const deck = state.decks.find((d) => d.id === deckId);
  state.picked.clear();
  toast(birlesen
    ? `${t('toast.moved', { n: ids.length, x: deck?.name ?? '' })} · ${t('toast.deduped', { n: birlesen })}`
    : t('toast.moved', { n: ids.length, x: deck?.name ?? '' }));
  await refresh();
}

/** Havuzda o an süzgeçten geçen kayıtlar; seçim de taşıma da bunun üstünde. */
function visibleNotes() {
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
  return notes.sort((a, b) => b.createdAt - a.createdAt);
}

function renderBrowse() {
  const notes = visibleNotes();
  const shown = new Set(notes.map((n) => n.id));
  // Süzgeç değişince görünmeyen kayıt seçili kalmasın: göremediğin şeyi taşımak
  // sürpriz olur.
  for (const id of state.picked) if (!shown.has(id)) state.picked.delete(id);

  $('browse-count').textContent = t('browse.count', { n: notes.length });
  $('browse-empty').hidden = notes.length > 0;

  const byNote = new Map();
  for (const c of state.cards) {
    if (!byNote.has(c.noteId)) byNote.set(c.noteId, []);
    byNote.get(c.noteId).push(c);
  }

  const deckName = new Map(state.decks.map((d) => [d.id, d.name]));
  const showDeck = $('browse-deck').value === 'all' && state.decks.length > 1;

  $('notes-list').innerHTML = notes
    .slice(0, 300)
    .map((n) => {
      const cards = byNote.get(n.id) ?? [];
      const soonest = cards.reduce((a, c) => (!a || c.due < a.due ? c : a), null);
      const picked = state.picked.has(n.id);
      const learned = isLearned(n);
      return `<li class="note${picked ? ' is-picked' : ''}${learned ? ' is-learned' : ''}" data-note="${n.id}">
        <span class="note-hanzi">${escapeHtml(n.hanzi)}</span>
        <span class="note-body">
          <span class="note-pinyin">${escapeHtml(toMarks(n.pinyin))}</span>
          <span class="note-meaning">${escapeHtml(n.meaning)}</span>
          <span class="note-deck">${[
            learned ? `<b class="note-learned">${escapeHtml(t('browse.learned'))}</b>` : '',
            showDeck ? escapeHtml(deckName.get(n.deckId) ?? '') : '',
          ].filter(Boolean).join(' · ')}</span>
        </span>
        <span class="note-due">${soonest ? escapeHtml(dueLabel(soonest)) : '—'}<br>${t('browse.cards', { n: cards.length })}</span>
        <button class="icon-btn" data-del="${n.id}" aria-label="${t('browse.delete')}">✕</button>
      </li>`;
    })
    .join('');

  $('notes-list').classList.add('is-selectable');
  els('[data-note]').forEach((li) =>
    li.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) return;
      const id = li.dataset.note;
      state.picked.has(id) ? state.picked.delete(id) : state.picked.add(id);
      renderBrowse();
    })
  );

  els('[data-del]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const note = state.notes.get(btn.dataset.del);
      const yes = await askConfirm(t('confirm.deleteNote', { x: note.hanzi }), t('confirm.deleteNoteText'), {
        ok: t('set.delete'), danger: true,
      });
      if (!yes) return;
      await db.removeNote(note.id);
      state.picked.delete(note.id);
      toast(t('toast.deleted'));
      await refresh();
    })
  );

  renderBulkBar();
}

/** Seçim çubuğu: bir şey seçiliyken görünür, taşınacak desteyi sorar. */
function renderBulkBar() {
  const n = state.picked.size;
  const bar = $('browse-bulk');
  bar.hidden = n === 0;
  if (bar.hidden) return;

  $('browse-picked').textContent = t('browse.picked', { n });

  // Taşıyacak başka deste yoksa taşıma kısmı görünmez; işaretleme her zaman var.
  const many = state.decks.length > 1;
  $('browse-move').hidden = !many;
  $('btn-browse-move').hidden = !many;

  const notes = [...state.picked].map((id) => state.notes.get(id)).filter(Boolean);
  $('btn-browse-learn').textContent =
    notes.length && notes.every(isLearned) ? t('browse.unlearn') : t('browse.learn');

  const sel = $('browse-move');
  const keep = sel.value;
  sel.innerHTML = state.decks
    .map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`)
    .join('');
  if (keep && state.decks.some((d) => d.id === keep)) sel.value = keep;
}

/* ═══════════════════ ayarlar ═══════════════════ */

function bindSettings() {
  const s = state.settings;

  const langSel = $('opt-lang');
  langSel.innerHTML = LANGUAGES.map(
    ([code, name]) => `<option value="${code}">${name}</option>`
  ).join('');
  langSel.value = getLang();
  langSel.addEventListener('change', async (e) => {
    setLang(e.target.value);
    state.settings.lang = e.target.value;
    await db.setSetting('lang', e.target.value);
    await refresh();
    renderStudyHome();
  });

  applyTheme(s.theme ?? 'system');
  els('[data-theme-pick]').forEach((b) =>
    b.addEventListener('click', async () => {
      const theme = b.dataset.themePick;
      state.settings.theme = theme;
      applyTheme(theme);
      await db.setSetting('theme', theme);
    })
  );

  $('opt-type-pinyin').checked = s.types.includes('pinyin');
  $('opt-type-meaning').checked = s.types.includes('meaning');
  $('opt-type-recall').checked = s.types.includes('recall');
  $('opt-type-write').checked = s.types.includes('write');
  $('opt-tts').checked = s.tts;

  const syncTypes = async () => {
    const types = [];
    if ($('opt-type-pinyin').checked) types.push('pinyin');
    if ($('opt-type-meaning').checked) types.push('meaning');
    if ($('opt-type-recall').checked) types.push('recall');
    if ($('opt-type-write').checked) types.push('write');
    if (!types.length) { toast(t('toast.oneType')); $('opt-type-pinyin').checked = true; return; }
    state.settings.types = types;
    await db.setSetting('types', types);
    const added = await db.backfillCards(types);
    if (added) toast(t('toast.cardsMade', { n: added }));
    // Kapatılan türdeki kategori seçiliyse karışığa dön.
    if (state.settings.mode && state.settings.mode !== 'all'
        && state.settings.mode !== LEARNED && !types.includes(state.settings.mode)) {
      state.settings.mode = 'all';
      await db.setSetting('mode', 'all');
    }
    await refresh();
  };
  ['opt-type-pinyin', 'opt-type-meaning', 'opt-type-recall', 'opt-type-write'].forEach((id) =>
    $(id).addEventListener('change', syncTypes)
  );

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
    node.textContent = t('set.ttsUnsupported');
    return;
  }
  const v = chineseVoice();
  node.textContent = v ? t('set.ttsVoice', { name: v.name }) : t('set.ttsNone');
}

const isNative = () => Boolean(window.Capacitor?.isNativePlatform?.());

/**
 * Native eklentiye köprü üstünden ulaşıyoruz.
 *
 * Eklentinin JS paketini `import` etmek çıplak modül adı demek, o da paketleyici
 * demek; projenin derleme adımı yok. `registerPlugin` ise Capacitor'ın kendi
 * global'inde duruyor ve yöntemleri native tarafın bildirdiği başlıklardan
 * çözüyor — paketleyiciye gerek kalmıyor.
 */
const nativePlugin = (name) => window.Capacitor?.registerPlugin?.(name);

/**
 * Yedeği dışarı verir.
 *
 * Tarayıcıda blob bağlantısıyla iniyor. Android'de inmiyordu: WebView'da
 * indirme dinleyicisi tanımlı değil, blob bağlantısını native tarafa hiç
 * çeviremiyor, düğme sessizce hiçbir şey yapmıyordu. Orada dosya önbellek
 * dizinine yazılıp paylaşım penceresi açılıyor; kullanıcı e-postaya, Drive'a,
 * nereye isterse gönderiyor.
 */
async function exportBackup() {
  const data = await db.exportAll();
  const json = JSON.stringify(data);
  const name = `inkwell-${new Date().toISOString().slice(0, 10)}.json`;

  try {
    if (isNative()) await shareBackup(name, json);
    else downloadBackup(name, json);
  } catch (err) {
    console.error(err);
    toast(t('toast.exportFail'));
    return;
  }

  $('backup-status').textContent =
    t('set.lastBackup', { date: new Date().toLocaleString(getLang()), n: data.notes.length });
}

function downloadBackup(name, json) {
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function shareBackup(name, json) {
  const Filesystem = nativePlugin('Filesystem');
  const Share = nativePlugin('Share');
  if (!Filesystem || !Share) throw new Error('no bridge');

  // Önbellek dizini: uygulamanın FileProvider ayarı (`file_paths.xml`) burayı
  // kapsıyor, paylaşım için okunabilir bir içerik adresi ancak böyle çıkıyor.
  const { uri } = await Filesystem.writeFile({
    path: name,
    data: json,
    directory: 'CACHE',
    encoding: 'utf8',
  });
  await Share.share({ title: name, files: [uri], dialogTitle: t('set.shareBackup') });
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
    // Mükerrer birleşmesi sessiz kalmamalı: havuzdaki kayıt sayısı düştüğü
    // için kullanıcı bir şey silindi sanabilir.
    toast(stats.merged
      ? `${t('toast.merged', { n: stats.notes })} · ${t('toast.deduped', { n: stats.merged })}`
      : t('toast.merged', { n: stats.notes }));
  } catch (err) {
    // Yedek olmayan dosyayı ayrı söylüyoruz: "okunamadı" demek, yanlış dosyayı
    // seçtiğini fark etmeyi zorlaştırıyor.
    toast(err?.message === 'notBackup' ? t('error.notBackup') : t('toast.fileError'));
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
        <em>${t('set.deckNotes', { n: counts.get(d.id) ?? 0 })}</em>
        <button class="icon-btn" data-deck-rename="${d.id}" aria-label="${t('set.rename')}">✎</button>
        ${state.decks.length > 1 ? `<button class="icon-btn" data-deck-del="${d.id}" aria-label="${t('set.delete')}">✕</button>` : ''}
      </li>`
    )
    .join('');

  els('[data-deck-rename]').forEach((b) =>
    b.addEventListener('click', async () => {
      const deck = state.decks.find((d) => d.id === b.dataset.deckRename);
      const name = await askText(t('prompt.rename'), deck.name, { ok: t('dialog.save') });
      if (!name) return;
      await db.renameDeck(deck.id, name);
      state.decks = await db.allDecks();
      await refresh();
    })
  );
  els('[data-deck-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const deck = state.decks.find((d) => d.id === b.dataset.deckDel);
      const n = [...state.notes.values()].filter((x) => x.deckId === deck.id).length;
      const yes = await askConfirm(t('prompt.deleteDeck', { x: deck.name }), t('confirm.deleteDeck', { x: deck.name, n }), {
        ok: t('set.delete'), danger: true,
      });
      if (!yes) return;
      await db.removeDeck(deck.id);
      state.decks = await db.allDecks();
      if (state.settings.lastDeck === deck.id) {
        state.settings.lastDeck = state.decks[0]?.id ?? null;
        await db.setSetting('lastDeck', state.settings.lastDeck);
      }
      if (state.settings.studyDeck === deck.id) {
        state.settings.studyDeck = 'all';
        await db.setSetting('studyDeck', 'all');
      }
      await refresh();
    })
  );
}

/* ═══════════════════ ortak ═══════════════════ */

/** Künye: sözlük kaynağına bağlantı içerdiği için ayrı üretiliyor. */
function renderColophon() {
  $('colophon').innerHTML = t('set.colophon', {
    link: '<a href="https://cc-cedict.org/" target="_blank" rel="noopener">CC-CEDICT</a>',
  });
}

function fillDeckSelects() {
  const opts = state.decks.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
  const all = `<option value="all">${escapeHtml(t('deck.all'))}</option>`;

  const study = $('study-deck');
  study.innerHTML = all + opts;
  study.value = state.settings.studyDeck ?? 'all';
  if (!study.value) study.value = 'all';

  const add = $('add-deck');
  add.innerHTML = opts;
  add.value = currentDeck();

  // Tek deste varken açılır kutu seçecek bir şey sunmuyor; yerine hangi
  // desteye eklendiğini söyleyen tek satır gösteriliyor.
  const single = state.decks.length === 1;
  $('deck-compact').hidden = !single;
  $('deck-full').hidden = single;
  if (single) {
    $('deck-compact-text').innerHTML = t('add.deckCompact', {
      deck: escapeHtml(state.decks[0].name),
    });
  }

  const browse = $('browse-deck');
  const keep = browse.value;
  browse.innerHTML = all + opts;
  browse.value = keep && [...browse.options].some((o) => o.value === keep) ? keep : 'all';
}

/* ═══════════════════ tema ═══════════════════ */

const THEMES = ['system', 'light', 'dark'];

/**
 * 'system' seçiliyse özniteliği hiç koymayız; CSS o zaman işletim sisteminin
 * tercihini dinler. Adres çubuğunun rengi de temayla birlikte değişmeli,
 * yoksa koyu temada tepede açık bir şerit kalıyor.
 */
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;

  const dark = theme === 'dark'
    || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  for (const m of els('meta[name="theme-color"]')) m.remove();
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = dark ? '#000000' : '#ffffff';
  document.head.appendChild(meta);

  els('[data-theme-pick]').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.themePick === theme)
  );
}

/* ═══════════════════ diyalog ═══════════════════ */

/**
 * Tek bir <dialog> üstünde iki iş: metin sormak ve onaylatmak.
 * <dialog> odak tuzağını, Esc'i ve arka planı tarayıcıdan hazır alıyor;
 * bize yalnız sözü veren sarmalayıcı kalıyor.
 */
function openDialog({ title, text = '', value = null, ok, cancel, danger = false }) {
  const dlg = $('dialog');
  const input = $('dialog-input');
  const okBtn = $('dialog-ok');

  $('dialog-title').textContent = title;
  $('dialog-text').textContent = text;
  $('dialog-text').hidden = !text;

  input.hidden = value === null;
  input.value = value ?? '';

  okBtn.textContent = ok ?? t('dialog.ok');
  okBtn.classList.toggle('btn--danger', danger);
  // cancel === false: onay değil bilgi verir, tek düğme yeter.
  const cancelBtn0 = $('dialog-cancel');
  cancelBtn0.hidden = cancel === false;
  cancelBtn0.textContent = cancel === false ? '' : cancel ?? t('dialog.cancel');

  const cancelBtn = $('dialog-cancel');

  // Söz, kullanıcının **eylemiyle** çözülüyor; `close` olayı yalnız emniyet
  // kemeri. Önce yalnız ona bağlıydı: bazı gömülü tarayıcılarda <dialog>
  // kapanıp `returnValue` doğru ayarlandığı hâlde `close` hiç tetiklenmiyor,
  // söz sonsuza kadar askıda kalıyor — arayüzde "düğmeye bastım, hiçbir şey
  // olmadı" olarak görünüyor, hata da vermiyor.
  return new Promise((resolve) => {
    let settled = false;
    const sonuc = () => (input.hidden ? true : input.value.trim() || null);

    const finish = (val) => {
      if (settled) return;
      settled = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancelClick);
      dlg.removeEventListener('cancel', onEsc);
      dlg.removeEventListener('close', onClose);
      if (dlg.open) dlg.close();
      resolve(val);
    };

    const onOk = () => finish(sonuc());
    const onCancelClick = () => finish(null);
    const onEsc = () => finish(null);
    const onClose = () => finish(dlg.returnValue === 'ok' ? sonuc() : null);

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancelClick);
    dlg.addEventListener('cancel', onEsc);
    dlg.addEventListener('close', onClose);

    dlg.returnValue = '';
    dlg.showModal();
    if (!input.hidden) { input.focus(); input.select(); }
  });
}

/** Metin sorar; iptal ya da boş girdide null döner. */
const askText = (title, value = '', opts = {}) => openDialog({ title, value, ...opts });

/** Onaylatır; evet ise true, değilse null. */
const askConfirm = (title, text, opts = {}) => openDialog({ title, text, ...opts });

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
