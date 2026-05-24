import {
  AUTH_RETURN_STORAGE_KEY,
  consumeAuthAction,
  getAuthSuccessTarget,
  saveAuthReturnContext,
} from "./AuthFlow";

describe("AuthFlow", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("conserve pathname + search + hash dans getAuthSuccessTarget", () => {
    const target = getAuthSuccessTarget({
      fallback: "/profile",
      locationState: { from: { pathname: "/messages", search: "?thread=test", hash: "#reply" } },
    });
    expect(target).toBe("/messages?thread=test#reply");
  });

  it("n'utilise pas un contexte auth expiré", () => {
    window.sessionStorage.setItem(
      AUTH_RETURN_STORAGE_KEY,
      JSON.stringify({ returnTo: "/stale", savedAt: Date.now() - (16 * 60 * 1000) })
    );

    expect(getAuthSuccessTarget({ fallback: "/profile" })).toBe("/profile");
    expect(window.sessionStorage.getItem(AUTH_RETURN_STORAGE_KEY)).toBeNull();
  });

  it("nettoie une action stale dans consumeAuthAction", () => {
    saveAuthReturnContext({ returnTo: "/messages", action: { type: "reply", payload: { id: 1 } } });

    const action = consumeAuthAction({ currentPath: "/profile", actionType: "reply" });
    expect(action).toBeNull();
    expect(window.sessionStorage.getItem(AUTH_RETURN_STORAGE_KEY)).toBeNull();
  });
});
