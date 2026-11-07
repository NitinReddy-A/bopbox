import { greetingFor } from '../greeting';

describe('greetingFor', () => {
  it.each([
    [0, 'late night bops?'],
    [4, 'late night bops?'],
    [5, 'good morning, legend'],
    [11, 'good morning, legend'],
    [12, 'afternoon groove check'],
    [17, 'golden hour, golden tunes'],
    [21, 'night shift soundtrack'],
    [23, 'night shift soundtrack'],
  ])('hour %i -> %s', (hour, greeting) => {
    expect(greetingFor(hour)).toBe(greeting);
  });
});
