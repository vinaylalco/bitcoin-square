# Bitcoin Square

React + Strapi integration demo. The frontend uses Vite and TanStack Query to consume content from a Strapi v5 instance. It also includes the Distinctive Journaling app, which uses Supabase Auth plus browser-side encryption for private journal drafts and completed entries.

## Setup

1. Copy `.env.example` to `.env` and fill in the values that apply to your local environment.
2. Ensure Strapi v5 is running with the content types from `strapi/` if you are working on the Strapi-backed site content.
3. Import legacy Strapi data when needed:
   ```bash
   node scripts/import-strapi.ts
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```

## Distinctive Journaling Supabase setup

Distinctive Journaling uses Supabase for account authentication and encrypted journal storage. Supabase Auth handles email/password sign up and login. The user's journal secret is an encryption passphrase only: it is used in the browser to derive an encryption key, is never sent to Supabase, and is not stored by the app.

### Create a Supabase project

1. Go to [Supabase](https://supabase.com/) and create a project.
2. Wait for the project to finish provisioning.
3. In the Supabase dashboard, open **Project Settings** → **API**.
4. Copy the **Project URL** into `VITE_SUPABASE_URL`.
5. Copy the browser-safe **anon public** key into `VITE_SUPABASE_ANON_KEY`.

Do **not** put the Supabase service role key in `.env`, Cloudflare Pages variables, or any frontend code. The service role key bypasses Row Level Security and must only be used in trusted server-side environments.

### Environment variables

Add these values to your local `.env` file:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-public-key
```

The `VITE_` prefix makes these values available to the browser bundle. That is expected for the anon key when Row Level Security is configured correctly.

### Run the SQL schema

1. Open your Supabase project dashboard.
2. Go to **SQL Editor**.
3. Open `supabase/journal_entries_schema.sql` from this repository.
4. Paste the full SQL into the Supabase SQL Editor.
5. Run the SQL once for the target project.

The SQL creates `public.journal_entries`, an `updated_at` trigger, indexes, comments, and RLS policies for authenticated users.

### Enable and verify Row Level Security

The schema file enables RLS on `public.journal_entries`. After running it, verify in Supabase:

1. Go to **Database** → **Tables** → `journal_entries`.
2. Confirm Row Level Security is enabled.
3. Open the table policies and confirm authenticated users can only `select`, `insert`, `update`, and `delete` rows where `auth.uid() = user_id`.

RLS is required because the browser uses the anon key. The anon key is safe for browser use only when policies correctly restrict access to each user's own rows.

### Current `journal_entries` table

The current multiple-entry schema stores one row per encrypted journal draft or completed entry. A user can have many rows.

| Column | Purpose |
| --- | --- |
| `id` | UUID primary key for the individual journal entry. |
| `user_id` | Supabase Auth user ID; protected by RLS with `auth.uid() = user_id`. |
| `encrypted_payload` | Client-side encrypted JSON blob containing the journal form data and current step. |
| `encryption_salt` | Salt used for key derivation; not secret. |
| `iv` | AES-GCM initialization vector/nonce; not secret. |
| `version` | Encryption payload version for future migrations. |
| `display_title` | Plaintext generic title used for list/display purposes. |
| `status` | Entry lifecycle status: `draft` or `complete`. |
| `created_at` | Server timestamp for row creation. |
| `updated_at` | Server timestamp maintained by the update trigger. |
| `completed_at` | Timestamp set when the user explicitly completes the final journal step. |

`display_title` is plaintext. Keep it generic, such as `Journal entry - [date]`, unless the user explicitly accepts the privacy tradeoff of storing meaningful titles outside the encrypted payload. Sensitive fields such as event names should stay inside `encrypted_payload`.

### Privacy model

- Email and password are handled by Supabase Auth.
- The journal secret is only an encryption passphrase and is not a login password.
- The secret is used only in the browser to derive an encryption key.
- The secret is not stored in Supabase, localStorage, or sessionStorage.
- Journal entries are encrypted in the browser before saving.
- Supabase stores encrypted blobs plus non-secret metadata only.
- Decrypted journal content should remain in memory and should not be written to localStorage/sessionStorage.

If a user forgets their secret, previously encrypted journal entries may not be recoverable. Supabase can reset an account password, but it cannot recover the client-side journal encryption secret because the app does not store it.

## Running locally

```bash
cp .env.example .env
npm install
npm run dev
```

Fill in the Supabase variables before using Distinctive Journaling auth or encrypted storage. Fill in the Strapi variables before working with Strapi-backed content.

## Building for Cloudflare Pages

Build the production bundle with:

```bash
npm run build
```

Use these Cloudflare Pages build settings:

- **Build command:** `npm run build`
- **Output directory:** `dist`

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Cloudflare Pages environment variables for the relevant deployment environments. Do not add the service role key.

## Current Distinctive Journaling limitations

- No full entries dashboard yet.
- No old-entry search UI yet.
- No account deletion UI yet.
- No export/import yet.

## Testing

Vitest is configured for unit tests. Run:

```bash
npm test
```

## Strapi

The `strapi` directory contains schema definitions for Home, Lesson and Language as well as reusable SEO and rich text components. See `docs/strapi-plan.md` for more details.
