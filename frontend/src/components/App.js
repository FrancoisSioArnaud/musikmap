import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { StyledEngineProvider, ThemeProvider } from "@mui/material/styles";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";

import { buildMuiTheme } from "../muiThemeBuilder";
import {
  getStoredCurrentClient,
  getClientTheme,
  CURRENT_CLIENT_STORAGE_KEY,
} from "../clientThemes";
import { applyActiveClientTheme } from "../applyActiveClientTheme";

import HomePage from "./HomePage";
import RegisterPage from "./RegisterPage";
import LoginPage from "./LoginPage";
import UserProfilePage from "./UserProfilePage";
import UserSettings from "./UserProfile/UserSettings";
import UserProfileEdit from "./UserProfile/UserProfileEdit";
import MenuAppBar from "./Common/Menu";

import FlowboxLayout from "./Flowbox/FlowboxLayout";
import Onboarding from "./Flowbox/Onboarding";
import LiveSearch from "./Flowbox/LiveSearch";
import Discover from "./Flowbox/Discover";

import ClientAdminGuard from "./ClientAdmin/ClientAdminGuard";
import ClientAdminLayout from "./ClientAdmin/ClientAdminLayout";
import ClientDashboard from "./ClientAdmin/Dashboard";
import ClientArticlesList from "./ClientAdmin/ArticlesList";
import ClientArticleEdit from "./ClientAdmin/ArticleEdit";

import { UserContext } from "./UserContext";
import { checkUserStatus } from "./UsersUtils";

function LayoutWithHeader() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <MenuAppBar />
      <main
        style={{
          flex: 1,
          minHeight: "calc(100vh - 64px)",
          width: "100vw",
          padding: "58px 0 0 0",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}

function ClientAdminRouteWrapper() {
  return (
    <ClientAdminGuard>
      <ClientAdminLayout />
    </ClientAdminGuard>
  );
}

export default function App() {
  const [user, setUser] = useState({});
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentBoxName, setCurrentBoxName] = useState("");
  const [currentClient, setCurrentClient] = useState(() => getStoredCurrentClient());

  const applyUserClientTheme = useCallback((userData) => {
    const nextClientSlug = userData?.client_slug || userData?.client?.slug || "default";
    setCurrentClient(nextClientSlug);
  }, []);

  const providerValue = useMemo(
    () => ({
      user,
      setUser,
      isAuthenticated,
      setIsAuthenticated,
      authChecked,
      setAuthChecked,
      currentBoxName,
      setCurrentBoxName,
      currentClient,
      setCurrentClient,
      applyUserClientTheme,
    }),
    [
      user,
      isAuthenticated,
      authChecked,
      currentBoxName,
      currentClient,
      applyUserClientTheme,
    ]
  );

  const activeClientTheme = useMemo(() => {
    return getClientTheme(currentClient);
  }, [currentClient]);

  const muiTheme = useMemo(() => {
    return buildMuiTheme(activeClientTheme);
  }, [activeClientTheme]);

  useEffect(() => {
    applyActiveClientTheme(currentClient);
  }, [currentClient]);

  useEffect(() => {
    checkUserStatus(
      setUser,
      setIsAuthenticated,
      setCurrentClient,
      setAuthChecked
    );
  }, []);

  useEffect(() => {
    if (isAuthenticated && user?.client_slug) {
      setCurrentClient(user.client_slug);
      return;
    }

    if (isAuthenticated && user?.client?.slug) {
      setCurrentClient(user.client.slug);
      return;
    }

    if (authChecked && !isAuthenticated) {
      setCurrentClient("default");
    }
  }, [authChecked, isAuthenticated, user]);

  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_CLIENT_STORAGE_KEY, currentClient || "default");
    } catch (error) {}
  }, [currentClient]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === CURRENT_CLIENT_STORAGE_KEY) {
        setCurrentClient(event.newValue || "default");
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={muiTheme}>
        <Router>
          <UserContext.Provider value={providerValue}>
            <Routes>
              <Route element={<LayoutWithHeader />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/profile/settings" element={<UserSettings />} />
                <Route path="/profile/edit" element={<UserProfileEdit />} />
                <Route path="/profile" element={<UserProfilePage />} />
                <Route path="/profile/:username" element={<UserProfilePage />} />

                <Route path="/flowbox/:boxSlug" element={<FlowboxLayout />}>
                  <Route index element={<Onboarding />} />
                  <Route
                    path="search"
                    element={
                      <LiveSearch
                        isSpotifyAuthenticated={true}
                        isDeezerAuthenticated={true}
                      />
                    }
                  />
                  <Route path="discover" element={<Discover />} />
                </Route>
              </Route>

              <Route path="/client" element={<ClientAdminRouteWrapper />}>
                <Route index element={<ClientDashboard />} />
                <Route path="articles" element={<ClientArticlesList />} />
                <Route path="articles/new" element={<ClientArticleEdit />} />
                <Route path="articles/:articleId" element={<ClientArticleEdit />} />
              </Route>

              <Route
                path="/register"
                element={
                  authChecked
                    ? (isAuthenticated ? <Navigate to="/profile" replace /> : <RegisterPage />)
                    : null
                }
              />
              <Route
                path="/login"
                element={
                  authChecked
                    ? (isAuthenticated ? <Navigate to="/profile" replace /> : <LoginPage />)
                    : null
                }
              />
            </Routes>
          </UserContext.Provider>
        </Router>
      </ThemeProvider>
    </StyledEngineProvider>
  );
}

const appDiv = document.getElementById("app");
createRoot(appDiv).render(<App />);
