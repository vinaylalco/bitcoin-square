import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  const copy = (text: string) => {
    if (navigator?.clipboard) navigator.clipboard.writeText(text);
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div>
        <h2 className="font-medium">Account</h2>
        <p>Email: {user.email}</p>
      </div>
      {user.nostrPublicKey && (
        <div>
          <h2 className="font-medium">Nostr Keys</h2>
          <p className="break-all">
            Public Key: {user.nostrPublicKey}
            <button
              type="button"
              className="ml-2 underline text-sm"
              onClick={() => copy(user.nostrPublicKey!)}
            >
              Copy
            </button>
          </p>
          <p className="break-all">
            Private Key: {user.nostrPrivateKey}
            <button
              type="button"
              className="ml-2 underline text-sm"
              onClick={() => copy(user.nostrPrivateKey!)}
            >
              Copy
            </button>
          </p>
        </div>
      )}
      <div>
        <h2 className="font-medium">Enrolled Courses</h2>
        {Array.isArray((user as any).courses) && (user as any).courses.length ? (
          <ul className="list-disc list-inside">
            {(user as any).courses.map((c: any) => (
              <li key={c.id}>{c.title}</li>
            ))}
          </ul>
        ) : (
          <p>No courses yet.</p>
        )}
      </div>
    </div>
  );
}

