/**
 * Arayüz dili — Türkçe ve İngilizce.
 *
 * Metinler iki yerden geliyor: index.html'deki sabit metinler ve app.js'in
 * ürettiği dinamik metinler. İlki `data-i18n` işaretleriyle DOM üzerinde
 * değiştiriliyor, ikincisi `t()` ile.
 *
 * Kullanıcının kendi yazdıkları (kartların anlamları, deste adları) elbette
 * çevrilmiyor.
 */

const TR = {
  'nav.study': 'Çalış',
  'nav.add': 'Ekle',
  'nav.browse': 'Havuz',
  'nav.settings': 'Ayarlar',

  'study.greeting': 'Bugünün tekrarı',
  'study.deck': 'Deste',
  'study.what': 'Ne çalışacaksın',
  'study.start': 'Çalışmaya başla',
  'study.startN': 'Çalışmaya başla · {n}',
  'study.noCards': 'Bu kategoride kart yok',
  'study.empty': 'Havuz boş. Başlamak için birkaç karakter ekle.',
  'study.emptyLink': 'Ekle',
  'study.emptyNote': 'Bugünlük bu kadar. Yeni kart eklemek istersen {link} sekmesine geç.',
  'study.quit': 'Oturumu bitir',
  'study.reveal': 'Göster',
  'study.markLearned': '✓ Bunu öğrendim',
  'study.check': 'Kontrol et',
  'study.next': 'Sonraki',
  'study.done': 'Oturum bitti',
  'study.back': 'Geri dön',
  'study.summary': '{done} kart çalışıldı · {correct} doğru.',
  'study.poolInfo': 'Bu kategoride <b>{notes}</b> kayıt, <b>{cards}</b> kart.',
  'study.matureInfo': '<b>{n}</b> kart yerleşmiş sayılıyor (3 haftadan uzun aralık).',

  'count.cards': 'kart',
  'count.today': 'bugün',
  'count.mature': 'yerleşmiş',

  'mode.all': 'Karışık',
  'mode.learned': 'Öğrenildi',
  'deck.all': 'Tüm desteler',
  'type.pinyin': 'Okunuş',
  'type.meaning': 'Anlam',
  'type.recall': 'Üretim',
  'type.write': 'Yazma',
  'type.read': 'Tanıma',

  'card.tonehint': 'Ton için sayı kullan: <code>hao3</code> → hǎo',
  'card.meaninghint': 'Kendi sözcüklerinle yazabilirsin.',
  'card.meaningPh': 'anlamı yaz',
  'card.whichMeaning': 'Anlamı ne?',
  'card.recallPrompt': 'Okunuşunu yaz, karakteri de aklında tut',
  'card.traditional': 'geleneksel: {x}',
  'card.recallNote': 'Karakteri de hatırladın mı? Hatırlamadıysan bir sonrakinde kendine yüklen.',

  'write.status': 'Karakteri strok sırasıyla çiz',
  'write.hint': 'İpucu',
  'write.giveUp': 'Bilmiyorum',
  'write.loading': 'Strok verisi yükleniyor…',
  'write.loadFail': 'Strok verisi yüklenemedi.',
  'write.noData': 'Bu karakterin strok verisi yok — kendin değerlendir.',
  'write.progress': '{i}. karakter · {n} taneden',
  'write.flawless': 'Hatasız',
  'write.mistakes': '{n} strok hatası',

  'verdict.exact': 'Doğru',
  'verdict.tone': 'Ton yanlış',
  'verdict.near': 'Neredeyse',
  'verdict.wrong': 'Yanlış',
  'verdict.youWrote': 'yazdığın: {x}',

  'add.title': 'Ekle',
  'add.subtitle': 'Sözlükten ara ya da toplu yapıştır',
  'add.tabSearch': 'Sözlükten',
  'add.tabBulk': 'Toplu yapıştır',
  'add.tabManual': 'Elle',
  'add.deckLabel': 'Eklenecek deste',
  'add.deckCompact': '<b>{deck}</b> destesine eklenecek',
  'add.newDeck': '+ Yeni deste',
  'add.newDeckShort': '+ Yeni',
  'add.deckExplain': 'Desteler bölümleri ayırmak için: her bölümü ayrı çalışabilirsin.',
  'add.searchPh': 'Ara',
  'add.searchHint':
    '<b>Enter</b>\'a basınca en üstteki sonuç doğrudan eklenir — <code>ni3</code> ⏎ <code>hao3</code> ⏎ diye aralıksız girebilirsin. Başka bir karakter istiyorsan listeden seç.',
  'add.bulkHint':
    'Her satıra bir kayıt. <b>Sadece pinyin yazman yeter</b> — karakter ve anlam sözlükten gelir. Karakteri yapıştırırsan da olur. Kendi anlamını yazmak istersen okunuştan sonra ekle.',
  'add.preview': 'Önizle',
  'add.add': 'Ekle',
  'add.addN': '{n} kaydı ekle',
  'add.hanzi': 'Karakter',
  'add.pinyin': 'Pinyin',
  'add.meaning': 'Anlam',
  'add.meaningPh': 'iyi, güzel',
  'add.dictLoading': 'Sözlük yükleniyor…',
  'add.dictPreparing': 'Sözlük hazırlanıyor…',
  'add.dictReady': '{n} kayıt hazır.',
  'add.dictFail': 'Sözlük yüklenemedi. Dosyadan açıyorsan yerel bir sunucu gerekiyor (README).',
  'add.results': '{n} sonuç',
  'add.noMatch': 'Eşleşme yok.',
  'add.inPool': 'havuzda',
  'add.added': 'eklendi',
  'add.fromDict': 'sözlükten',
  'add.fromPinyin': 'okunuştan',
  'add.errNoHanzi': 'Karakter ya da tonlu pinyin yok',
  'add.errNoPinyin': 'Pinyin bulunamadı',
  'add.errNoReading': 'Bu okunuşta kayıt yok',
  'add.pickOther': 'Başka karakter seç',

  'browse.title': 'Havuz',
  'browse.search': 'Ara',
  'browse.empty': 'Bu destede henüz kayıt yok.',
  'browse.count': '{n} kayıt',
  'browse.cards': '{n} kart',
  'browse.delete': 'Sil',
  'browse.picked': '{n} seçili',
  'browse.selectAll': 'Tümü',
  'browse.clearPick': 'Seçimi bırak',
  'browse.move': 'Taşı',
  'browse.learn': 'Öğrenildi',
  'browse.unlearn': 'Havuza al',
  'browse.learned': 'öğrenildi',

  'set.title': 'Ayarlar',
  'set.language': 'Dil',
  'set.cardTypes': 'Kart türleri',
  'set.cardTypesHint':
    'Her kayıt seçtiğin türler için ayrı ayrı takip edilir. Üçünde de cevabı yazarsın; sonuç cevabın doğruya yakınlığına göre belirlenir.',
  'set.typePinyinDesc': '汉 → pinyin\'i yaz',
  'set.typeMeaningDesc': 'hǎo → anlamını yaz',
  'set.typeRecallDesc': 'anlam → okunuşu yaz, karakteri hatırla',
  'set.typeWriteDesc': 'anlam → karakteri kalemle çiz (dokunmatik ekran gerekir)',
  'set.sound': 'Ses',
  'set.tts': 'Karakteri seslendir',
  'set.ttsDesc': 'cevap açılınca Çince okunuşu çalar',
  'set.ttsVoice': 'Kullanılan ses: {name}',
  'set.ttsNone': 'Cihazda Çince ses paketi bulunamadı — sistem ayarlarından eklemen gerekebilir.',
  'set.ttsUnsupported': 'Bu tarayıcı seslendirmeyi desteklemiyor.',
  'set.backup': 'Yedek',
  'set.storagePersisted': 'Tarayıcı bu verileri kalıcı işaretledi; yer açmak için kendiliğinden silmeyecek.',
  'set.storageVolatile': 'Tarayıcı bu verileri kalıcı işaretlemedi — disk sıkışırsa silebilir. Düzenli yedek al.',
  'set.backupHint': 'Tüm kayıtların bu cihazda tutuluyor. Düzenli yedek al.',
  'set.export': 'Dışa aktar',
  'set.shareBackup': 'Yedeği gönder',
  'set.import': 'İçe aktar',
  'set.lastBackup': 'Son yedek: {date} · {n} kayıt',
  'set.theme': 'Görünüm',
  'set.themeSystem': 'Sistem',
  'set.themeLight': 'Açık',
  'set.themeDark': 'Koyu',
  'set.decks': 'Desteler',
  'set.deckNotes': '{n} kayıt',
  'set.rename': 'Yeniden adlandır',
  'set.delete': 'Sil',
  'set.colophon': 'Inkwell · sözlük verisi {link} (CC BY-SA 4.0)',

  'toast.added': '{x} eklendi',
  'toast.dupe': '{x} zaten havuzda',
  'toast.deckCreated': '"{x}" oluşturuldu',
  'toast.oneType': 'En az bir tür açık kalmalı',
  'toast.cardsMade': '{n} yeni kart üretildi',
  'toast.bulkAdded': '{n} kayıt eklendi',
  'toast.deleted': 'Silindi',
  'toast.moved': '{n} kayıt "{x}" destesine taşındı',
  'toast.learned': '{x} öğrenildi sayıldı',
  'toast.learnedN': '{n} kayıt öğrenildi sayıldı',
  'toast.unlearnedN': '{n} kayıt havuza döndü',
  'toast.needFields': 'Karakter ve anlam gerekli',
  'toast.merged': '{n} kayıt birleştirildi',
  'toast.deduped': '{n} mükerrer karakter tekleştirildi',
  'toast.fileError': 'Dosya okunamadı',
  'toast.exportFail': 'Yedek dışarı verilemedi',
  'toast.noMatch': 'Eşleşme yok',

  'prompt.newDeck': 'Yeni deste',
  'prompt.deleteDeck': '"{x}" silinsin mi?',
  'dialog.ok': 'Tamam',
  'dialog.gotIt': 'Anladım',
  'pool.warnTitle': '"{x}" destesi {n} karakteri geçti',
  'pool.warnText': 'Bir oturum seçili destenin tamamını veriyor, yani bu deste artık uzun sürecek. Tek seferde hepsini çalışman gerekmiyor: yeni karakterleri ayrı bir desteye ekleyebilir, kategori seçerek daraltabilir, iyi bildiğin karakterleri doğru cevaptan sonra "öğrenildi" işaretleyerek havuzdan çıkarabilirsin. Bu uyarı bir daha çıkmayacak.',
  'dialog.cancel': 'Vazgeç',
  'dialog.create': 'Oluştur',
  'dialog.save': 'Kaydet',
  'prompt.rename': 'Yeni ad',
  'confirm.deleteNote': '"{x}" silinsin mi?',
  'confirm.deleteNoteText': 'Kaydın tekrar geçmişi de gider.',
  'confirm.deleteDeck': 'İçindeki {n} kayıt da silinir. Kayıtları saklamak istersen önce Havuz ekranından başka desteye taşı.',
  'error.notBackup': 'Bu dosya bir Inkwell yedeği değil.',
};

const EN = {
  'nav.study': 'Study',
  'nav.add': 'Add',
  'nav.browse': 'Pool',
  'nav.settings': 'Settings',

  'study.greeting': "Today's practice",
  'study.deck': 'Deck',
  'study.what': 'What to study',
  'study.start': 'Start studying',
  'study.startN': 'Start studying · {n}',
  'study.noCards': 'No cards in this category',
  'study.empty': 'The pool is empty. Add a few characters to begin.',
  'study.emptyLink': 'Add',
  'study.emptyNote': "That's it for now. To add new cards, go to the {link} tab.",
  'study.quit': 'End session',
  'study.reveal': 'Show',
  'study.markLearned': '✓ I know this one',
  'study.check': 'Check',
  'study.next': 'Next',
  'study.done': 'Session finished',
  'study.back': 'Go back',
  'study.summary': '{done} cards studied · {correct} correct.',
  'study.poolInfo': '<b>{notes}</b> entries, <b>{cards}</b> cards in this category.',
  'study.matureInfo': '<b>{n}</b> cards count as settled (interval longer than 3 weeks).',

  'count.cards': 'cards',
  'count.today': 'today',
  'count.mature': 'settled',

  'mode.all': 'Mixed',
  'mode.learned': 'Learned',
  'deck.all': 'All decks',
  'type.pinyin': 'Reading',
  'type.meaning': 'Meaning',
  'type.recall': 'Recall',
  'type.write': 'Writing',
  'type.read': 'Recognition',

  'card.tonehint': 'Use numbers for tones: <code>hao3</code> → hǎo',
  'card.meaninghint': 'Your own words are fine.',
  'card.meaningPh': 'type the meaning',
  'card.whichMeaning': 'What does it mean?',
  'card.recallPrompt': 'Type the reading, and recall the character too',
  'card.traditional': 'traditional: {x}',
  'card.recallNote': 'Did you recall the character as well? If not, be strict with yourself next time.',

  'write.status': 'Draw the character in stroke order',
  'write.hint': 'Hint',
  'write.giveUp': "I don't know",
  'write.loading': 'Loading stroke data…',
  'write.loadFail': 'Stroke data could not be loaded.',
  'write.noData': 'No stroke data for this character — judge it yourself.',
  'write.progress': 'character {i} of {n}',
  'write.flawless': 'Flawless',
  'write.mistakes': '{n} stroke mistakes',

  'verdict.exact': 'Correct',
  'verdict.tone': 'Wrong tone',
  'verdict.near': 'Almost',
  'verdict.wrong': 'Wrong',
  'verdict.youWrote': 'you wrote: {x}',

  'add.title': 'Add',
  'add.subtitle': 'Search the dictionary or paste in bulk',
  'add.tabSearch': 'Dictionary',
  'add.tabBulk': 'Bulk paste',
  'add.tabManual': 'Manual',
  'add.deckLabel': 'Deck to add to',
  'add.deckCompact': 'Adding to <b>{deck}</b>',
  'add.newDeck': '+ New deck',
  'add.newDeckShort': '+ New',
  'add.deckExplain': 'Decks keep chapters apart, so you can study each one on its own.',
  'add.searchPh': 'Search',
  'add.searchHint':
    '<b>Enter</b> adds the top result straight away — you can type <code>ni3</code> ⏎ <code>hao3</code> ⏎ without pausing. Pick from the list if you want a different character.',
  'add.bulkHint':
    'One entry per line. <b>Pinyin alone is enough</b> — the character and meaning come from the dictionary. Pasting characters works too. To use your own meaning, write it after the reading.',
  'add.preview': 'Preview',
  'add.add': 'Add',
  'add.addN': 'Add {n} entries',
  'add.hanzi': 'Character',
  'add.pinyin': 'Pinyin',
  'add.meaning': 'Meaning',
  'add.meaningPh': 'good, fine',
  'add.dictLoading': 'Loading dictionary…',
  'add.dictPreparing': 'Preparing dictionary…',
  'add.dictReady': '{n} entries ready.',
  'add.dictFail': 'Dictionary failed to load. Opening from a file needs a local server (see README).',
  'add.results': '{n} results',
  'add.noMatch': 'No matches.',
  'add.inPool': 'in pool',
  'add.added': 'added',
  'add.fromDict': 'from dictionary',
  'add.fromPinyin': 'from reading',
  'add.errNoHanzi': 'No character or toned pinyin',
  'add.errNoPinyin': 'Pinyin not found',
  'add.errNoReading': 'No entry with this reading',
  'add.pickOther': 'Pick another character',

  'browse.title': 'Pool',
  'browse.search': 'Search',
  'browse.empty': 'No entries in this deck yet.',
  'browse.count': '{n} entries',
  'browse.cards': '{n} cards',
  'browse.delete': 'Delete',
  'browse.picked': '{n} selected',
  'browse.selectAll': 'All',
  'browse.clearPick': 'Clear selection',
  'browse.move': 'Move',
  'browse.learn': 'Learned',
  'browse.unlearn': 'Back to pool',
  'browse.learned': 'learned',

  'set.title': 'Settings',
  'set.language': 'Language',
  'set.cardTypes': 'Card types',
  'set.cardTypesHint':
    'Each entry is tracked separately for the types you pick. You type the answer in all of them; the result follows how close it was.',
  'set.typePinyinDesc': '汉 → type the pinyin',
  'set.typeMeaningDesc': 'hǎo → type the meaning',
  'set.typeRecallDesc': 'meaning → type the reading, recall the character',
  'set.typeWriteDesc': 'meaning → draw the character with a pen (needs a touch screen)',
  'set.sound': 'Sound',
  'set.tts': 'Speak the character',
  'set.ttsDesc': 'plays the Chinese reading when the answer is revealed',
  'set.ttsVoice': 'Voice in use: {name}',
  'set.ttsNone': 'No Chinese voice found on this device — you may need to add one in system settings.',
  'set.ttsUnsupported': 'This browser does not support speech.',
  'set.backup': 'Backup',
  'set.storagePersisted': 'The browser marked this data as persistent; it will not clear it to free space.',
  'set.storageVolatile': 'The browser has not marked this data as persistent — it may be cleared if disk space runs low. Keep backups.',
  'set.backupHint': 'All your entries live on this device. Back them up regularly.',
  'set.export': 'Export',
  'set.shareBackup': 'Send backup',
  'set.import': 'Import',
  'set.lastBackup': 'Last backup: {date} · {n} entries',
  'set.theme': 'Appearance',
  'set.themeSystem': 'System',
  'set.themeLight': 'Light',
  'set.themeDark': 'Dark',
  'set.decks': 'Decks',
  'set.deckNotes': '{n} entries',
  'set.rename': 'Rename',
  'set.delete': 'Delete',
  'set.colophon': 'Inkwell · dictionary data {link} (CC BY-SA 4.0)',

  'toast.added': '{x} added',
  'toast.dupe': '{x} is already in the pool',
  'toast.deckCreated': '"{x}" created',
  'toast.oneType': 'At least one type must stay on',
  'toast.cardsMade': '{n} new cards created',
  'toast.bulkAdded': '{n} entries added',
  'toast.deleted': 'Deleted',
  'toast.moved': 'Moved {n} entries to "{x}"',
  'toast.learned': '{x} marked as learned',
  'toast.learnedN': 'Marked {n} entries as learned',
  'toast.unlearnedN': '{n} entries back in the pool',
  'toast.needFields': 'Character and meaning are required',
  'toast.merged': '{n} entries merged',
  'toast.deduped': '{n} duplicate characters folded together',
  'toast.fileError': 'Could not read the file',
  'toast.exportFail': 'Could not export the backup',
  'toast.noMatch': 'No match',

  'prompt.newDeck': 'New deck',
  'prompt.deleteDeck': 'Delete "{x}"?',
  'dialog.ok': 'OK',
  'dialog.gotIt': 'Got it',
  'pool.warnTitle': 'Deck "{x}" passed {n} characters',
  'pool.warnText': 'A session hands you the whole selected deck, so this one will run long now. You do not have to study all of it at once: put new characters in a separate deck, narrow things down with a category, or mark characters you know well as "learned" after a correct answer. This warning will not appear again.',
  'dialog.cancel': 'Cancel',
  'dialog.create': 'Create',
  'dialog.save': 'Save',
  'prompt.rename': 'New name',
  'confirm.deleteNote': 'Delete "{x}"?',
  'confirm.deleteNoteText': 'Its review history goes too.',
  'confirm.deleteDeck': 'The {n} entries in it go too. To keep them, move them to another deck from the pool first.',
  'error.notBackup': 'This file is not an Inkwell backup.',
};

const DICTS = { tr: TR, en: EN };
export const LANGUAGES = [
  ['tr', 'Türkçe'],
  ['en', 'English'],
];

let lang = 'tr';

/** Cihazın diline bakar; Türkçe değilse İngilizce. */
export function detect() {
  const nav = navigator.language ?? '';
  return nav.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export function setLang(next) {
  lang = DICTS[next] ? next : 'tr';
  document.documentElement.lang = lang;
  applyDom();
}

export const getLang = () => lang;

/** Anahtarı çevirir; {ad} yer tutucularını doldurur. */
export function t(key, vars) {
  const text = DICTS[lang][key] ?? DICTS.tr[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

/**
 * Sabit metinleri günceller.
 *
 *   data-i18n       metin
 *   data-i18n-html  içinde biçimleme olan metin
 *   data-i18n-ph    yer tutucu
 *   data-i18n-aria  erişilebilirlik etiketi
 */
export function applyDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-html]')) {
    el.innerHTML = t(el.dataset.i18nHtml);
  }
  for (const el of root.querySelectorAll('[data-i18n-ph]')) {
    el.placeholder = t(el.dataset.i18nPh);
  }
  for (const el of root.querySelectorAll('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  }
}
