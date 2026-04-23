import base64
import io
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone

_QRCODE_MODULE = None
_CAIROSVG_MODULE = None
_REPORTLAB_HELPERS = None

STICKER_TEMPLATE_DIR = (
    Path(settings.BASE_DIR) / "box_management" / "static" / "box_management" / "stickers" / "templates"
)
SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
ET.register_namespace("", SVG_NS)
ET.register_namespace("xlink", XLINK_NS)


def get_qrcode_module():
    global _QRCODE_MODULE
    if _QRCODE_MODULE is not None:
        return _QRCODE_MODULE
    try:
        import qrcode as qrcode_module
    except ImportError as exc:
        raise RuntimeError("qrcode_missing") from exc
    _QRCODE_MODULE = qrcode_module
    return qrcode_module


def get_cairosvg_module():
    global _CAIROSVG_MODULE
    if _CAIROSVG_MODULE is not None:
        return _CAIROSVG_MODULE
    try:
        import cairosvg as cairosvg_module
    except ImportError as exc:
        raise RuntimeError("cairosvg_missing") from exc
    except OSError as exc:
        raise RuntimeError("cairosvg_system_missing") from exc
    _CAIROSVG_MODULE = cairosvg_module
    return cairosvg_module


def get_reportlab_helpers():
    global _REPORTLAB_HELPERS
    if _REPORTLAB_HELPERS is not None:
        return _REPORTLAB_HELPERS
    try:
        from reportlab.lib.pagesizes import A3 as reportlab_a3
        from reportlab.lib.utils import ImageReader as reportlab_image_reader
        from reportlab.pdfgen import canvas as reportlab_canvas
    except ImportError as exc:
        raise RuntimeError("reportlab_missing") from exc
    _REPORTLAB_HELPERS = (reportlab_a3, reportlab_image_reader, reportlab_canvas)
    return _REPORTLAB_HELPERS


def get_sticker_template_path_for_client(client):
    client_slug = (getattr(client, "slug", "") or "").strip()
    if client_slug:
        candidate = STICKER_TEMPLATE_DIR / f"{client_slug}.svg"
        if candidate.exists():
            return candidate
    return STICKER_TEMPLATE_DIR / "default.svg"


def find_svg_element_by_id(root, element_id):
    for element in root.iter():
        if str(element.attrib.get("id") or "").strip() == element_id:
            return element
    return None


def parse_svg_dimension(value, fallback=None):
    raw = str(value or "").strip()
    if not raw:
        return fallback
    raw = raw.replace("px", "").strip()
    try:
        return float(raw)
    except (TypeError, ValueError):
        return fallback


def get_svg_viewbox_size(root):
    view_box = str(root.attrib.get("viewBox") or "").strip()
    if view_box:
        parts = re.split(r"[\s,]+", view_box)
        if len(parts) == 4:
            try:
                return float(parts[2]), float(parts[3])
            except (TypeError, ValueError):
                pass
    width = parse_svg_dimension(root.attrib.get("width"), 1000.0)
    height = parse_svg_dimension(root.attrib.get("height"), 1000.0)
    return width or 1000.0, height or 1000.0


def load_sticker_template_with_zone(client):
    template_path = get_sticker_template_path_for_client(client)
    if not template_path.exists():
        raise FileNotFoundError("Template SVG sticker introuvable.")

    svg_text = template_path.read_text(encoding="utf-8")
    root = ET.fromstring(svg_text)
    qr_zone = find_svg_element_by_id(root, "qr-zone")
    if qr_zone is None:
        raise ValueError("Le template SVG doit contenir un élément avec id='qr-zone'.")

    x = parse_svg_dimension(qr_zone.attrib.get("x"), 0.0)
    y = parse_svg_dimension(qr_zone.attrib.get("y"), 0.0)
    width = parse_svg_dimension(qr_zone.attrib.get("width"), None)
    height = parse_svg_dimension(qr_zone.attrib.get("height"), None)
    if width is None or height is None:
        raise ValueError("La zone QR du template SVG doit définir x, y, width et height.")

    svg_width, svg_height = get_svg_viewbox_size(root)
    return root, {"x": x, "y": y, "width": width, "height": height}, (svg_width, svg_height)


def generate_qr_png_bytes(content, *, size=1400):
    qrcode_module = get_qrcode_module()
    qr = qrcode_module.QRCode(
        version=None,
        error_correction=qrcode_module.constants.ERROR_CORRECT_Q,
        box_size=12,
        border=4,
    )
    qr.add_data(content)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
    image = image.resize((size, size))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def build_sticker_svg_bytes(sticker, absolute_sticker_url):
    root, qr_zone, (svg_width, svg_height) = load_sticker_template_with_zone(sticker.client)
    qr_png_bytes = generate_qr_png_bytes(absolute_sticker_url)
    qr_png_base64 = base64.b64encode(qr_png_bytes).decode("ascii")

    image_el = ET.Element(f"{{{SVG_NS}}}image")
    image_el.set("id", "generated-qr")
    image_el.set("x", str(qr_zone["x"]))
    image_el.set("y", str(qr_zone["y"]))
    image_el.set("width", str(qr_zone["width"]))
    image_el.set("height", str(qr_zone["height"]))
    image_el.set("preserveAspectRatio", "none")
    image_el.set(f"{{{XLINK_NS}}}href", f"data:image/png;base64,{qr_png_base64}")
    image_el.set("href", f"data:image/png;base64,{qr_png_base64}")
    root.append(image_el)

    svg_bytes = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    return svg_bytes, svg_width, svg_height


def render_sticker_png_bytes(sticker, absolute_sticker_url, *, output_size=2200):
    cairosvg_module = get_cairosvg_module()
    svg_bytes, _svg_width, _svg_height = build_sticker_svg_bytes(sticker, absolute_sticker_url)
    return cairosvg_module.svg2png(bytestring=svg_bytes, output_width=output_size, output_height=output_size)


def sticker_asset_basename(sticker):
    return f"sticker-{sticker.slug}"


def mark_stickers_generated(stickers, now=None):
    now = now or timezone.now()
    updated = []
    for sticker in stickers:
        before = sticker.qr_generated_at
        sticker.mark_generated(at=now)
        if before != sticker.qr_generated_at or sticker.status != sticker.get_status_from_fields():
            updated.append(sticker)
        else:
            updated.append(sticker)
    for sticker in updated:
        sticker.save(update_fields=["qr_generated_at", "status", "updated_at", "assigned_at"])
    return updated


def mark_stickers_downloaded(stickers, now=None):
    now = now or timezone.now()
    for sticker in stickers:
        sticker.mark_downloaded(at=now)
        sticker.save(update_fields=["qr_generated_at", "downloaded_at", "status", "updated_at", "assigned_at"])
    return stickers


def build_stickers_zip_response(request, stickers):
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for sticker in stickers:
            absolute_url = request.build_absolute_uri(f"/s/{sticker.slug}")
            png_bytes = render_sticker_png_bytes(sticker, absolute_url)
            archive.writestr(f"{sticker_asset_basename(sticker)}.png", png_bytes)

    response = HttpResponse(zip_buffer.getvalue(), content_type="application/zip")
    response["Content-Disposition"] = 'attachment; filename="stickers-images.zip"'
    return response


def build_stickers_pdf_response(request, stickers):
    reportlab_a3, reportlab_image_reader, reportlab_canvas = get_reportlab_helpers()

    pdf_buffer = io.BytesIO()
    pdf = reportlab_canvas.Canvas(pdf_buffer, pagesize=reportlab_a3)
    page_width, page_height = reportlab_a3

    for sticker in stickers:
        absolute_url = request.build_absolute_uri(f"/s/{sticker.slug}")
        png_bytes = render_sticker_png_bytes(sticker, absolute_url, output_size=2600)
        image_reader = reportlab_image_reader(io.BytesIO(png_bytes))
        pdf.drawImage(image_reader, 0, 0, width=page_width, height=page_height, preserveAspectRatio=True, anchor="c")
        pdf.showPage()

    pdf.save()
    response = HttpResponse(pdf_buffer.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = 'attachment; filename="stickers-a3.pdf"'
    return response
