import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export default {
  async create(ctx) {
    const { productType, productId, email } = ctx.request.body || {};

    if (!productType || !productId) {
      return ctx.badRequest('productType and productId are required');
    }

    let customerEmail = email;
    let userId: number | null = null;

    if (ctx.state && ctx.state.user) {
      userId = ctx.state.user.id;
      customerEmail = ctx.state.user.email;
    } else if (!email) {
      return ctx.badRequest('Email is required');
    }

    let productName = productType;
    let price = 0;
    try {
      const uid = `api::${productType}.${productType}`;
      const product = await strapi.entityService.findOne(uid, productId);
      if (product) {
        productName = product.title || product.name || productType;
        price = product.price || 0;
      }
    } catch (err) {
      return ctx.badRequest('Invalid product');
    }

    if (!price) {
      return ctx.badRequest('Invalid product');
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: productName },
            unit_amount: Math.round(price * 100),
          },
          quantity: 1,
        },
      ],
      success_url: process.env.STRIPE_SUCCESS_URL || 'https://example.com/success',
      cancel_url: process.env.STRIPE_CANCEL_URL || 'https://example.com/cancel',
      customer_email: customerEmail,
    });

    await strapi.entityService.create('api::order.order', {
      data: {
        user: userId,
        email: customerEmail,
        productType,
        productId: productId.toString(),
        stripeSessionId: session.id,
        paymentStatus: 'pending',
      },
    });

    ctx.body = { url: session.url };
  },
};
