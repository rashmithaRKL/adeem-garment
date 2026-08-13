# Adeem Garment — Production Management System

React + TypeScript + Vite front end, Supabase back end (Postgres + Auth + Storage + RLS + Edge Functions),
deployed as a static site on **Cloudflare Pages (free plan)**.

## Why this split

Cloudflare Pages free serves static assets. Every privileged operation — role checks, Excel parsing,
compression, storage writes, signed downloads — runs in **Supabase Edge Functions**, so no service-role
key ever reaches the browser and no paid Cloudflare Worker plan is required.

    Browser (Cloudflare Pages)  ->  Supabase Auth        (session)
                                ->  Supabase Postgres    (RLS-filtered reads)
                                ->  Edge Functions       (privileged writes, compression, signed URLs)
                                ->  Supabase Storage     (private bucket, never public)

## Quick start

    npm install
    cp .env.example .env.local        # fill in your Supabase URL + anon key
    npm run dev

## Database

Run the migrations in order against your Supabase project:

    supabase db push                  # or paste each file into the SQL editor

    supabase/migrations/0001_schema.sql          tables, indexes, triggers
    supabase/migrations/0002_rls.sql             row level security policies
    supabase/migrations/0003_storage.sql         private bucket + storage policies
    supabase/migrations/0004_seed.sql            5 production lines + demo orders
    supabase/migrations/0005_status_realtime_audit.sql  status enums, realtime, audit log
    supabase/migrations/0006_quality.sql         quality uploads, inspections, defects
    supabase/migrations/0007_quality_lines.sql   register a line from an imported report
    supabase/migrations/0008_hr_loading_plan.sql HR attendance + loading plan

## Edge Functions

    supabase functions deploy process-excel
    supabase functions deploy download-excel

Set their secrets once:

    supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...

## Deploy to Cloudflare Pages

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Env vars | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

`public/_redirects` sends all paths to `index.html` so client-side routes such as `/admin/employees`
resolve on a hard refresh. Only the anon key is exposed — it is safe by design because RLS is the gate.

## Security model

Authorization is enforced four times, each sufficient alone:

1. **Route guard** — `RequireRole` resolves the role from the database before rendering, so admin
   markup never flashes for an employee.
2. **Edge Function** — re-reads `profiles.role` from the JWT's user id; never trusts a client claim.
3. **RLS** — policies filter rows in Postgres, so a crafted query returns nothing.
4. **Storage** — the bucket is private; downloads are 60-second signed URLs issued after a check.

## Roadmap hooks

The layout is feature-sliced so upgrades stay local:

- more production lines: insert rows in `production_lines` — no code change, nothing is hardcoded to five
- new Excel layouts: add synonyms to `src/features/excel/columnDetection.ts`
- mobile capture, downtime reporting, manual entry: new folders under `src/features/`
- background processing at volume: move `importService` into a queued Edge Function
