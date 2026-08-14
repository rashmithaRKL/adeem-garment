# Folder architecture

Feature-sliced. A feature owns its pages, queries and logic; `shared/` and `components/` hold only
things used by more than one feature. This keeps future modules (mobile capture, downtime reporting,
payroll) additive instead of invasive.

    src/
      app/                  application shell: providers, router, guards
        App.tsx
        providers.tsx       react-query + auth providers
        router.tsx          route table, admin and employee subtrees
        guards.tsx          RequireAuth, RequireRole, RedirectByRole
      features/
        auth/               session, profile, role resolution, login page
        dashboard/          KPI + line aggregation queries, realtime subscription
        lines/              production line screens
        orders/             order screens
        analytics/          efficiency and buyer mix
        quality/            inspection reports: parsing, import, line-wise screens
        hr/                 carder and attendance: sheet parser, import, HR screen
        loading/            loading plan: sheet parser, import, line-wise queue
        excel/              the whole upload pipeline (parse, detect, hash, compress, import)
                            plus sheetKit.ts, the shared header matcher the HR and
                            loading-plan parsers are built on, and templates.ts
        uploads/            upload lists, version history, upload details
        employees/          admin-only employee management
        audit/              admin-only audit log
        settings/           admin-only system settings
        notifications/      employee inbox
      components/           presentational primitives (Card, Kpi, StatusChip, ProgressBar, Table)
        charts/             Donut, BarChart, LineChart, RankedBars + the series palette
      layouts/              AdminLayout, EmployeeLayout, AuthLayout
      lib/                  supabase client, env, formatters, error mapping
      types/                database.ts (generated), domain.ts (hand-written)
      styles/               tokens.css + global.css
    supabase/
      migrations/           schema, RLS, storage, seed
      functions/            process-excel, download-excel

## Rules

- A feature never imports another feature's internals — only its `index.ts` barrel.
- No component builds a Supabase query inline; queries live in `features/<x>/queries.ts`.
- No dashboard number is hardcoded. Every figure is an aggregate over `production_records`.
- Nothing privileged runs in the browser. If it needs the service role, it is an Edge Function.

## Regenerating database types

    supabase gen types typescript --project-id <ref> > src/types/database.ts
