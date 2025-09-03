import { useEffect, useState } from "react";
import { getCurrentUser, onAuthStateChange, logout } from "@/lib/strapi";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getCurrentUser().then((u) => setUser(u));
    const unsub = onAuthStateChange((u) => setUser(u));
    return unsub;
  }, []);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  if (!user) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-semibold">Not logged in</h1>
        <p className="text-neutral-500">Please log in to view your profile.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-semibold">👤 Profile</h1>
      <p className="text-neutral-500">Logged in as {user.email}</p>
      <button
        onClick={handleLogout}
        className="px-4 py-2 rounded-lg bg-brand text-white"
      >
        Log out
      </button>
    </div>
  );
}
