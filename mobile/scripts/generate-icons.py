#!/usr/bin/env python3
"""Generuje komplet ikon aplikacji FormaSync.

Znak to sztanga — czytelna od razu i zgodna z tematem aplikacji. Kolory pochodzą
z motywu aplikacji, żeby ikona i wnętrze wyglądały jak jedna całość.

Uruchomienie (z katalogu mobile):
    python scripts/generate-icons.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "assets" / "images"

# Tło ikony: nieco jaśniejsze niż czysta czerń, żeby znak nie zlewał się z ciemnym ekranem.
BACKGROUND = (18, 18, 20, 255)
# Czerwień akcentu z motywu aplikacji, rozjaśniona pod ciemne tło ikony.
ACCENT = (240, 86, 91, 255)
WHITE = (255, 255, 255, 255)

# Układ znaku w jednostkach względnych (szerokość znaku = 1.0).
# Rysujemy gryf na całej szerokości, a na nim talerze — od zewnętrznych, mniejszych.
BAR_HEIGHT = 0.16
INNER_PLATE = {"x": 0.12, "w": 0.115, "h": 0.60}
OUTER_PLATE = {"x": 0.00, "w": 0.085, "h": 0.40}


def draw_mark(image: Image.Image, mark_width: float, color: tuple[int, int, int, int]) -> None:
    """Rysuje sztangę wyśrodkowaną na obrazie."""
    draw = ImageDraw.Draw(image)
    cx, cy = image.width / 2, image.height / 2
    left = cx - mark_width / 2

    def box(x: float, w: float, h: float) -> tuple[float, float, float, float]:
        x0 = left + x * mark_width
        half = h * mark_width / 2
        return (x0, cy - half, x0 + w * mark_width, cy + half)

    def rounded(rect: tuple[float, float, float, float], softness: float = 0.38) -> None:
        radius = min(rect[2] - rect[0], rect[3] - rect[1]) * softness
        draw.rounded_rectangle(rect, radius=radius, fill=color)

    # Gryf przez całą szerokość.
    rounded(box(0.0, 1.0, BAR_HEIGHT), softness=0.5)

    for plate in (OUTER_PLATE, INNER_PLATE):
        rounded(box(plate["x"], plate["w"], plate["h"]))
        mirrored_x = 1.0 - plate["x"] - plate["w"]
        rounded(box(mirrored_x, plate["w"], plate["h"]))


def canvas(size: int, background: tuple[int, int, int, int] | None = None) -> Image.Image:
    return Image.new("RGBA", (size, size), background or (0, 0, 0, 0))


def save(image: Image.Image, name: str) -> None:
    path = OUT / name
    image.save(path, "PNG")
    print(f"{name}: {image.width}×{image.height}, {path.stat().st_size // 1024} kB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # Ikona główna — pełne tło, launcher sam przycina rogi.
    icon = canvas(1024, BACKGROUND)
    draw_mark(icon, 1024 * 0.62, ACCENT)
    save(icon, "icon.png")

    # Ikona adaptacyjna Androida: warstwa pierwszego planu bywa przycinana do koła,
    # więc znak musi zmieścić się w bezpiecznym obszarze (środkowe ~66% płótna).
    foreground = canvas(1024)
    draw_mark(foreground, 1024 * 0.55, ACCENT)
    save(foreground, "android-icon-foreground.png")

    save(canvas(1024, BACKGROUND), "android-icon-background.png")

    # Wariant monochromatyczny: system sam nadaje mu kolor motywu.
    monochrome = canvas(1024)
    draw_mark(monochrome, 1024 * 0.55, WHITE)
    save(monochrome, "android-icon-monochrome.png")

    # Ekran powitalny — sam znak na przezroczystym tle.
    splash = canvas(512)
    draw_mark(splash, 512 * 0.82, ACCENT)
    save(splash, "splash-icon.png")

    favicon = canvas(196, BACKGROUND)
    draw_mark(favicon, 196 * 0.62, ACCENT)
    save(favicon, "favicon.png")


if __name__ == "__main__":
    main()
