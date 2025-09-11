export interface CheckoutResponse {
  url: string;
}

interface CheckoutOptions {
  productType: string;
  productId: string | number;
  email?: string;
  token?: string;
}

/**
 * Calls the backend checkout endpoint and returns the Stripe Checkout URL.
 */
export async function checkout({
  productType,
  productId,
  email,
  token,
}: CheckoutOptions): Promise<CheckoutResponse> {
  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ productType, productId, email }),
  });
  if (!res.ok) {
    throw new Error(res.statusText);
  }
  return (await res.json()) as CheckoutResponse;
}
