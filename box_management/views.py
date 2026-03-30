# ===== Standard library =====
import json

import requests

# ===== Django =====
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.contrib.humanize.templatetags.humanize import naturaltime
from django.db import transaction
from django.db.models import Count, Max, Prefetch, Q
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils.timezone import localtime

# ===== Django REST Framework =====
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

# ===== Project =====
from api_aggregation.views import ApiAggregation
from users.models import CustomUser
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
    _reactions_summary_for_deposits,
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
    _get_active_incitation_for_box,
    _build_incitation_overlap_counts,
    _get_incitation_overlap_queryset,
    _coerce_bool,
    DEFAULT_FLOWBOX_SEARCH_INCITATION_TEXT,
)

# Barèmes & coûts (importés depuis ton module utils global)
from utils import (
    COST_REVEAL_BOX,
)

User = get_user_model()


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

        viewer = (
            request.user
            if (
                hasattr(request, "user")
                and not isinstance(request.user, AnonymousUser)
                and getattr(request.user, "is_authenticated", False)
            )
            else None
        )

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

        active_incitation = _get_active_incitation_for_box(box)

        data = {
            "name": box.name,
            "client_slug": box.client.slug if box.client else None,
            "deposit_count": box.deposit_count,
            "last_deposit_date": last_deposit_date,
            "last_deposit_song_image_url": last_deposit_song_image_url,
            "active_incitation": (
                {
                    "id": active_incitation.id,
                    "text": active_incitation.text,
                    "start_date": active_incitation.start_date.isoformat(),
                    "end_date": active_incitation.end_date.isoformat(),
                }
                if active_incitation
                else None
            ),
            "search_incitation_text": (
                active_incitation.text
                if active_incitation
                else DEFAULT_FLOWBOX_SEARCH_INCITATION_TEXT
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

        incoming_url = option.get("url")
        if not song_name or not song_author:
            return Response({"detail": "Titre ou artiste manquant"}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user if not isinstance(request.user, AnonymousUser) else None
        is_authed = bool(user and getattr(user, "is_authenticated", False))

        prev_head, older_list = _get_prev_head_and_older(box, limit=15)

        with transaction.atomic():
            try:
                song = Song.objects.get(title__iexact=song_name, artist__iexact=song_author)
                song.n_deposits = (song.n_deposits or 0) + 1
            except Song.DoesNotExist:
                song = Song(
                    song_id=option.get("id"),
                    title=song_name,
                    artist=song_author,
                    image_url=option.get("image_url") or "",
                    duration=option.get("duration") or 0,
                )

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

        if is_authed and prev_head is not None:
            try:
                DiscoveredSong.objects.get_or_create(
                    user=user,
                    deposit=prev_head,
                    defaults={"discovered_type": "main"},
                )
            except Exception:
                pass

        points_balance = None
        if is_authed:
            try:
                add_points_url = request.build_absolute_uri(reverse("add-points"))
                csrftoken_cookie = request.COOKIES.get("csrftoken")
                csrftoken_header = csrftoken_cookie or get_token(request)

                headers_bg = {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrftoken_header,
                    "Referer": request.build_absolute_uri("/"),
                }
                r = requests.post(
                    add_points_url,
                    cookies=request.COOKIES,
                    headers=headers_bg,
                    data=json.dumps({"points": points_to_add}),
                    timeout=4,
                )
                if r.ok:
                    try:
                        data = r.json()
                        points_balance = data.get("points_balance")
                    except ValueError:
                        points_balance = None
            except Exception:
                pass

        deps_to_serialize = []
        if prev_head is not None:
            deps_to_serialize.append(prev_head)
        deps_to_serialize.extend(older_list)

        force_ids = []
        if prev_head is not None and not is_authed:
            force_ids = [prev_head.pk]

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

        response = {
            "main": main_payload,
            "older_deposits": older_payloads,
            "successes": list(successes),
            "points_balance": points_balance,
        }
        return Response(response, status=status.HTTP_200_OK)


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
        user = request.user
        if not user.is_authenticated:
            return Response(
                {"detail": "Authentification requise."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        public_key = request.data.get("dep_public_key")
        if not public_key:
            return Response(
                {"detail": "Clé publique manquante"},
                status=status.HTTP_400_BAD_REQUEST,
            )

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

        cost = int(COST_REVEAL_BOX)

        csrf_token = get_token(request)
        origin = request.build_absolute_uri("/")

        headers_bg = {
            "Content-Type": "application/json",
            "X-CSRFToken": csrf_token,
            "Referer": origin,
            "Origin": origin.rstrip("/"),
        }
        cookies = request.COOKIES

        try:
            add_points_url = request.build_absolute_uri(reverse("add-points"))

            r = requests.post(
                add_points_url,
                cookies=cookies,
                headers=headers_bg,
                data=json.dumps({"points": -cost}),
                timeout=4,
            )

            try:
                points_payload = r.json()
            except ValueError:
                points_payload = {}

            if r.status_code != 200:
                return Response(points_payload, status=r.status_code)

        except Exception:
            return Response(
                {"detail": "Oops une erreur s’est produite, réessayez dans quelques instants."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        points_balance = points_payload.get("points_balance")

        try:
            DiscoveredSong.objects.get_or_create(
                user=user,
                deposit=deposit,
                defaults={"discovered_type": "revealed"},
            )
        except Exception:
            return Response(
                {"detail": "Erreur lors de l’enregistrement de la découverte."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

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
        user = request.user
        if not user.is_authenticated:
            return Response(
                {"error": "Vous devez être connecté pour effectuer cette action."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        deposit_id = request.data.get("deposit_id")
        if not deposit_id:
            return Response(
                {"error": "Identifiant de dépôt manquant."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        discovered_type = request.data.get("discovered_type") or "revealed"
        if discovered_type not in ("main", "revealed"):
            discovered_type = "revealed"

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
        )

        return Response({"success": True}, status=status.HTTP_200_OK)

    def get(self, request):
        user = request.user
        if not user.is_authenticated:
            return Response(
                {"error": "Vous devez être connecté pour effectuer cette action."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

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
                "discovered_at": ds_obj.discovered_at.isoformat(),
                "deposit_id": dep.pk,
            }

        main_indices = [i for i, e in enumerate(events) if e.discovered_type == "main"]

        sessions_all = []
        consumed = [False] * len(events)

        for idx, mi in enumerate(main_indices):
            main_ds = events[mi]
            box = main_ds.deposit.box
            start = main_ds.discovered_at
            deadline = start + timedelta(seconds=3600)
            end = main_indices[idx + 1] if (idx + 1) < len(main_indices) else len(events)

            deposits_list = [deposit_payload(main_ds)]
            consumed[mi] = True

            for j in range(mi + 1, end):
                ds = events[j]
                if ds.discovered_type != "revealed":
                    continue
                if ds.deposit.box_id != box.id:
                    continue
                if ds.discovered_at <= deadline:
                    deposits_list.append(deposit_payload(ds))
                    consumed[j] = True

            sessions_all.append({
                "session_id": str(main_ds.id),
                "box": {"id": box.id, "name": box.name, "url": box.url},
                "started_at": start.isoformat(),
                "deposits": deposits_list,
            })

        next_main_pos_from = [None] * len(events)
        next_idx = None
        for i in range(len(events) - 1, -1, -1):
            next_main_pos_from[i] = next_idx
            if events[i].discovered_type == "main":
                next_idx = i

        orph_counter = 0
        i = 0
        while i < len(events):
            if consumed[i] or events[i].discovered_type != "revealed":
                i += 1
                continue

            start_ds = events[i]
            box = start_ds.deposit.box
            start = start_ds.discovered_at
            deadline = start + timedelta(seconds=3600)
            stop_at = next_main_pos_from[i] if next_main_pos_from[i] is not None else len(events)

            deposits_list = [deposit_payload(start_ds)]
            consumed[i] = True

            j = i + 1
            while j is not None and j < stop_at:
                if consumed[j]:
                    j += 1
                    continue
                ds2 = events[j]
                if (
                    ds2.discovered_type == "revealed"
                    and ds2.deposit.box_id == box.id
                    and ds2.discovered_at <= deadline
                ):
                    deposits_list.append(deposit_payload(ds2))
                    consumed[j] = True
                    j += 1
                    continue
                if ds2.discovered_type == "main":
                    break
                j += 1

            sessions_all.append({
                "session_id": f"orph-{orph_counter}",
                "box": {"id": box.id, "name": box.name, "url": box.url},
                "started_at": start.isoformat(),
                "deposits": deposits_list,
            })
            orph_counter += 1
            i = j if j is not None else (i + 1)

        sessions_all.sort(key=lambda s: s["started_at"], reverse=True)

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


class AddUserPoints(APIView):
    """
    Class goal : add (or delete) points to the connected user.
    """
    def post(self, request, format=None):
        if not request.user.is_authenticated:
            return Response(
                {"errors": "Utilisateur non connecté."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = request.user
        points = request.data.get("points")

        if points is None:
            return Response(
                {"errors": "Nombre de points invalide."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            points = int(points)
        except (TypeError, ValueError):
            return Response(
                {"errors": "Nombre de points invalide."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user.refresh_from_db(fields=["points"])
        except Exception:
            user.refresh_from_db()

        current = getattr(user, "points", 0)
        new_balance = current + points

        if new_balance < 0:
            return Response(
                {
                    "error": "insufficient_funds",
                    "message": "Pas assez de points pour effectuer cette action.",
                    "points_balance": current,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.points = new_balance
        user.save(update_fields=["points"])

        return Response(
            {
                "status": "Points mis à jour avec succès.",
                "points_balance": user.points,
            },
            status=status.HTTP_200_OK,
        )


class UserDepositsView(APIView):
    permission_classes = []

    def get(self, request):
        """
        GET /box-management/user-deposits?username=<str>&limit=<int>&offset=<int>
        """

        raw_username = (request.GET.get("username") or "").strip()
        if not raw_username:
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

        target_user = User.objects.filter(username__iexact=raw_username).first()
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

        viewer = request.user if getattr(request.user, "is_authenticated", False) else None

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
    permission_classes = [IsAuthenticated]

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
    permission_classes = [IsAuthenticated]

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

        if request.user.is_authenticated:
            owned_ids = list(
                EmojiRight.objects.filter(user=request.user, emoji__active=True)
                .values_list("emoji_id", flat=True)
            )

            if dep_public_key:
                r = (
                    Reaction.objects.filter(
                        user=request.user,
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
    permission_classes = [IsAuthenticated]

    def post(self, request):
        emoji_id = request.data.get("emoji_id")
        if not emoji_id:
            return Response({"detail": "emoji_id manquant"}, status=status.HTTP_400_BAD_REQUEST)

        emoji = Emoji.objects.filter(id=emoji_id).first()
        if not emoji or not emoji.active:
            return Response({"detail": "Emoji indisponible"}, status=status.HTTP_404_NOT_FOUND)
        if emoji.cost == 0:
            return Response({"ok": True, "owned": True}, status=status.HTTP_200_OK)

        if EmojiRight.objects.filter(user=request.user, emoji=emoji).exists():
            return Response({"ok": True, "owned": True}, status=status.HTTP_200_OK)

        cost = int(emoji.cost or 0)
        request.user.refresh_from_db(fields=["points"])
        if getattr(request.user, "points", 0) < cost:
            return Response(
                {"error": "insufficient_funds", "message": "Crédits insuffisants"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        csrf_token = get_token(request)
        origin = request.build_absolute_uri("/")
        headers_bg = {
            "Content-Type": "application/json",
            "X-CSRFToken": csrf_token,
            "Referer": origin,
            "Origin": origin.rstrip("/"),
        }
        r = requests.post(
            request.build_absolute_uri(reverse("add-points")),
            cookies=request.COOKIES,
            headers=headers_bg,
            data=json.dumps({"points": -cost}),
            timeout=4,
        )
        if not r.ok:
            return Response({"detail": "Erreur débit points"}, status=status.HTTP_502_BAD_GATEWAY)

        EmojiRight.objects.create(user=request.user, emoji=emoji)
        request.user.refresh_from_db(fields=["points"])
        return Response(
            {"ok": True, "owned": True, "points_balance": getattr(request.user, "points", None)},
            status=status.HTTP_200_OK,
        )


class ReactionView(APIView):
    """
    POST /box-management/reactions
    Body: { "dep_public_key": "<str>", "emoji_id": <int|null|"none"> }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
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

        if emoji_id in (None, "", 0, "none"):
            Reaction.objects.filter(user=request.user, deposit=deposit).delete()
            summary = _reactions_summary_for_deposits([deposit.id]).get(
                deposit.id, []
            )
            return Response(
                {"my_reaction": None, "reactions_summary": summary},
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
                user=request.user, emoji=emoji
            ).exists()
            if not has_right:
                return Response(
                    {"error": "forbidden", "message": "Emoji non débloqué"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        obj, created = Reaction.objects.get_or_create(
            user=request.user,
            deposit=deposit,
            defaults={"emoji": emoji},
        )
        if not created and obj.emoji_id != emoji.id:
            obj.emoji = emoji
            obj.save(update_fields=["emoji", "updated_at"])

        summary = _reactions_summary_for_deposits([deposit.id]).get(
            deposit.id, []
        )
        my = {"emoji": emoji.char, "reacted_at": obj.created_at.isoformat()}
        return Response(
            {"my_reaction": my, "reactions_summary": summary},
            status=status.HTTP_200_OK,
        )


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
