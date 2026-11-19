const { withAndroidManifest } = require("expo/config-plugins");

// Setting `orientation: "portrait"` in app.json makes Expo's Android build
// emit <uses-feature android:name="android.hardware.screen.portrait"
// android:required="true"> in the manifest. That doesn't just lock the UI
// to portrait (which is what's actually wanted) — Google Play reads
// "required" as "don't let tablets, desktops or Android XR devices install
// this app at all", since they don't report that hardware feature. The app
// works fine on those devices (same phone layout, just bigger), so the
// feature should be declared optional instead of required.
function withAndroidOptionalScreenOrientation(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest["uses-feature"]) {
      manifest["uses-feature"] = [];
    }
    for (const name of ["android.hardware.screen.portrait", "android.hardware.screen.landscape"]) {
      const existing = manifest["uses-feature"].find((f) => f.$ && f.$["android:name"] === name);
      if (existing) {
        existing.$["android:required"] = "false";
      } else {
        manifest["uses-feature"].push({ $: { "android:name": name, "android:required": "false" } });
      }
    }
    return config;
  });
}

module.exports = withAndroidOptionalScreenOrientation;
