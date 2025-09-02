import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useRole } from "../hooks/userole";

export default function RequireAdmin() {
  const { role, loading } = useRole();
  const loc = useLocation();

  if (loading) {
    return <div className="p-4 text-sm text-neutral-500">Checking permissions…</div>;
  }
  if (role === null) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  if (role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
