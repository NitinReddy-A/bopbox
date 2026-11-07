import { formatAgo, formatCompact, formatCount, formatDuration } from '../format';

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(1204)).toBe('1,204');
    expect(formatCount(1234567)).toBe('1,234,567');
  });

  it('never shows negatives or fractions', () => {
    expect(formatCount(-3)).toBe('0');
    expect(formatCount(9.6)).toBe('10');
  });
});

describe('formatCompact', () => {
  it.each([
    [999, '999'],
    [1000, '1k'],
    [1204, '1.2k'],
    [15_600, '15k'],
    [3_450_000, '3.4M'],
  ])('%i -> %s', (n, out) => {
    expect(formatCompact(n)).toBe(out);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [83_000, '1:23'],
    [3_723_000, '1:02:03'],
    [-5, '0:00'],
  ])('%i ms -> %s', (ms, out) => {
    expect(formatDuration(ms)).toBe(out);
  });
});

describe('formatAgo', () => {
  const now = 1_000_000_000;
  it.each([
    [0, 'never'],
    [now - 10_000, 'just now'],
    [now - 5 * 60_000, '5m ago'],
    [now - 3 * 3_600_000, '3h ago'],
    [now - 2 * 86_400_000, '2d ago'],
  ])('%i -> %s', (then, out) => {
    expect(formatAgo(then, now)).toBe(out);
  });
});
