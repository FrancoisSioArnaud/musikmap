import { authenticateProviderUser, disconnectProviderUser, getProviderConnection } from "./providerClient";

export const checkSpotifyAuthentication = async (setIsSpotifyAuthenticated, user = null) => {
  try {
    if (user) {
      setIsSpotifyAuthenticated(Boolean(getProviderConnection(user, "spotify")?.connected));
      return;
    }
    const response = await fetch("/spotify/is-authenticated", { credentials: "same-origin" });
    const data = await response.json().catch(() => ({}));
    setIsSpotifyAuthenticated(Boolean(data?.status));
  } catch (error) {
    console.error(error);
    setIsSpotifyAuthenticated(false);
  }
};

export const authenticateSpotifyUser = async () => {
  await authenticateProviderUser("spotify");
};

export const disconnectSpotifyUser = async (isSpotifyAuthenticated, setIsSpotifyAuthenticated) => {
  try {
    if (!isSpotifyAuthenticated) return;
    await disconnectProviderUser("spotify");
    setIsSpotifyAuthenticated(false);
  } catch (error) {
    console.error(error);
  }
};
