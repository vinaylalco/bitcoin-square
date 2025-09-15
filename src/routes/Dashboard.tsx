import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getUserOrders, getUserAccessGrants, Order, AccessGrant } from '../api/user';
import { decryptPrivateKey } from '../utils/nostr';

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const nav = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [privKey, setPrivKey] = useState<string | null>(null);
  const [askPassword, setAskPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [privError, setPrivError] = useState('');

  useEffect(() => {
    if (!token) return;
    getUserOrders(token).then(setOrders).catch(() => {});
    getUserAccessGrants(token).then(setGrants).catch(() => {});
  }, [token]);

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
      {user.nostrEncryptedKey && (
        <div className="break-all">
          <strong>Nostr Private Key:</strong>{' '}
          {privKey ? (
            <>
              {privKey}{' '}
              <button
                type="button"
                className="text-brand underline ml-2"
                onClick={() => navigator.clipboard.writeText(privKey)}
              >
                Copy
              </button>
            </>
          ) : askPassword ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const pk = await decryptPrivateKey(user.nostrEncryptedKey || '', password);
                  setPrivKey(pk);
                  setPassword('');
                  setAskPassword(false);
                  setPrivError('');
                } catch {
                  setPrivError('Incorrect password');
                }
              }}
              className="inline-flex items-center space-x-2"
            >
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border p-1 text-sm"
                placeholder="Password"
              />
              <button type="submit" className="text-brand underline text-sm">
                Reveal
              </button>
              {privError && <span className="text-red-600 ml-2 text-sm">{privError}</span>}
            </form>
          ) : (
            <button
              type="button"
              className="text-brand underline ml-2"
              onClick={() => setAskPassword(true)}
            >
              Show
            </button>
          )}
        </div>
      )}
      {orders.length > 0 && (
        <div>
          <h3 className="font-semibold mt-4">Orders</h3>
          <ul className="list-disc ml-5">
            {orders.map((o) => (
              <li key={o.id}>
                {o.course?.title || 'Course'} - {new Date(o.createdAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>
      )}
      {grants.length > 0 && (
        <div>
          <h3 className="font-semibold mt-4">Courses</h3>
          <ul className="list-disc ml-5">
            {grants.map((g) => (
              <li key={g.id}>{g.course?.title || 'Course'}</li>
            ))}
          </ul>
        </div>
      )}
      <button onClick={handleLogout} className="mt-4 bg-brand text-white p-2">Logout</button>
    </div>
  );
}
