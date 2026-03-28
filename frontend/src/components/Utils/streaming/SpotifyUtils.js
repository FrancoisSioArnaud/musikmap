/**
 * Checks if the user is authenticated with Spotify.
 * Makes an asynchronous request to the server to fetch the authentication status.
 * @param {function} setIsSpotifyAuthenticated - A function to set the Spotify authentication status of a user.
 */
export const checkSpotifyAuthentication = async (setIsSpotifyAuthenticated) => {
  try {
    const response = await fetch("/spotify/is-authenticated");
    const data = await response.json();
    setIsSpotifyAuthenticated(data.status);
  } catch (error) {
    console.error(error);
  }
};

/**
 * Authenticates the user with Spotify if not already authenticated.
 * @param {boolean} isSpotifyAuthenticated - A boolean indicating if the user is already authenticated with Spotify.
 * @param {function} setIsSpotifyAuthenticated - A function to set the Spotify authentication status of the user.
 */
export const authenticateSpotifyUser = async (
  isSpotifyAuthenticated,
  setIsSpotifyAuthenticated
) => {
  try {
    checkSpotifyAuthentication(setIsSpotifyAuthenticated);
    if (!isSpotifyAuthenticated) {
      const response = await fetch("/spotify/auth-redirection");
      const data = await response.json();
      window.location.replace(data.url);
    }
  } catch (error) {
    console.error(error);
  }
};

/**
 * Disconnect the user with Spotify if not already authenticated.
 * @param {boolean} isSpotifyAuthenticated - A boolean indicating if the user is already authenticated with Deezer.
 * @param {function} setIsSpotifyAuthenticated - A function to set the Deezer authentication status of the user.
 */
export const disconnectSpotifyUser = async (
  isSpotifyAuthenticated,
  setIsSpotifyAuthenticated
) => {
  try {
    checkSpotifyAuthentication(setIsSpotifyAuthenticated);
    if (isSpotifyAuthenticated) {
      const response = await fetch("/spotify/disconnect");
      const data = await response.json();
      window.location.replace(data.url);
    }
  } catch (error) {
    console.error(error);
  }
};
