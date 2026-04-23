from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from box_management.builders.deposit_payloads import (
    _build_comments_context_for_deposits,
    _build_reactions_from_instance,
)
from box_management.domain.constants import (
    COMMENT_REASON_ALREADY_COMMENTED,
    COMMENT_REASON_EMAIL_FORBIDDEN,
    COMMENT_REASON_EMPTY,
    COMMENT_REASON_LINK_FORBIDDEN,
    COMMENT_REASON_PHONE_FORBIDDEN,
    COMMENT_REASON_RATE_LIMIT,
    COMMENT_REASON_REPORT_THRESHOLD,
    COMMENT_REASON_RESTRICTED,
    COMMENT_REASON_RISK_QUARANTINE,
    COMMENT_REASON_TARGET_USER_DAILY_COMMENT_LIMIT_REACHED,
    COMMENT_REASON_TOO_LONG,
)
from box_management.models import Comment
from box_management.services.boxes.client_access import _coerce_bool, _get_active_client_user_or_response
from box_management.services.comments.admin_comments import (
    create_comment_restriction,
    list_client_admin_comments,
    list_comment_restrictions,
)
from box_management.services.comments.create_comment import create_comment
from box_management.services.comments.delete_comment import delete_comment_by_author
from box_management.services.comments.moderate_comment import moderate_comment
from box_management.services.comments.moderation_rules import _get_profile_picture_url
from box_management.services.comments.report_comment import report_comment
from box_management.services.reactions.add_reaction import add_or_remove_reaction
from la_boite_a_son.api_errors import api_error
from users.utils import get_current_app_user, touch_last_seen


def _get_request_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _get_comment_error_message(reason_code):
    messages = {
        COMMENT_REASON_RATE_LIMIT: "Tu commentes trop vite. Réessaie dans un instant.",
        COMMENT_REASON_ALREADY_COMMENTED: "Tu as déjà commenté ce dépôt.",
        COMMENT_REASON_TARGET_USER_DAILY_COMMENT_LIMIT_REACHED: "Cet utilisateur a déjà reçu beaucoup de commentaires aujourd’hui.",
        COMMENT_REASON_LINK_FORBIDDEN: "Les liens ne sont pas autorisés dans les commentaires.",
        COMMENT_REASON_EMAIL_FORBIDDEN: "Les adresses email ne sont pas autorisées dans les commentaires.",
        COMMENT_REASON_PHONE_FORBIDDEN: "Les numéros de téléphone ne sont pas autorisés dans les commentaires.",
        COMMENT_REASON_EMPTY: "Ton commentaire est vide.",
        COMMENT_REASON_TOO_LONG: "Ton commentaire est trop long.",
        COMMENT_REASON_RESTRICTED: "Tu ne peux plus commenter pour le moment.",
        COMMENT_REASON_REPORT_THRESHOLD: "Ce commentaire est en cours de vérification.",
        COMMENT_REASON_RISK_QUARANTINE: "Votre commentaire est en cours de vérification.",
    }
    return messages.get(reason_code, "Impossible d’ajouter le commentaire.")


def _comment_reason_to_error_code(reason_code):
    mapping = {
        COMMENT_REASON_RATE_LIMIT: "COMMENT_RATE_LIMIT",
        COMMENT_REASON_ALREADY_COMMENTED: "COMMENT_ALREADY_COMMENTED",
        COMMENT_REASON_TARGET_USER_DAILY_COMMENT_LIMIT_REACHED: "COMMENT_TARGET_LIMIT_REACHED",
        COMMENT_REASON_LINK_FORBIDDEN: "COMMENT_LINK_FORBIDDEN",
        COMMENT_REASON_EMAIL_FORBIDDEN: "COMMENT_EMAIL_FORBIDDEN",
        COMMENT_REASON_PHONE_FORBIDDEN: "COMMENT_PHONE_FORBIDDEN",
        COMMENT_REASON_EMPTY: "COMMENT_EMPTY",
        COMMENT_REASON_TOO_LONG: "COMMENT_TOO_LONG",
        COMMENT_REASON_RESTRICTED: "COMMENT_RESTRICTED",
        COMMENT_REASON_REPORT_THRESHOLD: "COMMENT_REPORT_THRESHOLD",
        COMMENT_REASON_RISK_QUARANTINE: "COMMENT_RISK_QUARANTINED",
    }
    return mapping.get(reason_code, "COMMENT_CREATION_FAILED")


def _comment_error(status_code, reason_code, detail=None, **extra):
    return api_error(
        status_code,
        _comment_reason_to_error_code(reason_code),
        detail or _get_comment_error_message(reason_code),
        reason_code=reason_code,
        **extra,
    )


def _serialize_client_admin_comment(comment):
    reports = list(getattr(comment, "prefetched_reports", []) or [])
    decisions = list(getattr(comment, "prefetched_decisions", []) or [])
    latest_decision = decisions[0] if decisions else None

    user = getattr(comment, "user", None)
    profile_picture_url = _get_profile_picture_url(user) if user else (comment.author_avatar_url or None)

    return {
        "id": comment.id,
        "text": comment.text,
        "status": comment.status,
        "reason_code": comment.reason_code or "",
        "risk_score": int(comment.risk_score or 0),
        "risk_flags": list(comment.risk_flags or []),
        "reports_count": int(comment.reports_count or 0),
        "created_at": comment.created_at.isoformat(),
        "updated_at": comment.updated_at.isoformat() if getattr(comment, "updated_at", None) else None,
        "deposit_deleted": bool(comment.deposit_deleted or not comment.deposit_id),
        "deposit": {
            "public_key": comment.deposit_public_key
            or (comment.deposit.public_key if getattr(comment, "deposit", None) else ""),
            "box_name": comment.deposit_box_name
            or (
                comment.deposit.box.name
                if getattr(comment, "deposit", None) and getattr(comment.deposit, "box", None)
                else ""
            ),
            "box_url": comment.deposit_box_url
            or (
                comment.deposit.box.url
                if getattr(comment, "deposit", None) and getattr(comment.deposit, "box", None)
                else ""
            ),
        },
        "author": {
            "id": comment.user_id,
            "username": getattr(user, "username", None) or comment.author_username or None,
            "display_name": getattr(user, "username", None)
            or comment.author_display_name
            or comment.author_username
            or "anonyme",
            "email": getattr(user, "email", None) or comment.author_email or None,
            "profile_picture_url": profile_picture_url,
        },
        "report_reason_codes": [r.reason_code for r in reports],
        "latest_decision": (
            {
                "decision_code": latest_decision.decision_code,
                "reason_code": latest_decision.reason_code,
                "internal_note": latest_decision.internal_note,
                "created_at": latest_decision.created_at.isoformat(),
                "acted_by": getattr(latest_decision.acted_by, "username", None),
            }
            if latest_decision
            else None
        ),
    }


def _serialize_comment_restriction(restriction):
    return {
        "id": restriction.id,
        "user_id": restriction.user_id,
        "username": getattr(restriction.user, "username", None),
        "email": getattr(restriction.user, "email", None),
        "restriction_type": restriction.restriction_type,
        "reason_code": restriction.reason_code or "",
        "internal_note": restriction.internal_note or "",
        "starts_at": restriction.starts_at.isoformat() if restriction.starts_at else None,
        "ends_at": restriction.ends_at.isoformat() if restriction.ends_at else None,
        "created_at": restriction.created_at.isoformat() if restriction.created_at else None,
        "created_by": getattr(restriction.created_by, "username", None),
    }


class ReactionView(APIView):
    permission_classes = []

    def post(self, request):
        current_user = get_current_app_user(request)
        if not current_user:
            return api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Identité requise.")
        touch_last_seen(current_user)

        dep_public_key = request.data.get("dep_public_key")
        if not dep_public_key:
            return api_error(status.HTTP_400_BAD_REQUEST, "DEPOSIT_PUBLIC_KEY_REQUIRED", "dep_public_key manquant")
        result, error = add_or_remove_reaction(
            user=current_user,
            dep_public_key=dep_public_key,
            emoji_id=request.data.get("emoji_id"),
        )
        if error:
            return api_error(error["status"], error["code"], error["detail"])
        deposit = result["deposit"]
        rx = _build_reactions_from_instance(deposit, current_user=current_user)
        if result.get("my_reaction") is None and request.data.get("emoji_id") in (None, "", 0, "none"):
            return Response({"my_reaction": None, "reactions": rx["detail"]}, status=status.HTTP_200_OK)
        return Response({"my_reaction": rx["mine"], "reactions": rx["detail"]}, status=status.HTTP_200_OK)


class CommentCreateView(APIView):
    permission_classes = []

    def post(self, request):
        current_user = get_current_app_user(request)
        if not current_user:
            return api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Identité requise.")
        if getattr(current_user, "is_guest", False):
            return api_error(status.HTTP_403_FORBIDDEN, "ACCOUNT_COMPLETION_REQUIRED", "Compte complet requis.")
        touch_last_seen(current_user)

        dep_public_key = (request.data.get("dep_public_key") or "").strip()
        text_value = str(request.data.get("text") or "").strip()
        result, error = create_comment(
            user=current_user,
            dep_public_key=dep_public_key,
            text_value=text_value,
            author_ip=_get_request_ip(request),
            author_user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
        if error:
            return (
                _comment_error(error["status"], error["reason_code"])
                if "reason_code" in error
                else api_error(error["status"], error["code"], error["detail"])
            )

        comment = result["comment"]
        deposit = result["deposit"]
        comment_status = comment.status

        comments_context = _build_comments_context_for_deposits([deposit], viewer=current_user).get(
            deposit.id,
            {"items": [], "viewer_state": {}},
        )
        response_status = (
            status.HTTP_202_ACCEPTED if comment_status == Comment.STATUS_QUARANTINED else status.HTTP_201_CREATED
        )
        return Response(
            {
                "status": comment.status,
                "comment_id": comment.id,
                "comments": comments_context,
                "message": "Votre commentaire est en cours de vérification."
                if comment_status == Comment.STATUS_QUARANTINED
                else None,
            },
            status=response_status,
        )


class CommentDetailView(APIView):
    permission_classes = []

    def delete(self, request, comment_id: int):
        current_user = get_current_app_user(request)
        if not current_user or getattr(current_user, "is_guest", False):
            return api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Identité requise.")
        touch_last_seen(current_user)

        payload, error = delete_comment_by_author(current_user=current_user, comment_id=comment_id)
        if error:
            return api_error(error["status"], error["code"], error["detail"])
        return Response(payload, status=status.HTTP_200_OK)


class CommentReportView(APIView):
    permission_classes = []

    def post(self, request, comment_id: int):
        current_user = get_current_app_user(request)
        if not current_user or getattr(current_user, "is_guest", False):
            return api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Identité requise.")
        touch_last_seen(current_user)

        payload, error = report_comment(
            current_user=current_user,
            comment_id=comment_id,
            reason=request.data.get("reason"),
            details=request.data.get("details"),
        )
        if error:
            return api_error(error["status"], error["code"], error["detail"])
        return Response(payload, status=status.HTTP_200_OK)


class ClientAdminCommentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        payload, _error = list_client_admin_comments(
            client_id=user.client_id,
            tab=(request.query_params.get("tab") or "quarantined").strip(),
        )
        return Response(
            {"items": [_serialize_client_admin_comment(comment) for comment in payload["items"]]},
            status=status.HTTP_200_OK,
        )


class ClientAdminCommentModerateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, comment_id: int):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        result, error = moderate_comment(
            client_id=user.client_id,
            actor=user,
            comment_id=comment_id,
            action=(request.data.get("action") or "").strip(),
            reason_code=(request.data.get("reason") or "").strip(),
            note=str(request.data.get("note") or "").strip(),
        )
        if error:
            return api_error(error["status"], error["code"], error["detail"])
        return Response({"item": _serialize_client_admin_comment(result["item"])}, status=status.HTTP_200_OK)


class ClientAdminCommentRestrictionListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        result, _error = list_comment_restrictions(
            client_id=user.client_id,
            show_all=_coerce_bool(request.query_params.get("all")),
            now_dt=timezone.now(),
        )
        return Response(
            {"items": [_serialize_comment_restriction(item) for item in result["items"]]}, status=status.HTTP_200_OK
        )

    def post(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        try:
            target_user_id = int(request.data.get("user_id"))
        except (TypeError, ValueError):
            return api_error(
                status.HTTP_400_BAD_REQUEST,
                "COMMENT_RESTRICTION_USER_ID_INVALID",
                "user_id invalide.",
            )

        result, error = create_comment_restriction(
            client_id=user.client_id,
            actor=user,
            user_id=target_user_id,
            restriction_type=(request.data.get("restriction_type") or "").strip(),
            reason_code=(request.data.get("reason_code") or "manual_restriction").strip(),
            internal_note=str(request.data.get("internal_note") or "").strip(),
            now_dt=timezone.now(),
        )
        if error:
            return api_error(error["status"], error["code"], error["detail"])
        return Response({"item": _serialize_comment_restriction(result["item"])}, status=status.HTTP_201_CREATED)
