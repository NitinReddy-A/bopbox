#!/usr/bin/env node
/**
 * Release title and body for a version, from release-notes/<version>.md.
 *
 *   node scripts/release/notes.mjs 2.2.0 --title      -> the title (the file's first heading)
 *   node scripts/release/notes.mjs 2.2.0 <sha256>     -> the body, with install line and checksum
 *
 * A version without a notes file still gets a sensible title and body.
 */
import fs from 'node:fs';
import path from 'node:path';

export function releaseNotes(version, text) {
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n');
  const heading = lines.findIndex((l) => l.startsWith('# '));
  const title = heading >= 0 ? lines[heading].slice(2).trim() : `Tube v${version}`;
  const body = (heading >= 0 ? lines.slice(heading + 1) : lines).join('\n').trim();
  return { title, body };
}

export function releaseBody(version, text, sha256) {
  const { body } = releaseNotes(version, text);
  const parts = [body || `**Tube ${version}**`];
  parts.push(
    `**Install:** download \`tube-v${version}.apk\` on your phone and open it. It updates an earlier Tube in place and keeps your sign-in and settings.`,
  );
  if (sha256) parts.push(`SHA-256: \`${sha256}\``);
  parts.push('Tube is its own app; it does not patch or redistribute Google\'s YouTube APK. Not affiliated with YouTube or Google.');
  return parts.join('\n\n') + '\n';
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const [version, arg] = process.argv.slice(2);
  if (!version) {
    console.error('usage: notes.mjs <version> [--title | <sha256>]');
    process.exit(1);
  }
  const file = path.join(process.cwd(), 'release-notes', `${version}.md`);
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  process.stdout.write(arg === '--title' ? releaseNotes(version, text).title + '\n' : releaseBody(version, text, arg));
}
