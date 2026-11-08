// Config plugin: native tweaks the generated Android project needs.
// - MainActivity supports Picture-in-Picture and keeps one task (widgets/deep links reuse it).
// - Cleartext traffic stays disabled; WebView only talks HTTPS.
// - YouTube links and shared text open in the app.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com'];

function withBopboxManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity.$['android:supportsPictureInPicture'] = 'true';
    activity.$['android:resizeableActivity'] = 'true';
    activity.$['android:launchMode'] = 'singleTask';
    const changes = new Set((activity.$['android:configChanges'] || '').split('|').filter(Boolean));
    ['keyboard', 'keyboardHidden', 'orientation', 'screenSize', 'screenLayout', 'smallestScreenSize', 'uiMode'].forEach((c) =>
      changes.add(c),
    );
    activity.$['android:configChanges'] = [...changes].join('|');

    // Open YouTube links tapped in other apps, and accept "Share → Tube" with a link in the text.
    const filters = activity['intent-filter'] || [];
    const hasLinkFilter = filters.some((f) => (f.data || []).some((d) => d.$ && d.$['android:host'] === 'youtu.be'));
    if (!hasLinkFilter) {
      filters.push({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        category: [
          { $: { 'android:name': 'android.intent.category.DEFAULT' } },
          { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
        ],
        data: [
          { $: { 'android:scheme': 'https' } },
          { $: { 'android:scheme': 'http' } },
          ...YOUTUBE_HOSTS.map((host) => ({ $: { 'android:host': host } })),
        ],
      });
      filters.push({
        action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'text/plain' } }],
      });
      activity['intent-filter'] = filters;
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:usesCleartextTraffic'] = 'false';
    return cfg;
  });
}

module.exports = function withBopbox(config) {
  return withBopboxManifest(config);
};
