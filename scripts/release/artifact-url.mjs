#!/usr/bin/env node
/**
 * Prints the APK download URL from the JSON that `eas build --json --wait` writes.
 *
 *   node scripts/release/artifact-url.mjs build.json
 *
 * Exits non-zero (with the reason on stderr) if the build did not finish or has no artifact,
 * so a failed build can never be published as a release.
 */
import fs from 'node:fs';

export function artifactUrl(json) {
  const builds = Array.isArray(json) ? json : [json];
  const build = builds.find((b) => b && String(b.platform).toUpperCase() === 'ANDROID') ?? builds[0];
  if (!build) throw new Error('no build in the EAS output');
  if (build.status !== 'FINISHED') throw new Error(`build ${build.id ?? '?'} ended as ${build.status ?? 'unknown'}`);
  const url = build.artifacts?.applicationArchiveUrl ?? build.artifacts?.buildUrl;
  if (!url || !/^https:\/\//.test(url)) throw new Error(`build ${build.id ?? '?'} has no downloadable artifact`);
  return url;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  try {
    console.log(artifactUrl(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))));
  } catch (e) {
    console.error(`artifact-url: ${e.message}`);
    process.exit(1);
  }
}
