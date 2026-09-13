"""SVG ikonundan PWA için PNG türevleri üretir."""
from PIL import Image, ImageDraw, ImageFont
import os

PAPER = (250, 247, 242, 255)
SEAL  = (192, 57, 43, 255)

FONTS = [
    r"C:\Windows\Fonts\simsun.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
]

def font_at(size):
    for path in FONTS:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    raise SystemExit("Çince font bulunamadı")

def rounded(size, radius, fill):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle([0, 0, size - 1, size - 1], radius, fill=fill)
    return img

def glyph(img, size, box, color):
    d = ImageDraw.Draw(img)
    f = font_at(box)
    l, t, r, b = d.textbbox((0, 0), "墨", font=f)
    d.text(((size - (r - l)) / 2 - l, (size - (b - t)) / 2 - t), "墨", font=f, fill=color)

def standard(size, out):
    img = rounded(size, int(size * 0.22), PAPER)
    pad = int(size * 0.1875)
    plate = rounded(size - pad * 2, int(size * 0.10), SEAL)
    img.paste(plate, (pad, pad), plate)
    glyph(img, size, int(size * 0.41), PAPER)
    img.save(out)

def maskable(size, out):
    # Maskeli ikonlarda kenarların kırpılacağını varsay: zemin taşsın,
    # karakter merkezdeki güvenli alanda kalsın.
    img = Image.new("RGBA", (size, size), SEAL)
    glyph(img, size, int(size * 0.38), PAPER)
    img.save(out)

standard(192, "icons/icon-192.png")
standard(512, "icons/icon-512.png")
standard(180, "icons/icon-180.png")
maskable(512, "icons/icon-maskable.png")
print("ikonlar üretildi")
