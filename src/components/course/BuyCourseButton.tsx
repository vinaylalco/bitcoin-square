import { useState, MouseEvent } from "react";
import { useCreateCheckoutSession } from "../../hooks/useCreateCheckoutSession";
import { getStripe } from "../../lib/stripeClient";

interface BuyCourseButtonProps {
  lessonPlanId?: number;
  stripePriceId?: string | null;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export default function BuyCourseButton({
  lessonPlanId,
  stripePriceId,
  label = "Buy Course",
  className = "",
  disabled = false,
}: BuyCourseButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync, isPending } = useCreateCheckoutSession();

  async function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (typeof lessonPlanId !== "number" || !stripePriceId) {
      setError("This course is not currently available for purchase.");
      return;
    }

    try {
      setError(null);
      const session = await mutateAsync({
        lessonPlanId,
        priceId: stripePriceId,
      });

      const stripe = await getStripe();
      if (!stripe) {
        throw new Error("Unable to initialize Stripe. Please try again later.");
      }

      const result = await stripe.redirectToCheckout({ sessionId: session.id });
      if (result.error) {
        throw new Error(result.error.message || "Unable to start checkout.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start checkout.";
      setError(message);
    }
  }

  const isDisabled =
    disabled ||
    isPending ||
    typeof lessonPlanId !== "number" ||
    !stripePriceId;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-white shadow-[0_12px_30px_rgba(169,21,255,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(169,21,255,0.45)] disabled:cursor-not-allowed disabled:opacity-70 ${className}`.trim()}
      >
        {isPending ? "Processing…" : label}
      </button>
      {error && (
        <p className="text-xs font-medium text-red-500 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
