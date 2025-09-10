import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(identifier, password);
      navigate("/dashboard");
    } catch {
      setError("Invalid credentials");
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Login</h1>
      {error && <p className="text-red-500 mb-2">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="Email"
          className="w-full border p-2"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full border p-2"
          required
        />
        <button type="submit" className="w-full bg-brand text-white py-2 rounded">
          Login
        </button>
      </form>
      <div className="mt-4 text-sm space-y-1">
        <Link to="/forgot-password" className="text-brand">
          Forgot password?
        </Link>
        <div>
          <Link to="/register" className="text-brand">
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}

