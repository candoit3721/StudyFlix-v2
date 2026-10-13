/**
 * An in-memory fake of the few Supabase endpoints the sync engine uses, served through Playwright
 * routing on the site's own origin (so there are no CORS preflights).
 *
 * The state lives in the test's Node process, so several browser contexts (devices) in one test
 * share one "database". Like the real one it ignores re-sent event ids, keeps the newer visit, and
 * scopes every row to the signed-in user.
 *
 * Usage:
 *   const fake = new FakeSupabase();
 *   await fake.install(context, baseURL);   // routes + points the site at the fake
 */
import type { BrowserContext, Route } from '@playwright/test';

export const FAKE_EMAIL = 'family@example.com';
export const FAKE_PASSWORD = 'correct horse battery staple';
const PREFIX = '/__fake-supabase';

interface EventRow {
  user_id: string;
  id: string;
  learner_id: string;
  lesson_id: string;
  kind: 'item' | 'practice';
  key: string;
  answered: number;
  correct: number;
  at: string;
}

interface VisitRow {
  user_id: string;
  learner_id: string;
  lesson_id: string;
  visited_at: string;
}

export interface SummaryRow {
  learner_id: string;
  lesson_id: string;
  kind: string;
  key: string;
  answered: number;
  correct: number;
  at: string;
}

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

export class FakeSupabase {
  readonly user = { id: '6f1c3a52-6a9e-4c55-9a51-3f0d6f3b2a10', email: FAKE_EMAIL };
  events: EventRow[] = [];
  visits: VisitRow[] = [];
  /** Every request, as "METHOD /path?query", in order. */
  requests: string[] = [];
  /** Requests the fake does not know. A test should expect this to stay empty. */
  unknown: string[] = [];
  /** Make the REST endpoints fail: 'http' answers 503, 'network' aborts the request. */
  restFailure: 'http' | 'network' | null = null;
  /** Make the auth endpoints fail like an unreachable service. */
  authFailure = false;
  private tokens = new Map<string, string>();
  private counter = 0;

  /** Route the fake on this context and point the site at it (before any page script runs). */
  async install(context: BrowserContext, baseURL: string): Promise<void> {
    await context.addInitScript(
      (config) => {
        (globalThis as { __STUDYFLIX_SYNC__?: unknown }).__STUDYFLIX_SYNC__ = config;
      },
      { url: `${baseURL}${PREFIX}`, key: 'test-key' },
    );
    await context.route(`**${PREFIX}/**`, (route) => this.handle(route));
  }

  /** The progress summary for the family account, like the `progress_summary` view. */
  summary(): SummaryRow[] {
    const rows = new Map<string, SummaryRow>();
    for (const event of this.events.filter((e) => e.user_id === this.user.id)) {
      const id = [event.learner_id, event.lesson_id, event.kind, event.key].join('\u0000');
      const row = rows.get(id);
      if (row) {
        row.answered += event.answered;
        row.correct += event.correct;
        if (event.at > row.at) row.at = event.at;
      } else {
        const { user_id: _user, id: _id, ...rest } = event;
        rows.set(id, { ...rest });
      }
    }
    return [...rows.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, row]) => row);
  }

  /** How many requests reached the REST API (progress tables), whatever the outcome. */
  restRequests(): string[] {
    return this.requests.filter((r) => r.includes('/rest/v1/'));
  }

  private session() {
    this.counter += 1;
    const token = `fake.${base64url({ n: this.counter })}`;
    this.tokens.set(token, this.user.id);
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      sub: this.user.id,
      email: this.user.email,
      role: 'authenticated',
      aud: 'authenticated',
      exp: now + 3600,
      iat: now,
    };
    const accessToken = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(claims)}.${base64url('signature')}`;
    this.tokens.set(accessToken, this.user.id);
    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      refresh_token: token,
      user: {
        id: this.user.id,
        aud: 'authenticated',
        role: 'authenticated',
        email: this.user.email,
        app_metadata: { provider: 'email' },
        user_metadata: {},
        created_at: '2026-10-01T00:00:00Z',
      },
    };
  }

  private userFor(route: Route): string | null {
    const header = route.request().headers().authorization ?? '';
    return this.tokens.get(header.replace(/^Bearer /i, '')) ?? null;
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice(url.pathname.indexOf(PREFIX) + PREFIX.length);
    const method = request.method();
    this.requests.push(`${method} ${path}${url.search}`);
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'OPTIONS') return route.fulfill({ status: 204 });

    if (path.startsWith('/auth/v1/')) {
      if (this.authFailure) return route.abort('internetdisconnected');
      if (path === '/auth/v1/token' && method === 'POST') {
        const body = request.postDataJSON() as Record<string, string>;
        if (url.searchParams.get('grant_type') === 'password') {
          if (body.email === FAKE_EMAIL && body.password === FAKE_PASSWORD) return json(200, this.session());
          return json(400, {
            code: 400,
            error_code: 'invalid_credentials',
            msg: 'Invalid login credentials',
          });
        }
        if (
          url.searchParams.get('grant_type') === 'refresh_token' &&
          this.tokens.has(body.refresh_token ?? '')
        ) {
          return json(200, this.session());
        }
        return json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
      }
      if (path === '/auth/v1/logout' && method === 'POST') return route.fulfill({ status: 204 });
      if (path === '/auth/v1/user' && method === 'GET') {
        return this.userFor(route) ? json(200, this.session().user) : json(401, { msg: 'invalid JWT' });
      }
    }

    if (path.startsWith('/rest/v1/')) {
      if (this.restFailure === 'network') return route.abort('internetdisconnected');
      if (this.restFailure === 'http') return json(503, { message: 'Service Unavailable' });
      const userId = this.userFor(route);
      if (!userId) return json(401, { code: '42501', message: 'permission denied' });

      if (path === '/rest/v1/progress_events' && method === 'POST') {
        for (const row of request.postDataJSON() as EventRow[]) {
          if (row.user_id && row.user_id !== userId) {
            return json(403, { code: '42501', message: 'new row violates row-level security policy' });
          }
          if (!this.events.some((e) => e.user_id === userId && e.id === row.id)) {
            this.events.push({ ...row, user_id: userId });
          }
        }
        return route.fulfill({ status: 201 });
      }

      if (path === '/rest/v1/progress_summary' && method === 'GET') {
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 1000);
        return json(200, this.summary().slice(offset, offset + Math.min(limit, 1000)));
      }

      if (path === '/rest/v1/learner_visits' && method === 'POST') {
        for (const row of request.postDataJSON() as VisitRow[]) {
          const current = this.visits.find((v) => v.user_id === userId && v.learner_id === row.learner_id);
          if (!current) this.visits.push({ ...row, user_id: userId });
          else if (Date.parse(row.visited_at) > Date.parse(current.visited_at)) Object.assign(current, row);
        }
        return route.fulfill({ status: 201 });
      }

      if (path === '/rest/v1/learner_visits' && method === 'GET') {
        return json(
          200,
          this.visits
            .filter((v) => v.user_id === userId)
            .map(({ learner_id, lesson_id, visited_at }) => ({ learner_id, lesson_id, visited_at })),
        );
      }
    }

    this.unknown.push(`${method} ${path}${url.search}`);
    console.warn(`fake-supabase: no route for ${method} ${path}${url.search}`);
    return json(501, { message: `fake-supabase has no route for ${method} ${path}` });
  }
}
