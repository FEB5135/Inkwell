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

**Tarayıcının `prompt`/`confirm` kutuları kullanılmaz.** Uygulamanın dışında
duruyorlar. `index.html`'deki tek `<dialog>` üstünden `askText()` ve
`askConfirm()` var.

---

## Mimari

```
index.html            arayüz iskeleti (data-i18n işaretli)
css/app.css           tema — nötr zemin + mavi vurgu, açık/koyu
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

Karıştırmadan sonra `spreadSiblings` aynı karakterin kartlarını birbirinden
uzaklaştırıyor. Buranın iki tuzağı var, ikisi de rastgeleliği sessizce
öldürüyordu: **uygun adaylar arasından rastgele seçilmeli** (ilk uyganı almak
karıştırmayı boşa çıkarıp sırayı devre çeviriyordu) ve **aralık en az iki aday
bırakmalı** (`size - 2`; daha genişi her adımda tek aday bıraktığı için oturum
boyunca aynı dördül tekrarlanıyordu). Seçim, kaydın kalan kart sayısıyla
ağırlıklı — kartlar eşit dağılmışken düpedüz eşit olasılık, dengesizken sona
yığılmayı önlüyor. Kategori rozetlerindeki
sayı da bu yüzden vadeyi değil, o kategoriyi seçersen gelecek kart sayısını
gösteriyor.

**Öğrenildi**, kart durumu değil kullanıcının kararı. Doğru cevaptan sonra
çıkan düğmeyle işaretlenir (`notes.learnedAt`), kayıt normal kuyruktan çıkar
ama kartları ve zamanlaması durur; kendi kategorisinden istendiği zaman
çalışılır, Havuz'dan geri alınır.

Ekleme hedefi (`lastDeck`) ile çalışılan deste (`studyDeck`) ayrı ayarlar.
Tek ayardılar; yeni deste açmak çalışma kuyruğunu sessizce boşaltıyordu.

**Oturum başına kart sınırı yok — denendi ve kaldırıldı.** Sınır, 59 kartla 60
kart arasında keyfi bir davranış farkı yaratıyordu. Havuzun tamamı hâlâ tek
oturumda geliyor; bunun bedeli yalnızca **bir kez** söyleniyor: eklenen
destenin kayıt sayısı `POOL_WARN_AT`'i (100) ilk geçtiğinde ekleme sonrası bir
bilgi diyaloğu çıkıyor. `poolWarned` ayarı tekrarını engelliyor — mesaj
uygulamanın nasıl çalıştığını anlatıyor, bir kez okunması yeter.

Sayımın iki ayrıntısı deneyerek oturdu: birim **kayıt** (hanzi + anlamı), açık
tür sayısı kadar kart değil — kullanıcı eklediği şeyi sayıyor, üç katını değil.
Ve sayım **deste başına**; oturum zaten seçili desteyle sınırlı olduğu için
toplamı saymak, kırk kayıtlık yeni bir bölüme eklerken bile uyarı çıkarıyordu.

**Tekrar geçmişi 90 günde budanıyor** (`REVIEW_KEEP_DAYS`). Geçmiş yalnız
"bugün kaç kart" sayacı için okunuyor ama hiç silinmiyordu: 500 karakter ve
kart başına 50 tekrarda yedeğin 8,7 MB'ının 8,3 MB'ı tekrar kayıtlarıydı.
Budama hem açılışta veritabanında hem de yedek üretilirken uygulanıyor.

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

**Zemin tonsuz, renk yalnız anlam taşıdığı yerde.** Gri tonlarında kalan en
ufak sıcaklık geniş yüzeyde kahverengiye çalıyor; zemin bu yüzden düz beyaz
(`#ffffff`) ve düz siyah (`#000000`), aradaki griler de nötr. Arka planda
ışıma yok.

**Arayüzün vurgusu mavi (`--accent`), kırmızı yalnız "yanlış" demek için
ayrıldı (`--wrong`).** Çalışırken doğru yeşil, yanlış kırmızı yanıyor; düğmeler
ve etkin sekmeler de kırmızıyken bu iki anlam birbirine karışıyordu. Aynı
sebeple üç sayaç ayrı ayrı okunuyor: havuz mavi, bugün kehribar, yerleşmiş
yeşil. `--wrong` ayrıca geri alınamaz işlemlerde (silme düğmesi) kullanılıyor —
orada da anlamı "dikkat".

Açık temada zemin ile kart aynı beyaz olduğu için **kartları ayıran tek şey
kenarlık**: `--rule` tonuna dokunurken bunu hesaba kat.

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
gönderilmeli, `mouseup` belgeye. Koordinat hesaplarken kendi varsayımını
kurma: kütüphane SVG'nin içine kendi `translate(...) scale(...)` grubunu
koyuyor, karakter koordinatını ekrana çevirmek için o grubun
`getScreenCTM()` matrisi kullanılmalı.

**`<dialog>`'un `close` olayına tek başına güvenme.** Bazı gömülü
tarayıcılarda diyalog kapanıp `returnValue` doğru ayarlandığı hâlde `close`
hiç tetiklenmiyor. Söz yalnız o olaya bağlıyken bütün diyaloglar sessizce
askıda kalıyordu — kullanıcı düğmeye basıyor, hiçbir şey olmuyor, hata da yok.
`openDialog` artık düğme tıklamalarıyla çözülüyor, `close` yalnız emniyet
kemeri.

**hanzi-writer geçersiz renkte çöker.** Renkleri CSS belirteçlerinden okuyoruz
(`cssVar`); olmayan bir belirteç boş dize döndürür, kütüphane de
`Invalid color:` diye atar ve **çizim tamamen durur**. Belirteç adı
değiştirildiğinde `cssVar` çağrıları da güncellenmeli; `cssVar`'ın yedek
rengi bu sessiz kırılmayı görünür kılmak için var.

**Gömülü tarayıcıda servis çalışanı kaydolmaz.** Konsoldaki "unknown error
when fetching the script" bundan; gerçek tarayıcıda sorun değil.

**Eski servis çalışanı hâlâ devrede olabilir.** Kabuk artık önce ağdan alınsa
da, sayfayı yöneten kayıt eski sürümse o eski kuralla (önbellek önce) çalışmaya
devam ediyor. Geliştirirken "yazdığım kod çalışmıyor" hissi buradan gelir:
`navigator.serviceWorker.getRegistrations()` ile kaydı sil, `caches.keys()` ile
önbellekleri boşalt, yenile. Sunucunun ne verdiğini tarayıcı dışından (curl,
Invoke-WebRequest) doğrulamak en hızlı ayrım.

**Servis çalışanı kabuğu artık önce ağdan alıyor.** Önce önbellekten sunarken
kod değişikliği hep bir açılış gecikmeli geliyordu; geliştirirken eski `app.js`
sunulduğu için yok olmayan hatalar kovalanıyordu. Çevrimdışılık önbellek
yedeğiyle duruyor. Sözlük hâlâ önce önbellekten (6,8 MB).

---

## Yedek ve eşitleme

Dışa aktarma tarayıcıda blob bağlantısıyla iniyor; **Android'de inmiyor**,
WebView'da indirme dinleyicisi yok. Orada dosya `Directory.CACHE`'e yazılıp
paylaşım penceresi açılıyor (`@capacitor/filesystem` + `@capacitor/share`).
Eklentilere `Capacitor.registerPlugin` ile köprü üstünden ulaşılıyor — JS
paketini `import` etmek paketleyici gerektirirdi, projenin derleme adımı yok.

**Aynı karakter birden çok destede bulunabilir.** Ders kitabında bir karakter
birkaç bölümde geçebiliyor ve her bölümün destesinde kendi kaydı olabilmeli.
Bu yüzden yinelenen denetimi (`findByHanzi`) desteye bakıyor, havuzun tamamına
değil. Bedeli: her kopyanın kendi zamanlaması var.

Kopyalar iki yerde tekleniyor. **"Tüm desteler" çalışılırken** kuyruğa her
karakterden yalnız biri giriyor (`tekleştir`) — tek deste çalışırken kopya
doğru, hepsini birden çalışırken 猫'yu üç kez sormanın anlamı yok. Kazanan en
eski kayıt, `planDedupe` ile aynı kural. Eleme süzgeçten **sonra**: kopyalardan
biri öğrenildi işaretliyse zaten elenmiş olur, geriye çalışılabilir olan kalır.
Sayımlar da (`renderModes`) aynı elemeyi uyguluyor, yoksa rozet düğmeyle
çelişiyor. **Kayıt taşınırken** hedef destede aynı karakter varsa `dedupeAll`
ikisini birleştirip kullanıcıya söylüyor.

İçe aktarma `id` üzerinden birleştiriyordu; aynı karakteri iki cihazda elle
eklemek mükerrer kayıt üretiyordu. `planDedupe` bunu tekliyor: kazanan en eski
kayıt (eşitlikte küçük `id`), kartlarda tür tür en çok çalışılmış olan kalır.
Kural saf ve deterministik — iki cihaz aynı sonuca varmazsa yedekler gidip
gelirken yakınsamaz. Anahtarı **deste + karakter**: farklı destelerdeki
kopyalar kasıtlı olduğu için birleştirilmez, yalnız aynı destede iki kez
beliren kayıt kaza sayılır. Bunun sınırı şu: iki cihazda *ayrı ayrı oluşturulan*
destelerin id'leri farklı olduğu için, oralardaki aynı karakter birleşmez.

Cihaza ait ayarlar (`lang`, `theme`, `lastDeck`, `studyDeck`, `mode`) yedekten
gelmez; yedeğin işi kartları taşımak.

## Sırada

- Cihazlar arası eşitleme (tablet ↔ bilgisayar ayrı havuzlar tutuyor)
- Benzer görünen karakterlerin (未/末, 己/已) çıkış zamanlarının ayrılması
