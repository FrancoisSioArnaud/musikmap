import { createContext } from "react";

export const UserContext = createContext({
  user: {},
  setUser: () => {},
  isAuthenticated: false,
  setIsAuthenticated: () => {},
  currentBoxName: "",
  setCurrentBoxName: () => {},
  currentClient: "default",
  setCurrentClient: () => {},
});
