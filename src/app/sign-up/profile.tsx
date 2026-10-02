import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, danger, Field, formStyles, PickerSheet, PrimaryButton, SelectField, type SheetItem } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { logFunnel } from '@/lib/funnel';
import { formatPhone } from '@/lib/phone';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Flow 1, screen s5: Create your account (profile and communities), plus the section 13 additions:
// InstaPay handle (cooks get paid peer to peer) and the optional "How did you hear about TBKHN A?" referral question.

type Community = { id: string; name: string; kind: string; governorate: string };
type Optional = 'club' | 'sahel' | 'school' | 'work';
const OPTIONAL: { kind: Optional; label: string }[] = [
  { kind: 'club', label: 'CLUB' },
  { kind: 'sahel', label: 'SAHEL' },
  { kind: 'school', label: 'SCHOOL' },
  { kind: 'work', label: 'WORK' },
];

const HEARD = [
  { value: 'friend', label: 'A friend' },
  { value: 'family', label: 'Family' },
  { value: 'community', label: 'My community' },
  { value: 'social_media', label: 'Social media' },
  { value: 'ad', label: 'An ad' },
  { value: 'search', label: 'Search' },
  { value: 'other', label: 'Other' },
] as const;
type Heard = (typeof HEARD)[number]['value'];

type UsernameState = { msg: string; color: string; icon?: 'error' | 'check-circle'; ok: boolean; suggestions: string[] };

function usernameState(u: string, taken: boolean | null): UsernameState {
  if (!u) return { msg: 'Choose a username: 3–20 letters, numbers, . or _', color: colors.muted, ok: false, suggestions: [] };
  if (u.length < 3) return { msg: 'At least 3 characters', color: danger, icon: 'error', ok: false, suggestions: [] };
  if (taken === null) return { msg: 'Checking…', color: colors.muted, ok: false, suggestions: [] };
  if (taken) {
    const yy = new Date().getFullYear() % 100;
    const suggestions = [`${u}1`, `${u}_`, `${u}.${yy}`].filter((x) => x.length <= 20);
    return { msg: `@${u} is already taken. Try one of these:`, color: danger, icon: 'error', ok: false, suggestions };
  }
  return { msg: `@${u} is available`, color: colors.teal, icon: 'check-circle', ok: true, suggestions: [] };
}

export default function ProfileStep() {
  const { session, refreshProfile } = useSession();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [taken, setTaken] = useState<boolean | null>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [gov, setGov] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [optional, setOptional] = useState<Partial<Record<Optional, string>>>({});
  const [instapay, setInstapay] = useState('');
  const [heard, setHeard] = useState<Heard | null>(null);
  const [inviter, setInviter] = useState('');
  const [sheet, setSheet] = useState<{ title: string; items: SheetItem[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneDigits = (session?.user.phone ?? '').replace(/^\+?20/, '');

  useEffect(() => {
    logFunnel('profile_started', {}, { userRef: session?.user.id });
    supabase
      .from('communities')
      .select('id, name, kind, governorate')
      .eq('status', 'approved')
      .order('name')
      .then(({ data }) => setCommunities(data ?? []));
  }, [session?.user.id]);

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
  const governorates = useMemo(
    () => [...new Set(communities.filter((c) => c.kind === 'area').map((c) => c.governorate))].sort(),
    [communities],
  );
  const areas = communities.filter((c) => c.kind === 'area' && c.governorate === gov);
  const byId = (id?: string | null) => communities.find((c) => c.id === id);

  const canSubmit = name.trim().length > 0 && un.ok && Boolean(gov && areaId);

  function openPicker(title: string, options: { label: string; value: string | null }[], current: string | null, set: (v: string | null) => void) {
    setSheet({ title, items: options.map((o) => ({ label: o.label, selected: o.value === current, onPress: () => set(o.value) })) });
  }

  async function onContinue() {
    if (!session || !canSubmit) return;
    setBusy(true);
    setError(null);
    const area = byId(areaId)!;
    const { error: saveError } = await supabase
      .from('profiles')
      .update({
        display_name: name.trim(),
        username,
        governorate: gov,
        area: area.name,
        instapay_handle: instapay.trim() || null,
        heard_from: heard,
        inviter_name: heard === 'friend' || heard === 'family' ? inviter.trim() || null : null,
      })
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
    const joined = [areaId, ...Object.values(optional)].filter((id): id is string => Boolean(id));
    await supabase
      .from('community_members')
      .upsert(joined.map((community_id) => ({ community_id, user_id: session.user.id })), { ignoreDuplicates: true });
    logFunnel('communities_selected', { count: joined.length, kinds: joined.map((id) => byId(id)?.kind) }, { userRef: session.user.id });
    logFunnel('signup_completed', { heard_from: heard }, { userRef: session.user.id });
    await refreshProfile();
    setBusy(false);
    router.replace('/home');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <BackHeader title="Create your account" />
          <Text style={styles.required}>
            <Text style={{ color: colors.coral }}>*</Text> Required
          </Text>

          <View style={styles.group}>
            <Field label="FULL NAME" required>
              <TextInput value={name} onChangeText={setName} placeholder="example: Nour Sami" placeholderTextColor="#b5bcb9" maxLength={60} autoComplete="name" textContentType="name" style={formStyles.input} />
            </Field>
            <Field label="MOBILE NUMBER" required>
              <View style={styles.row}>
                <Text style={[formStyles.input, { flex: 1 }]}>{formatPhone(phoneDigits)}</Text>
                <MaterialIcons name="verified" size={18} color={colors.teal} />
              </View>
            </Field>
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
                    placeholderTextColor="#b5bcb9"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[formStyles.input, { flex: 1 }]}
                    accessibilityLabel="Username"
                  />
                  {un.icon ? <MaterialIcons name={un.icon} size={18} color={un.color} /> : null}
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

          <Text style={styles.section}>
            YOUR COMMUNITIES <Text style={{ color: colors.coral }}>*</Text>
          </Text>
          <Text style={styles.sectionSub}>Tell us where you belong: this decides who sees your posts and whose posts you see.</Text>
          <View style={styles.group}>
            <SelectField
              label="GOVERNORATE"
              required
              value={gov ?? 'Choose'}
              onPress={() =>
                openPicker('Governorate', governorates.map((g) => ({ label: g, value: g })), gov, (v) => {
                  if (v !== gov) setAreaId(null);
                  setGov(v);
                })
              }
            />
            <SelectField
              label="AREA"
              required
              value={byId(areaId)?.name ?? (gov ? 'Choose' : 'Choose a governorate first')}
              onPress={() => gov && openPicker('Area', areas.map((a) => ({ label: a.name, value: a.id })), areaId, setAreaId)}
            />
            {OPTIONAL.map(({ kind, label }) => (
              <SelectField
                key={kind}
                label={label}
                value={byId(optional[kind])?.name ?? 'None'}
                onPress={() =>
                  openPicker(
                    label[0] + label.slice(1).toLowerCase(),
                    [...communities.filter((c) => c.kind === kind).map((c) => ({ label: c.name, value: c.id })), { label: 'None', value: null }],
                    optional[kind] ?? null,
                    (v) => setOptional((o) => ({ ...o, [kind]: v ?? undefined })),
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
            <TextInput value={instapay} onChangeText={setInstapay} placeholder="example: nour@instapay" placeholderTextColor="#b5bcb9" autoCapitalize="none" autoCorrect={false} maxLength={60} style={formStyles.input} />
          </Field>
          <Text style={[formStyles.hint, { color: colors.muted }]}>Needed when you cook, so neighbors can pay you directly. Add it later if you like.</Text>

          <Text style={styles.section}>HOW DID YOU HEAR ABOUT TBKHN A? (OPTIONAL)</Text>
          <View style={styles.group}>
            <SelectField
              label="I HEARD FROM"
              value={HEARD.find((h) => h.value === heard)?.label ?? 'None'}
              onPress={() => openPicker('How did you hear about TBKHN A?', [...HEARD, { label: 'None', value: null }], heard, (v) => setHeard(v as Heard | null))}
            />
            {heard === 'friend' || heard === 'family' ? (
              <Field label="WHO INVITED YOU? (OPTIONAL)">
                <TextInput value={inviter} onChangeText={setInviter} placeholder="Their name or @username" placeholderTextColor="#b5bcb9" maxLength={60} style={formStyles.input} />
              </Field>
            ) : null}
          </View>

          {error ? <Text style={[formStyles.hint, { color: danger }]}>{error}</Text> : null}
          <PrimaryButton label="Continue" onPress={onContinue} busy={busy} disabled={!canSubmit} style={{ marginTop: 22 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <PickerSheet title={sheet?.title ?? ''} items={sheet?.items ?? null} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  pad: { paddingHorizontal: 22, paddingBottom: 30 },
  required: { fontFamily: fonts.bold, fontSize: 12, color: colors.muted, marginTop: 14 },
  group: { gap: 12, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { fontFamily: fonts.bold, fontSize: 13, color: colors.teal, backgroundColor: colors.tealSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, overflow: 'hidden' },
  section: { fontFamily: fonts.extraBold, fontSize: 12, letterSpacing: 0.6, color: colors.ink, marginTop: 28 },
  sectionSub: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: 4 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.tealSoft, borderRadius: 14, padding: 14, marginTop: 14 },
  noteText: { flex: 1, fontFamily: fonts.semiBold, fontSize: 12.5, lineHeight: 18, color: '#33403b' },
});
