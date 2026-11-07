import { appForUrl, resolveSearch } from '../search';

describe('resolveSearch', () => {
  it('ignores blank input', () => {
    expect(resolveSearch('   ')).toBeNull();
  });

  it('treats free text as a query that still needs a target app', () => {
    expect(resolveSearch('  lofi beats to study to ')).toEqual({ kind: 'query', app: null, query: 'lofi beats to study to' });
  });

  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['m.youtube.com/watch?v=abc', 'youtube'],
    ['youtu.be/abc', 'youtube'],
    ['https://open.spotify.com/track/123', 'spotify'],
    ['open.spotify.com/album/9', 'spotify'],
  ] as const)('routes %s to %s', (input, app) => {
    const result = resolveSearch(input);
    expect(result).toMatchObject({ kind: 'url', app });
    expect(result?.kind === 'url' && result.url.startsWith('https://')).toBe(true);
  });

  it('keeps unrelated links and dotted words as queries', () => {
    expect(resolveSearch('https://example.com/song')).toMatchObject({ kind: 'query' });
    expect(resolveSearch('daft.punk')).toMatchObject({ kind: 'query' });
  });

  it('does not treat lookalike hosts as the app', () => {
    expect(appForUrl('https://notyoutube.com/watch')).toBeNull();
    expect(appForUrl('https://spotify.com.evil.io/x')).toBeNull();
  });
});
