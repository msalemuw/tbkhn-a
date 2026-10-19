// Adds the Apple and Google sign-in plugins to app.json. Google's plugin needs the iOS URL scheme,
// which is the iOS client ID from Google Cloud reversed, so it is added only once that ID is set.
// Android extras (Google Maps key for the maps, google-services.json for push alerts) are added only once they exist,
// so builds keep working before they are set up.
module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const plugins = [...(config.plugins ?? []), 'expo-apple-authentication'];
  if (iosClientId) {
    const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`;
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
  }
  const android = { ...config.android };
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY;
  if (mapsKey) android.config = { ...android.config, googleMaps: { apiKey: mapsKey } };
  // EAS hands a "file" variable over as a path; locally the file can sit next to app.json.
  if (process.env.GOOGLE_SERVICES_JSON) android.googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  return { ...config, plugins, android };
};
