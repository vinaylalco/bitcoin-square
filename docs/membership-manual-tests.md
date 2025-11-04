# Membership Checkout Manual Verification

To confirm the membership signup flow no longer triggers a `404` after registration:

1. Register a brand-new user from the membership portal signup form.
2. Observe the successful Strapi registration response in the network tab and note the returned numeric `user.id`.
3. Continue through the flow and initiate checkout without refreshing the page.
4. The checkout request now includes the captured `userId`, allowing the Strapi controller to look up the just-created account without relying on eventual email persistence.
5. Verify that the API responds with a checkout session (invoice URL or success message) instead of a `404`.

This scenario covers back-to-back `register → checkout` submissions and ensures the retry logic introduced in the payments controller resolves transient user lookup delays.
