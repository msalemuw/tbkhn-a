// Place search for the location screens (member's home spot, cook's pickup spot), Egypt only.
//
// Runs as a Supabase Edge Function (Deno). The app calls it with the member's sign-in; it asks Google Places (New):
//   { action: 'search', q, lat?, lng?, session }  ->  { hits: [{ id, name, line2 }] }   suggestions while typing
//   { action: 'pick', id, session }               ->  { lat, lng }                      the point of the chosen suggestion
// `session` groups one typing-and-picking run so Google bills it as a single session.
// Needs the secret GOOGLE_PLACES_KEY (Edge Functions > Secrets). The key never reaches the app.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const KEY = Deno.env.get('GOOGLE_PLACES_KEY');
const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Daily caps (UTC day) on paid Google requests, per member and for everyone together. Over the cap the app falls
// back to the phone's own lookup. Raise these when real traffic needs it; at 800 searches a day a month stays near
// Google's free 10,000 plus a few dollars.
const CAPS = { search: { perMember: 150, total: 800 }, pick: { perMember: 100, total: 800 } };

async function underCap(uid: string, kind: 'search' | 'pick') {
  const { data, error } = await admin.rpc('places_allow', {
    p_uid: uid,
    p_kind: kind,
    p_user_cap: CAPS[kind].perMember,
    p_total_cap: CAPS[kind].total,
  });
  if (error) {
    console.log('places_allow failed', JSON.stringify(error));
    return false; // if the counter is unreachable, do not spend
  }
  return data === true;
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

Deno.serve(async (req) => {
  try {
    if (!KEY) return reply({ error: 'GOOGLE_PLACES_KEY is not set' }, 503);

    // Only signed-in members (the public app key alone is not enough), so the paid search can't be used by strangers.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(token);
    if (!auth?.user) return reply({ error: 'sign in first' }, 401);

    const body = await req.json();
    const session = String(body.session ?? '').slice(0, 64);

    if (body.action === 'search') {
      const q = String(body.q ?? '').trim().slice(0, 120);
      if (q.length < 2) return reply({ hits: [] });
      if (!(await underCap(auth.user.id, 'search'))) return reply({ error: 'daily limit reached' }, 429);
      const payload: Record<string, unknown> = { input: q, includedRegionCodes: ['eg'], languageCode: 'en' };
      if (session) payload.sessionToken = session;
      if (Number.isFinite(body.lat) && Number.isFinite(body.lng)) {
        payload.locationBias = { circle: { center: { latitude: body.lat, longitude: body.lng }, radius: 50000 } };
      }
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: { ...JSON_HEADERS, 'X-Goog-Api-Key': KEY },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        console.log('autocomplete failed', res.status, JSON.stringify(json));
        return reply({ error: 'search failed' }, 502);
      }
      const hits = (json?.suggestions ?? [])
        .map((s: any) => s.placePrediction)
        .filter(Boolean)
        .slice(0, 6)
        .map((p: any) => ({
          id: p.placeId,
          name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? q,
          line2: p.structuredFormat?.secondaryText?.text ?? '',
        }));
      return reply({ hits });
    }

    if (body.action === 'pick') {
      const id = String(body.id ?? '');
      if (!/^[\w-]{10,200}$/.test(id)) return reply({ error: 'bad id' }, 400);
      if (!(await underCap(auth.user.id, 'pick'))) return reply({ error: 'daily limit reached' }, 429);
      const url = new URL(`https://places.googleapis.com/v1/places/${id}`);
      if (session) url.searchParams.set('sessionToken', session);
      const res = await fetch(url, { headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'location' } });
      const json = await res.json().catch(() => null);
      const loc = json?.location;
      if (!res.ok || !loc) {
        console.log('details failed', res.status, JSON.stringify(json));
        return reply({ error: 'place not found' }, 502);
      }
      return reply({ lat: loc.latitude, lng: loc.longitude });
    }

    return reply({ error: 'unknown action' }, 400);
  } catch (e) {
    return reply({ error: String(e) }, 500);
  }
});
