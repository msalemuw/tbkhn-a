import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { BuildInfo } from '@/components/build-info';
import { Chip } from '@/components/chip';
import { BackHeader, danger, Field, formStyles, PickerSheet, PrimaryButton, SelectField, type SheetItem } from '@/components/form';
import { RequestCommunitySheet } from '@/components/request-community';
import { colors, fonts } from '@/constants/theme';
import { logFunnel } from '@/lib/funnel';
import { HEARD, OTHER_DETAIL } from '@/lib/heard';
import { formatPhone } from '@/lib/phone';
import { uploadPhoto } from '@/lib/posts';
import { type Country, fetchCountries, fetchRegions, type Region } from '@/lib/regions';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Flow 1, screen s5: Create your account (profile and communities), plus the section 13 additions:
// InstaPay handle (cooks get paid peer to peer) and the optional "How did you hear about tabkheen A?" referral question.

type Community = { id: string; name: string; kind: string; governorate: string; country_code?: string; pending?: boolean };
type Optional = 'club' | 'sahel' | 'school' | 'work';
// "I love …" (founder, 2026-10-10), asked on the website sign-up too.
type Loves = 'cooking' | 'eating' | 'both';
const LOVES: { value: Loves; label: string }[] = [
  { value: 'cooking', label: 'I love cooking' },
  { value: 'eating', label: 'I love eating' },
  { value: 'both', label: 'I love cooking and eating' },
];

const OPTIONAL: { kind: Optional; label: string; noun: string }[] = [
  { kind: 'club', label: 'CLUB', noun: 'club' },
  { kind: 'sahel', label: 'SAHEL', noun: 'Sahel community' },
  { kind: 'school', label: 'SCHOOL', noun: 'school' },
  { kind: 'work', label: 'WORK', noun: 'workplace' },
];


// first.last from the name, never from the email (which would show part of it on the public profile). Names that are
// not in Latin letters give nothing and the member types one. The website does the same.
function nameToUsername(full: string): string {
  const words = full
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
  if (!words.length) return '';
  const u = (words.length > 1 ? `${words[0]}.${words[words.length - 1]}` : words[0]).slice(0, 20);
  return u.length >= 3 ? u : '';
}

type UsernameState = { msg: string; color: string; icon?: 'error' | 'check-circle'; ok: boolean; suggestions: string[] };

function usernameState(u: string, taken: boolean | null): UsernameState {
  if (!u) return { msg: 'Choose a username: 3–20 letters, numbers, . or _', color: colors.muted, ok: false, suggestions: [] };
  if (u.length < 3) return { msg: 'At least 3 characters', color: colors.ink, icon: 'error', ok: false, suggestions: [] };
  if (taken === null) return { msg: 'Checking…', color: colors.muted, ok: false, suggestions: [] };
  if (taken) {
    const yy = new Date().getFullYear() % 100;
    const suggestions = [`${u}1`, `${u}_`, `${u}.${yy}`].filter((x) => x.length <= 20);
    return { msg: `@${u} is already taken. Try one of these:`, color: colors.ink, icon: 'error', ok: false, suggestions };
  }
  return { msg: `@${u} is available`, color: colors.ink, icon: 'check-circle', ok: true, suggestions: [] };
}

export default function ProfileStep() {
  const { session, profile, refreshProfile } = useSession();
  // Three steps (founder, 2026-10-25): 1 photo, name and username; 2 the required details (loves, country, governorate,
  // area); 3 the optional extras. Each is saved on its own; someone who stopped after step 1 comes back to step 2.
  const [part, setPart] = useState<1 | 2 | 3>(profile?.username ? 2 : 1);
  // Google and Apple share the member's name, so it starts filled in.
  // Optional profile photo (founder, 2026-10-11); the website sign-up has the same circle.
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [name, setName] = useState(() => String(session?.user.user_metadata?.full_name ?? session?.user.user_metadata?.name ?? ''));
  // Starts from the name (first.last), checked for availability like a typed one; same as the website.
  const [username, setUsername] = useState(() => nameToUsername(name));
  const [loves, setLoves] = useState<Loves | null>(null);
  const [taken, setTaken] = useState<boolean | null>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState('EG');
  const [regions, setRegions] = useState<Region[]>([]);
  const [requested, setRequested] = useState<Community[]>([]);
  const [request, setRequest] = useState<{ kind: string; noun: string } | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [gov, setGov] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [optional, setOptional] = useState<Partial<Record<Optional, string>>>({});
  const [instapay, setInstapay] = useState('');
  // "A friend" is preselected and there is no "prefer not to say" (founder, 2026-10-10); the website matches.
  const [heard, setHeard] = useState<string | null>('friend');
  const [heardPick, setHeardPick] = useState<string | null>(null);
  const [heardText, setHeardText] = useState('');
  const [inviter, setInviter] = useState('');
  const [sheet, setSheet] = useState<{ title: string; items: SheetItem[]; searchable?: boolean; footer?: { label: string; onPress: () => void } } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneDigits = (session?.user.phone ?? '').replace(/^\+?20/, '');

  useEffect(() => {
    logFunnel(part === 2 ? 'details_started' : 'profile_started', {}, { userRef: session?.user.id });
    // Approved communities, plus this member's own pending requests, so a request made before going back still shows up.
    const mine = session?.user.id ? `,requested_by.eq.${session.user.id}` : '';
    supabase
      .from('communities')
      .select('*')
      .or(`status.eq.approved${mine}`)
      .order('name')
      .then(({ data }) =>
        setCommunities(((data as (Community & { status: string })[] | null) ?? []).filter((c) => c.status !== 'rejected').map((c) => ({ ...c, pending: c.status === 'pending' }))),
      );
    // If the countries table is not there yet, the form falls back to Egypt only.
    fetchCountries().then(setCountries, () => {});
    // Once per visit: moving from step 1 to step 2 must not reload the lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  useEffect(() => {
    let live = true;
    fetchRegions(country).then((r) => live && setRegions(r), () => live && setRegions([]));
    return () => {
      live = false;
    };
  }, [country]);

  // Live, advisory username check; the unique index decides on save.
  useEffect(() => {
    if (username.length < 3) return;
    let live = true;
    const id = setTimeout(async () => {
      const { data } = await supabase.rpc('username_available', { candidate: username });
      if (!live) return;
      setTaken(data === false);
      if (data === false) logFunnel('profile_field_error', { field: 'username_taken' }, { userRef: session?.user.id });
    }, 400);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [username, session?.user.id]);

  const un = usernameState(username, username.length < 3 ? false : taken);
  const inCountry = (c: Community) => (c.country_code ?? 'EG') === country;
  const all = useMemo(() => [...communities, ...requested], [communities, requested]);
  // Regions come from the database; with none listed (or no countries table yet) fall back to what the areas say.
  const governorates = useMemo(
    () => (regions.length ? regions.map((r) => r.name) : [...new Set(communities.filter((c) => c.kind === 'area' && inCountry(c)).map((c) => c.governorate))].sort()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [regions, communities, country],
  );
  const typedRegion = countries.length > 0 && regions.length === 0;
  const areas = all.filter((c) => c.kind === 'area' && c.governorate === gov && inCountry(c));
  const byId = (id?: string | null) => all.find((c) => c.id === id);
  const label = (c: Community) => (c.pending ? `${c.name} (pending approval)` : c.name);

  const heardDef = HEARD.find((h) => h.value === heard);
  const heardDetail = heardDef?.detail.kind === 'pick' ? (heardPick && heardPick !== OTHER_DETAIL ? heardPick : heardText.trim() || null) : heardDef?.detail.kind === 'text' ? heardText.trim() || null : null;

  const canContinue = name.trim().length > 0 && un.ok;
  const canSubmit = loves !== null && Boolean(gov?.trim() && areaId);

  function openPicker(
    title: string,
    options: { label: string; value: string | null }[],
    current: string | null,
    set: (v: string | null) => void,
    extra?: { searchable?: boolean; footer?: { label: string; onPress: () => void } },
  ) {
    setSheet({ title, items: options.map((o) => ({ label: o.label, selected: o.value === current, onPress: () => set(o.value) })), ...extra });
  }

  function openRequest(kind: string, noun: string) {
    if (!gov?.trim()) return setError(`Choose your ${typedRegion ? 'region' : 'governorate'} first, then request your ${noun}.`);
    setError(null);
    setRequestError(null);
    setRequest({ kind, noun });
  }

  async function sendRequest(communityName: string) {
    if (!session || !request || !gov) return;
    setRequestBusy(true);
    setRequestError(null);
    const area = request.kind === 'area' ? communityName : (byId(areaId)?.name ?? null);
    const row: Record<string, unknown> = { name: communityName, kind: request.kind, governorate: gov.trim(), area, requested_by: session.user.id, status: 'pending' };
    if (countries.length) row.country_code = country;
    const { data, error: reqError } = await supabase.from('communities').insert(row).select('id, name, kind, governorate').single();
    setRequestBusy(false);
    // Someone else already asked for it and it is waiting for approval, so it is not in this member's list.
    // Accept it as typed instead of blocking (founder, 2026-10-11): the name is saved; they join it once it is approved.
    const duplicate = reqError?.code === '23505';
    if (duplicate) logFunnel('community_request_duplicate', { kind: request.kind }, { userRef: session.user.id });
    else if (reqError || !data) return setRequestError('We couldn’t send your request. Check your connection and try again.');
    const made: Community = duplicate
      ? { id: `waiting:${request.kind}:${communityName}`, name: communityName, kind: request.kind, governorate: gov.trim(), country_code: country, pending: true }
      : { ...(data as Community), country_code: country, pending: true };
    setRequested((r) => [...r, made]);
    if (request.kind === 'area') setAreaId(made.id);
    else setOptional((o) => ({ ...o, [request.kind as Optional]: made.id }));
    if (!duplicate) logFunnel('community_requested', { kind: request.kind, country }, { userRef: session.user.id });
    setRequest(null);
  }

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!res.canceled && res.assets[0]) setPhoto(res.assets[0]);
  }

  // Step 1: the account basics are saved first, so the account exists even if step 2 is never finished.
  async function onContinue() {
    if (!session || !canContinue) return;
    setBusy(true);
    setError(null);
    // The photo is optional, so a failed upload never blocks sign-up; it can be added later in Edit profile.
    let avatarPath: string | null = null;
    if (photo) {
      try {
        avatarPath = await uploadPhoto(session.user.id, photo.uri, photo.mimeType ?? 'image/jpeg');
      } catch {
        logFunnel('profile_field_error', { field: 'photo_upload' }, { userRef: session.user.id });
      }
    }
    const { error: saveError } = await supabase
      .from('profiles')
      .update({ display_name: name.trim(), username, ...(avatarPath ? { avatar_path: avatarPath } : {}) })
      .eq('id', session.user.id);
    if (saveError) {
      setBusy(false);
      if (saveError.code === '23505') {
        setTaken(true);
        logFunnel('identifier_conflict', { type: 'username' }, { userRef: session.user.id });
      } else {
        setError('We couldn’t save your profile. Check your connection and try again.');
      }
      return;
    }
    logFunnel('basics_saved', { photo: Boolean(avatarPath) }, { userRef: session.user.id });
    logFunnel('details_started', {}, { userRef: session.user.id });
    // The account still has no area, so the app keeps sending this member to step 2 until it is finished.
    await refreshProfile();
    setBusy(false);
    setPart(2);
  }

  // Step 2: the required details. The account counts as created from here (a username and an area).
  async function onDetails() {
    if (!session || !canSubmit) return;
    setBusy(true);
    setError(null);
    const area = byId(areaId)!;
    // How they heard is saved as it stands (a friend by default), so skipping step 3 loses nothing.
    const { error: saveError } = await supabase
      .from('profiles')
      .update({
        loves,
        country_code: countries.length ? country : undefined,
        governorate: gov?.trim(),
        area: area.name,
        heard_from: heard,
        heard_detail: heardDetail,
        inviter_name: heard === 'friend' || heard === 'family' ? inviter.trim() || null : null,
      })
      .eq('id', session.user.id);
    if (saveError) {
      setBusy(false);
      setError('We couldn’t save your profile. Check your connection and try again.');
      return;
    }
    // A requested area is still pending: the database adds the member when an admin approves.
    const joined = [areaId].filter((id): id is string => Boolean(id) && !byId(id)?.pending);
    await supabase
      .from('community_members')
      .upsert(joined.map((community_id) => ({ community_id, user_id: session.user.id })), { ignoreDuplicates: true });
    logFunnel('communities_selected', { count: joined.length, kinds: joined.map((id) => byId(id)?.kind), pending: requested.length }, { userRef: session.user.id });
    logFunnel('signup_completed', { heard_from: heard, heard_detail: heardPick && heardPick !== OTHER_DETAIL ? heardPick : null }, { userRef: session.user.id });
    logFunnel('extras_started', {}, { userRef: session.user.id });
    await refreshProfile();
    setBusy(false);
    setPart(3);
  }

  // Step 3: the optional extras (club, Sahel, school, work, InstaPay, how they heard). Skipping it is fine.
  async function onExtras() {
    if (!session) return;
    setBusy(true);
    setError(null);
    const { error: saveError } = await supabase
      .from('profiles')
      .update({
        instapay_handle: instapay.trim() || null,
        heard_from: heard,
        heard_detail: heardDetail,
        inviter_name: heard === 'friend' || heard === 'family' ? inviter.trim() || null : null,
      })
      .eq('id', session.user.id);
    if (saveError) {
      setBusy(false);
      setError('We couldn’t save your profile. Check your connection and try again.');
      return;
    }
    const joined = Object.values(optional).filter((id): id is string => Boolean(id) && !byId(id)?.pending);
    await supabase
      .from('community_members')
      .upsert(joined.map((community_id) => ({ community_id, user_id: session.user.id })), { ignoreDuplicates: true });
    logFunnel('extras_saved', { communities: joined.length }, { userRef: session.user.id });
    setBusy(false);
    router.replace('/home');
  }

  function onSkip() {
    if (session) logFunnel('extras_skipped', {}, { userRef: session.user.id });
    router.replace('/home');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <BackHeader
            title={part === 1 ? 'Create your account' : part === 2 ? 'Nearly there' : 'A little more (optional)'}
            onBack={async () => {
              if (part > 1) return setPart(part === 3 ? 2 : 1);
              // The welcome screen sends a signed-in account straight back here, so going back means signing out.
              await supabase.auth.signOut();
              router.replace('/');
            }}
          />
          <Text style={styles.required}>
            Step {part} of 3 · <Text style={{ color: colors.muted }}>*</Text> Required
          </Text>

          {part === 1 ? (
            <>
          <Pressable style={styles.photo} onPress={pickPhoto} accessibilityRole="button" accessibilityLabel={photo ? 'Change photo' : 'Add a profile photo'}>
            {photo ? (
              <Image source={{ uri: photo.uri }} style={styles.photoCircle} contentFit="cover" />
            ) : (
              <View style={[styles.photoCircle, styles.photoEmpty]}>
                <MaterialIcons name="add-a-photo" size={30} color={colors.navy} />
              </View>
            )}
            <Text style={styles.photoText}>{photo ? 'Change photo' : 'Add a profile photo (optional)'}</Text>
          </Pressable>

          <View style={styles.group}>
            <Field label="FULL NAME" required>
              <TextInput value={name} onChangeText={setName} placeholder="example: Nour Sami" placeholderTextColor={colors.faint} maxLength={60} autoComplete="name" textContentType="name" style={formStyles.input} />
            </Field>
            {phoneDigits ? (
              <Field label="MOBILE NUMBER" required>
                <View style={styles.row}>
                  <Text style={[formStyles.input, { flex: 1 }]}>{formatPhone(phoneDigits)}</Text>
                  <MaterialIcons name="verified" size={18} color={colors.teal} />
                </View>
              </Field>
            ) : session?.user.email ? (
              <Field label="EMAIL">
                <Text style={formStyles.input}>{session.user.email}</Text>
              </Field>
            ) : null}
            <View>
              <Field label="USERNAME" required borderColor={username ? (un.ok ? colors.teal : un.icon === 'error' ? danger : undefined) : undefined}>
                <View style={styles.row}>
                  <Text style={[formStyles.input, { color: colors.muted }]}>@</Text>
                  <TextInput
                    value={username}
                    onChangeText={(v) => {
                      setUsername(v.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 20));
                      setTaken(null);
                    }}
                    placeholder="example: nour.s"
                    placeholderTextColor={colors.faint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[formStyles.input, { flex: 1 }]}
                    accessibilityLabel="Username"
                  />
                  {un.icon ? <MaterialIcons name={un.icon} size={18} color={un.ok ? colors.teal : un.color} /> : null}
                </View>
              </Field>
              <Text style={[formStyles.hint, { color: un.color }]}>{un.msg}</Text>
              {un.suggestions.length ? (
                <View style={styles.chips}>
                  {un.suggestions.map((s) => (
                    <Text key={s} style={styles.chip} onPress={() => { setUsername(s); setTaken(null); }}>
                      @{s}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          </View>

            </>
          ) : part === 2 ? (
            <>
          <Text style={styles.section}>
            ABOUT YOU <Text style={{ color: colors.muted }}>*</Text>
          </Text>
          <View style={styles.chips}>
            {LOVES.map((l) => (
              <Chip key={l.value} label={l.label} on={loves === l.value} onPress={() => setLoves(l.value)} />
            ))}
          </View>

          <Text style={styles.section}>
            YOUR COMMUNITIES <Text style={{ color: colors.muted }}>*</Text>
          </Text>
          <Text style={styles.sectionSub}>Tell us where you belong: this decides who sees your posts and whose posts you see.</Text>
          <View style={styles.group}>
            {countries.length > 1 ? (
              <SelectField
                label="COUNTRY"
                required
                value={countries.find((c) => c.code === country)?.name ?? 'Egypt'}
                onPress={() =>
                  openPicker(
                    'Country',
                    countries.map((c) => ({ label: c.name, value: c.code })),
                    country,
                    (v) => {
                      if (!v || v === country) return;
                      setCountry(v);
                      setGov(null);
                      setAreaId(null);
                      setOptional({});
                    },
                    { searchable: true },
                  )
                }
              />
            ) : null}
            {typedRegion ? (
              <Field label="REGION OR CITY" required>
                <TextInput
                  value={gov ?? ''}
                  onChangeText={(v) => {
                    setGov(v);
                    setAreaId(null);
                  }}
                  maxLength={60}
                  placeholder="example: Dubai"
                  placeholderTextColor={colors.faint}
                  style={formStyles.input}
                />
              </Field>
            ) : (
              <SelectField
                label="GOVERNORATE"
                required
                value={gov ?? 'Choose'}
                onPress={() =>
                  openPicker(
                    'Governorate',
                    governorates.map((g) => ({ label: g, value: g })),
                    gov,
                    (v) => {
                      if (v !== gov) setAreaId(null);
                      setGov(v);
                    },
                    { searchable: true },
                  )
                }
              />
            )}
            <SelectField
              label="AREA"
              required
              value={byId(areaId) ? label(byId(areaId)!) : gov?.trim() ? 'Choose' : `Choose a ${typedRegion ? 'region' : 'governorate'} first`}
              onPress={() =>
                gov?.trim() &&
                openPicker('Area', areas.map((a) => ({ label: label(a), value: a.id })), areaId, setAreaId, {
                  searchable: true,
                  footer: { label: 'Can’t find your area? Request it', onPress: () => openRequest('area', 'area') },
                })
              }
            />
          </View>
            </>
          ) : (
            <>
          <Text style={styles.section}>YOUR OTHER COMMUNITIES</Text>
          <View style={styles.group}>
            {OPTIONAL.map(({ kind, label: heading, noun }) => (
              <SelectField
                key={kind}
                label={heading}
                value={byId(optional[kind]) ? label(byId(optional[kind])!) : 'None'}
                onPress={() =>
                  openPicker(
                    heading[0] + heading.slice(1).toLowerCase(),
                    [...all.filter((c) => c.kind === kind && inCountry(c)).map((c) => ({ label: label(c), value: c.id })), { label: 'None', value: null }],
                    optional[kind] ?? null,
                    (v) => setOptional((o) => ({ ...o, [kind]: v ?? undefined })),
                    { searchable: true, footer: { label: `Can’t find your ${noun}? Request it`, onPress: () => openRequest(kind, noun) } },
                  )
                }
              />
            ))}
          </View>
          <View style={styles.note}>
            <MaterialIcons name="groups" size={19} color={colors.teal} />
            <Text style={styles.noteText}>You can join more communities anytime from your profile or the search tab.</Text>
          </View>

          <Text style={styles.section}>GETTING PAID</Text>
          <Field label="INSTAPAY HANDLE (OPTIONAL)">
            <TextInput value={instapay} onChangeText={setInstapay} placeholder="example: nour@instapay" placeholderTextColor={colors.faint} autoCapitalize="none" autoCorrect={false} maxLength={60} style={formStyles.input} />
          </Field>
          <Text style={[formStyles.hint, { color: colors.muted }]}>Needed when you cook, so neighbors can pay you directly. Add it later if you like.</Text>

          <Text style={styles.section}>HOW DID YOU HEAR ABOUT TABKHEEN A? (OPTIONAL)</Text>
          <View style={styles.group}>
            <SelectField
              label="I HEARD FROM"
              value={heardDef?.label ?? 'Choose'}
              onPress={() =>
                openPicker('How did you hear about tabkheen A?', HEARD.map((h) => ({ label: h.label, value: h.value })), heard, (v) => {
                  setHeard(v);
                  setHeardPick(null);
                  setHeardText('');
                })
              }
            />
            {heardDef?.detail.kind === 'pick' ? (
              <SelectField
                label="WHICH ONE?"
                value={heardPick === OTHER_DETAIL ? 'Another one' : (heardPick ?? 'Choose (optional)')}
                onPress={() =>
                  openPicker(
                    heardDef.detail.kind === 'pick' ? heardDef.detail.title : '',
                    [...(heardDef.detail.kind === 'pick' ? heardDef.detail.options : []).map((o) => ({ label: o, value: o })), { label: 'Another one', value: OTHER_DETAIL }],
                    heardPick,
                    setHeardPick,
                  )
                }
              />
            ) : null}
            {heardDef?.detail.kind === 'text' || (heardDef?.detail.kind === 'pick' && heardPick === OTHER_DETAIL) ? (
              <Field label={heardDef.detail.kind === 'text' ? heardDef.detail.label : 'WHICH ONE? (OPTIONAL)'}>
                <TextInput
                  value={heardText}
                  onChangeText={setHeardText}
                  placeholder={heardDef.detail.kind === 'text' ? heardDef.detail.placeholder : 'Type the name'}
                  placeholderTextColor={colors.faint}
                  maxLength={80}
                  style={formStyles.input}
                />
              </Field>
            ) : null}
            {heardDef?.detail.kind === 'person' ? (
              <Field label="WHO INVITED YOU? (OPTIONAL)">
                <TextInput value={inviter} onChangeText={setInviter} placeholder="Their name or @username" placeholderTextColor={colors.faint} maxLength={60} style={formStyles.input} />
              </Field>
            ) : null}
          </View>

            </>
          )}

          {error ? <Text style={formStyles.error}>{error}</Text> : null}
          <PrimaryButton
            label={part === 1 ? 'Continue' : part === 2 ? 'Create my account' : 'Save and finish'}
            onPress={part === 1 ? onContinue : part === 2 ? onDetails : onExtras}
            busy={busy}
            disabled={part === 1 ? !canContinue : part === 2 ? !canSubmit : false}
            style={{ marginTop: 22 }}
          />
          {part === 3 ? (
            <Text style={styles.skip} onPress={onSkip} accessibilityRole="button">
              Skip for now
            </Text>
          ) : null}
          <BuildInfo />
        </ScrollView>
      </KeyboardAvoidingView>
      <PickerSheet title={sheet?.title ?? ''} items={sheet?.items ?? null} onClose={() => setSheet(null)} searchable={sheet?.searchable} footer={sheet?.footer} />
      <RequestCommunitySheet
        key={request ? 'open' : 'closed'}
        visible={request !== null}
        existing={request ? all.filter((c) => c.kind === request.kind && c.governorate.toLowerCase() === (gov ?? '').trim().toLowerCase() && inCountry(c)) : []}
        onUseExisting={(id) => {
          if (request?.kind === 'area') setAreaId(id);
          else if (request) setOptional((o) => ({ ...o, [request.kind as Optional]: id }));
          setRequest(null);
        }}
        kindLabel={request?.noun ?? ''}
        where={[gov?.trim(), countries.find((c) => c.code === country)?.name].filter(Boolean).join(', ')}
        busy={requestBusy}
        error={requestError}
        onSubmit={sendRequest}
        onClose={() => setRequest(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  pad: { paddingHorizontal: 22, paddingBottom: 30 },
  required: { fontFamily: fonts.bold, fontSize: 12, color: colors.muted, marginTop: 14 },
  photo: { alignItems: 'center', gap: 8, marginTop: 14 },
  photoCircle: { width: 96, height: 96, borderRadius: 48 },
  photoEmpty: { backgroundColor: colors.lightBlue, alignItems: 'center', justifyContent: 'center' },
  photoText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink, textDecorationLine: 'underline' },
  group: { gap: 12, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink, backgroundColor: colors.lightBlue, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, overflow: 'hidden' },
  section: { fontFamily: fonts.extraBold, fontSize: 12, letterSpacing: 0.6, color: colors.ink, marginTop: 28 },
  sectionSub: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: 4 },
  skip: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, textAlign: 'center', textDecorationLine: 'underline', paddingVertical: 14, marginTop: 6 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.tealSoft, borderRadius: 14, padding: 14, marginTop: 14 },
  noteText: { flex: 1, fontFamily: fonts.semiBold, fontSize: 12.5, lineHeight: 18, color: colors.ink },
});
