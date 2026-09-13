# Inkwell

Kendi hanzi havuzunu kur, aralıklı tekrarla ezberle. Çevrimdışı çalışır, veri
cihazdan çıkmaz.

Ders kitabında her bölüm sonu çıkan yeni karakterleri kendi listene ekleyip
aralıklı tekrar (spaced repetition) ile çalışmak için yapıldı. Çince klavye
gerektirmez.

---

## Ne yapar

**Kart havuzu.** Karakterleri destelere (bölümlere) ayırarak biriktirirsin.

**Üç yönlü çalışma.** Her kayıt için ayrı ayrı takip edilen üç kart üretilir:

| Tür | Soru | Ölçtüğü |
|---|---|---|
| Tanıma | 好 → ? | okuma |
| Okunuş | 好 → pinyin'i yaz | ton hassasiyeti |
| Üretim | "iyi" → ? | hatırlama |

Yani 100 karakter girince 300 kart olur, tek tek kart hazırlamazsın.

**Aralıklı tekrar.** SM-2 türevi bir algoritma her kartı ne zaman tekrar
göstereceğine son performansına bakarak karar verir. Bildiğin karakter
aylarca çıkmaz, takıldığın her gün çıkar.

**Çince klavye gerekmez.** Üç ekleme yolu da İngilizce klavyeyle çalışır:

- **Sözlükten:** `hao3`, `hao` ya da `good` yazıp listeden seçersin —
  karakter, pinyin ve anlam kendiliğinden dolar.
- **Toplu yapıştır:** her satıra bir kayıt (`好 hao3 iyi`). Sadece karakteri
  yapıştırsan da olur, gerisini sözlükten tamamlar.
- **Elle:** üç alanı kendin doldurursun.

Ton işaretleri de aynı mantıkla: `hao3` yazarsın, `hǎo` görürsün. Cevap
denetiminde her iki yazım da kabul edilir, ama ton yanlışsa kart yanlış sayılır.

**Çevrimdışı.** Uygulama ve 124.000 kayıtlık CC-CEDICT sözlüğü cihazda durur.
İnternet gerekmez.

---

## Çalıştırma

Tarayıcı güvenlik kuralları yüzünden `index.html` dosyasını doğrudan çift
tıklayarak açmak yetmez (sözlük dosyası okunamaz, çevrimdışı kip çalışmaz).
Küçük bir yerel sunucu gerekir:

```bash
npx serve .
```

Sonra tarayıcıda `http://localhost:3000`.

Python tercih edersen:

```bash
python -m http.server 8000
```

### Tablete kurmak

Android için APK üretilir — aşağıdaki bölüme bak. Web sürümünü bir yere
yayınlayıp (örn. Vercel) tarayıcıdan "Ana ekrana ekle" ile kurmak da mümkün,
ama APK'da veri tarayıcı temizliğinden etkilenmez.

---

## Android sürümü (APK)

Uygulama Capacitor ile bir Android uygulamasına sarılır. Sunucu gerekmez,
sözlük dahil her şey APK'nın içindedir.

```bash
npm run apk
```

Çıktı: `dist/Inkwell-<sürüm>.apk`. Tablete kopyalayıp dosya yöneticisinden
açarsan kurulur (bilinmeyen kaynaklara izin vermen istenebilir).

Gereken: JDK 21 ve Android SDK (platform 36, build-tools 36). `ANDROID_HOME`
ayarlıysa betik gerisini halleder.

### İmzalama anahtarı — yedekle

İlk derlemede `android/inkwell.keystore` üretilir ve parolası
`android/keystore.properties` dosyasına yazılır. İkisi de depoya girmez.

Bu anahtar uygulamanın kimliğidir: aynı anahtarla imzalanmış yeni sürümler
tablete mevcut uygulamanın **üzerine** kurulur ve kartların korunur. Anahtar
kaybolursa güncelleme kurulamaz; uygulamayı silip yeniden kurman gerekir, o da
içindeki her şeyi siler. **Bu iki dosyayı güvenli bir yere kopyala.**

### Bilinen tuzak: uzun TEMP yolu

Java, Windows'ta NIO pipe'larını AF_UNIX soketiyle kurar ve soket yolu 108
baytlık sınıra sığmak zorundadır. `TEMP` yolu uzunsa Gradle
`Unable to establish loopback connection` diye hata verir. `tools/build-apk.mjs`
derleme sırasında kısa bir geçici dizin (`C:\Temp\inkwell-build`) kullanarak
bunu önler.

---

## Veri

Her şey tarayıcının IndexedDB'sinde, cihazda tutulur. Sunucuya hiçbir şey
gitmez, hesap yoktur.

**Yedek al.** Ayarlar → Dışa aktar bir JSON dosyası verir. İçe aktarma
birleştiricidir, silici değil: aynı kaydın iki sürümü varsa yeni olan kazanır.
İki cihazın yedeklerini üst üste yüklemek veri kaybettirmez.

Kayıtlar `updatedAt` ve silme mezar taşı taşır; ileride gerçek bir cihaz
eşitlemesi eklendiğinde mevcut veri olduğu gibi taşınabilir.

---

## Yapı

```
index.html            arayüz iskeleti
css/app.css           tema (açık/koyu, kağıt-mürekkep paleti)
js/app.js             ekranlar, oturum akışı
js/store.js           IndexedDB katmanı, yedekleme
js/srs.js             aralıklı tekrar algoritması
js/dict.js            sözlük araması
js/pinyin.js          ton sayısı ↔ ton işareti dönüşümü
data/cedict.tsv       gömülü sözlük (üretilmiş dosya)
tools/build-dict.mjs  CC-CEDICT → data/cedict.tsv
tools/make-icons.py   PWA ikonları
tools/build-www.mjs   www/ çıktısı (Capacitor bunu paketler)
tools/build-apk.mjs   imzalama + APK derlemesi
tools/make-android-assets.py  Android ikonları ve açılış görseli
android/              Capacitor'ın ürettiği Android projesi
sw.js                 çevrimdışı önbellek (yalnız web sürümünde)
```

Sözlüğü tazelemek için:

```bash
curl -o tools/cedict.txt.gz https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz
gzip -dc tools/cedict.txt.gz > tools/cedict.txt
node tools/build-dict.mjs
```

---

## Sırada ne var

- Kalemle yazma pratiği (strok sırası denetimiyle)
- Cihazlar arası eşitleme
- Benzer görünen karakterlerin (未/末, 己/已) birbirini bozmaması için
  çıkış zamanlarının ayrılması

---

Sözlük verisi [CC-CEDICT](https://cc-cedict.org/), CC BY-SA 4.0.
