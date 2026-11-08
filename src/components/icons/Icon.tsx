import { memo } from 'react';
import Svg, { Path } from 'react-native-svg';

/**
 * Bopbox's icon set: SF-Symbols-style glyphs drawn on a 24pt grid. Line icons use a 1.8pt
 * stroke with round caps and joins; transport glyphs are filled with softened corners.
 */
export type IconName =
  | 'play'
  | 'pause'
  | 'forward'
  | 'backward'
  | 'search'
  | 'gear'
  | 'chevronLeft'
  | 'chevronRight'
  | 'reload'
  | 'ellipsis'
  | 'xmark'
  | 'xmarkCircle'
  | 'house'
  | 'shield'
  | 'youtube'
  | 'spotify'
  | 'note'
  | 'wifiSlash'
  | 'pip'
  | 'arrowUpLine'
  | 'arrowLeft'
  | 'arrowRight'
  | 'contrast'
  | 'globe'
  | 'lock'
  | 'info'
  | 'signOut'
  | 'trash'
  | 'sparkles'
  | 'link'
  | 'sun'
  | 'thumbDown'
  | 'eyeSlash'
  | 'repeat'
  | 'gauge'
  | 'sliders'
  | 'hand'
  | 'checkmark'
  | 'chevronDown'
  | 'rectangleStack';

type Props = {
  name: IconName;
  size?: number;
  color: string;
  /** Override the stroke width for line icons (in 24pt units). */
  weight?: number;
};

type Glyph = { d: string; fill?: boolean; evenOdd?: boolean }[];

/** Gear outline generated once: 8 rounded teeth around a hub. */
function gearPath(): string {
  const teeth = 8;
  const outer = 9.6;
  const inner = 7.4;
  const points: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const w = (Math.PI / teeth) * 0.42;
    const span = (Math.PI * 2) / teeth;
    const at = (r: number, angle: number) => `${(12 + r * Math.cos(angle)).toFixed(2)} ${(12 + r * Math.sin(angle)).toFixed(2)}`;
    points.push(at(inner, a - span / 2 + w * 0.6), at(outer, a - w), at(outer, a + w), at(inner, a + span / 2 - w * 0.6));
  }
  return `M${points.join(' L')} Z`;
}

const GLYPHS: Record<IconName, Glyph> = {
  play: [{ d: 'M8.2 5.6v12.8a1.1 1.1 0 0 0 1.68.93l10.1-6.4a1.1 1.1 0 0 0 0-1.86l-10.1-6.4A1.1 1.1 0 0 0 8.2 5.6z', fill: true }],
  pause: [
    {
      d: 'M6.8 5.6A1.6 1.6 0 0 1 8.4 4h1.2a1.6 1.6 0 0 1 1.6 1.6v12.8A1.6 1.6 0 0 1 9.6 20H8.4a1.6 1.6 0 0 1-1.6-1.6zM12.8 5.6A1.6 1.6 0 0 1 14.4 4h1.2a1.6 1.6 0 0 1 1.6 1.6v12.8a1.6 1.6 0 0 1-1.6 1.6h-1.2a1.6 1.6 0 0 1-1.6-1.6z',
      fill: true,
    },
  ],
  forward: [
    {
      d: 'M2.6 7.3v9.4a.95.95 0 0 0 1.47.8L11 13v3.7a.95.95 0 0 0 1.47.8l7.36-4.7a.95.95 0 0 0 0-1.6l-7.36-4.7A.95.95 0 0 0 11 7.3V11L4.07 6.5a.95.95 0 0 0-1.47.8z',
      fill: true,
    },
  ],
  backward: [
    {
      d: 'M21.4 7.3v9.4a.95.95 0 0 1-1.47.8L13 13v3.7a.95.95 0 0 1-1.47.8l-7.36-4.7a.95.95 0 0 1 0-1.6l7.36-4.7A.95.95 0 0 1 13 7.3V11l6.93-4.5a.95.95 0 0 1 1.47.8z',
      fill: true,
    },
  ],
  search: [{ d: 'M10.6 17.2a6.6 6.6 0 1 0 0-13.2 6.6 6.6 0 0 0 0 13.2zM15.4 15.4 20 20' }],
  gear: [{ d: gearPath() }, { d: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' }],
  chevronLeft: [{ d: 'M14.8 5.2 8 12l6.8 6.8' }],
  chevronRight: [{ d: 'M9.2 5.2 16 12l-6.8 6.8' }],
  reload: [{ d: 'M19.6 12.4a7.6 7.6 0 1 1-2.25-5.65' }, { d: 'M18.2 3.6v3.6h-3.6' }],
  ellipsis: [
    {
      d: 'M6 13.7a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM12 13.7a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM18 13.7a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z',
      fill: true,
    },
  ],
  xmark: [{ d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' }],
  xmarkCircle: [
    {
      d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.1 8.05a.75.75 0 0 0-1.06 1.06L10.94 12l-2.9 2.9a.75.75 0 1 0 1.07 1.05L12 13.06l2.9 2.9a.75.75 0 1 0 1.05-1.07L13.06 12l2.9-2.9a.75.75 0 1 0-1.07-1.05L12 10.94z',
      fill: true,
      evenOdd: true,
    },
  ],
  house: [{ d: 'M4 10.6 12 4l8 6.6v8.2a1.2 1.2 0 0 1-1.2 1.2H15v-5.4H9V20H5.2A1.2 1.2 0 0 1 4 18.8z' }],
  shield: [{ d: 'M12 3.2 19 6v5.6c0 4.3-2.9 7.9-7 9.2-4.1-1.3-7-4.9-7-9.2V6z' }, { d: 'M8.9 12.2l2.2 2.2 4.1-4.4' }],
  youtube: [
    {
      d: 'M6 5.2h12a3.8 3.8 0 0 1 3.8 3.8v6a3.8 3.8 0 0 1-3.8 3.8H6A3.8 3.8 0 0 1 2.2 15V9A3.8 3.8 0 0 1 6 5.2zM10 9.3v5.4a.65.65 0 0 0 .98.56l4.5-2.7a.65.65 0 0 0 0-1.12l-4.5-2.7a.65.65 0 0 0-.98.56z',
      fill: true,
      evenOdd: true,
    },
  ],
  spotify: [{ d: 'M5.6 9.1c4.2-1.5 8.8-1.2 12.8.9M6.6 12.7c3.4-1 7-.7 10.1.9M7.6 16.1c2.6-.7 5.3-.5 7.6.6' }],
  note: [
    { d: 'M9.5 17.5V6.6l9-2.1v10.9' },
    { d: 'M7.2 19.8a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6zM16.2 17.7a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z', fill: true },
  ],
  wifiSlash: [
    { d: 'M4.6 9.9a11 11 0 0 1 14.8 0M7.3 13a7 7 0 0 1 9.4 0M10 16a3 3 0 0 1 4 0' },
    { d: 'M4 4l16 16' },
  ],
  pip: [{ d: 'M4.8 5h14.4A1.8 1.8 0 0 1 21 6.8v10.4a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 17.2V6.8A1.8 1.8 0 0 1 4.8 5z' }, { d: 'M12.5 11.5h5.5v4.5h-5.5z', fill: true }],
  arrowUpLine: [{ d: 'M12 20V9.5M7.2 13.8 12 9l4.8 4.8M6 4.6h12' }],
  arrowLeft: [{ d: 'M19.5 12h-15M10.6 5.9 4.5 12l6.1 6.1' }],
  arrowRight: [{ d: 'M4.5 12h15M13.4 5.9l6.1 6.1-6.1 6.1' }],
  contrast: [{ d: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z' }, { d: 'M12 3.5a8.5 8.5 0 0 0 0 17z', fill: true }],
  globe: [
    { d: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z' },
    { d: 'M12 3.5c-2.3 2.3-3.5 5.1-3.5 8.5s1.2 6.2 3.5 8.5c2.3-2.3 3.5-5.1 3.5-8.5S14.3 5.8 12 3.5zM3.6 12h16.8' },
  ],
  lock: [
    { d: 'M7 10.6h10a1.4 1.4 0 0 1 1.4 1.4v6.6a1.4 1.4 0 0 1-1.4 1.4H7a1.4 1.4 0 0 1-1.4-1.4V12A1.4 1.4 0 0 1 7 10.6z' },
    { d: 'M8.6 10.6V8a3.4 3.4 0 0 1 6.8 0v2.6' },
  ],
  info: [{ d: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 11v5.6' }, { d: 'M12 8.9a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2z', fill: true }],
  signOut: [{ d: 'M13.5 4.5H7a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 7 19.5h6.5' }, { d: 'M10.5 12h9.5M16.8 8.7 20 12l-3.2 3.3' }],
  trash: [{ d: 'M4.8 7h14.4M9.6 7V5.2h4.8V7M6.8 7l.75 11.6a1.4 1.4 0 0 0 1.4 1.3h6.1a1.4 1.4 0 0 0 1.4-1.3L17.2 7M10.2 10.8v5.4M13.8 10.8v5.4' }],
  sparkles: [
    { d: 'M10 3.5l1.6 4.4 4.4 1.6-4.4 1.6L10 15.5l-1.6-4.4L4 9.5l4.4-1.6zM17.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z', fill: true },
  ],
  sun: [
    { d: 'M12 16.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4z' },
    { d: 'M12 2.8v1.8M12 19.4v1.8M2.8 12h1.8M19.4 12h1.8M5.5 5.5l1.3 1.3M17.2 17.2l1.3 1.3M5.5 18.5l1.3-1.3M17.2 6.8l1.3-1.3' },
  ],
  thumbDown: [
    { d: 'M7.5 13.5V4.5H5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 5 13.5zM7.5 13.5l3.6 6.2a1.7 1.7 0 0 0 3.1-1.2l-.7-3.8h4.6a2 2 0 0 0 2-2.3l-1-6.4a2 2 0 0 0-2-1.7H7.5' },
  ],
  eyeSlash: [
    { d: 'M3 12s3.3-6 9-6c1.6 0 3 .4 4.2 1M21 12s-3.3 6-9 6c-1.6 0-3-.4-4.2-1' },
    { d: 'M9.9 14.1a3 3 0 0 1 4.2-4.2M4 20 20 4' },
  ],
  repeat: [{ d: 'M4.5 11V9.5a3 3 0 0 1 3-3h11M15.5 3.5l3 3-3 3M19.5 13v1.5a3 3 0 0 1-3 3h-11M8.5 20.5l-3-3 3-3' }],
  gauge: [{ d: 'M4.2 17.5a8.5 8.5 0 1 1 15.6 0' }, { d: 'M12 13.2l3.8-4.4' }, { d: 'M12 14.6a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8z', fill: true }],
  sliders: [{ d: 'M4 7h9M17 7h3M4 17h3M11 17h9' }, { d: 'M15 9.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM9 19.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z' }],
  hand: [{ d: 'M12 21V9.5M8 13.5l4-4 4 4M7.5 5h9' }],
  checkmark: [{ d: 'M5 12.5l4.5 4.5L19 7.5' }],
  chevronDown: [{ d: 'M5.5 9l6.5 6.5L18.5 9' }],
  rectangleStack: [{ d: 'M6.5 7h11A1.5 1.5 0 0 1 19 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 17.5v-9A1.5 1.5 0 0 1 6.5 7zM8 4h8' }],
  link: [{ d: 'M10.4 13.6a3.6 3.6 0 0 0 5.1 0l3-3a3.6 3.6 0 0 0-5.1-5.1l-1.2 1.2M13.6 10.4a3.6 3.6 0 0 0-5.1 0l-3 3a3.6 3.6 0 0 0 5.1 5.1l1.2-1.2' }],
};

export const Icon = memo(function Icon({ name, size = 24, color, weight = 1.8 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false} importantForAccessibility="no">
      {GLYPHS[name].map((part, i) =>
        part.fill ? (
          <Path key={i} d={part.d} fill={color} fillRule={part.evenOdd ? 'evenodd' : 'nonzero'} />
        ) : (
          <Path
            key={i}
            d={part.d}
            fill="none"
            stroke={color}
            strokeWidth={weight}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      )}
    </Svg>
  );
});

