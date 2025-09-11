import Stripe from 'stripe';
import { randomBytes } from 'crypto';
import { generateNostrKeyPair, encryptPrivateKey } from '../../utils/nostr';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export default {
  async stripe(ctx) {
    const sig = ctx.request.headers['stripe-signature'];
    const rawBody = ctx.request.body;

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig as any,
        process.env.STRIPE_WEBHOOK_SECRET as string
      );
    } catch (err: any) {
      strapi.log.error('Stripe webhook signature verification failed', err);
      ctx.throw(400, `Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const [order] = await strapi.entityService.findMany('api::order.order' as any, {
        filters: { stripeSessionId: session.id },
        populate: { user: true },
      });

      if (order) {
        let userId = order.user?.id;
        const email =
          session.customer_details?.email ||
          (session as any).customer_email ||
          order.email;

        if (!userId) {
          const existingUser = await strapi.db
            .query('plugin::users-permissions.user' as any)
            .findOne({ where: { email } });

          if (existingUser) {
            userId = existingUser.id;
          } else {
            const password = randomBytes(16).toString('hex');
            const { pub, priv } = generateNostrKeyPair();
            const encryptedPriv = await encryptPrivateKey(priv, password);
            const newUser = await strapi.entityService.create(
              'plugin::users-permissions.user' as any,
              {
                data: {
                  username: email,
                  email,
                  password,
                  nostrPublicKey: pub,
                  nostrPrivateKey: encryptedPriv,
                },
              }
            );
            userId = newUser.id;
            try {
              await (strapi.plugin('email').service('email') as any).send({
                to: email,
                subject: 'Your new account',
                text: 'Please reset your password to access your purchase.',
              });
            } catch (e) {
              strapi.log.error('Failed to send email', e);
            }
          }
        }

        await strapi.entityService.update('api::order.order' as any, order.id, {
          data: { user: userId, paymentStatus: 'paid' },
        });

        if (order.productType === 'course') {
          await strapi.entityService.create('api::access-grant.access-grant' as any, {
            data: { user: userId, course: order.productId },
          });
        }
      }
    }

    ctx.body = { received: true };
  },
};

