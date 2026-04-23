from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from box_management.builders.sticker_payloads import serialize_client_admin_sticker
from box_management.models import Sticker
from box_management.services.boxes.client_access import _get_active_client_user_or_response
from box_management.services.stickers.assignments import (
    assign_sticker_to_box,
    get_sticker_install_payload,
    unassign_sticker_from_box,
)
from box_management.services.stickers.export import (
    build_stickers_pdf_response,
    build_stickers_zip_response,
    mark_stickers_downloaded,
    mark_stickers_generated,
)
from box_management.services.stickers.selection import resolve_client_sticker_selection
from la_boite_a_son.api_errors import api_error


class ClientAdminStickerListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        search = (request.query_params.get("search") or "").strip()
        status_filter = (request.query_params.get("status") or "all").strip()

        stickers_qs = Sticker.objects.select_related("client", "box").filter(client_id=user.client_id)
        if search:
            stickers_qs = stickers_qs.filter(
                Q(slug__icontains=search) | Q(box__name__icontains=search) | Q(box__url__icontains=search)
            )

        if status_filter and status_filter != "all":
            if status_filter == "never_generated":
                stickers_qs = stickers_qs.filter(qr_generated_at__isnull=True)
            elif status_filter == "never_downloaded":
                stickers_qs = stickers_qs.filter(downloaded_at__isnull=True)
            elif status_filter == "assigned":
                stickers_qs = stickers_qs.filter(box__isnull=False)
            elif status_filter == "unassigned":
                stickers_qs = stickers_qs.filter(box__isnull=True)
            elif status_filter == "inactive":
                stickers_qs = stickers_qs.filter(is_active=False)
            else:
                stickers_qs = stickers_qs.filter(status=status_filter)

        stickers = list(stickers_qs.order_by("-created_at", "-id"))
        payload = [serialize_client_admin_sticker(sticker) for sticker in stickers]

        counts_base = Sticker.objects.filter(client_id=user.client_id)
        counts = {
            "all": counts_base.count(),
            "never_generated": counts_base.filter(qr_generated_at__isnull=True).count(),
            "never_downloaded": counts_base.filter(downloaded_at__isnull=True).count(),
            "assigned": counts_base.filter(box__isnull=False).count(),
            "unassigned": counts_base.filter(box__isnull=True).count(),
            "inactive": counts_base.filter(is_active=False).count(),
        }

        return Response({"results": payload, "counts": counts}, status=status.HTTP_200_OK)


class ClientAdminStickerGenerateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        stickers, error = resolve_client_sticker_selection(client_id=user.client_id, payload=request.data)
        if error:
            return api_error(error["status"], error["code"], error["detail"])

        mark_stickers_generated(stickers)
        return Response(
            {
                "ok": True,
                "count": len(stickers),
                "stickers": [serialize_client_admin_sticker(sticker) for sticker in stickers],
            },
            status=status.HTTP_200_OK,
        )


class ClientAdminStickerDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        stickers, error = resolve_client_sticker_selection(client_id=user.client_id, payload=request.data)
        if error:
            return api_error(error["status"], error["code"], error["detail"])

        export_format = (request.data.get("format") or "images").strip().lower()
        mark_stickers_generated(stickers)

        try:
            if export_format == "pdf":
                return build_stickers_pdf_response(request, stickers)
            return build_stickers_zip_response(request, stickers)
        except RuntimeError as exc:
            error_code = str(exc)
            details_by_code = {
                "qrcode_missing": "L’export de stickers nécessite la dépendance Python qrcode côté serveur.",
                "cairosvg_missing": "L’export de stickers nécessite la dépendance Python cairosvg côté serveur pour générer les PNG et PDF.",
                "cairosvg_system_missing": "L’export de stickers nécessite les bibliothèques système Cairo sur le serveur pour générer les PNG et PDF.",
                "reportlab_missing": "L’export PDF de stickers nécessite la dépendance Python reportlab côté serveur.",
            }
            detail = details_by_code.get(error_code)
            if not detail:
                raise
            return api_error(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                str(error_code or "STICKER_EXPORT_DEPENDENCY_MISSING").upper(),
                detail,
            )
        except FileNotFoundError:
            return api_error(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "STICKER_TEMPLATE_NOT_FOUND",
                "Le template SVG sticker est introuvable sur le serveur.",
            )
        except ValueError as exc:
            error_text = str(exc or "")
            if "zone QR du template SVG doit définir" in error_text:
                return api_error(
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "STICKER_TEMPLATE_QR_ZONE_INVALID",
                    "La zone QR du template sticker est invalide.",
                )
            if "template SVG doit contenir" in error_text:
                return api_error(
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "STICKER_TEMPLATE_QR_ZONE_MISSING",
                    "Le template sticker doit contenir une zone QR.",
                )
            return api_error(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "STICKER_TEMPLATE_INVALID",
                "Le template SVG sticker est invalide.",
            )


class ClientAdminStickerConfirmDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        stickers, error = resolve_client_sticker_selection(client_id=user.client_id, payload=request.data)
        if error:
            return api_error(error["status"], error["code"], error["detail"])

        mark_stickers_downloaded(stickers)
        return Response(
            {
                "ok": True,
                "count": len(stickers),
                "stickers": [serialize_client_admin_sticker(sticker) for sticker in stickers],
            },
            status=status.HTTP_200_OK,
        )


class ClientAdminStickerInstallView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        payload, error = get_sticker_install_payload(
            client_id=user.client_id,
            sticker_slug=(request.query_params.get("sticker") or "").strip(),
            search=(request.query_params.get("search") or "").strip(),
        )
        if error:
            return api_error(error["status"], error["code"], error["detail"])
        return Response(payload, status=status.HTTP_200_OK)


class ClientAdminStickerAssignView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, sticker_id):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        try:
            box_id = int(request.data.get("box_id"))
        except (TypeError, ValueError):
            return api_error(
                status.HTTP_400_BAD_REQUEST,
                "BOX_ID_INVALID",
                "Box invalide.",
            )

        result, error = assign_sticker_to_box(client_id=user.client_id, sticker_id=sticker_id, box_id=box_id)
        if error:
            extra = {"sticker": error["sticker"]} if "sticker" in error else {}
            return api_error(error["status"], error["code"], error["detail"], **extra)
        return Response({"ok": True, "sticker": result["sticker"]}, status=status.HTTP_200_OK)


class ClientAdminStickerUnassignView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, sticker_id):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        result, error = unassign_sticker_from_box(client_id=user.client_id, sticker_id=sticker_id)
        if error:
            return api_error(error["status"], error["code"], error["detail"])
        return Response({"ok": True, "sticker": result["sticker"]}, status=status.HTTP_200_OK)
