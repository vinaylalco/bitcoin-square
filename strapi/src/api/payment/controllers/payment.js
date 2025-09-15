export default {
  async checkout(ctx) {
    const { lessonPlanId } = ctx.request.body || {};
    const user = ctx.state.user;

    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    if (!lessonPlanId) {
      return ctx.badRequest('lessonPlanId is required');
    }

    const lessonPlan = await strapi.entityService.findOne(
      'api::lesson-plan.lesson-plan',
      lessonPlanId,
      { fields: ['title', 'price'] }
    );

    if (!lessonPlan) {
      return ctx.notFound('Lesson plan not found');
    }

    const session = await strapi
      .service('api::payment.payment')
      .createCheckoutSession(lessonPlan, user.id);

    ctx.body = { url: session.url };
  },

  async webhook(ctx) {
    const signature = ctx.request.headers['stripe-signature'];
    const payload = ctx.request.rawBody || ctx.request.body;

    let event;
    try {
      event = strapi
        .service('api::payment.payment')
        .verifyWebhookSignature(payload, signature);
    } catch (err) {
      return ctx.badRequest(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { lessonPlanId, userId } = session.metadata || {};

      if (lessonPlanId && userId) {
        await strapi.entityService.create('api::purchase.purchase', {
          data: {
            user: userId,
            lesson_plan: lessonPlanId,
            stripeSessionId: session.id,
            paymentStatus: 'paid',
          },
        });
      }
    }

    ctx.body = { received: true };
  },

  async myPurchases(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    const purchases = await strapi.entityService.findMany(
      'api::purchase.purchase',
      {
        filters: { user: user.id, paymentStatus: 'paid' },
        populate: { lesson_plan: true },
      }
    );

    ctx.body = purchases.map((p) => p.lesson_plan);
  },
};
