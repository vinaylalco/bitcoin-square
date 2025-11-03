import { useMutation } from "@tanstack/react-query";
import {
  createMembershipCheckout,
  type CreateMembershipCheckoutResponse,
} from "../lib/strapi";
import type { MembershipType } from "../utils/membership";

interface MembershipCheckoutPayload {
  email: string;
  membershipType: MembershipType;
  discountCode?: string;
}

export function useMembershipCheckout() {
  return useMutation<
    CreateMembershipCheckoutResponse,
    Error,
    MembershipCheckoutPayload
  >({
    mutationFn: ({ email, membershipType, discountCode }) =>
      createMembershipCheckout({
        membershipType,
        userEmail: email,
        discountCode,
      }),
  });
}

export type { MembershipType };
