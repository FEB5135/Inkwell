# Inkwell

Çince karakter (hanzi) çalışma uygulaması. Bağımsız bir kullanıcı için
yazıldı: ders kitabında her bölüm sonu çıkan yeni karakterleri kendi havuzuna
ekleyip çalışıyor.

Çalışan sürümler: web (yerel sunucu) ve Android APK. Depo:
https://github.com/FEB5135/Inkwell

---

## Değişmez kurallar

**Kullanıcıda Çince klavye yok, İngilizce klavye var.** Uygulamanın her yerinde
bu varsayım geçerli. Karakter yazdırmak isteyen hiçbir akış kurulamaz; okunuş
yazdırılır. Ton sayıyla girilir (`hao3`), ekranda işaretle gösterilir (`hǎo`);
cevap denetiminde iki yazım da kabul edilir.

**Veri cihazda kalır.** Hesap yok, sunucuya hiçbir kullanıcı verisi gitmez.
IndexedDB + JSON yedek. Kayıtlar `updatedAt` ve silme mezar taşı taşır; ileride
cihaz eşitlemesi veri kaybı olmadan eklenebilsin diye.

**Çevrimdışı çalışır.** Sözlük ve strok verisi uygulamanın içinde.

**Arayüz dili Türkçe ve İngilizce.** Yeni metin eklerken `js/i18n.js`'e iki
dilde de anahtar ekle; sabit metinler `data-i18n`, dinamikler `t()`.

---

## Mimari

```
index.html            arayüz iskeleti (data-i18n işaretli)
css/app.css           tema — kağıt & mürekkep, açık/koyu
js/app.js             ekranlar, oturum akışı
js/i18n.js            tr/en sözlüğü
js/store.js           IndexedDB, yedekleme
js/srs.js             kart zamanlaması (SM-2 türevi)
js/grade.js           cevabın doğruya yakınlığı
js/pinyin.js          ton dönüşümü, hece ayırma
js/syllables.js       ÜRETİLMİŞ — geçerli heceler
js/dict.js            sözlük araması
js/strokes.js         strok verisi
js/vendor/            hanzi-writer (MIT)
data/cedict.tsv       ÜRETİLMİŞ — sözlük (depoda)
data/strokes.txt      ÜRETİLMİŞ — strok verisi (depoda değil)
tools/                derleme betikleri
android/              Capacitor projesi
brand/icon-source.jpg marka görseli
```

Çerçeve yok, derleme adımı yok — düz ES modülleri. `tools/build-www.mjs`
dosyaları `www/` altında topluyor, Capacitor onu paketliyor.

## Komutlar

```bash
npm start        # yerel sunucu (http://localhost:4173)
npm run apk      # dist/Inkwell-<sürüm>.apk
npm run dict     # CC-CEDICT -> data/cedict.tsv + js/syllables.js
npm run strokes  # hanzi-writer-data -> data/strokes.txt
npm run icons    # brand/icon-source.jpg -> bütün ikon boyutları
```

`Inkwell.bat` bilgisayarda tek tıkla başlatır.

---

## Kart türleri

Dördü de cevabı **yazdırır**. Kafadan cevaplayıp kendine not vermek güvenilir
değil; insan bildiğini sanır.

| Tür | Soru | Cevap |
|---|---|---|
| `pinyin` | 老师 | `lao3shi1` |
| `meaning` | lǎoshī | `teacher` |
| `recall` | teacher | `lao3shi1` + karakteri hatırla |
| `write` | teacher · lǎoshī | karakteri kalemle çiz |

`read` türü kullanımdan kalktı (kendi not verilen eski tür); mevcut kartlar
bozulmasın diye gösterimi duruyor.

`write` dokunmatik ekran gerektirdiği için varsayılan kapalı.

## Çalışma akışı

Havuzun tamamı karıştırılıp baştan sona geliyor — vade ya da günlük sınır yok.
Cevap yazılır, sonuç görünür, oka basılıp geçilir.

**Not kullanıcıdan sorulmuyor.** Cevap zaten ölçüldüğü için yakınlıktan
türetiliyor: tam → İyi, ton yanlış / bir harf sapma → Zor, diğer → Tekrar.
Zamanlama verisi arka planda birikiyor ama kuyruğa karışmıyor. (Kullanıcı not
düğmelerini gereksiz bulduğu için kaldırıldı; altyapı duruyor.)

---

## Kararların gerekçeleri

**Sıralama gerçek sıklık verisine dayanır.** Arama sonuçları dosya sırasından
gelir; `data/cedict.tsv` yaygından nadire sıralıdır. Puanlama Jun Da'nın
karakter sıklığı + HSK 3.0 (yalnız 1-6. seviye) ile yapılır. CC-CEDICT'in
kendisinden türetilen ölçü yetmiyordu: "ni3" için 你 yerine 拟 getiriyordu.
HSK'nın "7-9" kümesine yükseltme verilmez, 5636 sözcüklük ileri düzey bir
torba olduğu için yaygın karakterleri geri itiyor (抹 → 妈).

**Hece listesi elle yazılmaz**, CC-CEDICT okunuşlarından üretilir — elle
yazılan liste eksik kalırdı. Hece ayırma geri izlemeli: "xian" tek hece mi
xi+an mı belirsiz, en az parçalı bölünme seçilir.

**Sözlük anahtarları hece ayırmadan geçmez.** CC-CEDICT okunuşları zaten
ayrılmış; 125 bin kaydı çözümlemek açılışı boşuna yavaşlatır.

**Marka karakteri 永.** 永字八法'nın karakteri: sekiz temel strok türünü birden
içerdiği için hat yazısında ilk yazılan karakter. Beş stroklu olması küçük
boyutlarda okunur kılıyor. (Kullanıcı için ayrıca anlamlı: Japoncası *ei*,
"sonsuz".)

---

## Tuzaklar

**Uzun TEMP yolu Gradle'ı kırar.** Java, Windows'ta NIO pipe'ını AF_UNIX
soketiyle kurar; soket yolu 108 bayta sığmalı. Uzun `TEMP`'te Gradle
`Unable to establish loopback connection` der. `tools/build-apk.mjs` kısa bir
geçici dizin kullanarak önlüyor.

**İmzalama anahtarı yedeklenmeli.** `android/inkwell.keystore` ve
`android/keystore.properties` depoda değil. Kaybolursa güncelleme mevcut
kurulumun üzerine kurulamaz; uygulamayı silmek gerekir, o da kartları siler.

**Android başlatıcı ikonu önbelleğe alınır.** Yeni ikon görünmüyorsa cihazı
yeniden başlatmak gerekebilir; APK'nın içinde doğru ikon vardır.

**hanzi-writer fare/dokunma olaylarını dinler**, işaretçi (pointer) olaylarını
değil. Kalem bunları zaten üretir. Test ederken `mousemove` SVG'ye
gönderilmeli, `mouseup` belgeye.

**Gömülü tarayıcıda servis çalışanı kaydolmaz.** Konsoldaki "unknown error
when fetching the script" bundan; gerçek tarayıcıda sorun değil.

---

## Sırada

- Cihazlar arası eşitleme (tablet ↔ bilgisayar ayrı havuzlar tutuyor)
- Benzer görünen karakterlerin (未/末, 己/已) çıkış zamanlarının ayrılması
