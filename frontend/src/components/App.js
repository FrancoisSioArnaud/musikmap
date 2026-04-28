import { StyledEngineProvider, ThemeProvider } from "@mui/material/styles";
import React, { useState, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";

import { applyActiveClientTheme } from "../applyActiveClientTheme";
import {
  getStoredCurrentClient,
  getClientTheme,
  CURRENT_CLIENT_STORAGE_KEY,
} from "../clientThemes";
import { buildMuiTheme } from "../muiThemeBuilder";

import AuthPage from "./Auth/AuthPage";
import AuthReturnPage from "./Auth/AuthReturnPage";
import ClientArticleEdit from "./ClientAdmin/ArticleEdit";
import ClientArticlesList from "./ClientAdmin/ArticlesList";
import ClientAdminGuard from "./ClientAdmin/ClientAdminGuard";
import ClientAdminLayout from "./ClientAdmin/ClientAdminLayout";
import ClientCommentsList from "./ClientAdmin/CommentsList";
import ClientDashboard from "./ClientAdmin/Dashboard";
import ClientIncitationsList from "./ClientAdmin/IncitationsList";
import ClientStickersInstall from "./ClientAdmin/StickersInstall";
import ClientStickersList from "./ClientAdmin/StickersList";
import MenuAppBar from "./Common/Menu";
import ClosedBoxPage from "./Flowbox/ClosedBoxPage";
import Discover from "./Flowbox/Discover";
import LiveSearch from "./Flowbox/LiveSearch";
import Onboarding from "./Flowbox/Onboarding";
import FlowboxBoxShell from "./Flowbox/runtime/FlowboxBoxShell";
import FlowboxSessionProvider from "./Flowbox/runtime/FlowboxSessionProvider";
import InBoxSessionGate from "./Flowbox/runtime/InBoxSessionGate";
import HomePage from "./HomePage";
import LinkDepositPage from "./LinkDepositPage";
import MessageConversationPage from "./Messages/MessageConversationPage";
import MessagesPage from "./Messages/MessagesPage";
import { UserContext } from "./UserContext";
import UserProfileEdit from "./UserProfile/UserProfileEdit";
import UserSettings from "./UserProfile/UserSettings";
import UserProfilePage from "./UserProfilePage";
import { checkUserStatus } from "./UsersUtils";

function LayoutWithHeader() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <MenuAppBar />
      <main
        style={{
          flex: 1,
          minHeight: "calc(100vh - var(--mm-app-header-height, 56px))",
          width: "100vw",
          padding: "var(--mm-app-header-height, 56px) 0 0 0",
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
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentBoxName, setCurrentBoxName] = useState("");
  const [currentClient, setCurrentClient] = useState(() => getStoredCurrentClient());
  const [economy, setEconomy] = useState(null);

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
      economy,
      setEconomy,
    }),
    [
      user,
      isAuthenticated,
      authChecked,
      currentBoxName,
      currentClient,
      economy,
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
    document.documentElement.style.setProperty("--mm-app-header-height", "56px");
  }, []);

  useEffect(() => {
    checkUserStatus(
      setUser,
      setIsAuthenticated,
      null,
      setAuthChecked
    );
  }, []);

  useEffect(() => {
    const loadEconomy = async () => {
      try {
        const response = await fetch("/box-management/economy/", {
          method: "GET",
          credentials: "same-origin",
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          setEconomy(data);
        }
      } catch (error) {}
    };

    loadEconomy();
  }, []);

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
            <FlowboxSessionProvider>
              <Routes>
                <Route element={<LayoutWithHeader />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/profile/settings" element={<UserSettings />} />
                  <Route path="/messages" element={<MessagesPage />} />
                  <Route path="/messages/:username" element={<MessageConversationPage />} />
                  <Route path="/profile/edit" element={<UserProfileEdit />} />
                  <Route path="/profile" element={<UserProfilePage />} />
                  <Route path="/profile/:username" element={<UserProfilePage />} />

                  <Route path="/flowbox/:boxSlug" element={<FlowboxBoxShell />}>
                    <Route index element={<Onboarding />} />
                    <Route path="closed" element={<ClosedBoxPage />} />
                    <Route element={<InBoxSessionGate />}>
                      <Route path="search" element={<LiveSearch />} />
                      <Route path="discover" element={<Discover />} />
                    </Route>
                  </Route>

                  <Route path="/l/:linkSlug" element={<LinkDepositPage />} />
                </Route>

                <Route path="/client" element={<ClientAdminRouteWrapper />}>
                  <Route index element={<ClientDashboard />} />
                  <Route path="articles" element={<ClientArticlesList />} />
                  <Route path="articles/new" element={<ClientArticleEdit />} />
                  <Route path="articles/:articleId" element={<ClientArticleEdit />} />
                  <Route path="incitation" element={<ClientIncitationsList />} />
                  <Route path="commentaires" element={<ClientCommentsList />} />
                  <Route path="stickers" element={<ClientStickersList />} />
                  <Route path="stickers/install" element={<ClientStickersInstall />} />
                </Route>

                <Route
                  path="/auth"
                  element={
                    authChecked
                      ? (isAuthenticated ? <Navigate to="/profile" replace /> : <AuthPage />)
                      : null
                  }
                />
                <Route path="/auth/return" element={<AuthReturnPage />} />
              </Routes>
            </FlowboxSessionProvider>
          </UserContext.Provider>
        </Router>
      </ThemeProvider>
    </StyledEngineProvider>
  );
}

const appDiv = document.getElementById("app");
createRoot(appDiv).render(<App />);
