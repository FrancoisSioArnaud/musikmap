import React from "react";
import { useParams, Outlet, ScrollRestoration } from "react-router-dom";

export default function FlowboxLayout() {
  const { boxSlug } = useParams();
  console.log("[FlowboxLayout] render slug=", boxSlug)
  return (
    <>
      <p>FlowBox layout</p>
      <Outlet />
      {/*<ScrollRestoration />*/}
    </>
  );
}
