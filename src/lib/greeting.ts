/** Time-of-day greeting for the home header. `hour` is 0-23 in local time. */
export function greetingFor(hour: number): string {
  if (hour < 5) return 'late night bops?';
  if (hour < 12) return 'good morning, legend';
  if (hour < 17) return 'afternoon groove check';
  if (hour < 21) return 'golden hour, golden tunes';
  return 'night shift soundtrack';
}
