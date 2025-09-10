import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, logout, nostrPrivKey } = useAuth();
  const nav = useNavigate();
  const [showPriv, setShowPriv] = useState(false);

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
      {user.nostrPublicKey && (
        <p className="break-all">
          <strong>Nostr Public Key:</strong> {user.nostrPublicKey}{' '}
          <button
            type="button"
            className="text-brand underline ml-2"
            onClick={() => navigator.clipboard.writeText(user.nostrPublicKey || '')}
          >
            Copy
          </button>
        </p>
      )}
      {nostrPrivKey && (
        <p className="break-all">
          <strong>Nostr Private Key:</strong> {showPriv ? nostrPrivKey : '••••••••'}{' '}
          <button
            type="button"
            className="text-brand underline ml-2"
            onClick={() => setShowPriv((s) => !s)}
          >
            {showPriv ? 'Hide' : 'Show'}
          </button>
          <button
            type="button"
            className="text-brand underline ml-2"
            onClick={() => navigator.clipboard.writeText(nostrPrivKey)}
          >
            Copy
          </button>
        </p>
      )}
      <button onClick={handleLogout} className="mt-4 bg-brand text-white p-2">Logout</button>
    </div>
  );
}
