import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useRole } from "../hooks/useRole";

export default function RequireAdmin() {
  const { role, loading } = useRole();
  const loc = useLocation();

  // Render nothing while role resolves; CMSGate will handle skeleton + data preload.
  if (loading) return null;

  if (role === null) {
    // Not logged in
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  if (role !== "admin") {
    // Logged in but not admin
    return <Navigate to="/" replace />;
  }

  // Admin
  return <Outlet />;
}
