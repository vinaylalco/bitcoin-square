import { Link } from "react-router-dom";

export default function CheckoutSuccess() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">Payment successful</p>
        <h1 className="text-3xl font-black uppercase tracking-[0.12em] text-[var(--fg-default)] sm:text-4xl">
          Thank you for your purchase!
        </h1>
        <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
          Your access to the course will be unlocked shortly. Check your email for a confirmation message with next steps.
        </p>
      </div>
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
          Ready to start learning?
        </p>
        <Link
          to="/education"
          className="inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-white shadow-[0_12px_30px_rgba(169,21,255,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(169,21,255,0.45)]"
        >
          Browse Courses
        </Link>
      </div>
      <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
        If you have any questions, reach out to <a className="font-semibold text-brand" href="mailto:support@bitcoin-square.com">support@bitcoin-square.com</a>.
      </p>
    </div>
  );
}
