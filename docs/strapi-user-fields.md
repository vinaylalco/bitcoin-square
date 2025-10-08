# Strapi user fields for community features

The front-end expects the Strapi **User** content type (in `plugins::users-permissions.user`) to expose a few extra fields beyond the defaults so that profile customization and Lightning support work correctly:

| Field name        | Type    | Notes |
|-------------------|---------|-------|
| `lnWalletAddress` | String  | Stores the member's Lightning address. Used to enable zaps and Bitcoin tipping. Empty/`null` hides zap buttons. |
| `screenName`      | String  | Optional display name shown instead of the nostr public key. Front-end generates a warm default but saves changes here. |
| `avatarUrl`       | String  | Optional profile photo URL. Users can upload a picture and we persist the resulting URL. |

For backwards compatibility the UI will also read from an older `lightningAddress` string if it exists, but only `lnWalletAddress` is updated when saving. Make sure these attributes are writable by the authenticated user role so the dashboard forms can update them via `PUT /api/users/:id`.
