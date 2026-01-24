# Bitcoin Square

React + Strapi integration demo. The frontend uses Vite and TanStack Query to consume content from a Strapi v5 instance.

## Setup

1. Copy `.env.example` to `.env` and fill in your Strapi URL and token.
2. Ensure Strapi v5 is running with the content types from `strapi/`.
3. Import legacy data:
   ```bash
   node scripts/import-strapi.ts
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```

When adding or updating dependencies, run `npm install` and commit the updated
`package-lock.json` so CI `npm ci` stays in sync.

## Testing

Vitest is configured for unit tests. Run:

```bash
npm test
```

## Strapi

The `strapi` directory contains schema definitions for Home, Lesson and Language as well as reusable SEO and rich text components. See `docs/strapi-plan.md` for more details.
