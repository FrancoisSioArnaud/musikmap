/**
 * Checks if the user is authenticated with Deezer.
 * Makes an asynchronous request to the server to fetch the authentication status.
 * @param {function} setIsDeezerAuthenticated - A function to set the Deezer authentication status of a user.
 */
export const checkDeezerAuthentication = async (setIsDeezerAuthenticated) => {
  try {
    const response = await fetch("/deezer/is-authenticated");
    const data = await response.json();
    setIsDeezerAuthenticated(data.status);
  } catch (error) {
    console.error(error);
  }
};

/**
 * Authenticates the user with Deezer if not already authenticated.
 * @param {boolean} isDeezerAuthenticated - A boolean indicating if the user is already authenticated with Deezer.
 * @param {function} setIsDeezerAuthenticated - A function to set the Deezer authentication status of the user.
 */
export const authenticateDeezerUser = async (
  isDeezerAuthenticated,
  setIsDeezerAuthenticated
) => {
  try {
    checkDeezerAuthentication(setIsDeezerAuthenticated);
    if (!isDeezerAuthenticated) {
      const response = await fetch("/deezer/auth-redirection");
      const data = await response.json();
      window.location.replace(data.url);
    }
  } catch (error) {
    console.error(error);
  }
};

/**
 * Disconnect the user with Deezer if already authenticated.
 * @param {boolean} isDeezerAuthenticated - A boolean indicating if the user is already authenticated with Deezer.
 * @param {function} setIsDeezerAuthenticated - A function to set the Deezer authentication status of the user.
 */
export const disconnectDeezerUser = async (
  isDeezerAuthenticated,
  setIsDeezerAuthenticated
) => {
  try {
    // Check if the user is authenticated with Deezer.
    checkDeezerAuthentication(setIsDeezerAuthenticated);
    // If the user is authenticated with Deezer, disconnect the user.
    if (isDeezerAuthenticated) {
      const response = await fetch("/deezer/disconnect");
      const data = await response.json();
      window.location.replace(data.url);
    }
  } catch (error) {
    console.error(error);
  }
};
