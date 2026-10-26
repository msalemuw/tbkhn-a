import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { BackHeader, danger, Field, formStyles, PickerSheet, PrimaryButton, SelectField, type SheetItem } from '@/components/form';
import { Avatar } from '@/components/avatar';
import { colors, fonts } from '@/constants/theme';
import { normalizeSocial, SOCIALS } from '@/lib/social';
import { uploadPhoto } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const USERNAME_DAYS = 30;

type AreaRow = { id: string; name: string; governorate: string; country_code: string | null };

// Edit your own profile: username (once every 30 days), name, bio, social links and the InstaPay handle neighbors pay you on.
export default function EditProfile() {
  const { session, profile, refreshProfile } = useSession();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [instapay, setInstapay] = useState(profile?.instapay_handle ?? '');
  const [socials, setSocials] = useState<Record<string, string>>(() => Object.fromEntries(SOCIALS.map((x) => [x.kind, profile?.[x.column] ?? ''])));
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  // Where you are: governorate and area (an approved area community). Changing it moves you to the new area's community.
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [gov, setGov] = useState<string | null>(profile?.governorate ?? null);
  const [areaName, setAreaName] = useState<string | null>(profile?.area ?? null);
  const [sheet, setSheet] = useState<{ title: string; items: SheetItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('communities')
      .select('id, name, governorate, country_code')
      .eq('kind', 'area')
      .eq('status', 'approved')
      .order('name')
      .then(({ data }) => setAreas((data as AreaRow[] | null) ?? []));
  }, []);
  const country = (profile as { country_code?: string | null } | null)?.country_code ?? 'EG';
  const inCountry = areas.filter((a) => (a.country_code ?? 'EG') === country);
  const governorates = [...new Set([...inCountry.map((a) => a.governorate), ...(profile?.governorate ? [profile.governorate] : [])])].sort();
  const govAreas = inCountry.filter((a) => a.governorate === gov);
  const placeChanged = gov !== (profile?.governorate ?? null) || areaName !== (profile?.area ?? null);

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!res.canceled && res.assets[0]) setPhoto(res.assets[0]);
  }

  // A username can change once every 30 days; the database enforces it, this just explains it.
  const nextChange = profile?.username_changed_at ? new Date(Date.parse(profile.username_changed_at) + USERNAME_DAYS * 86400000) : null;
  const [now] = useState(() => Date.now());
  const locked = nextChange != null && nextChange.getTime() > now;
  const userChanged = username !== (profile?.username ?? '');
  const userValid = /^[a-z0-9._]{3,20}$/.test(username);
  const ok = name.trim().length >= 1 && (!userChanged || userValid) && Boolean(gov && areaName);
  const save = async () => {
    if (!session) return;
    if (userChanged) {
      const { data: free } = await supabase.rpc('username_available', { candidate: username });
      if (free === false) {
        setError('That username is taken. Try another one.');
        return;
      }
    }
    const links: Record<string, string | null> = {};
    for (const x of SOCIALS) {
      const v = normalizeSocial(x.kind, socials[x.kind] ?? '');
      if (v === undefined) {
        setError(`That ${x.label} link doesn’t look right. Type your username or paste your ${x.label} link.`);
        return;
      }
      links[x.column] = v;
    }
    setBusy(true);
    setError(null);
    let avatarPath: string | undefined;
    try {
      if (photo) avatarPath = await uploadPhoto(session.user.id, photo.uri, photo.mimeType ?? 'image/jpeg');
    } catch (e) {
      setBusy(false);
      // The reason is shown so a repeated failure can be reported and fixed.
      setError(`We couldn’t upload your photo (${e instanceof Error ? e.message : 'unknown error'}). Check your connection and try again.`);
      return;
    }
    const { error: saveError } = await supabase
      .from('profiles')
      .update({ ...(userChanged ? { username } : {}), display_name: name.trim(), bio: bio.trim() || null, instapay_handle: instapay.trim() || null, ...links, ...(avatarPath ? { avatar_path: avatarPath } : {}), ...(placeChanged ? { governorate: gov, area: areaName } : {}) })
      .eq('id', session.user.id);
    setBusy(false);
    if (saveError) {
      const text = `${saveError.message} ${saveError.code}`;
      setError(
        text.includes('username_change_too_soon')
          ? 'You changed your username recently. You can change it again after 30 days.'
          : saveError.code === '23505'
            ? 'That username is taken. Try another one.'
            : saveError.code === '23514'
              ? 'That username can’t be used. Try another one.'
              : 'We couldn’t save your changes. Please try again.',
      );
      return;
    }
    if (placeChanged) {
      // Leave the old area's community and join the new one (the member list follows where you live).
      const oldIds = areas.filter((a) => a.name === profile?.area && a.governorate === profile?.governorate).map((a) => a.id);
      const next = areas.find((a) => a.name === areaName && a.governorate === gov);
      if (oldIds.length) await supabase.from('community_members').delete().eq('user_id', session.user.id).in('community_id', oldIds);
      if (next) await supabase.from('community_members').upsert([{ community_id: next.id, user_id: session.user.id }], { ignoreDuplicates: true });
    }
    await refreshProfile();
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <BackHeader title="Edit profile" />
          <Pressable style={styles.photo} onPress={pickPhoto} accessibilityRole="button" accessibilityLabel="Change photo">
            {photo ? <Image source={{ uri: photo.uri }} style={styles.preview} contentFit="cover" /> : <Avatar person={profile ? { id: profile.id, username: profile.username, display_name: profile.display_name, avatar_path: profile.avatar_path ?? null } : null} size={96} />}
            <Text style={styles.photoText}>Change photo</Text>
          </Pressable>
          <Field label="USERNAME">
            <TextInput
              value={username}
              onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
              editable={!locked}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              placeholderTextColor={colors.faint}
              style={[formStyles.input, locked && { opacity: 0.5 }]}
              accessibilityLabel="Username"
            />
          </Field>
          <Text style={[formStyles.hint, { color: userChanged && !userValid ? danger : colors.muted }]}>
            {locked
              ? `You can change your username again on ${nextChange!.toLocaleDateString()}.`
              : userChanged && !userValid
                ? '3–20 letters, numbers, . or _'
                : 'You can change your username once every 30 days.'}
          </Text>
          <Field label="NAME" required>
            <TextInput value={name} onChangeText={setName} maxLength={60} placeholderTextColor={colors.faint} style={formStyles.input} accessibilityLabel="Name" />
          </Field>
          <Field label="BIO">
            <TextInput value={bio} onChangeText={setBio} maxLength={300} multiline placeholder="Tell neighbors about your cooking" placeholderTextColor={colors.faint} style={[formStyles.input, { minHeight: 70 }]} accessibilityLabel="Bio" />
          </Field>
          {SOCIALS.map((x) => (
            <Field key={x.kind} label={x.label.toUpperCase()}>
              <TextInput value={socials[x.kind]} onChangeText={(t) => setSocials((o) => ({ ...o, [x.kind]: t }))} placeholder="Username or link" placeholderTextColor={colors.faint} autoCapitalize="none" autoCorrect={false} maxLength={200} style={formStyles.input} accessibilityLabel={x.label} />
            </Field>
          ))}
          <Text style={[formStyles.hint, { color: colors.muted }]}>Optional. Shown on your profile so neighbors can find you.</Text>
          <SelectField
            label="GOVERNORATE"
            required
            value={gov ?? 'Choose'}
            onPress={() =>
              setSheet({
                title: 'Governorate',
                items: governorates.map((g) => ({
                  label: g,
                  selected: g === gov,
                  onPress: () => {
                    if (g !== gov) setAreaName(null);
                    setGov(g);
                  },
                })),
              })
            }
          />
          <SelectField
            label="AREA"
            required
            value={areaName ?? (gov ? 'Choose' : 'Choose a governorate first')}
            onPress={() => gov && setSheet({ title: 'Area', items: govAreas.map((a) => ({ label: a.name, selected: a.name === areaName, onPress: () => setAreaName(a.name) })) })}
          />
          <Text style={[formStyles.hint, { color: colors.muted }]}>Where you live. Can’t find your area? Request it from the Search tab.</Text>
          <Field label="INSTAPAY HANDLE">
            <TextInput value={instapay} onChangeText={setInstapay} placeholder="example: nour@instapay" placeholderTextColor={colors.faint} autoCapitalize="none" autoCorrect={false} maxLength={60} style={formStyles.input} accessibilityLabel="InstaPay handle" />
          </Field>
          <Text style={[formStyles.hint, { color: colors.muted }]}>Needed when you cook, so neighbors can pay you directly. Only people with an order with you can see it.</Text>
          {error ? <Text style={[formStyles.error, { backgroundColor: danger }]}>{error}</Text> : null}
          <PrimaryButton label="Save" onPress={save} busy={busy} disabled={!ok} style={{ marginTop: 8 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <PickerSheet title={sheet?.title ?? ''} items={sheet?.items ?? null} onClose={() => setSheet(null)} searchable />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 22, gap: 14 },
  photo: { alignItems: 'center', gap: 8 },
  preview: { width: 96, height: 96, borderRadius: 48 },
  photoText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
});
