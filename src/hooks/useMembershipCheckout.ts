import { useMutation } from "@tanstack/react-query";
import { createMembershipCheckout } from "../lib/strapi";
import type { MembershipType } from "../utils/membership";

interface MembershipCheckoutPayload {
  email: string;
  membershipType: MembershipType;
}

interface MembershipCheckoutResponse {
  invoiceUrl: string;
}

export function useMembershipCheckout() {
  return useMutation<
    MembershipCheckoutResponse,
    Error,
    MembershipCheckoutPayload
  >({
    mutationFn: ({ email, membershipType }) =>
      createMembershipCheckout({ membershipType, userEmail: email }),
  });
}

export type { MembershipType };
