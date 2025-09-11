import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { strapiFetch } from '../api/strapi-client';
import { decryptPrivateKey } from '../utils/nostr';

interface Order {
  id: number;
  attributes: {
    productType: string;
    paymentStatus: string;
  };
}

interface Course {
  id: number;
  attributes: {
    title: string;
  };
}

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const nav = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [revealKey, setRevealKey] = useState(false);
  const [password, setPassword] = useState('');
  const [privKey, setPrivKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !token) return;
    async function load() {
      try {
        const orderRes = await strapiFetch<{ data: Order[] }>(
          `/api/orders?filters[user][id][$eq]=${user.id}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        setOrders(orderRes.data);
        const grantRes = await strapiFetch<{ data: any[] }>(
          `/api/access-grants?populate[course]=*&filters[user][id][$eq]=${user.id}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const crs: Course[] = grantRes.data
          .map((g) => g.attributes?.course?.data)
          .filter(Boolean);
        setCourses(crs);
      } catch (e) {
        console.error(e);
      }
    }
    load();
  }, [user, token]);

  if (!user) return <Navigate to="/login" replace />;

  function handleLogout() {
    logout();
    nav('/');
  }

  async function handleReveal() {
    if (!user.nostrPrivateKey) return;
    try {
      const key = await decryptPrivateKey(user.nostrPrivateKey, password);
      setPrivKey(key);
      setError('');
    } catch {
      setError('Incorrect password');
    }
  }

  return (
    <div className="max-w-sm mx-auto p-4 space-y-4">
      <h2 className="text-xl">Dashboard</h2>
      <div className="space-y-2">
        <p>
          <strong>Email:</strong> {user.email}
        </p>
        {user.username && (
          <p>
            <strong>Username:</strong> {user.username}
          </p>
        )}
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
        {user.nostrPrivateKey && (
          <div className="break-all">
            {privKey ? (
              <p>
                <strong>Nostr Private Key:</strong> {privKey}{' '}
                <button
                  type="button"
                  className="text-brand underline ml-2"
                  onClick={() => navigator.clipboard.writeText(privKey)}
                >
                  Copy
                </button>
              </p>
            ) : revealKey ? (
              <div className="space-x-2">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border p-1"
                  placeholder="Password"
                />
                <button
                  type="button"
                  className="text-brand underline"
                  onClick={handleReveal}
                >
                  Reveal
                </button>
                {error && <p className="text-red-500">{error}</p>}
              </div>
            ) : (
              <button
                type="button"
                className="text-brand underline"
                onClick={() => setRevealKey(true)}
              >
                Show Private Key
              </button>
            )}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-semibold">Orders</h3>
        <ul className="list-disc ml-4">
          {orders.map((o) => (
            <li key={o.id}>
              {o.attributes.productType} - {o.attributes.paymentStatus}
            </li>
          ))}
          {!orders.length && <li>None</li>}
        </ul>
      </div>

      <div>
        <h3 className="font-semibold">Courses</h3>
        <ul className="list-disc ml-4">
          {courses.map((c) => (
            <li key={c.id}>{c.attributes.title}</li>
          ))}
          {!courses.length && <li>None</li>}
        </ul>
      </div>

      <button onClick={handleLogout} className="bg-brand text-white p-2 mt-4">
        Logout
      </button>
    </div>
  );
}

