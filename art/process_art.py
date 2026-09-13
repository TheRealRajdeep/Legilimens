"""Turn the raw generated art in art/source/ into web-ready assets.

    python art/process_art.py

Outputs:
  web/public/mascot/{idle,thinking,confident,triumphant,stumped}.webp   4:5 tarot-card portraits, 800x1000
  web/public/mascot/thinking-alt-{1,2}.webp                              the other two thinking variants
  web/public/props/pot-{empty,low,mid,full}.webp                         transparent pot states
  web/public/props/orb.webp                                              transparent orb
  web/app/icon.png, web/app/apple-icon.png, web/app/favicon.ico          orb favicon set

The source images have painted-in "transparency" checkerboards and flat backdrops, so backgrounds are
removed by flood-filling from the image border across background-coloured pixels only.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "source"
MASCOT = ROOT / "web" / "public" / "mascot"
PROPS = ROOT / "web" / "public" / "props"
APP = ROOT / "web" / "app"

CARD = (800, 1000)  # 4:5
INK = np.array([21, 17, 31])


def rgb(name: str) -> Image.Image:
    return remove_corner_sparkle(Image.open(SRC / name).convert("RGB"))


def remove_corner_sparkle(img: Image.Image) -> Image.Image:
    """Paint out the generator's small light sparkle watermark in the bottom-right corner."""
    arr = np.asarray(img).astype(np.float32)
    h, w, _ = arr.shape
    size = int(min(w, h) * 0.09)
    region = (slice(h - size, h), slice(w - size, w))
    patch = arr[region]
    sat = patch.max(axis=2) - patch.min(axis=2)
    light = patch.mean(axis=2)
    local = ndimage.uniform_filter(light, size=31)
    mark = (sat < 60) & (light > local + 38)
    if mark.sum() < 30:
        return img
    mark = ndimage.binary_dilation(mark, iterations=6)
    keep = ~mark
    filled = patch.copy()
    for c in range(3):
        num = ndimage.gaussian_filter(patch[..., c] * keep, 14)
        den = ndimage.gaussian_filter(keep.astype(np.float32), 14)
        filled[..., c] = np.where(mark, num / np.maximum(den, 1e-3), patch[..., c])
    arr[region] = filled
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def save_webp(img: Image.Image, path: Path, quality: int = 84) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", quality=quality, method=6)
    print(f"  {path.relative_to(ROOT)}  {img.size}  {path.stat().st_size // 1024}KB")


def card(img: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    """Crop a scene to 4:5 around box (x0, y0, x1, y1) and scale to the card size."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    assert abs(w / h - 0.8) < 0.01, f"box {box} is not 4:5 ({w / h:.3f})"
    return img.crop(box).resize(CARD, Image.LANCZOS)


def border_background_mask(arr: np.ndarray, is_bg: np.ndarray) -> np.ndarray:
    """Background = pixels that look like background AND are connected to the image border."""
    labels, _ = ndimage.label(is_bg)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    edge = edge[edge != 0]
    return np.isin(labels, edge)


def keep_largest(img: Image.Image) -> Image.Image:
    """Drop stray fragments (neighbouring sprites) so only the main subject keeps alpha."""
    alpha = np.asarray(img.getchannel("A"))
    labels, n = ndimage.label(alpha > 40)
    if n <= 1:
        return img
    sizes = ndimage.sum(np.ones_like(alpha), labels, index=range(1, n + 1))
    main = ndimage.binary_dilation(labels == (int(np.argmax(sizes)) + 1), iterations=4)
    out = img.copy()
    out.putalpha(Image.fromarray(np.where(main, alpha, 0).astype(np.uint8)))
    return out


def checker_to_alpha(img: Image.Image, glow: bool = False) -> Image.Image:
    """Remove a painted light-grey/white checkerboard, keeping a soft edge.

    glow=True also removes checkerboard that has been tinted by a painted glow. The UI draws its own
    glow behind the pot, so losing the painted one is fine.
    """
    arr = np.asarray(img).astype(np.int16)
    sat = arr.max(axis=2) - arr.min(axis=2)
    light = arr.mean(axis=2)
    looks_checker = (sat < 22) & (light > 188)
    if glow:
        looks_checker |= (sat < 95) & (light > 172)
    bg = border_background_mask(arr, looks_checker)
    # grow slightly to eat the anti-aliased checker fringe, then feather
    bg = ndimage.binary_dilation(bg, iterations=2)
    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    out = img.convert("RGBA")
    out.putalpha(alpha)
    return out


def flat_to_alpha(img: Image.Image, tolerance: int = 34) -> Image.Image:
    """Remove a flat studio backdrop (sampled from the corners)."""
    arr = np.asarray(img).astype(np.int16)
    h, w, _ = arr.shape
    corners = np.array([arr[4, 4], arr[4, w - 5], arr[h - 5, 4], arr[h - 5, w - 5]])
    ref = corners.mean(axis=0)
    dist = np.abs(arr - ref).sum(axis=2)
    bg = border_background_mask(arr, dist < tolerance)
    bg = ndimage.binary_dilation(bg, iterations=2)
    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))
    out = img.convert("RGBA")
    out.putalpha(alpha)
    return out


def trim(img: Image.Image, pad: int = 24) -> Image.Image:
    bbox = img.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()
    x0, y0, x1, y1 = bbox
    return img.crop((max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad)))


def candlelit_backdrop(size: tuple[int, int]) -> Image.Image:
    """A booth-coloured card background for art that came on a plain studio backdrop."""
    w, h = size
    y, x = np.mgrid[0:h, 0:w]
    glow = np.exp(-(((x - w / 2) / (w * 0.55)) ** 2 + ((y - h * 0.18) / (h * 0.45)) ** 2))
    floor = np.exp(-(((x - w / 2) / (w * 0.7)) ** 2 + ((y - h * 1.05) / (h * 0.35)) ** 2))
    ember = np.array([226, 168, 59])
    velvet = np.array([46, 35, 64])
    base = INK[None, None, :] * 1.0
    col = base + glow[..., None] * (ember - INK) * 0.28 + floor[..., None] * (velvet - INK) * 0.9
    return Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), "RGB")


def place_on_card(figure: Image.Image) -> Image.Image:
    bg = candlelit_backdrop(CARD)
    fig = trim(figure)
    scale = min(CARD[0] * 0.86 / fig.width, CARD[1] * 0.9 / fig.height)
    fig = fig.resize((round(fig.width * scale), round(fig.height * scale)), Image.LANCZOS)
    # soft contact shadow so the figure stands on the floor
    shadow = Image.new("L", CARD, 0)
    sx, sy = CARD[0] // 2, CARD[1] - 40
    arr = np.zeros((CARD[1], CARD[0]), dtype=np.float32)
    yy, xx = np.mgrid[0 : CARD[1], 0 : CARD[0]]
    arr = np.exp(-(((xx - sx) / (fig.width * 0.42)) ** 2 + ((yy - sy) / 22) ** 2)) * 150
    shadow = Image.fromarray(arr.astype(np.uint8))
    bg.paste(Image.new("RGB", CARD, (8, 6, 12)), (0, 0), shadow)
    bg.paste(fig, ((CARD[0] - fig.width) // 2, CARD[1] - fig.height - 30), fig)
    return bg


def components(alpha: np.ndarray, min_area: int) -> list[tuple[int, int, int, int]]:
    mask = ndimage.binary_closing(alpha > 40, iterations=6)
    labels, _ = ndimage.label(mask)
    boxes = []
    for sl in ndimage.find_objects(labels):
        ys, xs = sl
        if (ys.stop - ys.start) * (xs.stop - xs.start) >= min_area:
            boxes.append((xs.start, ys.start, xs.stop, ys.stop))
    return boxes


def main() -> None:
    print("mascot cards")
    save_webp(card(rgb("seer-idle.png"), (6, 0, 1849, 2304)), MASCOT / "idle.webp")
    save_webp(card(rgb("seer-confident.png"), (80, 90, 1776, 2210)), MASCOT / "confident.webp")
    save_webp(card(rgb("seer-triumphant.png"), (805, 0, 2034, 1536)), MASCOT / "triumphant.webp")
    save_webp(card(rgb("seer-stumped.png"), (127, 90, 1743, 2110)), MASCOT / "stumped.webp")

    sheet = rgb("seer-thinking-sheet-3up.png")
    thirds = [(0, 0, 900, 1536), (960, 0, 1830, 1536), (1930, 0, 2816, 1536)]
    variants = [place_on_card(keep_largest(flat_to_alpha(sheet.crop(b)))) for b in thirds]
    save_webp(variants[2], MASCOT / "thinking.webp")
    save_webp(variants[0], MASCOT / "thinking-alt-1.webp")
    save_webp(variants[1], MASCOT / "thinking-alt-2.webp")

    print("props")
    orb = trim(checker_to_alpha(rgb("orb-favicon.png")))
    save_webp(orb, PROPS / "orb.webp", quality=88)

    pots = checker_to_alpha(rgb("vault-pot-4-states.png"), glow=True)
    boxes = components(np.asarray(pots.getchannel("A")), min_area=120_000)
    boxes.sort(key=lambda b: (b[1] // 300, b[0]))  # reading order: top to bottom, left to right
    names = ["empty", "low", "mid", "full"]
    assert len(boxes) == 4, f"expected 4 pot states, found {len(boxes)}: {boxes}"
    for name, box in zip(names, boxes):
        save_webp(trim(keep_largest(pots.crop(box)), pad=12), PROPS / f"pot-{name}.webp", quality=88)

    print("favicon")
    square = Image.new("RGBA", (max(orb.size),) * 2, (0, 0, 0, 0))
    square.paste(orb, ((square.width - orb.width) // 2, (square.height - orb.height) // 2), orb)
    square.resize((512, 512), Image.LANCZOS).save(APP / "icon.png")
    apple = Image.new("RGBA", (180, 180), (21, 17, 31, 255))
    small = square.resize((156, 156), Image.LANCZOS)
    apple.paste(small, (12, 12), small)
    apple.save(APP / "apple-icon.png")
    square.resize((64, 64), Image.LANCZOS).save(APP / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("  web/app/icon.png, apple-icon.png, favicon.ico")


if __name__ == "__main__":
    main()
