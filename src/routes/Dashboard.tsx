import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { user, logout } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div>
        <h2 className="font-medium">Account</h2>
        <p>Email: {user.email}</p>
      </div>
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
      <button
        type="button"
        className="underline text-sm mt-4"
        onClick={logout}
      >
        Logout
      </button>
    </div>
  );
}

