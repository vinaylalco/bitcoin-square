export type TipAttemptAction = "button" | "manual-open";

export interface TipAttemptDetail {
  context: "feed" | "chat" | "profile" | (string & {});
  hasEndpoint: boolean;
  action: TipAttemptAction;
  timestamp?: number;
}

export const recordTipAttempt = (detail: TipAttemptDetail) => {
  if (typeof window === "undefined") {
    return;
  }

  const payload = {
    type: "tip_attempt" as const,
    timestamp: detail.timestamp ?? Date.now(),
    context: detail.context,
    hasEndpoint: detail.hasEndpoint,
    action: detail.action,
  };

  try {
    window.dispatchEvent(new CustomEvent("bitcoinsquare:analytics", { detail: payload }));
  } catch (error) {
    if (import.meta.env?.DEV) {
      console.warn("Failed to record tip attempt", error);
    }
  }
};
