export const checkDeezerAuthentication = async (setIsDeezerAuthenticated) => {
  try {
    const response = await fetch("/deezer/is-authenticated", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const data = await response.json().catch(() => ({}));
    setIsDeezerAuthenticated(Boolean(data?.status));
    return Boolean(data?.status);
  } catch (error) {
    console.error(error);
    setIsDeezerAuthenticated(false);
    return false;
  }
};

export const authenticateDeezerUser = async (isDeezerAuthenticated, setIsDeezerAuthenticated) => {
  try {
    const authenticated = await checkDeezerAuthentication(setIsDeezerAuthenticated);
    if (isDeezerAuthenticated || authenticated) {
      return true;
    }

    const response = await fetch("/deezer/auth-redirection", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.url) {
      throw new Error(data?.detail || "Deezer auth-redirection failed");
    }

    window.location.assign(data.url);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const disconnectDeezerUser = async (isDeezerAuthenticated, setIsDeezerAuthenticated) => {
  try {
    const authenticated = await checkDeezerAuthentication(setIsDeezerAuthenticated);
    if (!isDeezerAuthenticated && !authenticated) {
      return true;
    }

    await fetch("/deezer/disconnect", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    setIsDeezerAuthenticated(false);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};
