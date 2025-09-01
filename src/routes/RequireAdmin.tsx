import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useRole } from "../hooks/userole";

export default function RequireAdmin() {
  const { role, loading } = useRole();

  if (loading) return <div className="p-4">Checking permissions…</div>;
  if (role === null) return <Navigate to="/login" replace />;
  if (role !== "admin") return <Navigate to="/" replace />;

  return <Outlet />;
}
