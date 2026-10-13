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
- The database (`supabase/migrations/20261013004603_learner_progress.sql`) stores answers as append-only events, so two devices can never overwrite each other and a retried send is ignored.
  The `progress_summary` view adds them up per learner, lesson and item.
  `learner_visits` keeps one last visit per learner, and never moves it backwards.
- At a device's first sign-in, the progress already saved on that device is uploaded once.
  Signing out keeps the progress on the device.
- `@supabase/supabase-js` is downloaded only on a signed-in device, or when a parent signs in, so signed-out pages make no requests to Supabase at all.

## The family project

| | |
|---|---|
| Project | `studyflix`, in the Supabase organization Study-Flix (free plan) |
| Project ref | `qyeksmswibgkmsfhbrpv` |
| Region | `ca-central-1` (Canada Central) |
| Project URL | `https://qyeksmswibgkmsfhbrpv.supabase.co` |
| Publishable key | `sb_publishable__j92W7nS36szAeo4rvFHzA_2qsbu7d1` |
| Dashboard | <https://supabase.com/dashboard/project/qyeksmswibgkmsfhbrpv> |

The project URL and the publishable key are public by design: they are built into the published site, and Row Level Security, not the key, protects the data.
That is why they are written here and in `.env.example`.
Never commit anything secret: not a `.env` file, not a secret key (`sb_secret_...`), not the legacy `service_role` key, and not the database password.

## One-time setup (a parent does this once)

Do the steps in this order.
The published site only turns sync on at step 5, so by then the tables exist and no one else can create an account.

1. **Create the Supabase project.**
   Done on 2026-10-12: the `studyflix` project above.
2. **Create the tables.**
   Open the [SQL editor](https://supabase.com/dashboard/project/qyeksmswibgkmsfhbrpv/sql/new), paste the whole of `supabase/migrations/20261013004603_learner_progress.sql`, and choose **Run**.
   It should finish with "Success. No rows returned".
   If you use the Supabase CLI instead, run these from the repository folder:

   ```bash
   npx supabase login
   npx supabase link --project-ref qyeksmswibgkmsfhbrpv
   npx supabase db push
   ```

   Check it under [Table Editor](https://supabase.com/dashboard/project/qyeksmswibgkmsfhbrpv/editor): the `public` schema now has the tables `progress_events` and `learner_visits`, both with RLS enabled, and the view `progress_summary`.
   Run the migration only once; a second run stops with "relation already exists" and changes nothing.
3. **Turn off sign-ups.**
   Open Authentication > [Sign In / Providers](https://supabase.com/dashboard/project/qyeksmswibgkmsfhbrpv/auth/providers).
   Under User Signups, turn **off** "Allow new users to sign up" and choose **Save changes**.
   Keep the **Email** provider turned on, because the family account signs in with email and password.
   This matters even though the site has no sign-up form: the publishable key is public, so with sign-ups on, anyone could create an account through the API.
4. **Create the family user.**
   Open Authentication > [Users](https://supabase.com/dashboard/project/qyeksmswibgkmsfhbrpv/auth/users), choose **Add user** > **Create new user**, enter the family email address and a strong password, keep **Auto Confirm User** ticked, and choose **Create user**.
   This is the one account every device signs in with.
   Keep the password in the family's password manager; it is never stored in this repository.
5. **Turn sync on for the published site.**
   In GitHub, open the repository's Settings > Secrets and variables > Actions, choose the **Variables** tab (not Secrets, because the workflow reads `vars.`), and add two repository variables with **New repository variable**:

   | Name | Value |
   |---|---|
   | `PUBLIC_SUPABASE_URL` | `https://qyeksmswibgkmsfhbrpv.supabase.co` |
   | `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable__j92W7nS36szAeo4rvFHzA_2qsbu7d1` |

   Or, with the GitHub CLI, from the repository folder:

   ```bash
   gh variable set PUBLIC_SUPABASE_URL --body 'https://qyeksmswibgkmsfhbrpv.supabase.co'
   gh variable set PUBLIC_SUPABASE_PUBLISHABLE_KEY --body 'sb_publishable__j92W7nS36szAeo4rvFHzA_2qsbu7d1'
   ```

   The next push to `main` (or a re-run of the latest CI run on `main`) builds and deploys the site with sync turned on, and the footer then shows "Family sign-in".
6. **Sign in on each device** at `/account/` (the "Family sign-in" link in the footer).
   Progress already saved on that device is uploaded at its first sign-in.
   From then on, the device stays signed in until someone chooses "Sign out of this device".

For `npm run dev` on your computer, run `cp .env.example .env`: `.env.example` holds the same two public values, and `.env` is ignored by git.
With a `.env`, `npm run build` and `npm run verify` also build a copy with sync on, as CI does once the variables are set; every test passes either way, and signed-out pages still send nothing to Supabase.
Without a `.env`, or if either variable is missing or empty, the site behaves exactly as before: progress stays in each browser, and the sign-in page says that syncing is not set up.

## Reviewing a job against a local copy

When a factory job waits for review, its preview runs against a local Supabase in Docker, not the family project.
`scripts/preview-local.sh` (the profile's `preview` command):
1. starts the local stack (`supabase/config.toml`: database, auth, API and Studio at <http://127.0.0.1:54323>);
2. rebuilds the local database from the job's own migrations, so a schema change is tried here before it reaches production;
3. loads the production snapshot, so the progress and the family sign-in are the real ones;
4. builds the site pointed at the local Supabase and serves it.

Only one job is previewed at a time, because there is one local database; starting a preview stops the others.
Signing in on a preview uses the family email and password, and only changes the local copy.

The snapshot is taken by hand, whenever fresher data is useful:

```bash
scripts/db-snapshot.sh
```

It needs Docker, and the Supabase CLI logged in and linked once (`npx supabase login`, then `npx supabase link --project-ref qyeksmswibgkmsfhbrpv`).
It saves `supabase/.snapshot/`, which holds the children's progress and the account's password hash: it is ignored by git and must never leave the computer.
Without a snapshot, previews start with an empty database.

After a job merges, the factory deploys: it applies new migrations to the family project (`npx supabase db push`), then pushes `main`, which publishes the site.
Migrations only merge after a parent's `/factory:approve`, and must only add things, so the live site keeps working while it deploys.

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
- Never point tests or agents at the real project, and never commit a secret: the project URL and publishable key above are the only Supabase values that belong in the repository.
