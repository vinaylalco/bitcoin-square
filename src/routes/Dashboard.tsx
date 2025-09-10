import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  if (!user) return <Navigate to="/login" replace />;

  function handleLogout() {
    logout();
    nav('/');
  }

  return (
    <div className="max-w-sm mx-auto p-4 space-y-2">
      <h2 className="text-xl mb-4">Dashboard</h2>
      <p><strong>Email:</strong> {user.email}</p>
      {user.username && <p><strong>Username:</strong> {user.username}</p>}
      <p><strong>User ID:</strong> {user.id}</p>
      <button onClick={handleLogout} className="mt-4 bg-brand text-white p-2">Logout</button>
    </div>
  );
}
