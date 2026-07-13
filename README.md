# Scan My Meal

Private, mobile-first nutrition tracking for Dr. Ashu and ABC of D® paid coaching clients.

## What is implemented

- Invitation-only Supabase Authentication with six-digit email OTP and secure-link support.
- Secure cookie sessions refreshed by the server proxy.
- Role and account-state routing for client, coach and administrator users.
- Seven-step onboarding with resumable drafts and versioned privacy, photo-processing, nutrition-estimate and AI-analysis consent.
- Supabase PostgreSQL schema, indexes, Row-Level Security, audit records and synthetic seed data.
- Private `meal-images` Storage bucket with owner, assigned-coach and administrator policies.
- Admin client list/detail, invitation send/resend/cancel and access-state controls.
- Protected meal upload, analysis, confirmation and history APIs.

The public homepage and visual language are preserved. OpenAI/ChatGPT workspace membership is not used for client access.

## Local setup

Requires Node.js 22.13 or newer and a Supabase project.

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and fill in the Supabase values.
3. In the Supabase SQL editor, run `supabase/migrations/202607130001_initial_access.sql`.
4. Optionally run `supabase/seed.sql` in a disposable local/staging project only.
5. Add `http://localhost:3000/auth/callback` to Supabase Authentication redirect URLs.
6. Copy the branded templates from `supabase/email-templates/` into the matching Supabase Auth templates. The OTP template uses `{{ .Token }}` and secure links use `{{ .ConfirmationURL }}`.
7. Run `npm run dev` and open `http://localhost:3000`.

The app intentionally has no public registration. Create the first administrator in Supabase Authentication, then set the matching `public.profiles` row to `role = 'admin'`, `account_status = 'active'`, and a completed onboarding timestamp using the SQL editor. All later clients can be invited from `/admin/clients/new`.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: project publishable key.
- `NEXT_PUBLIC_APP_URL`: canonical application origin.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only administrative key.
- `SUPABASE_AUTH_REDIRECT_URL`: exact `/auth/callback` URL for this environment.
- `AI_ANALYSIS_ENDPOINT` and `AI_API_KEY`: approved server-side meal-analysis provider.
- `ALLOW_DEMO_ANALYSIS`: local development only; never enable in production.

## Database and security

The migration in `supabase/migrations/` is the source of truth. Every sensitive table has RLS enabled. Client policies are owner-scoped, coach policies require an active assignment, and administrator policies use a server-side role lookup. The service-role key is confined to server modules and is never sent to browser code.

Storage objects use `userId/year/month/mealId/filename` paths in the private `meal-images` bucket. Access is controlled by Storage RLS; the application does not expose a public bucket URL.

Run the SQL policy checks in `supabase/tests/rls_access.sql` with pgTAP in a non-production project.

## Quality checks

```bash
npm run lint
npm test
npm run build
```

For a private pilot, also run `npm run pilot:check` and follow `PILOT-LAUNCH.md`. The readiness check displays only the name and state of each required integration; it never prints secret values.

Production launch still requires configured SMTP delivery, approved branded email templates, an authoritative licensed Indian-food nutrition dataset, a reviewed AI provider, legal review of retention/export/deletion language, rate limiting and staging end-to-end tests.

For SMTP, configure the provider host, port, username, password, sender address and sender name in the Supabase dashboard. These values are project secrets and are intentionally not application environment variables. Set the OTP expiry in Auth settings, retain the app&apos;s 60-second resend cooldown, and allow the exact local, staging and production `/auth/callback` URLs for their respective projects.

Meal photos remain private for the programme lifecycle and should be deleted after the legally approved retention window (the product currently communicates programme duration plus 30 days). Build the scheduled deletion/export process before production; account expiry alone never deletes historical records.
