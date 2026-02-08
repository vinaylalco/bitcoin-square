export default {
  routes: [
    {
      method: 'POST',
      path: '/payment/checkout',
      handler: 'payment.checkout',
      config: {
        policies: ['plugin::users-permissions.isAuthenticated'],
      },
    },
    {
      method: 'POST',
      path: '/payment/webhook',
      handler: 'payment.webhook',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/my-purchases',
      handler: 'payment.myPurchases',
      config: {
        policies: ['plugin::users-permissions.isAuthenticated'],
      },
    },
  ],
};
