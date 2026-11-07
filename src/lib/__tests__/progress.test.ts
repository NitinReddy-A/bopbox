import { extrapolatePosition, progressRatio } from '../progress';

const base = { positionMs: 10_000, durationMs: 60_000, updatedAtMs: 1_000 };

describe('extrapolatePosition', () => {
  it('advances with wall time while playing', () => {
    expect(extrapolatePosition({ ...base, isPlaying: true }, 4_000)).toBe(13_000);
  });

  it('holds still while paused', () => {
    expect(extrapolatePosition({ ...base, isPlaying: false }, 50_000)).toBe(10_000);
  });

  it('clamps to the track length', () => {
    expect(extrapolatePosition({ ...base, isPlaying: true }, 999_999)).toBe(60_000);
  });

  it('ignores clock skew where the update looks like it is from the future', () => {
    expect(extrapolatePosition({ ...base, isPlaying: true }, 0)).toBe(10_000);
  });

  it('keeps counting when the duration is unknown', () => {
    expect(extrapolatePosition({ ...base, durationMs: 0, isPlaying: true }, 2_000)).toBe(11_000);
  });
});

describe('progressRatio', () => {
  it('is a clamped fraction', () => {
    expect(progressRatio(30_000, 60_000)).toBe(0.5);
    expect(progressRatio(90_000, 60_000)).toBe(1);
    expect(progressRatio(5, 0)).toBe(0);
  });
});
