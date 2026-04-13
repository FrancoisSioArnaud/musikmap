import { authenticateProviderUser, disconnectProviderUser, getProviderConnection } from "./providerClient";

export const checkDeezerAuthentication = async (setIsDeezerAuthenticated, user = null) => {
  try {
    if (user) {
      setIsDeezerAuthenticated(Boolean(getProviderConnection(user, "deezer")?.connected));
      return;
    }
    const response = await fetch("/deezer/is-authenticated", { credentials: "same-origin" });
    const data = await response.json().catch(() => ({}));
    setIsDeezerAuthenticated(Boolean(data?.status));
  } catch (error) {
    console.error(error);
    setIsDeezerAuthenticated(false);
  }
};

export const authenticateDeezerUser = async () => {
  await authenticateProviderUser("deezer");
};

export const disconnectDeezerUser = async (isDeezerAuthenticated, setIsDeezerAuthenticated) => {
  try {
    if (!isDeezerAuthenticated) return;
    await disconnectProviderUser("deezer");
    setIsDeezerAuthenticated(false);
  } catch (error) {
    console.error(error);
  }
};
