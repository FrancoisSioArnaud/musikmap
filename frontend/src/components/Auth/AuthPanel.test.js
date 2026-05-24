import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

import { UserContext } from "../UserContext";

import AuthPanel from "./AuthPanel";

const mockNavigate = jest.fn();

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: "/auth", search: "", hash: "", state: null }),
}));

jest.mock("../Security/TokensUtils", () => ({ getCookie: () => "token" }));
jest.mock("../UsersUtils", () => ({ checkUserStatus: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../Utils/streaming/providerClient", () => ({ authenticateProviderUser: jest.fn() }));

jest.mock("../UserProfile/AvatarUploadField", () => (props) => (
  <div>
    <span>{props.label}</span>
    <button type="button" onClick={() => props.onCroppedFileChange?.(new File(["x"], "avatar.jpg", { type: "image/jpeg" }), "blob:test")}>mock-crop</button>
  </div>
));

function renderAuthPanel() {
  return render(
    <UserContext.Provider value={{ user: null, setUser: jest.fn(), setIsAuthenticated: jest.fn() }}>
      <AuthPanel initialTab="register" />
    </UserContext.Provider>
  );
}

describe("AuthPanel register avatar", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    window.sessionStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  it("affiche le wording et remplace l'input brut", () => {
    const { container } = renderAuthPanel();
    expect(screen.getByText("Ajoute une photo de profil")).toBeInTheDocument();
    expect(container.querySelector('input[type="file"][name="profile_picture"]')).toBeNull();
  });

  it("envoie profile_picture quand un fichier cropé est fourni", async () => {
    renderAuthPanel();
    fireEvent.click(screen.getByRole("button", { name: "mock-crop" }));
    fireEvent.submit(screen.getByRole("button", { name: "Créer mon compte" }).closest("form"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const options = global.fetch.mock.calls[0][1];
    expect(options.body.get("profile_picture")).toBeInstanceOf(File);
  });

  it("n'envoie pas profile_picture sans fichier", async () => {
    renderAuthPanel();
    fireEvent.submit(screen.getByRole("button", { name: "Créer mon compte" }).closest("form"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const options = global.fetch.mock.calls[0][1];
    expect(options.body.get("profile_picture")).toBeNull();
  });
});
