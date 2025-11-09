import React from "react";
import { useParams, Outlet, ScrollRestoration } from "react-router-dom";

export default function FlowboxLayout() {
  const { boxSlug } = useParams();
  return (
    <>
      <Outlet />
      {/*<ScrollRestoration />*/}
    </>
  );
}
