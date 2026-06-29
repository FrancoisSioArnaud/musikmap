import subprocess
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.http import HttpResponse
from django.test import override_settings
from django.urls import reverse

from box_management.models import ColorProfile, StickerTemplate
from box_management.services.stickers.export import (
    assert_pdf_has_visible_content,
    build_pdf_wrapper_svg,
    build_stickers_pdf_bytes,
    resolve_cmyk_icc_profile_path,
)

from .base import ClientAdminTestCase


class ClientAdminStickersTests(ClientAdminTestCase):
    def setUp(self):
        super().setUp()
        self.client_a = self.make_client(name="Sticker A", slug="sticker-a")
        self.client_b = self.make_client(name="Sticker B", slug="sticker-b")
        self.owner_a = self.make_client_user(username="owner-sticker-a", client=self.client_a)
        self.owner_b = self.make_client_user(username="owner-sticker-b", client=self.client_b)
        self.box_a = self.make_box(client=self.client_a, name="Box A", url="box-a")

    def test_sticker_generate_requires_selection(self):
        self.auth(self.owner_a)

        response = self.client.post(reverse("client-admin-stickers-generate"), {}, format="json")
        self.assert_api_error(response, status_code=400, code="STICKER_SELECTION_REQUIRED")

    def test_sticker_install_rejects_invalid_slug(self):
        self.auth(self.owner_a)

        response = self.client.get(reverse("client-admin-stickers-install"), {"sticker": "abc"})
        self.assert_api_error(response, status_code=400, code="INVALID_STICKER_SLUG")

    def test_sticker_install_is_scoped_to_client(self):
        sticker = self.make_sticker(client=self.client_b, slug="11111111111")
        self.auth(self.owner_a)

        response = self.client.get(reverse("client-admin-stickers-install"), {"sticker": sticker.slug})
        self.assert_api_error(response, status_code=404, code="STICKER_NOT_FOUND")

    def test_sticker_assign_rejects_box_from_other_client(self):
        sticker = self.make_sticker(client=self.client_a, slug="22222222222")
        foreign_box = self.make_box(client=self.client_b, name="Foreign box", url="foreign-box")
        self.auth(self.owner_a)

        response = self.client.post(
            reverse("client-admin-stickers-assign", args=[sticker.id]),
            {"box_id": foreign_box.id},
            format="json",
        )
        self.assert_api_error(response, status_code=404, code="BOX_NOT_FOUND")

    def test_sticker_assign_returns_conflict_when_already_assigned(self):
        sticker = self.make_sticker(client=self.client_a, slug="33333333333", box=self.box_a)
        self.auth(self.owner_a)

        response = self.client.post(
            reverse("client-admin-stickers-assign", args=[sticker.id]),
            {"box_id": self.box_a.id},
            format="json",
        )
        self.assert_api_error(response, status_code=409, code="STICKER_ALREADY_ASSIGNED")
        self.assertIn("sticker", response.data)


class StickerTemplateTests(ClientAdminTestCase):
    def test_valid_template_can_be_created(self):
        client = self.make_client(name="Template client", slug="template-client")
        template = self.make_sticker_template(clients=client)
        self.assertEqual(template.clients.count(), 1)

    def test_template_without_viewbox_is_rejected(self):
        with self.assertRaises(ValidationError):
            self.make_sticker_template(svg_content='<svg xmlns="http://www.w3.org/2000/svg"><rect id="qr-zone" x="0" y="0" width="10" height="10" /></svg>')

    def test_template_without_qr_zone_is_rejected(self):
        with self.assertRaises(ValidationError):
            self.make_sticker_template(svg_content='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>')

    def test_template_qr_zone_without_width_is_rejected(self):
        with self.assertRaises(ValidationError):
            self.make_sticker_template(svg_content='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="qr-zone" x="0" y="0" height="10" /></svg>')

    def test_template_non_svg_extension_is_rejected(self):
        template = StickerTemplate(name="Bad", slug="bad")
        template.svg_file.save("bad.txt", ContentFile(b"not svg"), save=False)
        with self.assertRaises(ValidationError):
            template.save()


class ColorProfileTests(ClientAdminTestCase):
    def test_color_profile_accepts_icc(self):
        profile = self.make_color_profile(filename="print.icc")
        self.assertEqual(profile.color_space, "CMYK")

    def test_color_profile_accepts_icm(self):
        profile = self.make_color_profile(name="ICM", slug="icm", filename="print.icm")
        self.assertTrue(profile.icc_file.name.endswith(".icm"))

    def test_color_profile_rejects_other_extension(self):
        with self.assertRaises(ValidationError):
            self.make_color_profile(filename="print.txt")

    def test_color_profile_rejects_unsupported_color_space(self):
        with self.assertRaises(ValidationError):
            self.make_color_profile(color_space="RGB")

    def test_only_one_active_cmyk_profile_can_be_default(self):
        first = self.make_color_profile(name="First", slug="first", is_default=True)
        second = self.make_color_profile(name="Second", slug="second", is_default=True)
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertFalse(first.is_default)
        self.assertTrue(second.is_default)

    @override_settings(STICKER_GENERIC_CMYK_ICC_PROFILE_PATH="")
    def test_cmyk_profile_resolution_uses_admin_default(self):
        profile = self.make_color_profile(is_default=True)
        self.assertEqual(resolve_cmyk_icc_profile_path(), Path(profile.icc_file.path))

    @override_settings(STICKER_GENERIC_CMYK_ICC_PROFILE_PATH="")
    def test_cmyk_profile_resolution_fails_without_profile(self):
        with self.assertRaisesRegex(RuntimeError, "sticker_cmyk_profile_missing"):
            resolve_cmyk_icc_profile_path()

    def test_cmyk_profile_resolution_uses_settings_path(self):
        with tempfile.NamedTemporaryFile(suffix=".icc") as profile_file:
            profile_file.write(b"icc")
            profile_file.flush()
            with override_settings(STICKER_GENERIC_CMYK_ICC_PROFILE_PATH=profile_file.name):
                self.assertEqual(resolve_cmyk_icc_profile_path(), Path(profile_file.name))

    @override_settings(STICKER_GENERIC_CMYK_ICC_PROFILE_PATH="/missing/profile.icc")
    def test_cmyk_profile_resolution_fails_when_settings_path_unreadable(self):
        with self.assertRaisesRegex(RuntimeError, "sticker_cmyk_profile_unreadable"):
            resolve_cmyk_icc_profile_path()


class ClientAdminStickerTemplateApiTests(ClientAdminTestCase):
    def setUp(self):
        self.client_a = self.make_client(name="Template API A", slug="template-api-a")
        self.client_b = self.make_client(name="Template API B", slug="template-api-b")
        self.owner_a = self.make_client_user(username="template-owner-a", client=self.client_a)

    def test_client_sees_only_active_templates_for_own_client(self):
        own = self.make_sticker_template(clients=self.client_a, name="Own", slug="own")
        self.make_sticker_template(clients=self.client_b, name="Other", slug="other")
        self.make_sticker_template(clients=self.client_a, name="Inactive", slug="inactive", is_active=False)
        self.auth(self.owner_a)
        response = self.client.get(reverse("client-admin-sticker-templates"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [{"id": own.id, "name": "Own", "slug": "own"}])

    def test_client_without_template_receives_empty_results(self):
        self.auth(self.owner_a)
        response = self.client.get(reverse("client-admin-sticker-templates"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])


class StickerPdfExportUnitTests(ClientAdminTestCase):
    def setUp(self):
        super().setUp()
        self.client_a = self.make_client(name="PDF export client", slug="pdf-export-client")
        self.owner = self.make_client_user(username="pdf-export-owner", client=self.client_a)
        self.sticker = self.make_sticker(client=self.client_a, slug="55555555555")

    def sticker_svg_bytes(self):
        return (
            b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 200">'
            b'<defs><style>.marker{fill:#000}</style></defs>'
            b'<rect id="qr-zone" x="10" y="20" width="30" height="30" />'
            b'<path id="visible-marker" class="marker" d="M0 0H100V20H0Z" />'
            b'<image id="generated-qr" href="data:image/png;base64,AAAA" x="10" y="20" width="30" height="30" />'
            b'</svg>'
        )

    def test_pdf_wrapper_is_inline_without_file_uri(self):
        wrapper = build_pdf_wrapper_svg(self.sticker_svg_bytes(), 200, 300).decode("utf-8")

        self.assertNotIn("file://", wrapper)
        self.assertNotIn('<image href="file:', wrapper)
        self.assertNotIn("as_uri", wrapper)
        self.assertIn('id="qr-zone"', wrapper)
        self.assertIn('id="generated-qr"', wrapper)
        self.assertIn('id="visible-marker"', wrapper)

    def test_pdf_wrapper_preserves_inline_svg_content(self):
        wrapper = build_pdf_wrapper_svg(self.sticker_svg_bytes(), 100, 100).decode("utf-8")

        self.assertIn('id="visible-marker"', wrapper)
        self.assertIn('viewBox="0 0 100 200"', wrapper)
        self.assertIn('preserveAspectRatio="xMidYMid meet"', wrapper)

    @patch("box_management.services.stickers.export.get_pypdf_writer")
    @patch("box_management.services.stickers.export.assert_pdf_has_visible_content")
    @patch("box_management.services.stickers.export.export_svg_to_pdf_with_inkscape")
    def test_build_stickers_pdf_bytes_writes_self_contained_wrapper(self, export_pdf, assert_content, get_pypdf):
        template = self.make_sticker_template(clients=self.client_a, svg_content=self.sticker_svg_bytes().decode("utf-8"))
        seen_wrappers = []

        class FakeReader:
            def __init__(self, _path):
                self.pages = [object()]

        class FakeWriter:
            def __init__(self):
                self.pages = []

            def add_page(self, page):
                self.pages.append(page)

            def write(self, output):
                output.write(b"pdf")

        def fake_export(input_svg, output_pdf):
            seen_wrappers.append(Path(input_svg).read_text(encoding="utf-8"))
            Path(output_pdf).write_bytes(b"%PDF-1.4\n%test")

        get_pypdf.return_value = (FakeReader, FakeWriter)
        export_pdf.side_effect = fake_export
        request = self.client.post("/").wsgi_request
        build_stickers_pdf_bytes(request, [self.sticker], template=template, paper_size="A4", orientation="portrait")

        self.assertEqual(len(seen_wrappers), 1)
        self.assertIn('id="visible-marker"', seen_wrappers[0])
        self.assertNotIn("file://", seen_wrappers[0])
        self.assertNotIn("sticker-0.svg", seen_wrappers[0])
        assert_content.assert_called_once()

    @patch("box_management.services.stickers.export.get_pypdf_writer")
    def test_assert_pdf_has_visible_content_rejects_blank_pdf(self, get_pypdf):
        class BlankPage(dict):
            def get(self, key):
                return super().get(key)

        class FakeReader:
            def __init__(self, _path):
                self.pages = [BlankPage({"/Contents": None, "/Resources": {}})]

        get_pypdf.return_value = (FakeReader, object)

        with self.assertRaisesRegex(RuntimeError, "inkscape_blank_pdf"):
            assert_pdf_has_visible_content("blank.pdf")

    @patch("box_management.services.stickers.export.get_pypdf_writer")
    def test_assert_pdf_has_visible_content_accepts_non_empty_pdf(self, get_pypdf):
        class FakeContents:
            def get_object(self):
                return self

            def get_data(self):
                return b"0 0 10 10 re f"

        class FakeResources(dict):
            def get_object(self):
                return self

        class NonEmptyPage(dict):
            def get(self, key):
                return super().get(key)

        class FakeReader:
            def __init__(self, _path):
                self.pages = [NonEmptyPage({"/Contents": FakeContents(), "/Resources": FakeResources({"/ProcSet": []})})]

        get_pypdf.return_value = (FakeReader, object)

        assert_pdf_has_visible_content("non-empty.pdf")


class ClientAdminStickerDownloadExportTests(ClientAdminTestCase):
    def setUp(self):
        self.client_a = self.make_client(name="Export A", slug="export-a")
        self.client_b = self.make_client(name="Export B", slug="export-b")
        self.owner_a = self.make_client_user(username="export-owner-a", client=self.client_a)
        self.sticker = self.make_sticker(client=self.client_a, slug="44444444444")
        self.template = self.make_sticker_template(clients=self.client_a, name="Export", slug="export")

    def post_download(self, payload):
        self.auth(self.owner_a)
        body = {"sticker_ids": [self.sticker.id], "file_type": "png", "paper_size": "A4"}
        body.update(payload)
        return self.client.post(reverse("client-admin-stickers-download"), body, format="json")

    def test_download_without_template_id_requires_template(self):
        response = self.post_download({})
        self.assert_api_error(response, 400, "STICKER_TEMPLATE_REQUIRED")

    def test_download_without_template_when_none_available_is_clear(self):
        self.template.clients.clear()
        response = self.post_download({})
        self.assert_api_error(response, 400, "STICKER_TEMPLATE_NONE_AVAILABLE")

    def test_download_with_other_client_template_is_not_found(self):
        other = self.make_sticker_template(clients=self.client_b, name="Other export", slug="other-export")
        response = self.post_download({"template_id": other.id})
        self.assert_api_error(response, 404, "STICKER_TEMPLATE_NOT_FOUND")

    def test_download_rejects_invalid_file_type(self):
        response = self.post_download({"template_id": self.template.id, "file_type": "gif"})
        self.assert_api_error(response, 400, "STICKER_EXPORT_FILE_TYPE_INVALID")

    def test_download_rejects_invalid_paper_size(self):
        response = self.post_download({"template_id": self.template.id, "paper_size": "A7"})
        self.assert_api_error(response, 400, "STICKER_EXPORT_PAPER_SIZE_INVALID")

    def test_pdf_without_orientation_is_rejected(self):
        response = self.post_download({"template_id": self.template.id, "file_type": "pdf", "orientation": ""})
        self.assert_api_error(response, 400, "STICKER_EXPORT_ORIENTATION_INVALID")

    @patch("box_management.api.views.stickers.build_stickers_zip_response")
    def test_png_with_orientation_returns_zip_and_marks_generated(self, build_zip):
        build_zip.return_value = HttpResponse(b"zip", content_type="application/zip")
        response = self.post_download({"template_id": self.template.id, "orientation": "landscape"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/zip")
        self.sticker.refresh_from_db()
        self.assertIsNotNone(self.sticker.qr_generated_at)

    @patch("box_management.api.views.stickers.build_stickers_zip_response")
    def test_jpeg_route_returns_zip(self, build_zip):
        build_zip.return_value = HttpResponse(b"zip", content_type="application/zip")
        response = self.post_download({"template_id": self.template.id, "file_type": "jpeg"})
        self.assertEqual(response.status_code, 200)
        build_zip.assert_called_once()

    @patch("box_management.api.views.stickers.build_stickers_pdf_response")
    def test_pdf_route_calls_pdf_export(self, build_pdf):
        build_pdf.return_value = HttpResponse(b"pdf", content_type="application/pdf")
        response = self.post_download({"template_id": self.template.id, "file_type": "pdf", "orientation": "portrait"})
        self.assertEqual(response.status_code, 200)
        build_pdf.assert_called_once()

    @patch("box_management.api.views.stickers.build_stickers_pdf_response")
    def test_pdf_without_color_mode_defaults_to_cmyk(self, build_pdf):
        build_pdf.return_value = HttpResponse(b"pdf", content_type="application/pdf")
        response = self.post_download({"template_id": self.template.id, "file_type": "pdf", "orientation": "portrait"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(build_pdf.call_args.kwargs["color_mode"], "cmyk")

    @patch("box_management.api.views.stickers.build_stickers_pdf_response")
    def test_pdf_rgb_passes_rgb_color_mode(self, build_pdf):
        build_pdf.return_value = HttpResponse(b"pdf", content_type="application/pdf")
        response = self.post_download({"template_id": self.template.id, "file_type": "pdf", "orientation": "portrait", "color_mode": "rgb"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(build_pdf.call_args.kwargs["color_mode"], "rgb")

    def test_pdf_rejects_invalid_color_mode(self):
        response = self.post_download({"template_id": self.template.id, "file_type": "pdf", "orientation": "portrait", "color_mode": "lab"})
        self.assert_api_error(response, 400, "STICKER_EXPORT_COLOR_MODE_INVALID")

    @patch("box_management.api.views.stickers.build_stickers_zip_response")
    def test_png_ignores_color_mode(self, build_zip):
        build_zip.return_value = HttpResponse(b"zip", content_type="application/zip")
        response = self.post_download({"template_id": self.template.id, "color_mode": "cmyk"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(build_zip.call_args.kwargs["file_type"], "png")

    @patch("box_management.api.views.stickers.build_stickers_zip_response")
    def test_jpeg_ignores_color_mode(self, build_zip):
        build_zip.return_value = HttpResponse(b"zip", content_type="application/zip")
        response = self.post_download({"template_id": self.template.id, "file_type": "jpeg", "color_mode": "cmyk"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(build_zip.call_args.kwargs["file_type"], "jpeg")


    @patch("box_management.api.views.stickers.build_stickers_pdf_response")
    def test_inkscape_failed_returns_error(self, build_pdf):
        build_pdf.side_effect = RuntimeError("inkscape_failed")
        response = self.post_download({"template_id": self.template.id, "file_type": "pdf", "orientation": "portrait", "color_mode": "rgb"})
        self.assert_api_error(response, 503, "INKSCAPE_FAILED")

    @patch("box_management.api.views.stickers.build_stickers_pdf_response")
    def test_inkscape_blank_pdf_returns_error(self, build_pdf):
        build_pdf.side_effect = RuntimeError("inkscape_blank_pdf")
        response = self.post_download({"template_id": self.template.id, "file_type": "pdf", "orientation": "portrait", "color_mode": "rgb"})
        self.assert_api_error(response, 503, "INKSCAPE_BLANK_PDF")

    @patch("box_management.services.stickers.export.resolve_cmyk_icc_profile_path")
    @patch("box_management.services.stickers.export.convert_pdf_to_cmyk_with_ghostscript")
    @patch("box_management.services.stickers.export.build_stickers_pdf_bytes", return_value=b"rgb-pdf")
    def test_pdf_cmyk_calls_ghostscript(self, build_pdf_bytes, convert_cmyk, resolve_profile):
        with tempfile.NamedTemporaryFile(suffix=".icc") as profile_file:
            profile_file.write(b"icc")
            profile_file.flush()
            resolve_profile.return_value = Path(profile_file.name)
            def write_cmyk(input_pdf, output_pdf, icc_profile_path):
                Path(output_pdf).write_bytes(b"cmyk-pdf")
            convert_cmyk.side_effect = write_cmyk
            response = self.post_download({"template_id": self.template.id, "file_type": "pdf", "orientation": "portrait", "color_mode": "cmyk"})
            self.assertEqual(response.status_code, 200)
            convert_cmyk.assert_called_once()

    @patch("box_management.services.stickers.export.convert_pdf_to_cmyk_with_ghostscript")
    @patch("box_management.services.stickers.export.build_stickers_pdf_bytes", return_value=b"rgb-pdf")
    def test_pdf_rgb_does_not_call_ghostscript(self, build_pdf_bytes, convert_cmyk):
        response = self.post_download({"template_id": self.template.id, "file_type": "pdf", "orientation": "portrait", "color_mode": "rgb"})
        self.assertEqual(response.status_code, 200)
        convert_cmyk.assert_not_called()

    @patch("box_management.services.stickers.export.build_stickers_pdf_bytes", return_value=b"rgb-pdf")
    @override_settings(STICKER_GENERIC_CMYK_ICC_PROFILE_PATH="")
    def test_cmyk_without_profile_returns_error(self, build_pdf_bytes):
        response = self.post_download({"template_id": self.template.id, "file_type": "pdf", "orientation": "portrait", "color_mode": "cmyk"})
        self.assert_api_error(response, 503, "STICKER_CMYK_PROFILE_MISSING")

    @patch("box_management.services.stickers.export.build_stickers_pdf_bytes", return_value=b"rgb-pdf")
    @override_settings(STICKER_GENERIC_CMYK_ICC_PROFILE_PATH="/missing/profile.icc")
    def test_cmyk_unreadable_profile_returns_error(self, build_pdf_bytes):
        response = self.post_download({"template_id": self.template.id, "file_type": "pdf", "orientation": "portrait", "color_mode": "cmyk"})
        self.assert_api_error(response, 503, "STICKER_CMYK_PROFILE_UNREADABLE")

    @patch("box_management.services.stickers.export.build_stickers_pdf_bytes", return_value=b"rgb-pdf")
    @patch("box_management.services.stickers.export.shutil.which", return_value=None)
    def test_ghostscript_missing_returns_error(self, which, build_pdf_bytes):
        self.make_color_profile(name="Default profile", slug="default-profile", is_default=True)
        response = self.post_download({"template_id": self.template.id, "file_type": "pdf", "orientation": "portrait", "color_mode": "cmyk"})
        self.assert_api_error(response, 503, "GHOSTSCRIPT_MISSING")

    @patch("box_management.services.stickers.export.build_stickers_pdf_bytes", return_value=b"rgb-pdf")
    @patch("box_management.services.stickers.export.subprocess.run")
    @patch("box_management.services.stickers.export.shutil.which", return_value="/usr/bin/gs")
    def test_ghostscript_failure_returns_error(self, which, run, build_pdf_bytes):
        self.make_color_profile(name="Default profile", slug="default-profile", is_default=True)
        run.side_effect = subprocess.CalledProcessError(1, ["gs"], stderr="boom")
        response = self.post_download({"template_id": self.template.id, "file_type": "pdf", "orientation": "portrait", "color_mode": "cmyk"})
        self.assert_api_error(response, 503, "GHOSTSCRIPT_FAILED")

