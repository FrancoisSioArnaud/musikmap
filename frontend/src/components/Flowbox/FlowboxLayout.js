import React, { useContext, useEffect } from "react";
import { useParams, Outlet } from "react-router-dom";
import { UserContext } from "../UserContext";

export default function FlowboxLayout() {
  const { boxSlug } = useParams();
  const { currentClient, setCurrentClient } = useContext(UserContext);

  useEffect(() => {
    let isCancelled = false;

    (async () => {
      try {
        if (!boxSlug) return;

        const url = `/box-management/get-box/?name=${encodeURIComponent(boxSlug)}`;
        const res = await fetch(url, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });

        if (!res.ok) return;

        const data = await res.json();
        if (!data || !data.name) return;

        if (isCancelled) return;

        const nextClient = data.client_slug || "default";

        if (currentClient !== nextClient) {
          setCurrentClient(nextClient);
        }
      } catch (error) {}
    })();

    return () => {
      isCancelled = true;
    };
  }, [boxSlug, currentClient, setCurrentClient]);

  return <Outlet />;
}
