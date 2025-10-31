import React, { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createPaymentSession, type MembershipType } from "../api/membership";
import PlanCard from "../components/PlanCard";
import { useAuth } from "../context/AuthContext";
import { useMembership } from "../hooks/useMembership";
import {
  readMembershipEmail,
  readMembershipPaymentId,
  storeMembershipEmail,
  storeMembershipPaymentId,
} from "../utils/membershipStorage";

type PlanDefinition = {
  id: MembershipType;
  title: string;
  highlight?: boolean;
  priceLabel: string;
  description: string;
  amount: number;
  ctaLabel: string;
};

const plans: PlanDefinition[] = [
  {
    id: "annual",
    title: "Annual Plan",
    highlight: true,
    priceLabel: "$5 / month",
    description: "Billed annually ($60 total)",
    amount: 60,
    ctaLabel: "Choose Annual",
  },
  {
    id: "lifetime",
    title: "Lifetime Plan",
    priceLabel: "$70 one-time",
    description: "One-time payment",
    amount: 70,
    ctaLabel: "Choose Lifetime",
  },
];

export default function Membership() {
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<PlanDefinition | null>(null);
  const [email, setEmail] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingPaymentId, setPendingPaymentId] = useState<string>("");

  useEffect(() => {
    const initialEmail = user?.email?.trim() || readMembershipEmail();
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [user?.email]);

  useEffect(() => {
    setPendingPaymentId(readMembershipPaymentId());
  }, []);

  useEffect(() => {
    const normalized = email.trim();
    if (normalized) {
      storeMembershipEmail(normalized);
    } else {
      storeMembershipEmail("");
    }
  }, [email]);

  const trimmedEmail = useMemo(() => email.trim(), [email]);

  const membershipStatusQuery = useMembership(trimmedEmail);

  const membershipStatus = membershipStatusQuery.membership;
  const hasActiveMembership = membershipStatusQuery.isSubscribed;
  const isPollingMembership =
    membershipStatusQuery.isFetching || membershipStatusQuery.isRefetching;

  useEffect(() => {
    if (hasActiveMembership) {
      storeMembershipPaymentId("");
      setPendingPaymentId("");
    }
  }, [hasActiveMembership]);

  const { mutateAsync, isPending } = useMutation({
    mutationFn: createPaymentSession,
  });

  const handlePlanSelect = (plan: PlanDefinition) => {
    setSelectedPlan(plan);
    setFormError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPlan) {
      setFormError("Please choose a membership plan to continue.");
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError("Please enter an email address.");
      return;
    }

    try {
      setFormError(null);
      const response = await mutateAsync({
        amount: selectedPlan.amount,
        membershipType: selectedPlan.id,
        userEmail: trimmedEmail,
      });

      storeMembershipEmail(trimmedEmail);
      storeMembershipPaymentId(response.paymentId);
      setPendingPaymentId(response.paymentId);
      window.location.href = response.paymentUrl;
    } catch (error) {
      if (error instanceof Error) {
        setFormError(error.message);
      } else {
        setFormError("We couldn't start the checkout. Please try again.");
      }
    }
  };

  const headerCopy = useMemo(() => {
    if (selectedPlan?.id === "lifetime") {
      return "Lifetime access, one simple payment.";
    }
    if (selectedPlan?.id === "annual") {
      return "Annual membership billed once a year.";
    }
    return "Choose the membership that fits you best.";
  }, [selectedPlan?.id]);

  let statusBanner: React.ReactNode = null;

  if (trimmedEmail) {
    if (membershipStatusQuery.isError) {
      const message =
        membershipStatusQuery.error instanceof Error
          ? membershipStatusQuery.error.message
          : "We couldn't confirm your membership status.";
      statusBanner = (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-700 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.24em]">Membership status</p>
          <p className="mt-2 text-sm">{message}</p>
          <button
            type="button"
            onClick={() => membershipStatusQuery.refetch()}
            className="mt-3 inline-flex items-center justify-center rounded-full border border-red-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-red-700 transition hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      );
    } else if (hasActiveMembership) {
      statusBanner = (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-700 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.24em]">Membership active</p>
          <p className="mt-2 text-sm">
            Your {membershipStatus?.membershipType ?? "Bitcoin Square"} membership is active. Enjoy premium content!
          </p>
        </div>
      );
    } else {
      const hasPendingSignal = Boolean(
        pendingPaymentId || membershipStatus || isPollingMembership,
      );

      if (hasPendingSignal) {
        statusBanner = (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.24em]">Awaiting confirmation</p>
            <p className="mt-2 text-sm">
              We're waiting for NowPayments to confirm your transaction. We'll refresh your membership status automatically.
            </p>
            <div className="mt-3 flex items-center gap-3 text-xs uppercase tracking-[0.24em]">
              <span className="font-semibold">Status:</span>
              <span className="rounded-full bg-amber-100 px-3 py-1 font-medium">
                {isPollingMembership ? "Checking..." : "Waiting for confirmation"}
              </span>
              <button
                type="button"
                onClick={() => membershipStatusQuery.refetch()}
                className="ml-auto inline-flex items-center justify-center rounded-full border border-amber-300 px-3 py-1 font-semibold text-amber-800 transition hover:bg-amber-100"
              >
                Refresh now
              </button>
            </div>
          </div>
        );
      }
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-4 py-16 sm:py-20">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">Membership</p>
        <h1 className="mt-3 text-3xl font-extrabold text-[var(--fg-default)] sm:text-4xl">
          Unlock premium Bitcoin Square content
        </h1>
        <p className="mt-4 text-base text-[var(--fg-muted)] sm:text-lg">{headerCopy}</p>
      </div>

      {statusBanner}

      <div className="grid gap-6 md:grid-cols-2">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            title={plan.title}
            priceLabel={plan.priceLabel}
            description={plan.description}
            ctaLabel={plan.ctaLabel}
            highlight={plan.highlight}
            isSelected={selectedPlan?.id === plan.id}
            onSelect={() => handlePlanSelect(plan)}
          />
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full flex-col gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-sm sm:w-3/4"
      >
        <div className="space-y-2">
          <label htmlFor="membership-email" className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)]">
            Email address
          </label>
          <input
            id="membership-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-4 py-3 text-[var(--fg-default)] shadow-inner focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
            placeholder="you@example.com"
          />
          <p className="text-xs text-[var(--fg-muted)]">
            We'll use this email to send your receipt and activate your membership in Strapi.
          </p>
        </div>

        {formError ? <p className="text-sm font-medium text-red-500">{formError}</p> : null}

        <button
          type="submit"
          disabled={isPending || hasActiveMembership}
          className="inline-flex items-center justify-center rounded-full bg-brand px-8 py-3 text-sm font-semibold uppercase tracking-[0.24em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending
            ? "Redirecting..."
            : hasActiveMembership
            ? "Membership active"
            : selectedPlan
            ? `Continue with ${selectedPlan.title}`
            : "Continue to checkout"}
        </button>
      </form>

      <p className="text-center text-xs text-[var(--fg-muted)]">
        Payments are processed through NowPayments using USDT. Once your payment is confirmed, your membership will be activated automatically.
      </p>
    </div>
  );
}
