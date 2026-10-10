// Public settings for the waitlist page. The publishable key is meant to be public (the app ships it too).
// Never put the secret / service_role key here.
window.TABKHEEN = {
  supabaseUrl: 'https://lkuefxakilvkitqmugqk.supabase.co',
  supabaseKey: 'sb_publishable_K5a4F0aQtkS65nUEm0iZNA_x71rp4UA',
  // Google sign-in: the public web client ID, the same one the app uses (Google Cloud project tabkheen-a).
  googleClientId: '259310650536-bbcejl2bs5vt6rcne1kmrdedh5v6le6u.apps.googleusercontent.com',
  // Apple sign-in on the website: the Services ID from the Apple Developer account. Empty hides the Apple button.
  appleServiceId: 'com.tabkheen.a.web',
  // Meta pixel ID from Events Manager, so ads can count sign-ups. Leave empty until the ads thread has one.
  metaPixelId: '',
  // Shown at the bottom of the page. Use the domain address once Cloudflare Email Routing forwards it.
  contactEmail: 'tbkheen.A@gmail.com',
  // Social media links shown at the bottom of the page (full https:// links). Empty ones are hidden.
  social: {
    instagram: 'https://www.instagram.com/tabkheen.a',
    facebook: 'https://www.facebook.com/106214638238182', // the "Tabkheen.a" page
    tiktok: 'https://www.tiktok.com/@tabkheen.a',
  },
};
