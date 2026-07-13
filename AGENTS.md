# Scan My Meal contributor guide

Scan My Meal is a private paid-client nutrition companion. Keep the experience calm, compassionate and mobile-first. Automated suggestions must follow the whole-food plant-based programme, clearly identify photographed food, avoid diagnosis or medication guidance, and state that image-based nutrition is an estimate.

## Security rules

- Supabase Authentication is the only client identity system; do not add open registration or workspace membership requirements.
- Enforce account status, programme status, role and ownership on the server and with Row-Level Security.
- Use `auth.getClaims()` for server authorization. Never trust browser-supplied user IDs or roles.
- Keep `SUPABASE_SERVICE_ROLE_KEY` in server-only code. Never prefix it with `NEXT_PUBLIC_`.
- Store meal photos only in the private `meal-images` bucket and preserve the owner path convention.
- Validate uploads and AI responses; require explicit confirmation before saving a meal.
- Never log tokens, images, full health profiles or provider payloads.
- Demo analysis is development-only; production fails safely when the provider is absent.

## Structure

- `app/`: public and protected App Router pages and APIs.
- `lib/access-control.ts`: authenticated server access context and redirects.
- `lib/access-rules.ts`: pure account/programme routing rules.
- `lib/supabase/`: browser, server, proxy, admin and database typing clients.
- `supabase/migrations/`: PostgreSQL schema, policies and private bucket configuration.
- `supabase/tests/`: pgTAP policy assertions.
- `tests/`: deterministic unit tests without external calls.

Use strict TypeScript, semantic HTML, visible focus states, 44 px touch targets and reduced-motion support. Before completing work run `npm run lint`, `npm test` and `npm run build`.
