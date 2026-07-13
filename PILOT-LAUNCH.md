# Scan My Meal private pilot launch

This checklist is the release gate for a small invitation-only pilot. Do not invite real clients until every required item is complete.

## 1. Supabase project

1. Create a dedicated staging/pilot Supabase project in the nearest suitable region.
2. Run both files in `supabase/migrations/` in filename order using the SQL editor.
3. Confirm the `meal-images` bucket exists and is marked private.
4. In Authentication settings, disable open email sign-up. Only administrators should create or invite users.
5. Add the exact pilot URL and its `/auth/callback` URL to allowed redirects. Keep `http://localhost:3000/auth/callback` for local development only.
6. Configure OTP expiry, the 60-second resend limit and CAPTCHA/rate limits.
7. Install the branded templates from `supabase/email-templates/` and configure custom SMTP before inviting clients.

## 2. First administrator

1. Create the administrator under Authentication > Users with the intended pilot email.
2. Copy `supabase/bootstrap-admin.example.sql`, replace its placeholder email and run it once in the SQL editor.
3. Sign in with that address and confirm `/admin` opens.
4. Never infer administrator access from an email address in application code.

## 3. Hosted configuration

Set these values in the hosting environment; secrets must be marked secret:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret)
- `SUPABASE_AUTH_REDIRECT_URL`
- `AI_ANALYSIS_ENDPOINT`
- `AI_API_KEY` (secret)

Do not set `ALLOW_DEMO_ANALYSIS` in production. Run `npm run pilot:check` locally with the same non-secret URLs and local secret values before publishing. `/api/health` must return HTTP 200 and `status: ready` after deployment.

## 4. Meal-analysis provider

The provider must accept a multipart image request, authenticate with a bearer token, honor the idempotency key and return the version `1.0` schema enforced in `lib/meal-analysis.ts`. It must not retain or train on meal images unless the final consent and vendor agreements explicitly permit that use. Production fails closed when the provider is unavailable.

## 5. Staging acceptance test

Use synthetic addresses and food photos only.

1. Administrator signs in with OTP.
2. Administrator creates and sends a client invitation.
3. The invited address accepts the link once; a second acceptance attempt fails safely.
4. Client completes all seven onboarding steps and required consents.
5. Client signs out and signs back in; the session is restored and role routing reaches the client dashboard.
6. Client uploads a valid image under 12 MB, confirms the estimated foods, edits one portion and saves the meal.
7. Meal totals and history reflect the saved correction.
8. A different client cannot read the meal, profile or signed image URL.
9. Assigned coach can view the client and add client-visible feedback; an unassigned coach cannot.
10. Administrator expires the programme; the client can sign in but cannot scan, upload or access paid dashboard features.
11. Administrator suspends and reactivates the client; both state transitions display the correct generic screens and create audit entries.
12. Sign-out clears the session. OTP resend cooldown and invalid/expired codes fail safely.

## 6. Pilot operating limits

- Begin with 2–5 consenting test clients.
- Review failed OTP delivery and meal-analysis errors daily without logging private payloads.
- Keep a manual support channel available.
- Do not make medical claims or use estimates for diagnosis or medication decisions.
- Do not enable public demo access in production.
- Review photo retention, export and deletion procedures before expanding beyond the pilot.

## Launch decision

Launch only when the readiness command passes, the health endpoint is ready, the staging acceptance test is complete, and Dr. Ashu has approved the nutrition wording and support process.
