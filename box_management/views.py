# ===== Standard library =====
import json
import requests
from datetime import date, timedelta

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
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

# ===== Project =====
from api_aggregation.views import ApiAggregation
from users.models import CustomUser
from .models import (
    Box,
    Deposit,
    DiscoveredSong,
    Emoji,
    EmojiRight,
    LocationPoint,
    Reaction,
    Song,
)
from .serializers import BoxSerializer, SongSerializer, EmojiSerializer
from .utils import _calculate_distance, _build_successes, _build_deposits_payload, _get_prev_head_and_older



User = get_user_model()



# --- Helper pour réactions ---
def _reactions_summary_for_deposits(dep_ids):
    """Retourne {deposit_id: [{'emoji': '🔥', 'count': 3}, ...]}"""
    summary = {d: [] for d in dep_ids}
    if not dep_ids:
        return summary

    qs = (
        Reaction.objects
        .filter(deposit_id__in=dep_ids)
        .values('deposit_id', 'emoji__char')
        .annotate(count=Count('id'))
    )
    for row in qs:
        did = row['deposit_id']           # int (colonne _id)
        emoji_char = row['emoji__char']
        cnt = row['count']
        summary.setdefault(did, []).append({"emoji": emoji_char, "count": cnt})

    # Tri par count desc
    for did in summary:
        summary[did].sort(key=lambda x: x["count"], reverse=True)
    return summary


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
    """

    def get(self, request, box_url: str, *args, **kwargs):
            # 1) Box par URL (slug) → 404 si introuvable
            box = get_object_or_404(Box, url=box_url)
    
            # 2) Dernier dépôt pour cette box (relations + réactions préchargées)
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
            deposits = list(qs)  # 0..1
    
            # 3) Viewer (auth facultative)
            viewer = (
                request.user
                if (hasattr(request, "user")
                    and not isinstance(request.user, AnonymousUser)
                    and getattr(request.user, "is_authenticated", False))
                else None
            )
    
            # 3.5) Marquer comme découvert (idempotent)
            if viewer and deposits:
                # Cas mono-dépôt (performant et très lisible)
                dep = deposits[0]
                DiscoveredSong.objects.get_or_create(
                    user=viewer,
                    deposit=dep,
                    defaults={"discovered_type": "main"},
                )
    
            # 4) Payload via utils (zéro re-get)
            payload = _build_deposits_payload(deposits, viewer=viewer, include_user=True)
    
            # 5) Retourne une liste (vide ou 1 élément)
            return Response(payload, status=status.HTTP_200_OK)

class GetBox(APIView):
    lookup_url_kwarg = "name"
    serializer_class = BoxSerializer

    # --------- GET ---------
    """
    GET /box-management/get-box/?name=<slug>
    → Retourne les infos principales d'une box (nom, nombre de dépôts, date du dernier dépôt).
    """

    def get(self, request, format=None):
        slug = request.GET.get("name")  # ✅ param GET "name"
        if not slug:
            return Response(
                {"detail": "Merci de spécifier le nom d'une boîte (paramètre ?name=)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # On enrichit avec le nombre de dépôts et la date du dernier
        box = (
            Box.objects
            .filter(url=slug)
            .annotate(
                deposit_count=Count("deposits"),
                last_deposit_at=Max("deposits__deposited_at"),
            )
            .only("name")
            .first()
        )

        if not box:
            return Response(
                {"detail": "Désolé. Cette boîte n'existe pas."},
                status=status.HTTP_404_NOT_FOUND,
            )

        last_deposit_date = (
            naturaltime(localtime(box.last_deposit_at))
            if box.last_deposit_at else None
        )

        data = {
            "name": box.name,
            "deposit_count": box.deposit_count,
            "last_deposit_date": last_deposit_date,
        }
        return Response(data, status=status.HTTP_200_OK)

    
    # --------- POST (création d’un dépôt) ---------
    def post(self, request, format=None):
        """
        Étapes simplifiées :
          1) Snapshot avant création (prev_head + older)
          2) Upsert Song (transaction atomique)
          3) Calcul des succès / points à partir de l'instance Song
          4) Création du Deposit
          5) Créditer les points via /users/add-points (best-effort)
          6) Répondre : {"successes": [...], "older_deposits": [...], "points_balance": <int|None>}
        """
        # --- 0) Lecture & validations minimales
        option = request.data.get("option") or {}
        box_slug = request.data.get("boxSlug")
        if not box_slug:
            return Response(
                {"detail": "boxSlug manquant"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        box = Box.objects.filter(url=box_slug).first()
        if not box:
            return Response(
                {"detail": "Boîte introuvable"},
                status=status.HTTP_404_NOT_FOUND,
            )

        song_name = (option.get("name") or "").strip()
        song_author = (option.get("artist") or "").strip()

        try:
            song_platform_id = int(option.get("platform_id"))
        except (TypeError, ValueError):
            song_platform_id = None

        incoming_url = option.get("url")
        if not song_name or not song_author:
            return Response(
                {"detail": "Titre ou artiste manquant"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # User courant (peut être anonyme)
        user = request.user if not isinstance(request.user, AnonymousUser) else None

        # --- 1) ÉTAT AVANT CRÉATION : prev_head + 15 précédents (payload older_deposits)
        prev_head, older_deposits_qs = _get_prev_head_and_older(box, limit=15)

        # --- 2) Upsert Song + calcul des succès + création Deposit (atomique ensemble)
        with transaction.atomic():
            # 2.a) Upsert Song
            try:
                song = Song.objects.get(
                    title__iexact=song_name,
                    artist__iexact=song_author,
                )
                song.n_deposits = (song.n_deposits or 0) + 1
            except Song.DoesNotExist:
                song = Song(
                    song_id=option.get("id"),
                    title=song_name,
                    artist=song_author,
                    image_url=option.get("image_url") or "",
                    duration=option.get("duration") or 0,
                )

            # URL de la plateforme utilisée
            if song_platform_id == 1 and incoming_url:
                song.spotify_url = incoming_url
            elif song_platform_id == 2 and incoming_url:
                song.deezer_url = incoming_url

            # Compléter l'autre URL via agrégateur (best-effort)
            try:
                request_platform = None
                if song_platform_id == 1 and not song.deezer_url:
                    request_platform = "deezer"
                elif song_platform_id == 2 and not song.spotify_url:
                    request_platform = "spotify"

                if request_platform:
                    aggreg_url = request.build_absolute_uri(reverse("api_agg:aggreg"))
                    payload = {
                        "song": {
                            "title": song.title,
                            "artist": song.artist,
                            "duration": song.duration,
                        },
                        "platform": request_platform,
                    }
                    headers = {
                        "Content-Type": "application/json",
                        "X-CSRFToken": get_token(request),
                    }
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
                # best-effort : on ne bloque pas le dépôt si l'agrégateur plante
                pass

            song.save()

            # 2.b) Calcul des succès / points à partir de l'instance Song (optimisée)
            successes, points_to_add = _build_successes(
                box=box,
                user=user,
                song=song,
            )

            # 2.c) Création du Deposit APRES calcul des succès (pour ne pas biaiser les "first")
            new_deposit = Deposit.objects.create(song=song, box=box, user=user)

        # --- 3) Créditer les points via endpoint (best-effort) et récupérer le solde
        points_balance = None
        try:
            if user and getattr(user, "is_authenticated", False):
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
                        # JSON invalide → on laisse points_balance à None
                        points_balance = None
        except Exception:
            # silencieux : on ne casse pas le dépôt si l'ajout de points échoue
            pass

        # --- 4) Sérialisation des résultats pour le frontend ----
        older_deposits = _build_deposits_payload(
            older_deposits_qs,
            viewer=user,
            include_user=True,
        )

        response = {
            "successes": list(successes),
            "points_balance": points_balance,
            "older_deposits": older_deposits,
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

        # Box via son slug/url
        box = get_object_or_404(Box, url=box_url)

        # Points de localisation liés à la box
        points = LocationPoint.objects.filter(box=box)
        if not points.exists():
            return Response({"error": "No location points for this box"}, status=status.HTTP_404_NOT_FOUND)

        # Vérification de la distance pour chaque point
        for point in points:
            max_dist = point.dist_location  # rayon admissible (en mètres)
            target_lat = point.latitude
            target_lng = point.longitude
            dist = _calculate_distance(latitude, longitude, target_lat, target_lng)
            if dist <= max_dist:
                # ✅ Localisation OK → HTTP 200 sans payload obligatoire
                return Response(status=status.HTTP_200_OK)

        # ❌ Trop loin → HTTP 403
        return Response({"error": "Tu n'est pas à coté de la boîte"}, status=status.HTTP_403_FORBIDDEN)




class ManageDiscoveredSongs(APIView):
    """
    POST: enregistrer une découverte pour un dépôt donné (deposit_id) et un type (main/revealed).
    GET : renvoie des **sessions** de découvertes, groupées par connexion à une boîte.
    """

    def post(self, request):
        user = request.user
        if not user.is_authenticated:
            return Response(
                {'error': 'Vous devez être connecté pour effectuer cette action.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        deposit_id = request.data.get('deposit_id')
        if not deposit_id:
            return Response({'error': 'Identifiant de dépôt manquant.'}, status=status.HTTP_400_BAD_REQUEST)

        discovered_type = request.data.get('discovered_type') or "revealed"
        if discovered_type not in ("main", "revealed"):
            discovered_type = "revealed"

        try:
            deposit = Deposit.objects.select_related('song_id').get(pk=deposit_id)
        except Deposit.DoesNotExist:
            return Response({'error': "Dépôt introuvable."}, status=status.HTTP_404_NOT_FOUND)

        if DiscoveredSong.objects.filter(user_id=user, deposit_id=deposit).exists():
            return Response({'error': 'Ce dépôt est déjà découvert.'}, status=status.HTTP_400_BAD_REQUEST)

        DiscoveredSong.objects.create(
            user_id=user,
            deposit_id=deposit,
            discovered_type=discovered_type
        )
        return Response({'success': True}, status=status.HTTP_200_OK)

    def get(self, request):
        user = request.user
        if not user.is_authenticated:
            return Response(
                {'error': 'Vous devez être connecté pour effectuer cette action.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # --- Params pagination (par sessions)
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

        # --- Helpers mapping (alignés sur GetBox)
        def map_user(u):
            if not u or isinstance(u, AnonymousUser):
                return None
            full_name = u.get_full_name() if hasattr(u, "get_full_name") else ""
            display_name = getattr(u, "username", None)
            profile_pic_url = None
            if getattr(u, "profile_picture", None):
                try:
                    profile_pic_url = u.profile_picture.url
                except Exception:
                    profile_pic_url = None
            return {"id": getattr(u, "id", None), "name": display_name, "profile_pic_url": profile_pic_url}

        def map_song_full(s, include_id=True):
            if not s:
                return {"title": None, "artist": None, "spotify_url": None, "deezer_url": None, "img_url": None}
            payload = {
                "title": getattr(s, "title", None),
                "artist": getattr(s, "artist", None),
                "spotify_url": getattr(s, "spotify_url", None),
                "deezer_url": getattr(s, "deezer_url", None),
                "img_url": getattr(s, "image_url", None),
            }
            if include_id:
                payload["id"] = getattr(s, "id", None)
            return payload

        def deposit_payload(ds_obj):
            dep = ds_obj.deposit_id
            s = dep.song_id
            u = dep.user
            return {
                "type": ds_obj.discovered_type,
                "discovered_at": ds_obj.discovered_at.isoformat(),
                "deposit_id": dep.id,
                "deposit_date": naturaltime(localtime(getattr(dep, "deposited_at", None))) if getattr(dep, "deposited_at", None) else None,
                "song": map_song_full(s, include_id=True),
                "user": map_user(u),
            }

        # --- 1) Flux complet trié par discovered_at ASC (chronologie réelle)
        events = list(
            DiscoveredSong.objects
            .filter(user_id=user)
            .select_related('deposit_id', 'deposit_id__song_id', 'deposit_id__user', 'deposit_id__box_id')
            .order_by('discovered_at', 'id')  # ASC, puis tie-break sur id
        )

        # Indices des mains (ASC)
        main_indices = [i for i, e in enumerate(events) if e.discovered_type == "main"]

        sessions_all = []
        consumed = [False] * len(events)

        # --- 2) Sessions pilotées par 'main'
        for idx, mi in enumerate(main_indices):
            main_ds = events[mi]
            box = main_ds.deposit_id.box_id
            start = main_ds.discovered_at
            deadline = start + timedelta(seconds=3600)
            end = main_indices[idx + 1] if (idx + 1) < len(main_indices) else len(events)

            deposits = [deposit_payload(main_ds)]
            consumed[mi] = True

            # revealed après le main, même box, <= +1h, avant le prochain main
            for j in range(mi + 1, end):
                ds = events[j]
                if ds.discovered_type != "revealed":
                    continue
                if ds.deposit_id.box_id.id != box.id:
                    continue
                if ds.discovered_at <= deadline:
                    deposits.append(deposit_payload(ds))
                    consumed[j] = True

            sessions_all.append({
                "session_id": str(main_ds.id),
                "box": {"id": box.id, "name": box.name, "url": box.url},
                "started_at": start.isoformat(),
                "deposits": deposits,
            })

        # --- 3) Sessions orphelines
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
            box = start_ds.deposit_id.box_id
            start = start_ds.discovered_at
            deadline = start + timedelta(seconds=3600)
            stop_at = next_main_pos_from[i] if next_main_pos_from[i] is not None else len(events)

            deposits = [deposit_payload(start_ds)]
            consumed[i] = True

            j = i + 1
            while j is not None and j < stop_at:
                if consumed[j]:
                    j += 1
                    continue
                ds2 = events[j]
                if ds2.discovered_type == "revealed" and ds2.deposit_id.box_id.id == box.id and ds2.discovered_at <= deadline:
                    deposits.append(deposit_payload(ds2))
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
                "deposits": deposits,
            })
            orph_counter += 1
            i = j if j is not None else (i + 1)

        # --- 4) Tri global et pagination
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


class RevealSong(APIView):
    """
    POST /box-management/revealSong
    Body: { "deposit_id": <int> }
    200: { "song": {...}, "points_balance": <int|None> }
    """

    def post(self, request, format=None):
        # 1) Auth requise
        user = request.user
        if not user.is_authenticated:
            return Response(
                {"detail": "Authentification requise."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # 2) Paramètres
        deposit_id = request.data.get("deposit_id")
        if not deposit_id:
            return Response(
                {"detail": "deposit_id manquant"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 3) Récupérer le dépôt + chanson
        try:
            # ✅ on utilise bien le nom du champ FK: "song"
            deposit = Deposit.objects.select_related("song").get(pk=deposit_id)
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

        # 4) Coût de la révélation
        cost = int(COST_REVEAL_BOX)

        # 5) Débit des points via AddUserPoints
        #    → si échec ou fonds insuffisants, on s'arrête ici.

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
            # ⚠️ IMPORTANT :
            # Le nom 'add-points' doit pointer vers la vue AddUserPoints.
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

            # Cas 5.1 : fonds insuffisants → on propage directement la réponse
            if r.status_code == 400 and points_payload.get("error") == "insufficient_funds":
                # Exemple de payload renvoyé par AddUserPoints :
                # {
                #   "error": "insufficient_funds",
                #   "message": "Pas assez de points pour effectuer cette action.",
                #   "points_balance": <int>
                # }
                return Response(points_payload, status=status.HTTP_400_BAD_REQUEST)

            # Cas 5.2 : autre erreur → 502 générique
            if not r.ok:
                return Response(
                    {"detail": "Oops une erreur s’est produite, réessayez dans quelques instants."},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

        except Exception:
            return Response(
                {"detail": "Oops une erreur s’est produite, réessayez dans quelques instants."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # Ici, AddUserPoints a renvoyé 200 → débit OK, on récupère points_balance
        points_balance = points_payload.get("points_balance")

        # 6) Enregistrer la découverte (DiscoveredSong)
        try:
            discover_url = request.build_absolute_uri("/box-management/discovered-songs")
            r2 = requests.post(
                discover_url,
                cookies=cookies,
                headers=headers_bg,
                data=json.dumps({"deposit_id": deposit_id, "discovered_type": "revealed"}),
                timeout=4,
            )
            # 400 = déjà découvert → on ne bloque pas
            if not r2.ok and r2.status_code != 400:
                return Response(
                    {"detail": "Erreur lors de l’enregistrement de la découverte."},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
        except Exception:
            return Response(
                {"detail": "Erreur lors de l’enregistrement de la découverte."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # 7) Réponse finale au frontend
        data = {
            "song": {
                "title": song.title,
                "artist": song.artist,
                "spotify_url": song.spotify_url,
                "deezer_url": song.deezer_url,
                # tu peux renvoyer image_url aussi, le frontend le gère déjà
                "image_url": song.image_url,
            },
            "points_balance": points_balance,
        }
        return Response(data, status=status.HTTP_200_OK)


class UserDepositsView(APIView):
    permission_classes = []  # public

    def get(self, request):
        # 1) Lecture & validation du paramètre user_id
        raw_user_id = (request.GET.get("user_id") or "").strip()
        if not raw_user_id:
            return Response({"errors": ["Pas d'utilisateur spécifié"]}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user_id = int(raw_user_id)
        except ValueError:
            return Response({"errors": ["Pas d'utilisateur spécifié"]}, status=status.HTTP_400_BAD_REQUEST)

        # 2) Vérification que l'utilisateur existe
        target_user = User.objects.filter(id=user_id).first()
        if not target_user:
            return Response({"errors": ["Utilisateur inexistant"]}, status=status.HTTP_404_NOT_FOUND)

        # 3) Récupération des 500 dépôts les plus récents
        deposits = (
            Deposit.objects
            .filter(user_id=user_id)
            .select_related("song_id", "box_id")
            .order_by("-deposited_at")[:500]
        )

        if not deposits:
            return Response([], status=status.HTTP_200_OK)

        # 4) Préparer les IDs pour récupérer les réactions en une seule requête
        dep_ids = [d.id for d in deposits]
        reactions_by_dep = _reactions_summary_for_deposits(dep_ids)

        # 5) Construction de la réponse JSON
        response_data = []
        for deposit in deposits:
            song = getattr(deposit, "song_id", None)
            box = getattr(deposit, "box_id", None)
            deposited_at = getattr(deposit, "deposited_at", None)

            title = getattr(song, "title", None)
            artist = getattr(song, "artist", None)
            img_url = getattr(song, "image_url", None)
            box_name = getattr(box, "name", None)

            response_data.append({
                "deposit_id": getattr(deposit, "id", None),
                "deposit_date": deposited_at.isoformat() if deposited_at else None,
                "box_name": box_name,
                "song": {
                    "title": title,
                    "artist": artist,
                    "img_url": img_url,
                },
                "reactions_summary": reactions_by_dep.get(deposit.id, []),
            })

        return Response(response_data, status=status.HTTP_200_OK)


# ==========================================================
# EMOJIS & REACTIONS
# ==========================================================

class EmojiCatalogView(APIView):
    """
    GET /box-management/emojis/catalog
    ?deposit_id=<int> (optionnel) pour retourner aussi la réaction courante
    """
    permission_classes = []

    def get(self, request):
        deposit_id = request.GET.get("deposit_id")
        basics = list(Emoji.objects.filter(active=True, basic=True).order_by('char'))
        actives_paid = list(Emoji.objects.filter(active=True, basic=False).order_by('cost', 'char'))

        owned_ids = []
        current_reaction = None

        if request.user.is_authenticated:
            # Emojis déjà possédés
            owned_ids = list(
                EmojiRight.objects.filter(user=request.user, emoji__active=True)
                .values_list('emoji_id', flat=True)
            )

            # Emoji actuellement sélectionné sur ce dépôt
            if deposit_id:
                r = Reaction.objects.filter(user=request.user, deposit_id=deposit_id).select_related("emoji").first()
                if r:
                    current_reaction = {"emoji": r.emoji.char, "id": r.emoji.id}

        data = {
            "basic": EmojiSerializer(basics, many=True).data,
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
        if emoji.basic:
            return Response({"ok": True, "owned": True}, status=status.HTTP_200_OK)

        if EmojiRight.objects.filter(user=request.user, emoji=emoji).exists():
            return Response({"ok": True, "owned": True}, status=status.HTTP_200_OK)

        cost = int(emoji.cost or 0)
        request.user.refresh_from_db(fields=["points"])
        if getattr(request.user, "points", 0) < cost:
            return Response({"error": "insufficient_funds", "message": "Crédits insuffisants"}, status=status.HTTP_400_BAD_REQUEST)

        # Débiter points
        csrf_token = get_token(request)
        origin = request.build_absolute_uri("/")
        headers_bg = {
            "Content-Type": "application/json",
            "X-CSRFToken": csrf_token,
            "Referer": origin,
            "Origin": origin.rstrip("/"),
        }
        r = requests.post(
            request.build_absolute_uri(reverse('add-points')),
            cookies=request.COOKIES,
            headers=headers_bg,
            data=json.dumps({"points": -cost}),
            timeout=4,
        )
        if not r.ok:
            return Response({"detail": "Erreur débit points"}, status=status.HTTP_502_BAD_GATEWAY)

        EmojiRight.objects.create(user=request.user, emoji=emoji)
        request.user.refresh_from_db(fields=["points"])
        return Response({"ok": True, "owned": True, "points_balance": getattr(request.user, "points", None)}, status=status.HTTP_200_OK)


class ReactionView(APIView):
    """
    POST /box-management/reactions
    Body: { "deposit_id": <int>, "emoji_id": <int|null|\"none\"> }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        deposit_id = request.data.get("deposit_id")
        emoji_id = request.data.get("emoji_id")

        if not deposit_id:
            return Response({"detail": "deposit_id manquant"}, status=status.HTTP_400_BAD_REQUEST)

        deposit = Deposit.objects.filter(id=deposit_id).first()
        if not deposit:
            return Response({"detail": "Dépôt introuvable"}, status=status.HTTP_404_NOT_FOUND)

        # suppression ("none")
        if emoji_id in (None, "", 0, "none"):
            Reaction.objects.filter(user=request.user, deposit=deposit).delete()
            summary = _reactions_summary_for_deposits([deposit.id]).get(deposit.id, [])
            return Response({"my_reaction": None, "reactions_summary": summary}, status=status.HTTP_200_OK)

        emoji = Emoji.objects.filter(id=emoji_id, active=True).first()
        if not emoji:
            return Response({"detail": "Emoji invalide"}, status=status.HTTP_404_NOT_FOUND)

        # ✅ Pas de check de droit si basic OU cost==0
        if not (emoji.basic or (emoji.cost or 0) == 0):
            has_right = EmojiRight.objects.filter(user=request.user, emoji=emoji).exists()
            if not has_right:
                return Response({"error": "forbidden", "message": "Emoji non débloqué"}, status=status.HTTP_403_FORBIDDEN)

        obj, created = Reaction.objects.get_or_create(
            user=request.user, deposit=deposit, defaults={"emoji": emoji}
        )
        if not created and obj.emoji_id != emoji.id:
            obj.emoji = emoji
            obj.save(update_fields=["emoji", "updated_at"])

        summary = _reactions_summary_for_deposits([deposit.id]).get(deposit.id, [])
        my = {"emoji": emoji.char, "reacted_at": obj.created_at.isoformat()}
        return Response({"my_reaction": my, "reactions_summary": summary}, status=status.HTTP_200_OK)


















