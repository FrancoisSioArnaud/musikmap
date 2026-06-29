import base64
import io
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status

from box_management.models import ColorProfile, StickerTemplate

_QRCODE_MODULE = None
_CAIROSVG_MODULE = None
_PIL_IMAGE = None
_PYPDF = None

DPI = 300
PAPER_SIZES_MM = {
    "A0": (841, 1189),
    "A1": (594, 841),
    "A2": (420, 594),
    "A3": (297, 420),
    "A4": (210, 297),
    "A5": (148, 210),
    "A6": (105, 148),
}
FILE_TYPES = {"png", "jpeg", "pdf"}
ORIENTATIONS = {"portrait", "landscape"}
PDF_COLOR_MODES = {"cmyk", "rgb"}
SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
ET.register_namespace("", SVG_NS)
ET.register_namespace("xlink", XLINK_NS)


def mm_to_px(mm):
    return int(round(mm / 25.4 * DPI))


def mm_to_pt(mm):
    return mm / 25.4 * 72


def validate_export_options(payload):
    file_type = str(payload.get("file_type") or "").strip().lower()
    paper_size = str(payload.get("paper_size") or "").strip().upper()
    orientation = str(payload.get("orientation") or "").strip().lower()
    color_mode = str(payload.get("color_mode") or "").strip().lower()
    if file_type not in FILE_TYPES:
        return None, {"status": status.HTTP_400_BAD_REQUEST, "code": "STICKER_EXPORT_FILE_TYPE_INVALID", "detail": "Type de fichier invalide."}
    if paper_size not in PAPER_SIZES_MM:
        return None, {"status": status.HTTP_400_BAD_REQUEST, "code": "STICKER_EXPORT_PAPER_SIZE_INVALID", "detail": "Format papier invalide."}
    if file_type == "pdf" and orientation not in ORIENTATIONS:
        return None, {"status": status.HTTP_400_BAD_REQUEST, "code": "STICKER_EXPORT_ORIENTATION_INVALID", "detail": "Orientation invalide."}
    if file_type == "pdf":
        color_mode = color_mode or "cmyk"
        if color_mode not in PDF_COLOR_MODES:
            return None, {"status": status.HTTP_400_BAD_REQUEST, "code": "STICKER_EXPORT_COLOR_MODE_INVALID", "detail": "Espace couleur invalide."}
    else:
        color_mode = "rgb"
    return {"file_type": file_type, "paper_size": paper_size, "orientation": orientation or "portrait", "color_mode": color_mode}, None


def resolve_client_sticker_template(client_id, template_id):
    has_templates = StickerTemplate.objects.filter(clients__id=client_id, is_active=True).exists()
    if not template_id:
        if not has_templates:
            return None, {"status": status.HTTP_400_BAD_REQUEST, "code": "STICKER_TEMPLATE_NONE_AVAILABLE", "detail": "Aucun template de sticker n’est disponible pour ce client."}
        return None, {"status": status.HTTP_400_BAD_REQUEST, "code": "STICKER_TEMPLATE_REQUIRED", "detail": "Sélectionne un template de sticker."}
    try:
        template_id = int(template_id)
    except (TypeError, ValueError):
        template_id = None
    template = StickerTemplate.objects.filter(id=template_id, clients__id=client_id, is_active=True).first()
    if not template:
        return None, {"status": status.HTTP_404_NOT_FOUND, "code": "STICKER_TEMPLATE_NOT_FOUND", "detail": "Le template de sticker sélectionné est introuvable."}
    return template, None


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


def get_pil_image():
    global _PIL_IMAGE
    if _PIL_IMAGE is not None:
        return _PIL_IMAGE
    from PIL import Image
    _PIL_IMAGE = Image
    return Image


def get_pypdf_writer():
    global _PYPDF
    if _PYPDF is not None:
        return _PYPDF
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError as exc:
        raise RuntimeError("pypdf_missing") from exc
    _PYPDF = (PdfReader, PdfWriter)
    return _PYPDF


def find_svg_element_by_id(root, element_id):
    for element in root.iter():
        if str(element.attrib.get("id") or "").strip() == element_id:
            return element
    return None


def parse_svg_dimension(value, fallback=None):
    raw = str(value or "").strip().replace("px", "")
    if not raw:
        return fallback
    return float(raw)


def get_svg_viewbox_size(root):
    parts = re.split(r"[\s,]+", str(root.attrib.get("viewBox") or "").strip())
    if len(parts) != 4:
        raise ValueError("Le template SVG doit contenir un viewBox exploitable.")
    return float(parts[2]), float(parts[3])


def load_sticker_template_with_zone(template):
    with template.svg_file.open("r") as svg_file:
        svg_text = svg_file.read()
    root = ET.fromstring(svg_text)
    qr_zone = find_svg_element_by_id(root, "qr-zone")
    if qr_zone is None:
        raise ValueError("Le template SVG doit contenir un élément avec id='qr-zone'.")
    zone = {key: parse_svg_dimension(qr_zone.attrib.get(key), None) for key in ("x", "y", "width", "height")}
    if any(value is None for value in zone.values()) or zone["width"] <= 0 or zone["height"] <= 0:
        raise ValueError("La zone QR du template SVG doit définir x, y, width et height.")
    return root, zone, get_svg_viewbox_size(root)


def generate_qr_png_bytes(content, *, size=1400):
    qrcode_module = get_qrcode_module()
    qr = qrcode_module.QRCode(version=None, error_correction=qrcode_module.constants.ERROR_CORRECT_Q, box_size=12, border=4)
    qr.add_data(content)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white").convert("RGBA").resize((size, size))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def build_sticker_svg_bytes(sticker, template, absolute_sticker_url):
    root, qr_zone, (svg_width, svg_height) = load_sticker_template_with_zone(template)
    qr_png_base64 = base64.b64encode(generate_qr_png_bytes(absolute_sticker_url)).decode("ascii")
    image_el = ET.Element(f"{{{SVG_NS}}}image")
    for key in ("x", "y", "width", "height"):
        image_el.set(key, str(qr_zone[key]))
    image_el.set("id", "generated-qr")
    image_el.set("preserveAspectRatio", "none")
    image_el.set(f"{{{XLINK_NS}}}href", f"data:image/png;base64,{qr_png_base64}")
    image_el.set("href", f"data:image/png;base64,{qr_png_base64}")
    root.append(image_el)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True), svg_width, svg_height


def contained_pixel_size(svg_width, svg_height, paper_size):
    max_w, max_h = (mm_to_px(v) for v in PAPER_SIZES_MM[paper_size])
    ratio = min(max_w / svg_width, max_h / svg_height)
    return max(1, int(round(svg_width * ratio))), max(1, int(round(svg_height * ratio)))


def render_sticker_image_bytes(sticker, template, absolute_sticker_url, *, paper_size, file_type):
    cairosvg_module = get_cairosvg_module()
    svg_bytes, svg_width, svg_height = build_sticker_svg_bytes(sticker, template, absolute_sticker_url)
    out_w, out_h = contained_pixel_size(svg_width, svg_height, paper_size)
    png = cairosvg_module.svg2png(bytestring=svg_bytes, output_width=out_w, output_height=out_h)
    if file_type == "png":
        return png
    Image = get_pil_image()
    rgba = Image.open(io.BytesIO(png)).convert("RGBA")
    background = Image.new("RGB", rgba.size, "white")
    background.paste(rgba, mask=rgba.getchannel("A"))
    buffer = io.BytesIO()
    background.save(buffer, format="JPEG", quality=95)
    return buffer.getvalue()


def sticker_asset_basename(sticker):
    return f"sticker-{sticker.slug}"


def mark_stickers_generated(stickers, now=None):
    now = now or timezone.now()
    for sticker in stickers:
        sticker.mark_generated(at=now)
        sticker.save(update_fields=["qr_generated_at", "status", "updated_at", "assigned_at"])
    return stickers


def mark_stickers_downloaded(stickers, now=None):
    now = now or timezone.now()
    for sticker in stickers:
        sticker.mark_downloaded(at=now)
        sticker.save(update_fields=["qr_generated_at", "downloaded_at", "status", "updated_at", "assigned_at"])
    return stickers


def build_stickers_zip_response(request, stickers, *, template, paper_size, file_type):
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for sticker in stickers:
            image_bytes = render_sticker_image_bytes(sticker, template, request.build_absolute_uri(f"/s/{sticker.slug}"), paper_size=paper_size, file_type=file_type)
            archive.writestr(f"{sticker_asset_basename(sticker)}.{file_type}", image_bytes)
    response = HttpResponse(zip_buffer.getvalue(), content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="stickers-{paper_size.lower()}-{file_type}.zip"'
    return response


def build_pdf_wrapper_svg(sticker_svg_path, page_width_pt, page_height_pt):
    href = Path(sticker_svg_path).as_uri()
    return f'''<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="{SVG_NS}" width="{page_width_pt}pt" height="{page_height_pt}pt" viewBox="0 0 {page_width_pt} {page_height_pt}">\n  <image href="{href}" x="0" y="0" width="{page_width_pt}" height="{page_height_pt}" preserveAspectRatio="xMidYMid meet"/>\n</svg>'''


def export_svg_to_pdf_with_inkscape(input_svg, output_pdf):
    if not shutil.which("inkscape"):
        raise RuntimeError("inkscape_missing")
    subprocess.run(["inkscape", str(input_svg), "--export-type=pdf", f"--export-filename={output_pdf}", "--export-text-to-path"], check=True, capture_output=True)


def build_stickers_pdf_bytes(request, stickers, *, template, paper_size, orientation):
    PdfReader, PdfWriter = get_pypdf_writer()
    width_mm, height_mm = PAPER_SIZES_MM[paper_size]
    if orientation == "landscape":
        width_mm, height_mm = height_mm, width_mm
    page_width_pt, page_height_pt = mm_to_pt(width_mm), mm_to_pt(height_mm)
    writer = PdfWriter()
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        for index, sticker in enumerate(stickers):
            sticker_svg, _w, _h = build_sticker_svg_bytes(sticker, template, request.build_absolute_uri(f"/s/{sticker.slug}"))
            sticker_svg_path = tmp_path / f"sticker-{index}.svg"
            wrapper_svg_path = tmp_path / f"page-{index}.svg"
            page_pdf_path = tmp_path / f"page-{index}.pdf"
            sticker_svg_path.write_bytes(sticker_svg)
            wrapper_svg_path.write_text(build_pdf_wrapper_svg(sticker_svg_path, page_width_pt, page_height_pt), encoding="utf-8")
            export_svg_to_pdf_with_inkscape(wrapper_svg_path, page_pdf_path)
            for page in PdfReader(str(page_pdf_path)).pages:
                writer.add_page(page)
        output = io.BytesIO()
        writer.write(output)
    return output.getvalue()


def resolve_cmyk_icc_profile_path():
    profile = ColorProfile.objects.filter(
        color_space=ColorProfile.COLOR_SPACE_CMYK,
        is_active=True,
        is_default=True,
    ).order_by("name", "id").first()
    if profile and profile.icc_file:
        path = Path(profile.icc_file.path)
        if path.is_file() and path.stat().st_size > 0:
            return path
        raise RuntimeError("sticker_cmyk_profile_unreadable")

    configured_path = str(getattr(settings, "STICKER_GENERIC_CMYK_ICC_PROFILE_PATH", "") or "").strip()
    if not configured_path:
        raise RuntimeError("sticker_cmyk_profile_missing")
    path = Path(configured_path)
    if not path.is_file() or path.stat().st_size <= 0:
        raise RuntimeError("sticker_cmyk_profile_unreadable")
    return path


def convert_pdf_to_cmyk_with_ghostscript(input_pdf, output_pdf, icc_profile_path):
    if not shutil.which("gs"):
        raise RuntimeError("ghostscript_missing")
    command = [
        "gs",
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.7",
        "-sColorConversionStrategy=CMYK",
        "-dProcessColorModel=/DeviceCMYK",
        f"-sOutputICCProfile={icc_profile_path}",
        f"-sOutputFile={output_pdf}",
        str(input_pdf),
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError("ghostscript_failed") from exc


def build_stickers_pdf_response(request, stickers, *, template, paper_size, orientation, color_mode="cmyk"):
    rgb_pdf_bytes = build_stickers_pdf_bytes(request, stickers, template=template, paper_size=paper_size, orientation=orientation)
    pdf_bytes = rgb_pdf_bytes
    if color_mode == "cmyk":
        icc_profile_path = resolve_cmyk_icc_profile_path()
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            input_pdf = tmp_path / "stickers-rgb.pdf"
            output_pdf = tmp_path / "stickers-cmyk.pdf"
            input_pdf.write_bytes(rgb_pdf_bytes)
            convert_pdf_to_cmyk_with_ghostscript(input_pdf, output_pdf, icc_profile_path)
            pdf_bytes = output_pdf.read_bytes()
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="stickers-{paper_size.lower()}.pdf"'
    return response
