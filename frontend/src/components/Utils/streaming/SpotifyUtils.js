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

    await fetch("/spotify/disconnect", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    setIsSpotifyAuthenticated(false);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};
