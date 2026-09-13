/**
 * APK derler.
 *
 * İlk çalıştırmada bir imzalama anahtarı (keystore) üretir. Bu anahtar
 * uygulamanın kimliğidir: aynı anahtarla imzalanmış yeni sürümler tablete
 * mevcut uygulamanın üzerine kurulur, verisi korunur. Anahtar kaybolursa
 * güncelleme kurulamaz — uygulamayı silip baştan kurmak gerekir, o da
 * içindeki kartları siler. Bu yüzden android/inkwell.keystore dosyasını
 * yedekle.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const ANDROID = 'android';
const KEYSTORE = join(ANDROID, 'inkwell.keystore');
const PROPS = join(ANDROID, 'keystore.properties');
const SDK = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? 'C:\\Users\\Android\\Sdk';

/**
 * Gradle'ın geçici dosya dizini.
 *
 * Java, Windows'ta NIO pipe'larını (Selector.open() bunu kullanır) AF_UNIX
 * soketiyle kurar ve soket yolu 108 baytlık sockaddr_un sınırına sığmak
 * zorundadır. Uzun bir TEMP yolunda connect "Invalid argument" verir, Gradle
 * de bunu "Unable to establish loopback connection" diye bildirir. Kısa bir
 * dizin vererek sorunu kaynağında kesiyoruz.
 */
const SHORT_TMP = 'C:\\Temp\\inkwell-build';

function run(cmd, args, opts = {}) {
  // Node 20'den beri .bat/.cmd dosyaları kabuk olmadan çalıştırılamıyor.
  const needsShell = process.platform === 'win32' && /\.(bat|cmd)$/i.test(cmd);
  const env = { ...process.env, ANDROID_HOME: SDK, ANDROID_SDK_ROOT: SDK };
  if (process.platform === 'win32') {
    mkdirSync(SHORT_TMP, { recursive: true });
    env.TMP = env.TEMP = SHORT_TMP;
  }
  return execFileSync(needsShell ? `"${cmd}"` : cmd, args, {
    stdio: 'inherit',
    shell: needsShell,
    env,
    ...opts,
  });
}

/* ── 0. SDK yolu ── */

// local.properties depoya girmez (makineye özeldir), yoksa üretilir.
const LOCAL_PROPS = join(ANDROID, 'local.properties');
if (!existsSync(LOCAL_PROPS)) {
  if (!existsSync(SDK)) {
    console.error(
      `Android SDK bulunamadı: ${SDK}\n` +
        'ANDROID_HOME ortam değişkenini SDK klasörüne ayarla.'
    );
    process.exit(1);
  }
  // Java properties biçimi: sürücü harfindeki iki nokta kaçırılır, ayraç olarak
  // ters bölü yerine düz bölü kullanılır (ters bölü kaçış karakteri sayılır).
  const sdkPath = SDK.replace(/\\/g, '/').replace(':', '\\:');
  writeFileSync(LOCAL_PROPS, `sdk.dir=${sdkPath}\n`, 'utf8');
  console.log(`SDK yolu yazıldı: ${LOCAL_PROPS}`);
}

/* ── 1. imzalama anahtarı ── */

if (!existsSync(KEYSTORE)) {
  console.log('İmzalama anahtarı üretiliyor (bir kereye mahsus)…');
  const password = randomBytes(24).toString('base64url');

  const keytool = process.env.JAVA_HOME
    ? join(process.env.JAVA_HOME, 'bin', 'keytool')
    : 'keytool';

  run(keytool, [
    '-genkeypair', '-v',
    '-keystore', KEYSTORE,
    '-alias', 'inkwell',
    '-keyalg', 'RSA', '-keysize', '2048',
    '-validity', '10950', // 30 yıl
    '-storepass', password,
    '-keypass', password,
    '-dname', 'CN=Inkwell, OU=Personal, O=Inkwell, C=TR',
  ]);

  writeFileSync(
    PROPS,
    [
      '# Bu dosya ve inkwell.keystore depoya girmez.',
      '# İkisini de yedekle: kaybolursa güncelleme kurulamaz.',
      'storeFile=inkwell.keystore',
      `storePassword=${password}`,
      'keyAlias=inkwell',
      `keyPassword=${password}`,
      '',
    ].join('\n'),
    'utf8'
  );
  console.log(`Anahtar yazıldı: ${KEYSTORE}`);
  console.log('Bu dosyayı ve keystore.properties dosyasını yedeklemeyi unutma.');
}

/* ── 2. sürüm numarasını ilerlet ── */

const gradlePath = join(ANDROID, 'app', 'build.gradle');
let gradle = readFileSync(gradlePath, 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

const codeMatch = /versionCode (\d+)/.exec(gradle);
const nextCode = Number(codeMatch[1]) + 1;
gradle = gradle
  .replace(/versionCode \d+/, `versionCode ${nextCode}`)
  .replace(/versionName "[^"]*"/, `versionName "${pkg.version}"`);
writeFileSync(gradlePath, gradle, 'utf8');
console.log(`Sürüm: ${pkg.version} (kod ${nextCode})`);

/* ── 3. derle ── */

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(join(process.cwd(), ANDROID, gradlew), ['assembleRelease', '--console=plain'], {
  cwd: ANDROID,
});

/* ── 4. çıktıyı topla ── */

const built = join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(built)) {
  console.error('APK bulunamadı:', built);
  process.exit(1);
}

mkdirSync('dist', { recursive: true });
const out = join('dist', `Inkwell-${pkg.version}.apk`);
copyFileSync(built, out);

const size = (readFileSync(out).length / 1024 / 1024).toFixed(1);
console.log(`\nHazır: ${out} (${size} MB)`);
