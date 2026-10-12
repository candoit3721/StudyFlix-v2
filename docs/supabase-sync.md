# Progress sync with Supabase

StudyFlix keeps each learner's progress in the browser.
When a parent signs a device in to the family account, that progress also syncs through [Supabase](https://supabase.com) (hosted Postgres), so it follows every learner to every signed-in device and browser.

The site stays fully static on GitHub Pages.
The browser talks to Supabase directly, and Row Level Security makes sure only the signed-in family account can read or write its data.

## What is synced

- **Synced**: quiz progress (which items each learner got right, and how many tries it took), practice progress (answers per practice block), and each learner's **last visit** (the last lesson page they opened, and when).
- **Not synced**: learner profiles (name, avatar icon, accent colour and courses) stay in `content/learners/*.yaml` and are not editable in the app.
  The current learner ("Who's learning today?") stays per device, because different children use different devices.
- **Signed out, offline or not set up**: everything still works.
  Lessons save progress in the browser as before, and nothing is sent anywhere.
  Answers given while signed out or offline are sent the next time the device is signed in and online.

## How it works

- `src/lib/progress.ts` is the local cache that every page reads synchronously.
  Each answer updates the cache at once and, on a device that has synced before, is also queued in an outbox (`src/lib/sync/outbox.ts`).
- `src/lib/sync/engine.ts` runs when a page loads, when the browser comes back online, when the tab becomes visible, and shortly after each answer.
  It sends the outbox, pulls the per-learner summary and the last visits, and rebuilds the local cache (`src/lib/sync/model.ts` holds the pure logic).
- The database (`supabase/migrations/20261012000000_learner_progress.sql`) stores answers as append-only events, so two devices can never overwrite each other and a retried send is ignored.
  The `progress_summary` view adds them up per learner, lesson and item.
  `learner_visits` keeps one last visit per learner, and never moves it backwards.
- At a device's first sign-in, the progress already saved on that device is uploaded once.
  Signing out keeps the progress on the device.
- `@supabase/supabase-js` is downloaded only on a signed-in device, or when a parent signs in, so signed-out pages make no requests to Supabase at all.

## One-time setup (a parent does this once)

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (the free plan is enough for a family).
2. **Create the tables.**
   Open the project's SQL editor, paste the whole of `supabase/migrations/20261012000000_learner_progress.sql`, and run it.
   If you use the Supabase CLI instead, link the project and run `supabase db push`.
3. **Set up sign-in** under Authentication:
   - keep the **Email** provider turned on;
   - under Sign In / Providers (or Authentication settings), turn **off** "Allow new users to sign up", so no one else can create an account;
   - under Authentication > Users, choose **Add user**, enter the family email address and a strong password, and tick **Auto Confirm User**.
     This is the one account every device signs in with.
4. **Connect the site.**
   In the project's Connect dialog (or Project Settings > API Keys), copy the **project URL** and the **publishable key** (`sb_publishable_...`; a legacy anon key also works).
   Both are public by design: Row Level Security protects the data, not the key.
   - For the published site: in GitHub, open the repository's Settings > Secrets and variables > Actions > **Variables**, and add `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` as repository variables.
     The next push to `main` builds and deploys the site with sync turned on.
   - For `npm run dev` on your computer: copy `.env.example` to `.env` and fill in the same two values.
     `.env` is ignored by git; never commit it.
5. **Sign in on each device** at `/account/` (the "Family sign-in" link in the footer).
   Progress already saved on that device is uploaded at its first sign-in.
   From then on, the device stays signed in until someone chooses "Sign out of this device".

If either variable is missing or empty, the site behaves exactly as before: progress stays in each browser, and the sign-in page says that syncing is not set up.

## When something goes wrong

- **"Could not reach the sync service"** on the sign-in page means the device is offline or Supabase is not answering.
  Progress keeps saving on the device and syncs when the connection is back.
- **Paused project.** Supabase may pause a free project after a period of inactivity.
  Sync then fails like being offline, and the site keeps working.
  To restore it, sign in to the Supabase dashboard, open the project and choose **Restore project**; queued answers sync on the next visit.
- **Forgotten password.** Reset it for the family user under Authentication > Users in the dashboard, then sign in again on each device.

## For future agents: testing without a real project

- **Test override.** If `globalThis.__STUDYFLIX_SYNC__` is defined before the page scripts run, it replaces the build-time config (`src/lib/sync/config.ts`).
  An object `{ url, key }` turns sync on, and `null` turns it off.
  The e2e tests set it with `context.addInitScript`.
  This is safe in production, because a visitor can only redirect their own browser.
- **Fake backend.** `tests/e2e/fake-supabase.ts` is an in-memory fake of the few auth and REST endpoints the engine uses, served on the site's own origin under `/__fake-supabase/` through Playwright routing.
  Its state lives in the test process, so two browser contexts (two devices) in one test share it.
  Unknown requests are logged and answered with 501.
- **Migration test.** `tests/unit/migration.test.ts` runs the migration in PGlite (Postgres in WebAssembly) with a minimal stand-in for Supabase's `auth` schema and roles, and checks the view, Row Level Security and grants.
- **Pure logic.** `tests/unit/sync.test.ts` covers the model, the outbox and a full sync run against in-memory fakes.
- Never point tests or agents at the real project, and never commit a real URL or key.
