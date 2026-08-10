"""Generate the PNG extension icons from simple vector-like Pillow shapes."""

from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def rounded_line(draw, points, fill, width):
    draw.line(points, fill=fill, width=width, joint="curve")
    radius = width // 2
    for x, y in (points[0], points[-1]):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def make_icon(size):
    scale = 4
    canvas_size = size * scale
    image = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def box(values):
        return tuple(round(value * canvas_size / 512) for value in values)

    draw.rounded_rectangle(box((20, 20, 492, 492)), radius=round(142 * canvas_size / 512), fill="#316e4f")
    draw.rounded_rectangle(box((151, 117, 361, 395)), radius=round(40 * canvas_size / 512), fill="#f8fff4")
    draw.rectangle(box((151, 171, 361, 209)), fill="#ddefb7")

    ring_width = max(2, round(24 * canvas_size / 512))
    rounded_line(draw, (box((207, 108))[:2], box((207, 176))[:2]), "#f8fff4", ring_width)
    rounded_line(draw, (box((305, 108))[:2], box((305, 176))[:2]), "#f8fff4", ring_width)

    check_width = max(2, round(28 * canvas_size / 512))
    points = [box((205, 287))[:2], box((240, 322))[:2], box((312, 234))[:2]]
    draw.line(points, fill="#316e4f", width=check_width, joint="curve")
    radius = check_width // 2
    for x, y in (points[0], points[-1]):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill="#316e4f")

    return image.resize((size, size), Image.Resampling.LANCZOS)


if __name__ == "__main__":
    ASSETS.mkdir(exist_ok=True)
    for icon_size in (16, 32, 48, 128):
        make_icon(icon_size).save(ASSETS / f"icon-{icon_size}.png", optimize=True)
