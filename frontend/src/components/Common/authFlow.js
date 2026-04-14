export const AUTH_RETURN_STORAGE_KEY = "mm_auth_return_context";

export const AUTH_BENEFITS = [
  "Retrouve toutes tes découvertes dans ta librairie.",
  "Commente et participe aux échanges.",
  "Débloque plus de réactions et personnalise ton compte.",
  "Épingle des chansons aux boîtes et à ton profil.",
];

const AUTH_COPY = {
  default: {
    title: "Crée ton compte",
    description: "Connecte-toi ou crée ton compte pour profiter de toutes les fonctionnalités de Boîte à Chanson.",
  },
  comment: {
    title: "Commente la découverte",
    description: "Connecte-toi ou crée ton compte pour commenter cette chanson.",
  },
  react: {
    title: "Réagis à la chanson",
    description: "Connecte-toi ou crée ton compte pour réagir à cette découverte.",
  },
  unlock_reaction: {
    title: "Débloque plus de réactions",
    description: "Connecte-toi ou crée ton compte pour débloquer et utiliser plus de réactions.",
  },
  favorite_song: {
    title: "Attache ta chanson de cœur",
    description: "Connecte-toi ou crée ton compte pour ajouter une chanson à ton profil.",
  },
  pinned_song: {
    title: "Épingle une chanson à la boîte",
    description: "Connecte-toi ou crée ton compte pour épingler une chanson à cette boîte.",
  },
  share_song: {
    title: "Partage la découverte",
    description: "Connecte-toi ou crée ton compte pour partager cette chanson.",
  },
  account: {
    title: "Crée ton compte",
    description: "Connecte-toi ou crée ton compte pour retrouver tes découvertes, personnaliser ton profil et accéder à toutes les fonctionnalités.",
  },
  client_admin: {
    title: "Connecte-toi",
    description: "Connecte-toi pour accéder au portail client.",
  },
};

export function getAuthContextCopy(authContext) {
  return AUTH_COPY[authContext] || AUTH_COPY.default;
}

export function buildRelativeLocation(locationLike) {
  if (!locationLike) return window.location.pathname + window.location.search + window.location.hash;
  if (typeof locationLike === "string") return locationLike;
  return `${locationLike.pathname || ""}${locationLike.search || ""}${locationLike.hash || ""}` || "/profile";
}

export function saveAuthReturnContext(payload) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      AUTH_RETURN_STORAGE_KEY,
      JSON.stringify({
        ...payload,
        savedAt: Date.now(),
      })
    );
  } catch (error) {}
}

export function getAuthReturnContext() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(AUTH_RETURN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

export function clearAuthReturnContext() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(AUTH_RETURN_STORAGE_KEY);
  } catch (error) {}
}

export function buildAuthPath({
  tab = "register",
  authContext = "default",
  mergeGuest = false,
  prefillUsername = "",
} = {}) {
  const params = new URLSearchParams();
  if (tab) params.set("tab", tab);
  if (authContext) params.set("context", authContext);
  if (mergeGuest) params.set("merge_guest", "1");
  if (prefillUsername) params.set("prefill_username", prefillUsername);
  const query = params.toString();
  return query ? `/auth?${query}` : "/auth";
}

export function startAuthPageFlow({
  navigate,
  location,
  tab = "register",
  authContext = "default",
  mergeGuest = false,
  prefillUsername = "",
  action = null,
  returnTo = null,
} = {}) {
  const resolvedReturnTo = returnTo || buildRelativeLocation(location);
  saveAuthReturnContext({
    returnTo: resolvedReturnTo,
    action,
    authContext,
  });
  navigate(
    buildAuthPath({
      tab,
      authContext,
      mergeGuest,
      prefillUsername,
    })
  );
}

export function getAuthSuccessTarget({ fallback = "/profile", locationState = null } = {}) {
  const stored = getAuthReturnContext();
  if (stored?.returnTo) return stored.returnTo;
  const from = locationState?.from;
  if (from?.pathname) {
    return `${from.pathname || ""}${from.search || ""}${from.hash || ""}`;
  }
  return fallback;
}

export function buildSpotifyLoginUrl() {
  const next = encodeURIComponent('/auth?tab=login');
  return `/oauth/login/spotify/?next=${next}`;
}

export function consumeAuthAction({
  currentPath,
  actionType,
  matcher,
} = {}) {
  const stored = getAuthReturnContext();
  if (!stored || !stored.action) return null;
  if (stored.returnTo && currentPath && stored.returnTo !== currentPath) return null;
  if (actionType && stored.action.type !== actionType) return null;
  if (typeof matcher === "function" && !matcher(stored.action.payload || {})) return null;
  clearAuthReturnContext();
  return stored.action;
}
