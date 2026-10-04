// Adds the Apple and Google sign-in plugins to app.json. Google's plugin needs the iOS URL scheme,
// which is the iOS client ID from Google Cloud reversed, so it is added only once that ID is set.
module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const plugins = [...(config.plugins ?? []), 'expo-apple-authentication'];
  if (iosClientId) {
    const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`;
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
  }
  return { ...config, plugins };
};
