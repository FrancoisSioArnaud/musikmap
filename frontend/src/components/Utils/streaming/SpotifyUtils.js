import { getCookie } from "../../Security/TokensUtils";

function getSpotifyConnection(user) {
  return user?.provider_connections?.spotify || null;
}

function getSpotifyConnectionAccessToken(user) {
  const connection = getSpotifyConnection(user);
  return connection?.connected && connection?.access_token ? connection.access_token : null;
}

function isSpotifyAccessTokenStillValid(user, minValiditySeconds = 30) {
  const connection = getSpotifyConnection(user);
  if (!connection?.connected || !connection?.access_token) {
    return false;
  }

  if (!connection?.expires_at) {
    return true;
  }

  const expiresAtMs = new Date(connection.expires_at).getTime();
  if (!Number.isFinite(expiresAtMs)) {
    return true;
  }

  return expiresAtMs - Date.now() > minValiditySeconds * 1000;
}

export const ensureValidSpotifyAccessToken = async ({ user, setUser, minValiditySeconds = 30 } = {}) => {
  const currentToken = getSpotifyConnectionAccessToken(user);
  if (!currentToken) {
    return null;
  }

  if (isSpotifyAccessTokenStillValid(user, minValiditySeconds)) {
    return currentToken;
  }

  try {
    const response = await fetch("/spotify/refresh-access-token", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return null;
    }

    if (data?.current_user && typeof setUser === "function") {
      setUser(data.current_user);
    }

    return (
      data?.access_token ||
      data?.current_user?.provider_connections?.spotify?.access_token ||
      null
    );
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const checkSpotifyAuthentication = async (setIsSpotifyAuthenticated) => {
  try {
    const response = await fetch("/spotify/is-authenticated", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const data = await response.json().catch(() => ({}));
    setIsSpotifyAuthenticated(Boolean(data?.status));
    return Boolean(data?.status);
  } catch (error) {
    console.error(error);
    setIsSpotifyAuthenticated(false);
    return false;
  }
};

export const authenticateSpotifyUser = async (isSpotifyAuthenticated, setIsSpotifyAuthenticated) => {
  try {
    const authenticated = await checkSpotifyAuthentication(setIsSpotifyAuthenticated);
    if (isSpotifyAuthenticated || authenticated) {
      return true;
    }

    const response = await fetch("/spotify/auth-redirection", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.url) {
      throw new Error(data?.detail || "Spotify auth-redirection failed");
    }

    window.location.assign(data.url);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const disconnectSpotifyUser = async (isSpotifyAuthenticated, setIsSpotifyAuthenticated) => {
  try {
    const authenticated = await checkSpotifyAuthentication(setIsSpotifyAuthenticated);
    if (!isSpotifyAuthenticated && !authenticated) {
      return true;
    }

    const response = await fetch("/spotify/disconnect", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
    });

    if (!response.ok) {
      throw new Error(`Spotify disconnect failed with status ${response.status}`);
    }

    setIsSpotifyAuthenticated(false);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};
