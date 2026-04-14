import { getCookie } from "../../Security/TokensUtils";

export const SUPPORTED_PROVIDER_CODES = ["spotify", "deezer"];
export const PERSONALIZED_SEARCH_PROVIDER_CODES = ["spotify"];
export const SERVER_SEARCH_PROVIDER_CODE = "spotify";

export const getProviderConnection = (user, providerCode) => {
  if (!user || !providerCode) return null;
  return user?.provider_connections?.[providerCode] || null;
};

export const isProviderConnected = (user, providerCode) => {
  return Boolean(getProviderConnection(user, providerCode)?.connected);
};

export const getConnectedPersonalizedProviderCodes = (user) => {
  return PERSONALIZED_SEARCH_PROVIDER_CODES.filter((providerCode) => {
    const connection = getProviderConnection(user, providerCode);
    return Boolean(connection?.connected && connection?.access_token);
  });
};

const normalizeSpotifyTrack = (item) => {
  const album = item?.album || {};
  const images = Array.isArray(album?.images) ? album.images : [];
  const imageUrl = images[0]?.url || "";
  const image64 = images.find((img) => img?.height === 64);
  const artists = Array.isArray(item?.artists)
    ? item.artists.map((artist) => artist?.name).filter(Boolean)
    : [];

  return {
    provider_code: "spotify",
    provider_track_id: item?.id || "",
    provider_url:
      item?.external_urls?.spotify || (item?.id ? `https://open.spotify.com/track/${item.id}` : ""),
    provider_uri: item?.uri || (item?.id ? `spotify:track:${item.id}` : ""),
    id: item?.id || "",
    name: item?.name || "",
    title: item?.name || "",
    artists,
    artist: artists.join(", "),
    duration: Math.round((item?.duration_ms || 0) / 1000),
    image_url: imageUrl,
    image_url_small: image64?.url || images[images.length - 1]?.url || imageUrl,
    isrc: item?.external_ids?.isrc || "",
  };
};

const normalizeDeezerTrack = (item) => {
  const album = item?.album || {};
  const contributors = Array.isArray(item?.contributors) ? item.contributors : [];
  const artists = contributors.length
    ? contributors.map((artist) => artist?.name).filter(Boolean)
    : [item?.artist?.name].filter(Boolean);

  return {
    provider_code: "deezer",
    provider_track_id: item?.id ? String(item.id) : "",
    provider_url: item?.link || (item?.id ? `https://www.deezer.com/track/${item.id}` : ""),
    provider_uri: item?.id ? `deezer:track:${item.id}` : "",
    id: item?.id ? String(item.id) : "",
    name: item?.title || "",
    title: item?.title || "",
    artists,
    artist: artists.join(", "),
    duration: Number(item?.duration || 0),
    image_url: album?.cover_medium || album?.cover_big || album?.cover || "",
    image_url_small: album?.cover_small || album?.cover_medium || album?.cover || "",
    isrc: item?.isrc || "",
  };
};

export const searchTracksViaBackend = async (providerCode, query, options = {}) => {
  const csrftoken = getCookie("csrftoken");
  const response = await fetch(`/${providerCode}/search`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrftoken,
    },
    body: JSON.stringify({ search_query: query }),
    signal: options.signal,
  });
  const json = await response.json().catch(() => []);
  return Array.isArray(json) ? json : [];
};

export const fetchRecentPlaysViaBackend = async (providerCode, options = {}) => {
  const response = await fetch(`/${providerCode}/recent-tracks`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal: options.signal,
  });
  const json = await response.json().catch(() => []);
  return Array.isArray(json) ? json : [];
};

export const searchTracksViaProviderClient = async (providerCode, query, accessToken, options = {}) => {
  if (providerCode === "spotify") {
    const response = await fetch(
      `https://api.spotify.com/v1/search?type=track&limit=15&q=${encodeURIComponent(query)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: options.signal,
      }
    );
    const json = await response.json();
    return Array.isArray(json?.tracks?.items) ? json.tracks.items.map(normalizeSpotifyTrack) : [];
  }

  if (providerCode === "deezer") {
    const url =
      `https://api.deezer.com/search/track?output=json&limit=15&q=${encodeURIComponent(query)}` +
      (accessToken ? `&access_token=${encodeURIComponent(accessToken)}` : "");
    const response = await fetch(url, { signal: options.signal });
    const json = await response.json();
    return Array.isArray(json?.data) ? json.data.map(normalizeDeezerTrack) : [];
  }

  return [];
};

export const fetchRecentPlaysViaProviderClient = async (providerCode, accessToken, options = {}) => {
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 12;

  if (providerCode === "spotify") {
    const response = await fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: options.signal,
    });
    const json = await response.json();
    const seen = new Set();
    return Array.isArray(json?.items)
      ? json.items
          .map((item) => normalizeSpotifyTrack(item?.track || {}))
          .filter((track) => {
            if (!track?.provider_track_id || seen.has(track.provider_track_id)) return false;
            seen.add(track.provider_track_id);
            return true;
          })
      : [];
  }

  if (providerCode === "deezer") {
    const response = await fetch(
      `https://api.deezer.com/user/me/history?limit=${limit}${accessToken ? `&access_token=${encodeURIComponent(accessToken)}` : ""}`,
      { signal: options.signal }
    );
    const json = await response.json();
    return Array.isArray(json?.data) ? json.data.map(normalizeDeezerTrack) : [];
  }

  return [];
};

export const authenticateProviderUser = async (providerCode) => {
  const response = await fetch(`/${providerCode}/auth-redirection`, { credentials: "same-origin" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.url) {
    throw new Error(data?.detail || `Impossible de connecter ${providerCode}.`);
  }
  window.location.replace(data.url);
};

export const disconnectProviderUser = async (providerCode) => {
  const response = await fetch(`/${providerCode}/disconnect`, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`Impossible de déconnecter ${providerCode}.`);
  }
  return true;
};
