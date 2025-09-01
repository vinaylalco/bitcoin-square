import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        alert(
          "Sign-up successful! Please check your email inbox and click the confirmation link before logging in."
        );
        setIsSignUp(false); // switch back to login form
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        navigate("/education"); // redirect to education page (not profile anymore)
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 max-w-sm mx-auto">
      <h1 className="text-xl font-semibold mb-4">
        {isSignUp ? "Sign Up" : "Login"}
      </h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-black"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-black"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 rounded-lg bg-brand text-white"
        >
          {loading ? "Loading..." : isSignUp ? "Sign Up" : "Login"}
        </button>
      </form>
      <button
        className="mt-4 text-sm text-brand"
        onClick={() => setIsSignUp(!isSignUp)}
      >
        {isSignUp
          ? "Already have an account? Login"
          : "Don’t have an account? Sign Up"}
      </button>
    </div>
  );
}
