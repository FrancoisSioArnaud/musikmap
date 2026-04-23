# ===== Standard library =====
import re
from urllib.parse import quote

# ===== Django =====
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Prefetch
from django.http import Http404, HttpResponseGone
from django.shortcuts import redirect
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.utils.timezone import localtime
from django.views.decorators.csrf import ensure_csrf_cookie

# ===== Django REST Framework =====
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from box_management.builders.deposit_payloads import (
    _build_deposits_payload,
    _build_song_from_instance,
    _build_user_from_instance,
)
from box_management.models import (
    Article,
    Box,
    BoxSession,
    Deposit,
    DiscoveredSong,
    Emoji,
    EmojiRight,
    Link,
    Reaction,
    Song,
    SongProviderLink,
    Sticker,
)
from box_management.provider_services import resolve_provider_link_for_song
from box_management.serializers import (
    BoxSerializer,
    ClientAdminArticleSerializer,
    ClientAdminIncitationSerializer,
    EmojiSerializer,
    PublicVisibleArticleDetailSerializer,
    PublicVisibleArticleSerializer,
)
from box_management.services.articles.get_visible_articles import get_visible_article_detail, get_visible_articles
from box_management.services.articles.import_article_preview import import_article_preview
from box_management.services.boxes.client_access import _coerce_bool, _get_active_client_user_or_response
from box_management.services.boxes.get_box_page_data import get_box_page_data
from box_management.services.boxes.session_helpers import (
    ensure_active_session_for_box_or_response as _ensure_active_session_for_box_or_response,
)
from box_management.services.boxes.session_helpers import (
    get_active_box_session as _get_active_box_session,
)
from box_management.services.boxes.session_helpers import (
    get_box_by_slug as _get_box_by_slug,
)
from box_management.services.boxes.session_helpers import (
    open_box_session_for_user as _open_box_session_for_user,
)
from box_management.services.boxes.session_helpers import (
    serialize_box_identity as _serialize_box_identity,
)
from box_management.services.boxes.session_helpers import (
    serialize_box_session as _serialize_box_session,
)
from box_management.services.boxes.session_helpers import (
    session_payload_for_box as _session_payload_for_box,
)
from box_management.services.boxes.verify_location import verify_location_for_box
from box_management.services.deposits.create_box_deposit import create_box_deposit_payload
from box_management.services.incitations.admin_incitations import (
    create_incitation,
    get_incitation_or_none,
    list_client_incitations,
    update_incitation,
)
from box_management.services.pinned.create_pinned_deposit import create_pinned_deposit
from box_management.services.pinned.pricing import (
    build_pinned_price_steps_payload,
    get_active_pinned_deposit_for_box,
    get_pinned_price_step,
    get_pinned_price_steps_raw,
)
from box_management.services.reveal.reveal_song import reveal_song_for_user
from la_boite_a_son.api_errors import api_error

# Barèmes & coûts
from la_boite_a_son.economy import COST_REVEAL_BOX, build_economy_payload

# ===== Project =====
from users.models import CustomUser
from users.utils import (
    apply_points_delta,
    attach_guest_cookie,
    build_current_user_payload,
    ensure_guest_user_for_request,
    get_current_app_user,
    touch_last_seen,
)

User = get_user_model()


def _get_request_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def sticker_redirect_view(request, sticker_slug):
    sticker_slug = (sticker_slug or "").strip()

    if not re.fullmatch(r"\d{11}", sticker_slug):
        return redirect("/")

    sticker = Sticker.objects.select_related("box", "client").filter(slug=sticker_slug).first()

    if not sticker:
        return redirect("/")

    if not sticker.is_active:
        return HttpResponseGone("Sticker désactivé.", content_type="text/plain; charset=utf-8")

    box_slug = getattr(getattr(sticker, "box", None), "url", "")
    if box_slug:
        return redirect(f"/flowbox/{box_slug}")

    return redirect(f"/client/stickers/install?sticker={quote(sticker.slug)}")


def sticker_root_not_found_view(request):
    raise Http404("Le slug du sticker est obligatoire.")


def _normalize_link_slug(raw_slug):
    return (raw_slug or "").strip().lower()


def _provider_error_status(error_code):
    if error_code == "INVALID_PROVIDER":
        return status.HTTP_400_BAD_REQUEST
    if error_code == "PROVIDER_LINK_NOT_FOUND":
        return status.HTTP_404_NOT_FOUND
    return status.HTTP_503_SERVICE_UNAVAILABLE


def _serialize_share_link(link, request):
    return {
        "slug": link.slug,
        "url": request.build_absolute_uri(f"/l/{link.slug}"),
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        "deposit_public_key": getattr(link.deposit, "public_key", None),
        "created_by": _build_user_from_instance(link.created_by),
    }


def _is_deposit_revealed_for_user(user, deposit):
    if not user or not deposit:
        return False
    return bool(
        getattr(deposit, "user_id", None) == getattr(user, "id", None)
        or DiscoveredSong.objects.filter(user=user, deposit=deposit).exists()
    )


def _build_public_link_payload(link, viewer):
    deposit = getattr(link, "deposit", None)
    if not deposit:
        return None

    deposits_payload = _build_deposits_payload(
        [deposit],
        viewer=viewer,
        include_user=True,
        force_song_infos_for=[deposit.pk],
    )
    deposit_payload = deposits_payload[0] if deposits_payload else {}
    deposit_payload = {
        **deposit_payload,
        "type": "revealed",
        "context": "link",
        "discovered_at": timezone.now().isoformat(),
        "deposit_id": deposit.pk,
    }

    box = getattr(deposit, "box", None)
    client = getattr(box, "client", None)

    return {
        "deposit": deposit_payload,
        "sender": _build_user_from_instance(link.created_by),
        "client_slug": getattr(client, "slug", None),
        "box": {
            "id": getattr(box, "id", None),
            "name": getattr(box, "name", None),
            "url": getattr(box, "url", None),
        }
        if box
        else None,
    }


# -----------------------
# Vues
# -----------------------


class ShareLinkCreateView(APIView):
    permission_classes = []

    def post(self, request):
        current_user = get_current_app_user(request)
        if not current_user:
            return api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Identité requise.")
        touch_last_seen(current_user)

        dep_public_key = (request.data.get("dep_public_key") or "").strip()
        if not dep_public_key:
            return api_error(status.HTTP_400_BAD_REQUEST, "DEPOSIT_PUBLIC_KEY_REQUIRED", "dep_public_key manquant")

        deposit = (
            Deposit.objects.select_related("song", "box", "box__client", "user")
            .filter(public_key=dep_public_key)
            .first()
        )
        if not deposit:
            return api_error(status.HTTP_404_NOT_FOUND, "DEPOSIT_NOT_FOUND", "Dépôt introuvable")

        if not _is_deposit_revealed_for_user(current_user, deposit):
            return api_error(
                status.HTTP_403_FORBIDDEN,
                "DEPOSIT_NOT_REVEALED",
                "Ce dépôt doit déjà être révélé pour pouvoir être partagé.",
            )

        with transaction.atomic():
            link = (
                Link.objects.select_for_update()
                .select_related("deposit", "created_by")
                .filter(deposit=deposit, created_by=current_user)
                .first()
            )
            created = link is None
            if created:
                link = Link(deposit=deposit, created_by=current_user)

            link.deposit_deleted = False
            link.extend_expiration()
            link.save()

        payload = _serialize_share_link(link, request)
        payload["created"] = created
        return Response(payload, status=status.HTTP_200_OK)


class ShareLinkPublicDetailView(APIView):
    permission_classes = []

    def get(self, request, link_slug):
        slug = _normalize_link_slug(link_slug)
        if not slug:
            return api_error(status.HTTP_404_NOT_FOUND, "LINK_NOT_FOUND", "Lien introuvable.")

        link = (
            Link.objects.select_related(
                "deposit", "deposit__song", "deposit__box", "deposit__box__client", "deposit__user", "created_by"
            )
            .prefetch_related(
                Prefetch(
                    "deposit__reactions",
                    queryset=Reaction.objects.select_related("emoji", "user").order_by("created_at", "id"),
                    to_attr="prefetched_reactions",
                )
            )
            .filter(slug=slug)
            .first()
        )

        if not link:
            return api_error(status.HTTP_404_NOT_FOUND, "LINK_NOT_FOUND", "Lien introuvable.")

        if link.deposit_deleted or not getattr(link, "deposit", None):
            return api_error(status.HTTP_410_GONE, "DEPOSIT_DELETED", "Ce dépôt n’est plus disponible.")

        now = timezone.now()
        if link.expires_at and link.expires_at <= now:
            return api_error(
                status.HTTP_410_GONE,
                "LINK_EXPIRED",
                "Ce lien a expiré.",
                sender=_build_user_from_instance(link.created_by),
            )

        viewer = get_current_app_user(request)
        if viewer:
            touch_last_seen(viewer)
            link.opened_by_users.add(viewer)

            discovery, created = DiscoveredSong.objects.get_or_create(
                user=viewer,
                deposit=link.deposit,
                defaults={
                    "discovered_type": "revealed",
                    "context": "link",
                    "link_sender": link.created_by,
                },
            )
            updates = []
            if discovery.context != "link":
                discovery.context = "link"
                updates.append("context")
            if discovery.link_sender_id != getattr(link.created_by, "id", None):
                discovery.link_sender = link.created_by
                updates.append("link_sender")
            if updates:
                discovery.save(update_fields=updates + ["updated_at"])

        link.extend_expiration()
        link.save(update_fields=["expires_at", "updated_at"])

        payload = _build_public_link_payload(link, viewer) or {}
        if payload:
            link.increment_open_counters(viewer)
        return Response(payload, status=status.HTTP_200_OK)


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
        box = Box.objects.filter(url=box_url).first()
        if not box:
            return api_error(status.HTTP_404_NOT_FOUND, "BOX_NOT_FOUND", "Boîte introuvable.")

        qs = Deposit.objects.latest_for_box(box, limit=1).prefetch_related(
            Prefetch(
                "reactions",
                queryset=Reaction.objects.select_related("emoji", "user").order_by("created_at", "id"),
                to_attr="prefetched_reactions",
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


class EconomyConfigView(APIView):
    """GET /box-management/economy/

    Public, cacheable economy configuration for the frontend.
    """

    permission_classes = []

    def get(self, request, *args, **kwargs):
        payload = build_economy_payload()
        payload["pinned_price_steps"] = get_pinned_price_steps_raw()
        return Response(payload, status=status.HTTP_200_OK)


def _serialize_active_pinned_deposit_for_box(box, viewer):
    active_pinned = get_active_pinned_deposit_for_box(box)
    if not active_pinned:
        return None

    payloads = _build_deposits_payload(
        [active_pinned],
        viewer=viewer,
        include_user=True,
        force_song_infos_for=[active_pinned.pk],
    )
    return payloads[0] if payloads else None


@method_decorator(ensure_csrf_cookie, name="dispatch")
class GetBox(APIView):
    lookup_url_kwarg = "name"
    serializer_class = BoxSerializer

    def get(self, request, format=None):
        data, error = get_box_page_data(request.GET.get("name"))
        if error:
            return api_error(error["status"], error["code"], error["detail"])
        return Response(data, status=status.HTTP_200_OK)

    def post(self, request, format=None):
        option = request.data.get("option") or {}
        box_slug = (request.data.get("boxSlug") or "").strip()
        if not box_slug:
            return api_error(status.HTTP_400_BAD_REQUEST, "BOX_SLUG_REQUIRED", "boxSlug manquant")

        box = _get_box_by_slug(box_slug)
        if not box:
            return api_error(status.HTTP_404_NOT_FOUND, "BOX_NOT_FOUND", "Boîte introuvable")

        user, session_error = _ensure_active_session_for_box_or_response(request, box)
        if session_error is not None:
            return session_error

        try:
            response_payload = create_box_deposit_payload(request=request, user=user, box=box, option=option)
        except ValueError:
            return api_error(status.HTTP_400_BAD_REQUEST, "INVALID_DEPOSIT_OPTION", "Le dépôt demandé est invalide.")

        response_payload["active_pinned_deposit"] = _serialize_active_pinned_deposit_for_box(box, user)
        return Response(response_payload, status=status.HTTP_200_OK)


class Location(APIView):
    """
    POST /box-management/verify-location
    """

    def post(self, request):
        try:
            latitude = float(request.data.get("latitude"))
            longitude = float(request.data.get("longitude"))
        except (TypeError, ValueError):
            return api_error(status.HTTP_400_BAD_REQUEST, "INVALID_COORDINATES", "Invalid latitude/longitude")

        result, error = verify_location_for_box(
            box_slug=(request.data.get("boxSlug") or "").strip(),
            latitude=latitude,
            longitude=longitude,
        )
        if error:
            return api_error(error["status"], error["code"], error["detail"])
        box = result["box"]

        current_user = get_current_app_user(request)
        guest_created = False
        if not current_user:
            current_user, guest_created = ensure_guest_user_for_request(request)
        touch_last_seen(current_user)

        session = _open_box_session_for_user(current_user, box)
        response = Response(
            {
                "active": True,
                "box": _serialize_box_identity(box),
                "session": _serialize_box_session(session),
                "current_user": build_current_user_payload(current_user),
            },
            status=status.HTTP_200_OK,
        )
        if guest_created and getattr(current_user, "guest_device_token", None):
            attach_guest_cookie(response, current_user.guest_device_token)
        return response


class BoxSessionView(APIView):
    permission_classes = []

    def get(self, request):
        box_slug = (request.query_params.get("boxSlug") or "").strip()
        if not box_slug:
            return api_error(status.HTTP_400_BAD_REQUEST, "BOX_SLUG_REQUIRED", "boxSlug manquant")

        box = _get_box_by_slug(box_slug)
        if not box:
            return api_error(status.HTTP_404_NOT_FOUND, "BOX_NOT_FOUND", "Boîte introuvable.")

        current_user = get_current_app_user(request)
        if current_user:
            touch_last_seen(current_user)

        session = _get_active_box_session(current_user, box) if current_user else None
        if not session:
            return Response(
                {"active": False, "box": _serialize_box_identity(box), "session": None}, status=status.HTTP_200_OK
            )

        return Response(_session_payload_for_box(session, box), status=status.HTTP_200_OK)


class ActiveBoxSessionsView(APIView):
    permission_classes = []

    def get(self, request):
        current_user = get_current_app_user(request)
        if not current_user:
            return Response({"sessions": []}, status=status.HTTP_200_OK)
        touch_last_seen(current_user)

        now = timezone.now()
        sessions = (
            BoxSession.objects.select_related("box__client")
            .filter(user=current_user, expires_at__gt=now)
            .order_by("-expires_at", "-id")
        )

        items = []
        seen_box_ids = set()
        for session in sessions:
            if session.box_id in seen_box_ids:
                continue
            seen_box_ids.add(session.box_id)
            items.append(
                {
                    "box": _serialize_box_identity(session.box),
                    "session": _serialize_box_session(session),
                }
            )

        return Response({"sessions": items}, status=status.HTTP_200_OK)


class ResolveProviderLinkView(APIView):
    def post(self, request, format=None):
        provider_code = (request.data.get("provider_code") or "").strip().lower()
        song_public_key = (request.data.get("song_public_key") or "").strip()

        if not provider_code or not song_public_key:
            return api_error(status.HTTP_400_BAD_REQUEST, "PROVIDER_LINK_PARAMS_REQUIRED", "Paramètres manquants.")

        song = (
            Song.objects.prefetch_related(
                Prefetch(
                    "provider_links",
                    queryset=SongProviderLink.objects.order_by("id"),
                    to_attr="prefetched_provider_links",
                )
            )
            .filter(public_key=song_public_key)
            .first()
        )
        if not song:
            return api_error(status.HTTP_404_NOT_FOUND, "SONG_NOT_FOUND", "Chanson introuvable.")

        result = resolve_provider_link_for_song(song, provider_code)
        refreshed_song = (
            Song.objects.prefetch_related(
                Prefetch(
                    "provider_links",
                    queryset=SongProviderLink.objects.order_by("id"),
                    to_attr="prefetched_provider_links",
                )
            )
            .filter(pk=song.pk)
            .first()
        ) or song

        if not result.get("ok"):
            error_code = result.get("code") or "PROVIDER_RESOLUTION_ERROR"
            return api_error(
                _provider_error_status(error_code),
                error_code,
                result.get("message") or "La plateforme est indisponible pour le moment. Réessaie plus tard.",
                song=_build_song_from_instance(refreshed_song, hidden=False),
            )

        link = result.get("link")
        return Response(
            {
                "ok": True,
                "provider_code": provider_code,
                "provider_url": getattr(link, "provider_url", None),
                "provider_uri": getattr(link, "provider_uri", None),
                "song": _build_song_from_instance(refreshed_song, hidden=False),
            },
            status=status.HTTP_200_OK,
        )


class RevealSong(APIView):
    """
    POST /box-management/revealSong
    Body: { "dep_public_key": <str> }
    200: { "song": {...}, "points_balance": <int|None> }
    """

    def post(self, request, format=None):
        user = get_current_app_user(request)
        if not user:
            return api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Identité requise.")
        touch_last_seen(user)

        public_key = request.data.get("dep_public_key")
        if not public_key:
            return api_error(status.HTTP_400_BAD_REQUEST, "DEPOSIT_PUBLIC_KEY_REQUIRED", "Clé publique manquante")

        result, error = reveal_song_for_user(
            user=user,
            dep_public_key=public_key,
            context=request.data.get("context"),
            cost_reveal_box=COST_REVEAL_BOX,
        )
        if error:
            if error.get("type") == "response":
                return Response(error["payload"], status=error["status"])
            return api_error(error["status"], error["code"], error["detail"])

        return Response(
            {
                "song": _build_song_from_instance(result["song"], hidden=False),
                "points_balance": result["points_balance"],
            },
            status=status.HTTP_200_OK,
        )


class ManageDiscoveredSongs(APIView):
    """
    GET : renvoie des sessions de découvertes, groupées par connexion à une boîte.
    Le POST manuel est volontairement désactivé pour éviter de contourner les
    règles d’accès/révélation côté serveur.
    """

    def post(self, request, format=None):
        user = get_current_app_user(request)
        if not user:
            return api_error(
                status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Vous devez être connecté pour effectuer cette action."
            )
        touch_last_seen(user)
        return api_error(
            status.HTTP_403_FORBIDDEN,
            "MANUAL_DISCOVERY_FORBIDDEN",
            "L’enregistrement manuel d’une découverte n’est pas autorisé.",
        )

    def get(self, request):
        user = get_current_app_user(request)
        if not user:
            return api_error(
                status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Vous devez être connecté pour effectuer cette action."
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
            DiscoveredSong.objects.filter(user_id=user.id)
            .select_related("deposit", "deposit__song", "deposit__user", "deposit__box", "link_sender")
            .prefetch_related(
                Prefetch(
                    "deposit__reactions",
                    queryset=Reaction.objects.select_related("emoji", "user", "deposit").order_by("created_at", "id"),
                    to_attr="prefetched_reactions",
                )
            )
            .order_by("discovered_at", "id")
        )

        if not events:
            return Response(
                {"sessions": [], "limit": limit, "offset": offset, "has_more": False, "next_offset": offset},
                status=status.HTTP_200_OK,
            )

        deposits = [ds.deposit for ds in events]
        unique_deposits = []
        seen_ids = set()
        for d in deposits:
            if d.pk not in seen_ids:
                seen_ids.add(d.pk)
                unique_deposits.append(d)

        deposits_payload_list = _build_deposits_payload(
            unique_deposits, viewer=user, include_user=True, include_deposit_time=False
        )
        deposit_payload_by_id = {dep.pk: payload for dep, payload in zip(unique_deposits, deposits_payload_list)}

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
            i for i, event in enumerate(events) if (event.context or "box") == "box" and event.discovered_type == "main"
        ]

        for idx, main_index in enumerate(box_main_indices):
            main_ds = events[main_index]
            box = main_ds.deposit.box
            if not box:
                consumed[main_index] = True
                continue
            next_main_index = box_main_indices[idx + 1] if (idx + 1) < len(box_main_indices) else len(events)
            deposits_list = [deposit_payload(main_ds)]
            consumed[main_index] = True
            for event_index in range(main_index + 1, next_main_index):
                ds = events[event_index]
                if (
                    consumed[event_index]
                    or (ds.context or "box") != "box"
                    or ds.discovered_type != "revealed"
                    or ds.deposit.box_id != box.id
                ):
                    continue
                deposits_list.append(deposit_payload(ds))
                consumed[event_index] = True
            sessions_all.append(
                {
                    "session_id": f"box-{main_ds.id}",
                    "session_type": "box",
                    "box": {"id": box.id, "name": box.name, "url": box.url},
                    "started_at": main_ds.discovered_at.isoformat(),
                    "deposits": deposits_list,
                }
            )

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
                    key=lambda deposit: (deposit.get("discovered_at") or "", deposit.get("deposit_id") or 0),
                    reverse=True,
                )
                sessions_all.append(
                    {
                        "session_id": f"profile-{event.id}",
                        "session_type": "profile",
                        "profile_user": _build_user_from_instance(owner),
                        "started_at": start.isoformat(),
                        "deposits": deposits_list,
                    }
                )
                index = cursor
                continue
            if event_context == "link":
                consumed[index] = True
                sessions_all.append(
                    {
                        "session_id": f"link-{event.id}",
                        "session_type": "link",
                        "link_sender": _build_user_from_instance(getattr(event, "link_sender", None)),
                        "started_at": event.discovered_at.isoformat(),
                        "deposits": [deposit_payload(event)],
                    }
                )
                index += 1
                continue
            if event.discovered_type == "revealed":
                box = event.deposit.box
                if box:
                    stop_at = (
                        next_box_main_pos_from[index] if next_box_main_pos_from[index] is not None else len(events)
                    )
                    deposits_list = [deposit_payload(event)]
                    consumed[index] = True
                    cursor = index + 1
                    while cursor < stop_at:
                        current = events[cursor]
                        if consumed[cursor] or (current.context or "box") != "box":
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
                    sessions_all.append(
                        {
                            "session_id": f"orph-{orphan_counter}",
                            "session_type": "box",
                            "box": {"id": box.id, "name": box.name, "url": box.url},
                            "started_at": event.discovered_at.isoformat(),
                            "deposits": deposits_list,
                        }
                    )
                    orphan_counter += 1
            index += 1

        sessions_all.sort(key=lambda session: session["started_at"], reverse=True)
        total_sessions = len(sessions_all)
        slice_start = offset
        slice_end = offset + limit
        sessions_page = sessions_all[slice_start:slice_end]
        has_more = slice_end < total_sessions
        next_offset = slice_end if has_more else slice_end
        return Response(
            {
                "sessions": sessions_page,
                "limit": limit,
                "offset": offset,
                "has_more": has_more,
                "next_offset": next_offset,
            },
            status=status.HTTP_200_OK,
        )


class UserDepositsView(APIView):
    permission_classes = []

    def get(self, request):
        me = _coerce_bool(request.GET.get("me"))
        raw_username = (request.GET.get("username") or "").strip()
        if not me and not raw_username:
            return api_error(status.HTTP_400_BAD_REQUEST, "USERNAME_REQUIRED", "Pas d'utilisateur spécifié")

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
                return api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Utilisateur non connecté")
            touch_last_seen(target_user)
        else:
            target_user = User.objects.filter(username__iexact=raw_username, is_guest=False).first()
            if not target_user:
                return api_error(status.HTTP_404_NOT_FOUND, "USER_NOT_FOUND", "Utilisateur inexistant")

        base_qs = (
            Deposit.objects.filter(user=target_user)
            .exclude(deposit_type="favorite")
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

        page_qs = list(base_qs[offset : offset + limit + 1])
        has_more = len(page_qs) > limit
        deposits = page_qs[:limit]
        viewer = get_current_app_user(request)
        items = _build_deposits_payload(deposits, viewer=viewer, include_user=False)
        next_offset = offset + len(deposits)
        return Response(
            {"items": items, "limit": limit, "offset": offset, "has_more": has_more, "next_offset": next_offset},
            status=status.HTTP_200_OK,
        )


class PinnedSongView(APIView):
    permission_classes = []

    def _get_box(self, request):
        box_slug = (request.query_params.get("boxSlug") or request.data.get("boxSlug") or "").strip()
        if not box_slug:
            return None, api_error(status.HTTP_400_BAD_REQUEST, "BOX_SLUG_REQUIRED", "boxSlug manquant.")

        box = _get_box_by_slug(box_slug)
        if not box:
            return None, api_error(status.HTTP_404_NOT_FOUND, "BOX_NOT_FOUND", "Boîte introuvable.")

        return box, None

    def _serialize_active_deposit(self, deposit, viewer):
        if not deposit:
            return None
        return _serialize_active_pinned_deposit_for_box(deposit.box, viewer)

    def get(self, request):
        box, error_response = self._get_box(request)
        if error_response is not None:
            return error_response

        viewer, session_error = _ensure_active_session_for_box_or_response(request, box)
        if session_error is not None:
            return session_error
        if viewer:
            touch_last_seen(viewer)

        active_pinned = get_active_pinned_deposit_for_box(box)
        return Response(
            {
                "active_pinned_deposit": self._serialize_active_deposit(active_pinned, viewer),
                "price_steps": build_pinned_price_steps_payload(
                    user_points=getattr(viewer, "points", None) if viewer else None
                ),
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        current_user = get_current_app_user(request)
        if not current_user:
            return api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Identité requise.")
        if getattr(current_user, "is_guest", False):
            return api_error(
                status.HTTP_403_FORBIDDEN,
                "ACCOUNT_COMPLETION_REQUIRED",
                "Finalise d’abord ton compte pour épingler une chanson.",
            )
        touch_last_seen(current_user)

        box, error_response = self._get_box(request)
        if error_response is not None:
            return error_response

        _session_user, session_error = _ensure_active_session_for_box_or_response(request, box)
        if session_error is not None:
            return session_error

        option = request.data.get("option") or {}
        try:
            duration_minutes = int(request.data.get("duration_minutes"))
        except (TypeError, ValueError):
            return api_error(status.HTTP_400_BAD_REQUEST, "PIN_DURATION_INVALID", "Durée invalide.")

        price_step = get_pinned_price_step(duration_minutes)
        if not price_step:
            return api_error(status.HTTP_400_BAD_REQUEST, "PIN_DURATION_UNAVAILABLE", "Durée non disponible.")

        points_cost = int(price_step["points"])
        if not option:
            return api_error(status.HTTP_400_BAD_REQUEST, "PIN_SONG_REQUIRED", "Chanson manquante.")

        result, error = create_pinned_deposit(
            user=current_user,
            box=box,
            option=option,
            duration_minutes=duration_minutes,
            points_cost=points_cost,
        )
        if error:
            if error.get("code") == "PIN_SLOT_OCCUPIED":
                return api_error(
                    error["status"],
                    error["code"],
                    error["detail"],
                    active_pinned_deposit=self._serialize_active_deposit(error["active_pinned"], error["user"]),
                    price_steps=build_pinned_price_steps_payload(user_points=error["user"].points),
                )
            if "payload" in error:
                points_payload = error["payload"]
                return api_error(
                    error["status"],
                    points_payload.get("code") or "INSUFFICIENT_POINTS",
                    points_payload.get("detail") or "Pas assez de points pour effectuer cette action.",
                    points_balance=points_payload.get("points_balance", error["user"].points),
                    price_steps=build_pinned_price_steps_payload(user_points=error["user"].points),
                )
            return api_error(error["status"], error["code"], error["detail"])
        pinned_deposit = result["deposit"]
        action = "created"

        refreshed_user = CustomUser.objects.filter(pk=current_user.pk).first() or current_user
        pinned_deposit = (
            Deposit.objects.select_related("song", "user", "box")
            .prefetch_related(
                Prefetch(
                    "reactions",
                    queryset=Reaction.objects.select_related("emoji", "user").order_by("created_at", "id"),
                    to_attr="prefetched_reactions",
                )
            )
            .filter(pk=pinned_deposit.pk)
            .first()
        )

        return Response(
            {
                "action": action,
                "active_pinned_deposit": self._serialize_active_deposit(pinned_deposit, refreshed_user),
                "price_steps": build_pinned_price_steps_payload(user_points=refreshed_user.points),
                "points_balance": int(getattr(refreshed_user, "points", 0) or 0),
            },
            status=status.HTTP_200_OK,
        )


class PublicVisibleArticlesView(APIView):
    def get(self, request, format=None):
        try:
            limit = int(request.query_params.get("limit", 5))
        except (TypeError, ValueError):
            limit = 5

        result, error = get_visible_articles(
            box_slug=(request.query_params.get("boxSlug") or request.query_params.get("box_slug") or "").strip(),
            limit=limit,
        )
        if error:
            return api_error(error["status"], error["code"], error["detail"])
        box = result["box"]
        if box is None:
            return Response([], status=status.HTTP_200_OK)

        _session_user, session_error = _ensure_active_session_for_box_or_response(request, box)
        if session_error is not None:
            return session_error

        serializer = PublicVisibleArticleSerializer(result["items"], many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PublicVisibleArticleDetailView(APIView):
    def get(self, request, article_id, format=None):
        result, error = get_visible_article_detail(
            box_slug=(request.query_params.get("boxSlug") or request.query_params.get("box_slug") or "").strip(),
            article_id=article_id,
        )
        if error:
            return api_error(error["status"], error["code"], error["detail"])
        box = result["box"]

        _session_user, session_error = _ensure_active_session_for_box_or_response(request, box)
        if session_error is not None:
            return session_error

        serializer = PublicVisibleArticleDetailSerializer(result["article"])
        return Response(serializer.data, status=status.HTTP_200_OK)


class ClientAdminArticleImportPageView(APIView):
    permission_classes = []

    def post(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        preview, error = import_article_preview(request.data.get("link"))
        if error:
            extra = {}
            if "field_errors" in error:
                extra["field_errors"] = error["field_errors"]
            if "remote_status" in error:
                extra["remote_status"] = error["remote_status"]
            return api_error(error["status"], error["code"], error["detail"], **extra)

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
            Article.objects.visible_for_client_user(user)
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
            return api_error(
                status.HTTP_400_BAD_REQUEST,
                "VALIDATION_ERROR",
                "Impossible d’enregistrer l’article.",
                field_errors=serializer.errors,
            )

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

        article = Article.objects.visible_for_client_user(user).with_related().filter(id=article_id).first()

        if not article:
            return None, api_error(
                status.HTTP_404_NOT_FOUND,
                "ARTICLE_NOT_FOUND",
                "Article introuvable.",
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
            return api_error(
                status.HTTP_400_BAD_REQUEST,
                "VALIDATION_ERROR",
                "Impossible d’enregistrer l’article.",
                field_errors=serializer.errors,
            )

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
        actives_paid = list(Emoji.objects.filter(active=True).order_by("cost", "char"))

        owned_ids = []
        current_reaction = None

        current_user = get_current_app_user(request)
        if current_user:
            touch_last_seen(current_user)
            owned_ids = list(
                EmojiRight.objects.filter(user=current_user, emoji__active=True).values_list("emoji_id", flat=True)
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
            return api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Authentification requise.")
        if getattr(current_user, "is_guest", False):
            return api_error(status.HTTP_403_FORBIDDEN, "ACCOUNT_COMPLETION_REQUIRED", "Compte complet requis.")
        touch_last_seen(current_user)

        emoji_id = request.data.get("emoji_id")
        if not emoji_id:
            return api_error(status.HTTP_400_BAD_REQUEST, "EMOJI_ID_REQUIRED", "emoji_id manquant")

        emoji = Emoji.objects.filter(id=emoji_id).first()
        if not emoji or not emoji.active:
            return api_error(status.HTTP_404_NOT_FOUND, "EMOJI_NOT_FOUND", "Emoji indisponible")

        cost = int(emoji.cost or 0)

        with transaction.atomic():
            current_user = CustomUser.objects.select_for_update().get(pk=current_user.pk)

            if cost == 0:
                _, created = EmojiRight.objects.get_or_create(user=current_user, emoji=emoji)
                return Response(
                    {"ok": True, "owned": True, "created": bool(created), "points_balance": current_user.points},
                    status=status.HTTP_200_OK,
                )

            if EmojiRight.objects.filter(user=current_user, emoji=emoji).exists():
                return Response(
                    {"ok": True, "owned": True, "points_balance": current_user.points}, status=status.HTTP_200_OK
                )

            ok_points, payload_points, code_points = apply_points_delta(current_user, -cost, lock_user=False)
            if not ok_points:
                if payload_points.get("code") == "INSUFFICIENT_POINTS":
                    payload_points = {
                        **payload_points,
                        "detail": "Tu n’as assez de points pour débloquer cet émoji. Les dépôts te font gagner des points.",
                    }
                return Response(payload_points, status=code_points)

            EmojiRight.objects.create(user=current_user, emoji=emoji)
            return Response(
                {"ok": True, "owned": True, "points_balance": payload_points.get("points_balance")},
                status=status.HTTP_200_OK,
            )


class ClientAdminIncitationListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        today = localtime().date()
        payload = list_client_incitations(user, today)

        serializer = ClientAdminIncitationSerializer(
            payload["phrases"],
            many=True,
            context={"today": today, "overlap_counts": payload["overlap_counts"]},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        user, error_response = _get_active_client_user_or_response(request)
        if error_response:
            return error_response

        serializer = ClientAdminIncitationSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error(
                status.HTTP_400_BAD_REQUEST,
                "VALIDATION_ERROR",
                "Impossible d’enregistrer la phrase d’incitation.",
                field_errors=serializer.errors,
            )

        result, error = create_incitation(user, serializer, _coerce_bool(request.data.get("force_overlap")))
        if error:
            overlap_qs = error["overlap_qs"]
            overlap_serializer = ClientAdminIncitationSerializer(
                overlap_qs.select_related("client"),
                many=True,
                context={"today": localtime().date()},
            )
            return api_error(
                status.HTTP_409_CONFLICT,
                "INCITATION_OVERLAP",
                "La période se superpose avec une autre phrase d’incitation.",
                overlaps=overlap_serializer.data,
            )

        phrase = result["phrase"]
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

        phrase = get_incitation_or_none(user, incitation_id)

        if not phrase:
            return None, api_error(
                status.HTTP_404_NOT_FOUND,
                "INCITATION_NOT_FOUND",
                "Phrase d’incitation introuvable.",
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
            return api_error(
                status.HTTP_400_BAD_REQUEST,
                "VALIDATION_ERROR",
                "Impossible d’enregistrer la phrase d’incitation.",
                field_errors=serializer.errors,
            )

        result, error = update_incitation(phrase, serializer, _coerce_bool(request.data.get("force_overlap")))
        if error:
            overlap_qs = error["overlap_qs"]
            overlap_serializer = ClientAdminIncitationSerializer(
                overlap_qs.select_related("client"),
                many=True,
                context={"today": localtime().date()},
            )
            return api_error(
                status.HTTP_409_CONFLICT,
                "INCITATION_OVERLAP",
                "La période se superpose avec une autre phrase d’incitation.",
                overlaps=overlap_serializer.data,
            )

        phrase = result["phrase"]
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
