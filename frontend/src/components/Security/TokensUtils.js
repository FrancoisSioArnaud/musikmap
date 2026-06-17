/**
 * Retrieves the value of a cookie by its name.
 * @param {string} name - The name of the cookie.
 * @returns {string} - The value of the cookie, or an empty string if the cookie is not found.
 */
export function getCookie(name) {
  const cookieValue = document.cookie.match(
    "(^|;)\\s*" + name + "\\s*=\\s*([^;]+)"
  );
  return cookieValue ? cookieValue.pop() : "";
}
