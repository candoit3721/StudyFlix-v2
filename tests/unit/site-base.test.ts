import { describe, expect, it } from 'vitest';
import { normalizeBase, SUBPATH_PROBE } from '../../scripts/site-base.mjs';
import { joinBase } from '../../src/lib/paths';

describe('normalizeBase', () => {
  it.each([undefined, '', '   ', '/'])('treats %j as the domain root', (raw) => {
    expect(normalizeBase(raw)).toBe('/');
  });

  it.each(['StudyFlix-v2', '/StudyFlix-v2', '/StudyFlix-v2/', ' /StudyFlix-v2/ '])(
    'turns %j into /StudyFlix-v2/, keeping the case',
    (raw) => {
      expect(normalizeBase(raw)).toBe('/StudyFlix-v2/');
    },
  );

  it('keeps nested paths', () => {
    expect(normalizeBase('a/b')).toBe('/a/b/');
  });

  it.each([
    'https://candoit3721.github.io/StudyFlix-v2/',
    '/a/../b/',
    '/a?x=1',
    '/a#top',
    '/Study Flix/',
    '/a\tb/',
    '//StudyFlix-v2/',
    '/a//b/',
  ])('rejects %j with an error naming SITE_BASE and the value', (raw) => {
    expect(() => normalizeBase(raw)).toThrow(/SITE_BASE/);
    expect(() => normalizeBase(raw)).toThrow(JSON.stringify(raw));
  });

  it('probes a subpath that is itself a valid base', () => {
    expect(normalizeBase(SUBPATH_PROBE)).toBe(SUBPATH_PROBE);
  });
});

describe('joinBase', () => {
  it('puts an in-site path under the base', () => {
    expect(joinBase('/', '/')).toBe('/');
    expect(joinBase('/', '/account/')).toBe('/account/');
    expect(joinBase('/StudyFlix-v2/', '/')).toBe('/StudyFlix-v2/');
    expect(joinBase('/StudyFlix-v2/', '/favicon.svg')).toBe('/StudyFlix-v2/favicon.svg');
  });

  it('rejects a path that does not start with a slash', () => {
    expect(() => joinBase('/StudyFlix-v2/', 'account/')).toThrow(/must start with/);
  });
});
