# ===== Standard library =====
import json
import re
from datetime import timedelta

import requests

# ===== Django =====
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.contrib.humanize.templatetags.humanize import naturaltime
from django.db import transaction, IntegrityError
from django.db.models import Count, Max, Prefetch, Q
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils import timezone
from django.utils.timezone import localtime, localdate

# ===== Django REST Framework =====
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

# ===== Project =====
from api_aggregation.views import ApiAggregation
from users.models import CustomUser
from users.utils import (
    apply_points_delta,
    attach_guest_cookie,
    build_current_user_payload,
    ensure_guest_user_for_request,
    get_current_app_user,
    touch_last_seen,
)
from .models import (
    Article,
    IncitationPhrase,
    Box,
    Deposit,
    DiscoveredSong,
    Emoji,
    EmojiRight,
    LocationPoint,
    Reaction,
    Song,
    Comment,
    CommentReport,
    CommentModerationDecision,
    CommentUserRestriction,
    CommentAttemptLog,
)
from .serializers import (
    BoxSerializer,
    SongSerializer,
    EmojiSerializer,
    ClientAdminArticleSerializer,
    PublicVisibleArticleSerializer,
    PublicVisibleArticleDetailSerializer,
    ClientAdminIncitationSerializer,
)
from .utils import (
    _calculate_distance,
    _build_successes,
    _build_deposits_payload,
    _build_song_from_instance,
    _get_prev_head_and_older,
    _build_reactions_from_instance,
    _build_user_from_instance,
    _get_active_client_user_or_response,
    _ArticleImportHTMLParser,
    _collapse_article_text,
    _truncate_article_text,
    _absolute_remote_url,
    _dedupe_keep_order,
    _pick_best_favicon_url,
    _clean_import_title,
    _looks_like_noise_text,
    _pick_best_short_text,
    _extract_import_preview_from_url,
    _get_current_incitation_for_box,
    _build_incitation_overlap_counts,
    _get_incitation_overlap_queryset,
    _coerce_bool,
    COMMENT_MAX_LENGTH,
    COMMENT_COOLDOWN_SECONDS,
    COMMENT_TARGET_USER_DAILY_LIMIT,
    COMMENT_REASON_ALREADY_COMMENTED,
    COMMENT_REASON_TARGET_USER_DAILY_COMMENT_LIMIT_REACHED,
    COMMENT_REASON_RATE_LIMIT,
    COMMENT_REASON_LINK_FORBIDDEN,
    COMMENT_REASON_EMAIL_FORBIDDEN,
    COMMENT_REASON_PHONE_FORBIDDEN,
    COMMENT_REASON_EMPTY,
    COMMENT_REASON_TOO_LONG,
    COMMENT_REASON_RESTRICTED,
    COMMENT_REASON_REPORT_THRESHOLD,
    COMMENT_REASON_RISK_QUARANTINE,
    COMMENT_REASON_DELETE_BY_AUTHOR,
    COMMENT_REASON_REMOVE_BY_MODERATION,
    COMMENT_REPORT_REASON_CHOICES,
    _normalize_comment_text,
    _detect_comment_pre_creation_error,
    _score_comment_risk,
    _build_comments_context_for_deposits,
    _get_profile_picture_url,
    _get_active_comment_restrictions_for_clients,
    _log_blocked_comment_attempt,
    extract_accent_color_from_urls,
)

# Barèmes & coûts (importés depuis ton module utils global)
from utils import (
    COST_REVEAL_BOX,
)

User = get_user_model()


def _get_request_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _get_comment_error_message(reason_code):
    messages = {
        COMMENT_REASON_ALREADY_COMMENTED: "Vous avez déjà commenté ce partage auparavant.",
        COMMENT_REASON_TARGET_USER_DAILY_COMMENT_LIMIT_REACHED: "Vous avez atteint la limite quotidienne de commentaires sur les partages de cette personne.",
        COMMENT_REASON_RATE_LIMIT: "Vous pouvez commenter à nouveau dans 2 minutes.",
        COMMENT_REASON_LINK_FORBIDDEN: "Les liens ne sont pas autorisés dans les commentaires.",
        COMMENT_REASON_EMAIL_FORBIDDEN: "Les emails ne sont pas autorisés dans les commentaires.",
        COMMENT_REASON_PHONE_FORBIDDEN: "Les numéros de téléphone ne sont pas autorisés dans les commentaires.",
        COMMENT_REASON_EMPTY: "Le commentaire est vide.",
        COMMENT_REASON_TOO_LONG: "Le commentaire ne peut pas dépasser 100 caractères.",
        COMMENT_REASON_RESTRICTED: "Vous ne pouvez pas commenter pour le moment.",
    }
    return messages.get(reason_code, "Impossible d’enregistrer ce commentaire.")


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
            "public_key": comment.deposit_public_key or (comment.deposit.public_key if getattr(comment, "deposit", None) else ""),
            "box_name": comment.deposit_box_name or (comment.deposit.box.name if getattr(comment, "deposit", None) and getattr(comment.deposit, "box", None) else ""),
            "box_url": comment.deposit_box_url or (comment.deposit.box.url if getattr(comment, "deposit", None) and getattr(comment.deposit, "box", None) else ""),
        },
        "author": {
            "id": comment.user_id,
            "username": getattr(user, "username", None) or comment.author_username or None,
            "display_name": getattr(user, "username", None) or comment.author_display_name or comment.author_username or "anonyme",
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


# -----------------------
# Vues
# -----------------------


class GetMain(APIView):
    """
    GET /box-management/get-main/<slug:box_url>/
    → Retourne le dernier dépôt d'une box donnée (via son slug URL).

    - 404 si la box n'existe pas
    - [] si aucun dépôt n'est encore présent
    - utilise _build_deposits_payload (utils.py)

    Spécificité : le dépôt renvoyé est toujours sérialisé avec les infos song (hidden=False),
    sans créer de reveal en base (mais on garde la création de DiscoveredSong pour les viewers connectés).
    """

    def get(self, request, box_url: str, *args, **kwargs):
        box = get_object_or_404(Box, url=box_url)

        qs = (
            Deposit.objects
            .latest_for_box(box, limit=1)
            .prefetch_related(
                Prefetch(
                    "reactions",
                    queryset=Reaction.objects
                        .select_related("emoji", "user")
                        .order_by("created_at", "id"),
                    to_attr="prefetched_reactions",
                )
            )
        )
        deposits = list(qs)

        viewer = get_current_app_user(request)
        if viewer:
            touch_last_seen(viewer)

        if viewer and deposits:
            dep = deposits[0]
            DiscoveredSong.objects.get_or_create(
                user=viewer,
                deposit=dep,
                defaults={"discovered_type": "main"},
            )

        force_ids = [deposits[0].pk] if deposits else []
        payload = _build_deposits_payload(
            deposits,
            viewer=viewer,
            include_user=True,
            force_song_infos_for=force_ids,
        )

        return Response(payload, status=status.HTTP_200_OK)


class GetBox(APIView):
    lookup_url_kwarg = "name"
    serializer_class = BoxSerializer

    def get(self, request, format=None):
        slug = request.GET.get("name")

        if not slug:
            return Response(
                {"detail": "Merci de spécifier le nom d'une boîte (paramètre ?name=)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        box = (
            Box.objects
            .select_related("client")
            .filter(url=slug)
            .annotate(
                deposit_count=Count("deposits"),
                last_deposit_at=Max("deposits__deposited_at"),
            )
            .only("name", "client__slug")
            .first()
        )

        if not box:
            return Response(
                {"detail": "Désolé. Cette boîte n'existe pas."},
                status=status.HTTP_404_NOT_FOUND,
            )

        last_deposit = (
            box.deposits
            .select_related("song")
            .order_by("-deposited_at")
            .first()
        )

        last_deposit_date = (
            naturaltime(localtime(box.last_deposit_at))
            if box.last_deposit_at else None
        )

        last_deposit_song_image_url = (
            last_deposit.song.image_url
            if last_deposit and last_deposit.song
            else None
        )

        current_incitation = _get_current_incitation_for_box(box)

        data = {
            "name": box.name,
            "client_slug": box.client.slug if box.client else None,
            "deposit_count": box.deposit_count,
            "last_deposit_date": last_deposit_date,
            "last_deposit_song_image_url": last_deposit_song_image_url,
            "search_incitation_text": (
                current_incitation.text if current_incitation else None
            ),
        }

        return Response(data, status=status.HTTP_200_OK)

    def post(self, request, format=None):
        """
        POST /box-management/get-box/
        Body: { option: {...}, boxSlug: "<slug>" }

        Réponse:
        {
          "main": <payload prev_head>,
          "older_deposits": [...],
          "successes": [...],
          "points_balance": <int|None>
        }

        - Snapshot AVANT création: prev_head + older (limit=15)
        - Crée DiscoveredSong(main) pour prev_head uniquement si user authentifié
        - Sérialise main+older en un seul batch
        - force_song_infos_for(prev_head) uniquement pour anonymes
        """

        option = request.data.get("option") or {}
        box_slug = request.data.get("boxSlug")
        if not box_slug:
            return Response({"detail": "boxSlug manquant"}, status=status.HTTP_400_BAD_REQUEST)

        box = Box.objects.filter(url=box_slug).first()
        if not box:
            return Response({"detail": "Boîte introuvable"}, status=status.HTTP_404_NOT_FOUND)

        song_name = (option.get("name") or "").strip()
        song_author = (option.get("artist") or "").strip()

        try:
            song_platform_id = int(option.get("platform_id"))
        except (TypeError, ValueError):
            song_platform_id = None

        incoming_url = (option.get("url") or "").strip()
        incoming_image_url = (option.get("image_url") or "").strip()
        incoming_image_url_small = (option.get("image_url_small") or "").strip()
        if not song_name or not song_author:
            return Response({"detail": "Titre ou artiste manquant"}, status=status.HTTP_400_BAD_REQUEST)

        existing_song = (
            Song.objects.filter(title__iexact=song_name, artist__iexact=song_author)
            .only("id", "accent_color", "image_url", "image_url_small")
            .first()
        )

        accent_color_to_apply = ""
        should_compute_accent = existing_song is None or not (existing_song.accent_color or "").strip()
        if should_compute_accent:
            accent_color_to_apply = (
                extract_accent_color_from_urls(
                    image_url_small=(getattr(existing_song, "image_url_small", "") or incoming_image_url_small or ""),
                    image_url=(getattr(existing_song, "image_url", "") or incoming_image_url or ""),
                )
                or ""
            )

        user = get_current_app_user(request)
        guest_created = False
        if not user:
            user, guest_created = ensure_guest_user_for_request(request)
        touch_last_seen(user)

        prev_head, older_list = _get_prev_head_and_older(box, limit=15)

        points_balance = None
        with transaction.atomic():
            user = CustomUser.objects.select_for_update().get(pk=user.pk)

            try:
                song = Song.objects.get(title__iexact=song_name, artist__iexact=song_author)
                song.n_deposits = (song.n_deposits or 0) + 1
            except Song.DoesNotExist:
                song = Song(
                    song_id=option.get("id"),
                    title=song_name,
                    artist=song_author,
                    image_url=incoming_image_url,
                    image_url_small=incoming_image_url_small,
                    accent_color=accent_color_to_apply,
                    duration=option.get("duration") or 0,
                )

            if incoming_image_url and not (song.image_url or "").strip():
                song.image_url = incoming_image_url
            if incoming_image_url_small and not (song.image_url_small or "").strip():
                song.image_url_small = incoming_image_url_small
            if accent_color_to_apply and not (song.accent_color or "").strip():
                song.accent_color = accent_color_to_apply

            if song_platform_id == 1 and incoming_url:
                song.spotify_url = incoming_url
            elif song_platform_id == 2 and incoming_url:
                song.deezer_url = incoming_url

            try:
                request_platform = None
                if song_platform_id == 1 and not song.deezer_url:
                    request_platform = "deezer"
                elif song_platform_id == 2 and not song.spotify_url:
                    request_platform = "spotify"

                if request_platform:
                    aggreg_url = request.build_absolute_uri(reverse("api_agg:aggreg"))
                    payload = {
                        "song": {"title": song.title, "artist": song.artist, "duration": song.duration},
                        "platform": request_platform,
                    }
                    headers = {"Content-Type": "application/json", "X-CSRFToken": get_token(request)}
                    r = requests.post(
                        aggreg_url,
                        data=json.dumps(payload),
                        headers=headers,
                        cookies=request.COOKIES,
                        timeout=6,
                    )
                    if r.ok:
                        other_url = r.json()
                        if isinstance(other_url, str):
                            if request_platform == "deezer":
                                song.deezer_url = other_url
                            elif request_platform == "spotify":
                                song.spotify_url = other_url
            except Exception:
                pass

            song.save()

            successes, points_to_add = _build_successes(box=box, user=user, song=song)

            Deposit.objects.create(song=song, box=box, user=user)

            if prev_head is not None:
                try:
                    DiscoveredSong.objects.get_or_create(
                        user=user,
                        deposit_id=prev_head.pk,
                        defaults={"discovered_type": "main"},
                    )
                except Exception:
                    pass

            ok_points, points_payload, _points_code = apply_points_delta(
                user,
                points_to_add,
                lock_user=False,
            )
            if ok_points:
                points_balance = points_payload.get("points_balance")

        deps_to_serialize = []
        if prev_head is not None:
            deps_to_serialize.append(prev_head)
        deps_to_serialize.extend(older_list)

        force_ids = []

        payloads = _build_deposits_payload(
            deps_to_serialize,
            viewer=user,
            include_user=True,
            force_song_infos_for=force_ids,
        )

        if prev_head is None:
            main_payload = None
            older_payloads = payloads
        else:
            main_payload = payloads[0] if payloads else None
            older_payloads = payloads[1:] if len(payloads) > 1 else []

        response = Response(
            {
                "main": main_payload,
                "older_deposits": older_payloads,
                "successes": list(successes),
                "points_balance": points_balance,
                "current_user": build_current_user_payload(user),
            },
            status=status.HTTP_200_OK,
        )
        if guest_created and getattr(user, "guest_device_token", None):
            attach_guest_cookie(response, user.guest_device_token)
        return response


class Location(APIView):
    """
    POST /box-management/verify-location

    Corps attendu:
    {
      "latitude": <float>,
      "longitude": <float>,
      "box": { "url": "<box_slug>" }
    }

    Réponses:
      - 200: localisation valide
      - 403: localisation invalide (trop loin)
      - 404: pas de points de localisation configurés pour cette box
      - 400: payload invalide
    """

    def post(self, request):
        try:
            latitude = float(request.data.get("latitude"))
            longitude = float(request.data.get("longitude"))
        except (TypeError, ValueError):
            return Response({"error": "Invalid latitude/longitude"}, status=status.HTTP_400_BAD_REQUEST)

        box_payload = request.data.get("box") or {}
        box_url = box_payload.get("url")
        if not box_url:
            return Response({"error": "Missing box.url"}, status=status.HTTP_400_BAD_REQUEST)

        box = get_object_or_404(Box, url=box_url)

        points = LocationPoint.objects.filter(box=box)
        if not points.exists():
            return Response({"error": "No location points for this box"}, status=status.HTTP_404_NOT_FOUND)

        for point in points:
            max_dist = point.dist_location
            target_lat = point.latitude
            target_lng = point.longitude
            dist = _calculate_distance(latitude, longitude, target_lat, target_lng)
            if dist <= max_dist:
                return Response(status=status.HTTP_200_OK)

        return Response({"error": "Tu n'est pas à coté de la boîte"}, status=status.HTTP_403_FORBIDDEN)


class RevealSong(APIView):
    """
    POST /box-management/revealSong
    Body: { "dep_public_key": <str> }
    200: { "song": {...}, "points_balance": <int|None> }
    """

    def post(self, request, format=None):
        user = get_current_app_user(request)
        if not user:
            return Response(
                {"detail": "Identité requise."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        touch_last_seen(user)

        public_key = request.data.get("dep_public_key")
        if not public_key:
            return Response(
                {"detail": "Clé publique manquante"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        context = request.data.get("context")
        if context in (None, ""):
            context = "box"
        if context not in ("box", "profile"):
            return Response(
                {"detail": "Contexte invalide."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            user = CustomUser.objects.select_for_update().get(pk=user.pk)

            try:
                deposit = (
                    Deposit.objects
                    .select_related("song")
                    .get(public_key=public_key)
                )
            except Deposit.DoesNotExist:
                return Response(
                    {"detail": "Dépôt introuvable"},
                    status=status.HTTP_404_NOT_FOUND,
                )

            song = deposit.song
            if not song:
                return Response(
                    {"detail": "Chanson introuvable pour ce dépôt"},
                    status=status.HTTP_404_NOT_FOUND,
                )

            discovery = DiscoveredSong.objects.filter(user=user, deposit=deposit).first()
            points_balance = int(getattr(user, "points", 0) or 0)

            if discovery is None:
                cost = int(COST_REVEAL_BOX)
                ok_points, points_payload, points_status = apply_points_delta(
                    user,
                    -cost,
                    lock_user=False,
                )
                if not ok_points:
                    return Response(points_payload, status=points_status)

                points_balance = points_payload.get("points_balance")

                try:
                    DiscoveredSong.objects.create(
                        user=user,
                        deposit=deposit,
                        discovered_type="revealed",
                        context=context,
                    )
                except IntegrityError:
                    pass

        song_payload = _build_song_from_instance(song, hidden=False)

        data = {
            "song": song_payload,
            "points_balance": points_balance,
        }
        return Response(data, status=status.HTTP_200_OK)


class ManageDiscoveredSongs(APIView):
    """
    POST: enregistrer une découverte pour un dépôt donné (deposit_id) et un type (main/revealed).
    GET : renvoie des sessions de découvertes, groupées par connexion à une boîte.
    """

    def post(self, request, format=None):
        user = get_current_app_user(request)
        if not user:
            return Response(
                {"error": "Vous devez être connecté pour effectuer cette action."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        touch_last_seen(user)

        deposit_id = request.data.get("deposit_id")
        if not deposit_id:
            return Response(
                {"error": "Identifiant de dépôt manquant."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        discovered_type = request.data.get("discovered_type") or "revealed"
        if discovered_type not in ("main", "revealed"):
            discovered_type = "revealed"

        context = request.data.get("context")
        if context in (None, ""):
            context = "box"
        if context not in ("box", "profile"):
            return Response(
                {"error": "Contexte invalide."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            deposit = (
                Deposit.objects
                .select_related("song", "box", "user")
                .get(pk=deposit_id)
            )
        except Deposit.DoesNotExist:
            return Response(
                {"error": "Dépôt introuvable."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if DiscoveredSong.objects.filter(user=user, deposit=deposit).exists():
            return Response(
                {"error": "Ce dépôt est déjà découvert."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        DiscoveredSong.objects.create(
            user=user,
            deposit=deposit,
            discovered_type=discovered_type,
            context=context,
        )

        return Response({"success": True}, status=status.HTTP_200_OK)

    def get(self, request):
        user = get_current_app_user(request)
        if not user:
            return Response(
                {"error": "Vous devez être connecté pour effectuer cette action."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        touch_last_seen(user)

        try:
            limit = int(request.GET.get("limit", 10))
        except Exception:
            limit = 10
        try:
            offset = int(request.GET.get("offset", 0))
        except Exception:
            offset = 0
        limit = 10 if limit <= 0 else limit
        offset = 0 if offset < 0 else offset

        events = list(
            DiscoveredSong.objects
            .filter(user_id=user.id)
            .select_related(
                "deposit",
                "deposit__song",
                "deposit__user",
                "deposit__box",
            )
            .prefetch_related(
                Prefetch(
                    "deposit__reactions",
                    queryset=Reaction.objects
                    .select_related("emoji", "user", "deposit")
                    .order_by("created_at", "id"),
                    to_attr="prefetched_reactions",
                )
            )
            .order_by("discovered_at", "id")
        )

        if not events:
            payload = {
                "sessions": [],
                "limit": limit,
                "offset": offset,
                "has_more": False,
                "next_offset": offset,
            }
            return Response(payload, status=status.HTTP_200_OK)

        deposits = [ds.deposit for ds in events]
        unique_deposits = []
        seen_ids = set()
        for d in deposits:
            if d.pk not in seen_ids:
                seen_ids.add(d.pk)
                unique_deposits.append(d)

        deposits_payload_list = _build_deposits_payload(
            unique_deposits,
            viewer=user,
            include_user=True,
            include_deposit_time=False,
        )

        deposit_payload_by_id = {
            dep.pk: payload
            for dep, payload in zip(unique_deposits, deposits_payload_list)
        }

        def deposit_payload(ds_obj):
            dep = ds_obj.deposit
            base = deposit_payload_by_id.get(dep.pk, {})
            return {
                **base,
                "type": ds_obj.discovered_type,
                "context": ds_obj.context or "box",
                "discovered_at": ds_obj.discovered_at.isoformat(),
                "deposit_id": dep.pk,
            }

        sessions_all = []
        consumed = [False] * len(events)

        box_main_indices = [
            i
            for i, event in enumerate(events)
            if (event.context or "box") == "box" and event.discovered_type == "main"
        ]

        for idx, main_index in enumerate(box_main_indices):
            main_ds = events[main_index]
            box = main_ds.deposit.box
            if not box:
                consumed[main_index] = True
                continue

            next_main_index = (
                box_main_indices[idx + 1]
                if (idx + 1) < len(box_main_indices)
                else len(events)
            )

            deposits_list = [deposit_payload(main_ds)]
            consumed[main_index] = True

            for event_index in range(main_index + 1, next_main_index):
                ds = events[event_index]
                if consumed[event_index]:
                    continue
                if (ds.context or "box") != "box":
                    continue
                if ds.discovered_type != "revealed":
                    continue
                if ds.deposit.box_id != box.id:
                    continue

                deposits_list.append(deposit_payload(ds))
                consumed[event_index] = True

            sessions_all.append({
                "session_id": f"box-{main_ds.id}",
                "session_type": "box",
                "box": {"id": box.id, "name": box.name, "url": box.url},
                "started_at": main_ds.discovered_at.isoformat(),
                "deposits": deposits_list,
            })

        next_box_main_pos_from = [None] * len(events)
        next_box_main_idx = None
        for index in range(len(events) - 1, -1, -1):
            next_box_main_pos_from[index] = next_box_main_idx
            event = events[index]
            if (event.context or "box") == "box" and event.discovered_type == "main":
                next_box_main_idx = index

        orphan_counter = 0
        index = 0
        while index < len(events):
            event = events[index]

            if consumed[index]:
                index += 1
                continue

            event_context = event.context or "box"

            if event_context == "profile":
                owner = event.deposit.user
                owner_id = getattr(owner, "id", None)
                deposits_list = []
                start = event.discovered_at
                session_indices = []

                cursor = index
                while cursor < len(events):
                    current = events[cursor]
                    current_context = current.context or "box"
                    current_owner_id = getattr(current.deposit.user, "id", None)
                    if current_context != "profile" or current_owner_id != owner_id:
                        break

                    deposits_list.append(deposit_payload(current))
                    session_indices.append(cursor)
                    cursor += 1

                for consumed_index in session_indices:
                    consumed[consumed_index] = True

                deposits_list.sort(
                    key=lambda deposit: (
                        deposit.get("discovered_at") or "",
                        deposit.get("deposit_id") or 0,
                    ),
                    reverse=True,
                )

                sessions_all.append({
                    "session_id": f"profile-{event.id}",
                    "session_type": "profile",
                    "profile_user": _build_user_from_instance(owner),
                    "started_at": start.isoformat(),
                    "deposits": deposits_list,
                })
                index = cursor
                continue

            if event.discovered_type == "revealed":
                box = event.deposit.box
                if box:
                    stop_at = (
                        next_box_main_pos_from[index]
                        if next_box_main_pos_from[index] is not None
                        else len(events)
                    )

                    deposits_list = [deposit_payload(event)]
                    consumed[index] = True

                    cursor = index + 1
                    while cursor < stop_at:
                        current = events[cursor]
                        if consumed[cursor]:
                            cursor += 1
                            continue
                        if (current.context or "box") != "box":
                            cursor += 1
                            continue
                        if current.discovered_type != "revealed":
                            if current.discovered_type == "main":
                                break
                            cursor += 1
                            continue
                        if current.deposit.box_id != box.id:
                            cursor += 1
                            continue

                        deposits_list.append(deposit_payload(current))
                        consumed[cursor] = True
                        cursor += 1

                    sessions_all.append({
                        "session_id": f"orph-{orphan_counter}",
                        "session_type": "box",
                        "box": {"id": box.id, "name": box.name, "url": box.url},
                        "started_at": event.discovered_at.isoformat(),
                        "deposits": deposits_list,
                    })
                    orphan_counter += 1

            index += 1

        sessions_all.sort(key=lambda session: session["started_at"], reverse=True)

        total_sessions = len(sessions_all)
        slice_start = offset
        slice_end = offset + limit
        sessions_page = sessions_all[slice_start:slice_end]
        has_more = slice_end < total_sessions
        next_offset = slice_end if has_more else slice_end

        payload = {
            "sessions": sessions_page,
            "limit": limit,
            "offset": offset,
            "has_more": has_more,
            "next_offset": next_offset,
        }
        return Response(payload, status=status.HTTP_200_OK)


class UserDepositsView(APIView):
    permission_classes = []

    def get(self, request):
        """
        GET /box-management/user-deposits?username=<str>&limit=<int>&offset=<int>
        """

        me = _coerce_bool(request.GET.get("me"))
        raw_username = (request.GET.get("username") or "").strip()
        if not me and not raw_username:
            return Response(
                {"errors": ["Pas d'utilisateur spécifié"]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            limit = int(request.GET.get("limit", 20))
        except Exception:
            limit = 20
        try:
            offset = int(request.GET.get("offset", 0))
        except Exception:
            offset = 0

        if limit <= 0:
            limit = 20
        if limit > 50:
            limit = 50
        if offset < 0:
            offset = 0

        if me:
            target_user = get_current_app_user(request)
            if not target_user:
                return Response(
                    {"errors": ["Utilisateur non connecté"]},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            touch_last_seen(target_user)
        else:
            target_user = User.objects.filter(username__iexact=raw_username, is_guest=False).first()
            if not target_user:
                return Response(
                    {"errors": ["Utilisateur inexistant"]},
                    status=status.HTTP_404_NOT_FOUND,
                )

        base_qs = (
            Deposit.objects
            .filter(user=target_user)
            .select_related("song", "box", "user")
            .prefetch_related(
                Prefetch(
                    "reactions",
                    queryset=Reaction.objects.select_related("emoji", "user", "deposit").order_by("created_at", "id"),
                    to_attr="prefetched_reactions",
                )
            )
            .order_by("-deposited_at", "-id")
        )

        page_qs = list(base_qs[offset: offset + limit + 1])
        has_more = len(page_qs) > limit
        deposits = page_qs[:limit]

        viewer = get_current_app_user(request)

        items = _build_deposits_payload(
            deposits,
            viewer=viewer,
            include_user=False,
        )

        next_offset = offset + len(deposits)

        return Response(
            {
                "items": items,
                "limit": limit,
                "offset": offset,
                "has_more": has_more,
                "next_offset": next_offset,
            },
            status=status.HTTP_200_OK,
        )


class PublicVisibleArticlesView(APIView):
    def get_box(self, request):
        box_slug = (request.query_params.get("boxSlug") or request.query_params.get("box_slug") or "").strip()
        if not box_slug:
            return None, Response({"detail": "boxSlug manquant."}, status=status.HTTP_400_BAD_REQUEST)

        box = Box.objects.select_related("client").filter(url=box_slug).first()
        if not box or not box.client_id:
            return None, None

        return box, None

    def get(self, request, format=None):
        box, error_response = self.get_box(request)
        if error_response:
            return error_response
        if not box:
            return Response([], status=status.HTTP_200_OK)

        try:
            limit = int(request.query_params.get("limit", 5))
        except (TypeError, ValueError):
            limit = 5

        limit = max(1, min(limit, 20))

        articles_qs = (
            Article.objects
            .with_related()
            .for_client(box.client_id)
            .currently_visible()
            .order_by("-published_at", "-created_at")[:limit]
        )

        serializer = PublicVisibleArticleSerializer(articles_qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PublicVisibleArticleDetailView(APIView):
    def get(self, request, article_id, format=None):
        box, error_response = PublicVisibleArticlesView().get_box(request)
        if error_response:
            return error_response
        if not box:
            return Response({"detail": "Article introuvable."}, status=status.HTTP_404_NOT_FOUND)

        article = (
            Article.objects
            .with_related()
            .for_client(box.client_id)
            .currently_visible()
            .filter(id=article_id)
            .first()
        )

        if not article:
            return Response({"detail": "Article introuvable."}, status=status.HTTP_404_NOT_FOUND)

        serializer = PublicVisibleArticleDetailSerializer(article)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ClientAdminArticleImportPageView(APIView):
    permission_classes = []

    def post(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        link = (request.data.get("link") or "").strip()
        if not link:
            return Response(
                {"link": ["Le lien externe est obligatoire pour importer une page."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        url_field = serializers.URLField()
        try:
            link = url_field.run_validation(link)
        except serializers.ValidationError as exc:
            return Response(
                {"link": exc.detail},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            preview = _extract_import_preview_from_url(link)
        except requests.Timeout:
            return Response(
                {"detail": "Le site a mis trop de temps à répondre."},
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )
        except requests.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else 502

            detail = f"La page n'est pas accessible (HTTP {status_code})."
            if status_code in {401, 402, 403}:
                detail = (
                    f"Le site refuse l'import automatique de cette page (HTTP {status_code})."
                )

            return Response(
                {"detail": detail},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except requests.RequestException:
            return Response(
                {"detail": "Impossible de récupérer cette page pour le moment."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception:
            return Response(
                {"detail": "Impossible d'analyser cette page."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(preview, status=status.HTTP_200_OK)

class ClientAdminArticleListCreateView(APIView):
    permission_classes = []

    def get(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        search = (request.GET.get("search") or "").strip()
        status_filter = (request.GET.get("status") or "").strip()

        articles_qs = (
            Article.objects
            .visible_for_client_user(user)
            .with_related()
            .search(search)
            .with_status(status_filter)
            .ordered_for_admin()
        )

        serializer = ClientAdminArticleSerializer(articles_qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        serializer = ClientAdminArticleSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        article = serializer.save(
            client_id=user.client_id,
            author=user,
        )

        output = ClientAdminArticleSerializer(article)
        return Response(output.data, status=status.HTTP_201_CREATED)


class ClientAdminArticleDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, article_id):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return None, error_response

        article = (
            Article.objects
            .visible_for_client_user(user)
            .with_related()
            .filter(id=article_id)
            .first()
        )

        if not article:
            return None, Response(
                {"detail": "Article introuvable."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return article, None

    def get(self, request, article_id):
        article, error_response = self.get_object(request, article_id)
        if error_response:
            return error_response

        serializer = ClientAdminArticleSerializer(article)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, article_id):
        article, error_response = self.get_object(request, article_id)
        if error_response:
            return error_response

        payload = dict(request.data)
        payload.pop("client", None)
        payload.pop("client_id", None)
        payload.pop("author", None)
        payload.pop("author_id", None)

        serializer = ClientAdminArticleSerializer(
            article,
            data=payload,
            partial=True,
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        article = serializer.save()
        output = ClientAdminArticleSerializer(article)
        return Response(output.data, status=status.HTTP_200_OK)

    def delete(self, request, article_id):
        article, error_response = self.get_object(request, article_id)
        if error_response:
            return error_response

        article.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ==========================================================
# EMOJIS & REACTIONS
# ==========================================================
class EmojiCatalogView(APIView):
    """
    GET /box-management/emojis/catalog
    ?dep_public_key=<str> (optionnel) pour retourner aussi la réaction courante
    """
    permission_classes = []

    def get(self, request):
        dep_public_key = request.GET.get("dep_public_key")
        actives_paid = list(
            Emoji.objects.filter(active=True).order_by("cost", "char")
        )

        owned_ids = []
        current_reaction = None

        current_user = get_current_app_user(request)
        if current_user:
            touch_last_seen(current_user)
            owned_ids = list(
                EmojiRight.objects.filter(user=current_user, emoji__active=True)
                .values_list("emoji_id", flat=True)
            )

            if dep_public_key:
                r = (
                    Reaction.objects.filter(
                        user=current_user,
                        deposit__public_key=dep_public_key,
                    )
                    .select_related("emoji")
                    .first()
                )
                if r and r.emoji:
                    current_reaction = {"emoji": r.emoji.char, "id": r.emoji.id}

        data = {
            "actives_paid": EmojiSerializer(actives_paid, many=True).data,
            "owned_ids": owned_ids,
            "current_reaction": current_reaction,
        }
        return Response(data, status=status.HTTP_200_OK)


class PurchaseEmojiView(APIView):
    """
    POST /box-management/emojis/purchase
    Body: { "emoji_id": <int> }
    """
    permission_classes = []

    def post(self, request):
        current_user = get_current_app_user(request)
        if not current_user:
            return Response({"detail": "Authentification requise."}, status=status.HTTP_401_UNAUTHORIZED)
        if getattr(current_user, "is_guest", False):
            return Response({"detail": "Compte complet requis."}, status=status.HTTP_403_FORBIDDEN)
        touch_last_seen(current_user)

        emoji_id = request.data.get("emoji_id")
        if not emoji_id:
            return Response({"detail": "emoji_id manquant"}, status=status.HTTP_400_BAD_REQUEST)

        emoji = Emoji.objects.filter(id=emoji_id).first()
        if not emoji or not emoji.active:
            return Response({"detail": "Emoji indisponible"}, status=status.HTTP_404_NOT_FOUND)

        cost = int(emoji.cost or 0)

        with transaction.atomic():
            current_user = CustomUser.objects.select_for_update().get(pk=current_user.pk)

            if cost == 0:
                _, created = EmojiRight.objects.get_or_create(user=current_user, emoji=emoji)
                return Response(
                    {
                        "ok": True,
                        "owned": True,
                        "created": bool(created),
                        "points_balance": current_user.points,
                    },
                    status=status.HTTP_200_OK,
                )

            if EmojiRight.objects.filter(user=current_user, emoji=emoji).exists():
                return Response(
                    {
                        "ok": True,
                        "owned": True,
                        "points_balance": current_user.points,
                    },
                    status=status.HTTP_200_OK,
                )

            ok_points, payload_points, code_points = apply_points_delta(
                current_user,
                -cost,
                lock_user=False,
            )
            if not ok_points:
                return Response(payload_points, status=code_points)

            EmojiRight.objects.create(user=current_user, emoji=emoji)
            return Response(
                {
                    "ok": True,
                    "owned": True,
                    "points_balance": payload_points.get("points_balance"),
                },
                status=status.HTTP_200_OK,
            )


class ReactionView(APIView):
    """
    POST /box-management/reactions
    Body: { "dep_public_key": "<str>", "emoji_id": <int|null|"none"> }
    """
    permission_classes = []

    def post(self, request):
        current_user = get_current_app_user(request)
        if not current_user:
            return Response({"detail": "Identité requise."}, status=status.HTTP_401_UNAUTHORIZED)
        touch_last_seen(current_user)

        dep_public_key = request.data.get("dep_public_key")
        emoji_id = request.data.get("emoji_id")

        if not dep_public_key:
            return Response(
                {"detail": "dep_public_key manquant"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        deposit = Deposit.objects.filter(public_key=dep_public_key).first()
        if not deposit:
            return Response(
                {"detail": "Dépôt introuvable"},
                status=status.HTTP_404_NOT_FOUND,
            )

        is_revealed_for_user = bool(
            getattr(deposit, "user_id", None) == getattr(current_user, "id", None)
            or DiscoveredSong.objects.filter(user=current_user, deposit=deposit).exists()
        )
        if not is_revealed_for_user:
            return Response(
                {"detail": "Écoute la chanson avant de réagir"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if emoji_id in (None, "", 0, "none"):
            Reaction.objects.filter(user=current_user, deposit=deposit).delete()
            deposit = (
                Deposit.objects.filter(pk=deposit.pk)
                .prefetch_related(
                    Prefetch(
                        "reactions",
                        queryset=Reaction.objects.select_related("emoji", "user").order_by("created_at", "id"),
                        to_attr="prefetched_reactions",
                    )
                )
                .first()
            )
            rx = _build_reactions_from_instance(deposit, current_user=current_user)
            return Response(
                {"my_reaction": None, "reactions": rx["detail"]},
                status=status.HTTP_200_OK,
            )

        emoji = Emoji.objects.filter(id=emoji_id, active=True).first()
        if not emoji:
            return Response(
                {"detail": "Emoji invalide"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not emoji.cost == 0:
            has_right = EmojiRight.objects.filter(
                user=current_user, emoji=emoji
            ).exists()
            if not has_right:
                return Response(
                    {"error": "forbidden", "message": "Emoji non débloqué"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        obj, created = Reaction.objects.get_or_create(
            user=current_user,
            deposit=deposit,
            defaults={"emoji": emoji},
        )
        if not created and obj.emoji_id != emoji.id:
            obj.emoji = emoji
            obj.save(update_fields=["emoji", "updated_at"])

        deposit = (
            Deposit.objects.filter(pk=deposit.pk)
            .prefetch_related(
                Prefetch(
                    "reactions",
                    queryset=Reaction.objects.select_related("emoji", "user").order_by("created_at", "id"),
                    to_attr="prefetched_reactions",
                )
            )
            .first()
        )
        rx = _build_reactions_from_instance(deposit, current_user=current_user)
        return Response(
            {"my_reaction": rx["mine"], "reactions": rx["detail"]},
            status=status.HTTP_200_OK,
        )


class CommentCreateView(APIView):
    permission_classes = []

    def post(self, request):
        current_user = get_current_app_user(request)
        if not current_user:
            return Response({"detail": "Identité requise."}, status=status.HTTP_401_UNAUTHORIZED)
        if getattr(current_user, "is_guest", False):
            return Response({"detail": "Compte complet requis."}, status=status.HTTP_403_FORBIDDEN)
        touch_last_seen(current_user)

        dep_public_key = (request.data.get("dep_public_key") or "").strip()
        raw_text = str(request.data.get("text") or "")
        text_value = raw_text.strip()
        normalized_text = _normalize_comment_text(text_value)

        deposit = (
            Deposit.objects
            .select_related("user", "box__client")
            .filter(public_key=dep_public_key)
            .first()
        )
        if not deposit:
            return Response({"detail": "Dépôt introuvable."}, status=status.HTTP_404_NOT_FOUND)

        client = getattr(getattr(deposit, "box", None), "client", None)
        if not client:
            return Response({"detail": "Client introuvable pour ce dépôt."}, status=status.HTTP_400_BAD_REQUEST)

        if Comment.objects.filter(deposit=deposit, user=current_user).exists():
            return Response(
                {"detail": _get_comment_error_message(COMMENT_REASON_ALREADY_COMMENTED), "reason_code": COMMENT_REASON_ALREADY_COMMENTED},
                status=status.HTTP_400_BAD_REQUEST,
            )

        active_restriction = _get_active_comment_restrictions_for_clients(current_user, [client.id]).get(client.id)
        if active_restriction:
            _log_blocked_comment_attempt(
                client=client,
                deposit=deposit,
                user=current_user,
                text=text_value,
                normalized_text=normalized_text,
                reason_code=COMMENT_REASON_RESTRICTED,
                author_ip=_get_request_ip(request),
                author_user_agent=request.META.get("HTTP_USER_AGENT", ""),
                meta={"restriction_type": active_restriction.restriction_type},
            )
            return Response(
                {"detail": _get_comment_error_message(COMMENT_REASON_RESTRICTED), "reason_code": COMMENT_REASON_RESTRICTED},
                status=status.HTTP_403_FORBIDDEN,
            )

        recent_cutoff = timezone.now() - timedelta(seconds=COMMENT_COOLDOWN_SECONDS)
        has_recent_comment = Comment.objects.filter(user=current_user, created_at__gte=recent_cutoff).exists()
        if has_recent_comment:
            _log_blocked_comment_attempt(
                client=client,
                deposit=deposit,
                user=current_user,
                text=text_value,
                normalized_text=normalized_text,
                reason_code=COMMENT_REASON_RATE_LIMIT,
                author_ip=_get_request_ip(request),
                author_user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
            return Response(
                {"detail": _get_comment_error_message(COMMENT_REASON_RATE_LIMIT), "reason_code": COMMENT_REASON_RATE_LIMIT},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        pre_creation_error = _detect_comment_pre_creation_error(text_value)
        if pre_creation_error:
            _log_blocked_comment_attempt(
                client=client,
                deposit=deposit,
                user=current_user,
                text=text_value,
                normalized_text=normalized_text,
                reason_code=pre_creation_error,
                author_ip=_get_request_ip(request),
                author_user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
            return Response(
                {"detail": _get_comment_error_message(pre_creation_error), "reason_code": pre_creation_error},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if deposit.user_id and deposit.user_id != current_user.id:
            daily_target_count = Comment.objects.filter(
                user=current_user,
                client=client,
                deposit_owner_user_id=deposit.user_id,
                created_at__date=localdate(),
            ).count()
            if daily_target_count >= COMMENT_TARGET_USER_DAILY_LIMIT:
                _log_blocked_comment_attempt(
                    client=client,
                    deposit=deposit,
                    user=current_user,
                    text=text_value,
                    normalized_text=normalized_text,
                    reason_code=COMMENT_REASON_TARGET_USER_DAILY_COMMENT_LIMIT_REACHED,
                    author_ip=_get_request_ip(request),
                    author_user_agent=request.META.get("HTTP_USER_AGENT", ""),
                    meta={"target_owner_user_id": deposit.user_id},
                )
                return Response(
                    {
                        "detail": _get_comment_error_message(COMMENT_REASON_TARGET_USER_DAILY_COMMENT_LIMIT_REACHED),
                        "reason_code": COMMENT_REASON_TARGET_USER_DAILY_COMMENT_LIMIT_REACHED,
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        risk_score, risk_flags = _score_comment_risk(text=text_value, normalized_text=normalized_text)
        comment_status = Comment.STATUS_PUBLISHED
        reason_code = ""
        if risk_score >= 70:
            comment_status = Comment.STATUS_QUARANTINED
            reason_code = risk_flags[0] if risk_flags else COMMENT_REASON_RISK_QUARANTINE

        try:
            comment = Comment.objects.create(
                client=client,
                deposit=deposit,
                user=current_user,
                text=text_value,
                normalized_text=normalized_text,
                status=comment_status,
                reason_code=reason_code,
                risk_score=risk_score,
                risk_flags=risk_flags,
                deposit_public_key=deposit.public_key or "",
                deposit_box_name=getattr(deposit.box, "name", "") or "",
                deposit_box_url=getattr(deposit.box, "url", "") or "",
                deposit_deleted=False,
                deposit_owner_user_id=getattr(deposit, "user_id", None),
                deposit_owner_username=getattr(getattr(deposit, "user", None), "username", "") or "",
                author_username=current_user.username or "",
                author_display_name=getattr(current_user, "display_name", None) or current_user.username or "",
                author_email=current_user.email or "",
                author_avatar_url=_get_profile_picture_url(current_user) or "",
                author_ip=_get_request_ip(request),
                author_user_agent=(request.META.get("HTTP_USER_AGENT", "") or "")[:255],
            )
        except IntegrityError:
            return Response(
                {"detail": _get_comment_error_message(COMMENT_REASON_ALREADY_COMMENTED), "reason_code": COMMENT_REASON_ALREADY_COMMENTED},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if comment_status == Comment.STATUS_QUARANTINED:
            CommentModerationDecision.objects.create(
                comment=comment,
                acted_by=None,
                decision_code="auto_quarantine",
                reason_code=reason_code or COMMENT_REASON_RISK_QUARANTINE,
                internal_note=", ".join(risk_flags or []),
            )

        comments_context = _build_comments_context_for_deposits([deposit], viewer=current_user).get(
            deposit.id,
            {"items": [], "viewer_state": {}},
        )
        response_status = status.HTTP_202_ACCEPTED if comment_status == Comment.STATUS_QUARANTINED else status.HTTP_201_CREATED
        return Response(
            {
                "status": comment.status,
                "comment_id": comment.id,
                "comments": comments_context,
                "message": "Votre commentaire est en cours de vérification." if comment_status == Comment.STATUS_QUARANTINED else None,
            },
            status=response_status,
        )


class CommentDetailView(APIView):
    permission_classes = []

    def delete(self, request, comment_id: int):
        current_user = get_current_app_user(request)
        if not current_user or getattr(current_user, "is_guest", False):
            return Response({"detail": "Identité requise."}, status=status.HTTP_401_UNAUTHORIZED)
        touch_last_seen(current_user)

        comment = (
            Comment.objects
            .select_related("deposit", "deposit__box", "client")
            .filter(pk=comment_id)
            .first()
        )
        if not comment:
            return Response({"detail": "Commentaire introuvable."}, status=status.HTTP_404_NOT_FOUND)
        if comment.user_id != current_user.id:
            return Response({"detail": "Action non autorisée."}, status=status.HTTP_403_FORBIDDEN)

        comment.status = Comment.STATUS_DELETED_BY_AUTHOR
        comment.reason_code = COMMENT_REASON_DELETE_BY_AUTHOR
        comment.save(update_fields=["status", "reason_code", "updated_at"])
        CommentModerationDecision.objects.create(
            comment=comment,
            acted_by=current_user,
            decision_code="delete_by_author",
            reason_code=COMMENT_REASON_DELETE_BY_AUTHOR,
        )

        comments_context = {"items": [], "viewer_state": {}}
        if comment.deposit_id:
            comments_context = _build_comments_context_for_deposits([comment.deposit], viewer=current_user).get(
                comment.deposit_id,
                comments_context,
            )

        return Response({"ok": True, "comments": comments_context}, status=status.HTTP_200_OK)


class CommentReportView(APIView):
    permission_classes = []

    def post(self, request, comment_id: int):
        current_user = get_current_app_user(request)
        if not current_user or getattr(current_user, "is_guest", False):
            return Response({"detail": "Identité requise."}, status=status.HTTP_401_UNAUTHORIZED)
        touch_last_seen(current_user)

        comment = (
            Comment.objects
            .select_related("user", "deposit", "client")
            .filter(pk=comment_id)
            .first()
        )
        if not comment:
            return Response({"detail": "Commentaire introuvable."}, status=status.HTTP_404_NOT_FOUND)
        if comment.user_id == current_user.id:
            return Response({"detail": "Vous ne pouvez pas signaler votre propre commentaire."}, status=status.HTTP_400_BAD_REQUEST)
        if comment.status != Comment.STATUS_PUBLISHED:
            return Response({"detail": "Ce commentaire ne peut plus être signalé."}, status=status.HTTP_400_BAD_REQUEST)

        reason_code = (request.data.get("reason") or "other").strip()
        if reason_code not in COMMENT_REPORT_REASON_CHOICES:
            reason_code = "other"
        free_text = str(request.data.get("details") or "").strip()[:255]

        report, created = CommentReport.objects.get_or_create(
            comment=comment,
            reporter=current_user,
            defaults={
                "reason_code": reason_code,
                "free_text": free_text,
                "reporter_username": current_user.username or "",
                "reporter_email": current_user.email or "",
            },
        )
        if not created:
            return Response({"ok": True, "already_reported": True}, status=status.HTTP_200_OK)

        comment.reports_count = comment.reports.count()
        if comment.reports_count >= 3 and comment.status == Comment.STATUS_PUBLISHED:
            comment.status = Comment.STATUS_QUARANTINED
            comment.reason_code = COMMENT_REASON_REPORT_THRESHOLD
            comment.save(update_fields=["reports_count", "status", "reason_code", "updated_at"])
            CommentModerationDecision.objects.create(
                comment=comment,
                acted_by=None,
                decision_code="auto_quarantine_report_threshold",
                reason_code=COMMENT_REASON_REPORT_THRESHOLD,
                internal_note=f"reports_count={comment.reports_count}",
            )
        else:
            comment.save(update_fields=["reports_count", "updated_at"])

        return Response({"ok": True, "reports_count": comment.reports_count}, status=status.HTTP_200_OK)


class ClientAdminCommentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        tab = (request.query_params.get("tab") or "quarantined").strip()
        qs = Comment.objects.filter(client_id=user.client_id)

        if tab == "signaled":
            qs = qs.filter(reports_count__gt=0)
        elif tab == "recent":
            pass
        else:
            qs = qs.filter(status=Comment.STATUS_QUARANTINED)

        comments = list(
            qs.select_related("user", "deposit", "deposit__box")
            .prefetch_related(
                Prefetch("reports", queryset=CommentReport.objects.order_by("-created_at", "-id"), to_attr="prefetched_reports"),
                Prefetch(
                    "moderation_decisions",
                    queryset=CommentModerationDecision.objects.select_related("acted_by").order_by("-created_at", "-id"),
                    to_attr="prefetched_decisions",
                ),
            )
            .order_by("-created_at", "-id")[:100]
        )

        return Response({"items": [_serialize_client_admin_comment(comment) for comment in comments]}, status=status.HTTP_200_OK)


class ClientAdminCommentModerateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, comment_id: int):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        comment = (
            Comment.objects
            .select_related("user", "deposit", "deposit__box")
            .filter(client_id=user.client_id, pk=comment_id)
            .first()
        )
        if not comment:
            return Response({"detail": "Commentaire introuvable."}, status=status.HTTP_404_NOT_FOUND)

        action = (request.data.get("action") or "").strip()
        reason_code = (request.data.get("reason") or "").strip()
        note = str(request.data.get("note") or "").strip()

        if action == "publish":
            comment.status = Comment.STATUS_PUBLISHED
            comment.reason_code = reason_code or ""
            decision_code = "publish"
        elif action == "remove":
            comment.status = Comment.STATUS_REMOVED_MODERATION
            comment.reason_code = reason_code or COMMENT_REASON_REMOVE_BY_MODERATION
            decision_code = "remove"
        else:
            return Response({"detail": "Action de modération invalide."}, status=status.HTTP_400_BAD_REQUEST)

        comment.save(update_fields=["status", "reason_code", "updated_at"])
        CommentModerationDecision.objects.create(
            comment=comment,
            acted_by=user,
            decision_code=decision_code,
            reason_code=comment.reason_code or "",
            internal_note=note,
        )

        comment = (
            Comment.objects
            .select_related("user", "deposit", "deposit__box")
            .prefetch_related(
                Prefetch("reports", queryset=CommentReport.objects.order_by("-created_at", "-id"), to_attr="prefetched_reports"),
                Prefetch(
                    "moderation_decisions",
                    queryset=CommentModerationDecision.objects.select_related("acted_by").order_by("-created_at", "-id"),
                    to_attr="prefetched_decisions",
                ),
            )
            .get(pk=comment.pk)
        )
        return Response({"item": _serialize_client_admin_comment(comment)}, status=status.HTTP_200_OK)


class ClientAdminCommentRestrictionListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        qs = CommentUserRestriction.objects.filter(client_id=user.client_id).select_related("user", "created_by")
        show_all = _coerce_bool(request.query_params.get("all"))
        if not show_all:
            now_dt = timezone.now()
            qs = qs.filter(starts_at__lte=now_dt).filter(Q(ends_at__isnull=True) | Q(ends_at__gt=now_dt))

        restrictions = list(qs.order_by("-created_at", "-id")[:100])
        return Response({"items": [_serialize_comment_restriction(item) for item in restrictions]}, status=status.HTTP_200_OK)

    def post(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        try:
            target_user_id = int(request.data.get("user_id"))
        except (TypeError, ValueError):
            return Response({"detail": "user_id invalide."}, status=status.HTTP_400_BAD_REQUEST)

        target_user = CustomUser.objects.filter(pk=target_user_id, is_guest=False).first()
        if not target_user:
            return Response({"detail": "Utilisateur introuvable."}, status=status.HTTP_404_NOT_FOUND)

        has_client_comment_activity = Comment.objects.filter(client_id=user.client_id, user_id=target_user.id).exists()
        has_client_attempt_activity = CommentAttemptLog.objects.filter(client_id=user.client_id, user_id=target_user.id).exists()
        if not (has_client_comment_activity or has_client_attempt_activity):
            return Response(
                {"detail": "Vous ne pouvez sanctionner que des utilisateurs ayant déjà interagi avec vos commentaires."},
                status=status.HTTP_403_FORBIDDEN,
            )

        restriction_type = (request.data.get("restriction_type") or "").strip()
        if restriction_type not in {
            CommentUserRestriction.TYPE_MUTE_24H,
            CommentUserRestriction.TYPE_MUTE_7D,
            CommentUserRestriction.TYPE_BAN,
        }:
            return Response({"detail": "restriction_type invalide."}, status=status.HTTP_400_BAD_REQUEST)

        reason_code = (request.data.get("reason_code") or "manual_restriction").strip()
        internal_note = str(request.data.get("internal_note") or "").strip()
        now_dt = timezone.now()
        ends_at = None
        if restriction_type == CommentUserRestriction.TYPE_MUTE_24H:
            ends_at = now_dt + timedelta(hours=24)
        elif restriction_type == CommentUserRestriction.TYPE_MUTE_7D:
            ends_at = now_dt + timedelta(days=7)

        restriction = CommentUserRestriction.objects.create(
            client_id=user.client_id,
            user=target_user,
            created_by=user,
            restriction_type=restriction_type,
            reason_code=reason_code,
            internal_note=internal_note,
            starts_at=now_dt,
            ends_at=ends_at,
        )

        restriction = CommentUserRestriction.objects.select_related("user", "created_by").get(pk=restriction.pk)
        return Response({"item": _serialize_comment_restriction(restriction)}, status=status.HTTP_201_CREATED)


class ClientAdminIncitationListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        today = localtime().date()
        phrases = list(
            IncitationPhrase.objects
            .visible_for_client_user(user)
            .select_related("client")
        )

        overlap_counts = _build_incitation_overlap_counts(phrases)

        def sort_key(item):
            if item.is_active_on_date(today):
                return (0, item.start_date, item.created_at, item.id)
            if item.is_future_on_date(today):
                return (1, item.start_date, item.created_at, item.id)
            return (2, -item.end_date.toordinal(), -item.created_at.timestamp(), -item.id)

        phrases.sort(key=sort_key)

        serializer = ClientAdminIncitationSerializer(
            phrases,
            many=True,
            context={"today": today, "overlap_counts": overlap_counts},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        serializer = ClientAdminIncitationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        start_date = serializer.validated_data.get("start_date")
        end_date = serializer.validated_data.get("end_date")
        force_overlap = _coerce_bool(request.data.get("force_overlap"))

        overlap_qs = _get_incitation_overlap_queryset(
            client_id=user.client_id,
            start_date=start_date,
            end_date=end_date,
        )

        if overlap_qs.exists() and not force_overlap:
            overlap_serializer = ClientAdminIncitationSerializer(
                overlap_qs.select_related("client"),
                many=True,
                context={"today": localtime().date()},
            )
            return Response(
                {
                    "error": "overlap_warning",
                    "detail": "La période se superpose avec une autre phrase d’incitation.",
                    "overlaps": overlap_serializer.data,
                },
                status=status.HTTP_409_CONFLICT,
            )

        phrase = serializer.save(client_id=user.client_id)
        output = ClientAdminIncitationSerializer(
            phrase,
            context={
                "today": localtime().date(),
                "overlap_counts": {phrase.id: phrase.get_overlap_count()},
            },
        )
        return Response(output.data, status=status.HTTP_201_CREATED)


class ClientAdminIncitationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, incitation_id):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return None, error_response

        phrase = (
            IncitationPhrase.objects
            .visible_for_client_user(user)
            .select_related("client")
            .filter(id=incitation_id)
            .first()
        )

        if not phrase:
            return None, Response(
                {"detail": "Phrase d’incitation introuvable."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return phrase, None

    def get(self, request, incitation_id):
        phrase, error_response = self.get_object(request, incitation_id)
        if error_response:
            return error_response

        serializer = ClientAdminIncitationSerializer(
            phrase,
            context={
                "today": localtime().date(),
                "overlap_counts": {phrase.id: phrase.get_overlap_count()},
            },
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, incitation_id):
        phrase, error_response = self.get_object(request, incitation_id)
        if error_response:
            return error_response

        payload = dict(request.data)
        payload.pop("client", None)
        payload.pop("client_id", None)

        serializer = ClientAdminIncitationSerializer(
            phrase,
            data=payload,
            partial=True,
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        start_date = serializer.validated_data.get("start_date", phrase.start_date)
        end_date = serializer.validated_data.get("end_date", phrase.end_date)
        force_overlap = _coerce_bool(request.data.get("force_overlap"))

        overlap_qs = _get_incitation_overlap_queryset(
            client_id=phrase.client_id,
            start_date=start_date,
            end_date=end_date,
            exclude_id=phrase.id,
        )

        if overlap_qs.exists() and not force_overlap:
            overlap_serializer = ClientAdminIncitationSerializer(
                overlap_qs.select_related("client"),
                many=True,
                context={"today": localtime().date()},
            )
            return Response(
                {
                    "error": "overlap_warning",
                    "detail": "La période se superpose avec une autre phrase d’incitation.",
                    "overlaps": overlap_serializer.data,
                },
                status=status.HTTP_409_CONFLICT,
            )

        phrase = serializer.save()
        output = ClientAdminIncitationSerializer(
            phrase,
            context={
                "today": localtime().date(),
                "overlap_counts": {phrase.id: phrase.get_overlap_count()},
            },
        )
        return Response(output.data, status=status.HTTP_200_OK)

    def delete(self, request, incitation_id):
        phrase, error_response = self.get_object(request, incitation_id)
        if error_response:
            return error_response

        phrase.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
