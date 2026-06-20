# Distinctive Journaling Supabase E2E Manual Test Checklist

Use this checklist against a real Supabase test project after applying `supabase/journal_entries_schema.sql` and setting `VITE_SUPABASE_URL` plus `VITE_SUPABASE_ANON_KEY` locally. Do not use production user data while testing.

## Test data

- User A email: `dj-user-a+<timestamp>@example.com`
- User B email: `dj-user-b+<timestamp>@example.com`
- Password: use a generated test password with at least 8 characters.
- Secret: use a generated journal secret that is different from the password.
- Sensitive event name sample: `Private event name - should not appear in display_title`.

## Checklist

| # | Test case | Steps | Expected result | Current run status |
|---:|---|---|---|---|
| 1 | New user can sign up with email, password, confirm password, secret, confirm secret. | Open `/signup`, enter matching password and secret values, submit. | Account is created; if email confirmation is on, user sees the confirmation message; otherwise user is routed/linked to login. | Not run: requires live Supabase project credentials and browser session. |
| 2 | Secret mismatch blocks signup UI. | Open `/signup`, enter mismatched secret/confirm secret, submit. | UI blocks submit and shows `Secret and confirm secret must match.`; no Supabase request should include the secret. | Not run: requires browser form test. |
| 3 | Password mismatch blocks signup UI. | Open `/signup`, enter mismatched password/confirm password, submit. | UI blocks submit and shows `Password and confirm password must match.` | Not run: requires browser form test. |
| 4 | User can log in with email/password/secret. | Confirm User A if needed, open `/login`, enter email/password/secret, submit. | User is authenticated, secret is kept in memory, and the app redirects to `/`. | Not run: requires live Supabase project credentials and browser session. |
| 5 | User cannot log in with wrong password. | Open `/login`, enter valid email, wrong password, and any secret, submit. | Login fails with a generic error and does not unlock the journal. | Not run: requires live Supabase project credentials and browser session. |
| 6 | Secret is not sent to Supabase during signup/login. | Inspect browser Network tab for `/auth/v1/signup` and `/auth/v1/token?grant_type=password`. | Request bodies contain email/password only; no secret field or secret value appears. | Code-audited pass; still verify in browser Network tab. |
| 7 | Logged-in user with secret can fill journaling form. | Log in, open the journal, fill all six steps. | Form accepts text without writing plaintext to storage. | Not run: requires browser form test. |
| 8 | User can save a draft journal entry. | Fill the journal and click Save draft. | UI shows draft save success and Supabase receives encrypted fields only. | Not run: requires live Supabase project credentials and browser session. |
| 9 | First save inserts a new `journal_entries` row. | Save a new draft without an existing selected entry id. | A new row is inserted and the returned row id is stored as the current editing entry id. | Code-audited pass; still verify in Supabase table. |
| 10 | Subsequent save updates the same row by id during that editing session. | Change a field and save again without refreshing. | The same row id is updated; no second row is created for the same editing session. | Code-audited pass; still verify in Supabase table. |
| 11 | Final submit marks the entry complete if implemented. | Navigate to the final step and click the complete/submit action. | Existing/current entry is saved with `status = complete` and `completed_at` set. | Code-audited pass; still verify in Supabase table. |
| 12 | Supabase row contains `encrypted_payload` only, not readable journal text. | Open Supabase table editor for the saved row. | Sensitive form text does not appear in `encrypted_payload` or other columns. | Not run: requires live Supabase row inspection. |
| 13 | `display_title` is generic and does not reveal `eventName`. | Save an entry with a sensitive event name, inspect `display_title`. | Title is generic, e.g. `Journal entry - [date]`, and does not contain the event name. | Code-audited pass; still verify in Supabase table. |
| 14 | Page refresh keeps Supabase auth session but loses in-memory secret. | Log in/unlock, refresh the page. | User remains authenticated but the journal asks for the secret again. | Not run: requires browser session test. |
| 15 | User is asked to unlock with secret after refresh. | After refresh, open the journal. | Unlock form is displayed before any decryption happens. | Not run: requires browser session test. |
| 16 | Correct secret decrypts and loads the most recent draft, if implemented. | Enter correct secret after refresh with an existing draft. | Most recently updated draft loads and restores saved fields/current step. | Code-audited pass; still verify in browser. |
| 17 | Wrong secret fails gracefully. | Enter wrong secret when unlocking an existing draft. | UI shows `We could not unlock this journal with that secret. Please check the secret and try again.` and does not update stored data. | Code-audited pass; still verify in browser. |
| 18 | Logout clears user, secret, and decrypted data. | Log in, unlock, load/fill journal, click Logout. | Supabase session, in-memory secret, and decrypted state are cleared. | Code-audited pass; still verify in browser devtools. |
| 19 | User A cannot read User B's rows due to RLS. | Save rows as User A and User B; attempt to query User B's row with User A session. | Query returns no row or an RLS/permission error. | Not run: requires live Supabase project with two users. |
| 20 | No plaintext journal data appears in console logs. | Perform signup/login/save/load/wrong-secret flows with DevTools Console open. | No plaintext journal field values appear. | Code-audited pass; still verify in browser console. |
| 21 | No secret appears in console logs. | Repeat auth/unlock/save/load flows with DevTools Console open. | Secret value never appears. | Code-audited pass; still verify in browser console. |
| 22 | Build passes. | Run `npm run build`. | Production bundle builds successfully. | Pass: build completed successfully in local audit run. |

## Bugs found in current local run

- No live Supabase project credentials were available in this environment, so browser/network/database portions of the checklist remain manual verification items.
- `npm run lint` is not available because `package.json` does not define a `lint` script.
- The full Vitest suite is currently not green in this environment because one existing `CourseDetailAccess.test.tsx` assertion fails and `jsdom` is missing.

## Fixes applied during this audit sequence

- Supabase signup/login auth errors were sanitized in `src/lib/supabaseClient.ts` so raw provider error details are not shown to users.

## Remaining manual checks

Run the checklist above with a disposable Supabase project, two test users, browser DevTools Network/Console tabs open, and the Supabase Table Editor or SQL Editor available for row/RLS verification.
