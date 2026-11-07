// Config plugin: native tweaks the generated Android project needs.
// - MainActivity supports Picture-in-Picture and keeps one task (widgets/deep links reuse it).
// - Cleartext traffic stays disabled; WebView only talks HTTPS.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

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

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:usesCleartextTraffic'] = 'false';
    return cfg;
  });
}

module.exports = function withBopbox(config) {
  return withBopboxManifest(config);
};
