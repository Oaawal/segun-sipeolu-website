"use client";

import { useEffect } from "react";

/** Registers the portal's service worker so the portal can be installed as an app. */
export function AppRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/portal-sw.js", { scope: "/portal" }).catch(() => {});
  }, []);
  return null;
}
