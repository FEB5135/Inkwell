"""Marka görselinden bütün ikon boyutlarını üretir.

Kaynak: brand/icon-source.jpg — 永 karakteri, son stroğu fırçanın altında
bitiyor. 永 (Çince yǒng, Japonca *ei*) "sonsuz" demek ve hat yazısında
永字八法 olarak bilinen klasik alıştırma karakteri: sekiz temel strok türünün
hepsini içerdiği için yüzyıllardır ilk yazılan karakter budur.

Üretilenler:
  icons/icon-{192,512}.png   uygulama ikonu (köşeler saydam)
  icons/icon-180.png         apple-touch-icon
  icons/icon-maskable.png    Android'in kırpacağı ikon (içerik güvenli alanda)
  android/.../mipmap-*       başlatıcı ikonları
  android/.../drawable-*     açılış görselleri

Not: kaynak bir raster görsel olduğu için SVG ikon üretilmiyor; eski vektör
logo (tools/make-logo.mjs) bunun yerini bıraktı.
"""
from PIL import Image, ImageDraw
import os

SRC = "brand/icon-source.jpg"
RES = "android/app/src/main/res"

# Çizimin kağıt tonu; maskeli ikonda zemin bununla doldurulur ki
# küçültülmüş çizimin kenarı zemine görünmez biçimde otursun.
PAPER = (247, 242, 230, 255)

# Çizimin kendi köşe yuvarlaklığı (kenarın yüzdesi olarak).
CORNER = 0.22

# Maskeli ikonda çizimin kapladığı oran. Android kenarları daire ya da
# köşeli kareyle kırpar; %88 bırakmak fırça sapının ucunun kesilmesini önler.
SAFE = 0.88

source = Image.open(SRC).convert("RGB")
if source.width != source.height:
    raise SystemExit("Kaynak kare olmalı")


def rounded(img, radius_ratio=CORNER):
    """Köşeleri saydamlaştırır."""
    out = img.convert("RGBA")
    r = int(out.width * radius_ratio)
    mask = Image.new("L", out.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, out.width - 1, out.height - 1], r, fill=255)
    out.putalpha(mask)
    return out


def circle(img):
    out = img.convert("RGBA")
    mask = Image.new("L", out.size, 0)
    ImageDraw.Draw(mask).ellipse([0, 0, out.width - 1, out.height - 1], fill=255)
    out.putalpha(mask)
    return out


def resized(img, size):
    return img.resize((size, size), Image.LANCZOS)


def inset(size, ratio=SAFE, background=PAPER):
    """Çizimi küçültüp verilen zeminin ortasına yerleştirir (taşmasız)."""
    canvas = Image.new("RGBA", (size, size), background)
    inner = int(size * ratio)
    art = resized(source.convert("RGBA"), inner)
    off = (size - inner) // 2
    canvas.paste(art, (off, off), art)
    return canvas


art = source.convert("RGBA")
written = []

# ── web / PWA ──
os.makedirs("icons", exist_ok=True)
for size in (192, 512, 180):
    rounded(resized(art, size)).save(f"icons/icon-{size}.png")
    written.append(f"icons/icon-{size}.png")

inset(512).convert("RGB").save("icons/icon-maskable.png")
written.append("icons/icon-maskable.png")

# ── Android başlatıcı ──
DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

for name, px in DENSITIES.items():
    folder = f"{RES}/mipmap-{name}"
    os.makedirs(folder, exist_ok=True)
    rounded(resized(art, px)).save(f"{folder}/ic_launcher.png")
    circle(resized(art, px)).save(f"{folder}/ic_launcher_round.png")
    # Uyarlanabilir ikonun ön katmanı 108dp tuvale çizilir, ortadaki 72dp'si
    # her cihazda görünür; zemini ayrı katman verdiği için saydam bırakılıyor.
    fg = round(px * 108 / 48)
    inset(fg, ratio=0.62, background=(0, 0, 0, 0)).save(f"{folder}/ic_launcher_foreground.png")
    written.append(folder)

with open(f"{RES}/values/ic_launcher_background.xml", "w", encoding="utf-8") as f:
    f.write(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="ic_launcher_background">#{PAPER[0]:02X}{PAPER[1]:02X}{PAPER[2]:02X}</color>\n'
        "</resources>\n"
    )

# ── açılış görselleri ──
SPLASH = {"mdpi": (320, 480), "hdpi": (480, 800), "xhdpi": (720, 1280),
          "xxhdpi": (960, 1600), "xxxhdpi": (1280, 1920)}

def splash(w, h):
    canvas = Image.new("RGB", (w, h), PAPER[:3])
    logo = int(min(w, h) * 0.32)
    tile = rounded(resized(art, logo))
    canvas.paste(tile, ((w - logo) // 2, (h - logo) // 2), tile)
    return canvas

for name, (w, h) in SPLASH.items():
    for folder, size in ((f"{RES}/drawable-port-{name}", (w, h)),
                         (f"{RES}/drawable-land-{name}", (h, w))):
        os.makedirs(folder, exist_ok=True)
        splash(*size).save(f"{folder}/splash.png")

os.makedirs(f"{RES}/drawable", exist_ok=True)
splash(720, 1280).save(f"{RES}/drawable/splash.png")

print(f"{len(written)} hedef yazildi + acilis gorselleri")
