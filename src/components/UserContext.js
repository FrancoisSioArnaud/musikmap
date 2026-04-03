import { createContext } from "react";

export const UserContext = createContext({
  user: null,
  setUser: () => {},
  isAuthenticated: false,
  setIsAuthenticated: () => {},
  currentClient: "default",
  setCurrentClient: () => {},
  authChecked: false,
  setAuthChecked: () => {},
});
