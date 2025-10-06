import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function CheckoutSuccess() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">Checkout complete</p>
      <h1 className="mt-4 text-3xl font-black uppercase tracking-[0.16em] text-[var(--fg-default)] sm:text-4xl">
        Thank you for your purchase
      </h1>
      {user ? (
        <>
          <p className="mt-6 text-sm leading-relaxed text-[var(--fg-muted)]">
            Your items are ready in your dashboard. Head there any time to review your purchase and resources.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-brand via-brand/90 to-[#FFF582] px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-white shadow-[0_25px_55px_rgba(169,21,255,0.4)] transition hover:-translate-y-1 hover:shadow-[0_35px_70px_rgba(169,21,255,0.45)]"
            >
              View dashboard
            </Link>
            <Link
              to="/shop"
              className="inline-flex items-center justify-center rounded-full border border-brand/40 px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-brand transition hover:border-brand hover:bg-brand hover:text-white"
            >
              Continue browsing
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="mt-6 text-sm leading-relaxed text-[var(--fg-muted)]">
            Log in to view your purchase. Once you sign in, you'll find everything waiting for you in your dashboard.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-full border border-brand px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-brand transition hover:bg-brand hover:text-white"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center justify-center rounded-full border border-[var(--border-subtle)] px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
            >
              Create account
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
