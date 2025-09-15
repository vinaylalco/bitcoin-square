import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default {
  async createCheckoutSession(lessonPlan, userId) {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: lessonPlan.title,
            },
            unit_amount: Math.round(Number(lessonPlan.price) * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.PUBLIC_URL}/purchase/success`,
      cancel_url: `${process.env.PUBLIC_URL}/purchase/cancel`,
      metadata: {
        lessonPlanId: String(lessonPlan.id),
        userId: String(userId),
      },
    });

    return session;
  },

  verifyWebhookSignature(payload, signature) {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  },
};
