import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AdminScreen, ErrorLine, useStaffRole } from '@/components/admin-ui';
import { Chip } from '@/components/chip';
import { Field, formStyles, PrimaryButton } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { type AdminCommunity, canAct, fetchCommunities, postAnnouncement } from '@/lib/admin';

// Announcements appear in Inbox > Notifications for everyone, or only for members of the chosen communities.
export default function Announce() {
  const role = useStaffRole();
  const [communities, setCommunities] = useState<AdminCommunity[]>([]);
  const [everyone, setEveryone] = useState(true);
  const [chosen, setChosen] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCommunities()
      .then(setCommunities)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load communities'));
  }, []);

  const audience = everyone
    ? 'everyone'
    : `${communities.filter((c) => chosen.includes(c.id)).reduce((n, c) => n + c.members, 0)} members in ${chosen.length} ${chosen.length === 1 ? 'community' : 'communities'}`;
  const ready = title.trim() && body.trim() && (everyone || chosen.length > 0);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await postAnnouncement(title, body, everyone ? null : chosen);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send');
    }
    setBusy(false);
  };

  if (!canAct(role)) {
    return (
      <AdminScreen title="Send announcement">
        <Text style={[formStyles.sub, { paddingHorizontal: 22 }]}>Only owners and moderators can send announcements.</Text>
      </AdminScreen>
    );
  }

  return (
    <AdminScreen title="Send announcement">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>WHO GETS IT</Text>
        <View style={styles.chips}>
          <Chip label="Everyone" on={everyone} onPress={() => setEveryone(true)} />
          <Chip label="Chosen communities" on={!everyone} onPress={() => setEveryone(false)} />
        </View>
        {!everyone ? (
          <View style={styles.chips}>
            {communities.map((c) => (
              <Chip
                key={c.id}
                label={`${c.name} (${c.members})`}
                on={chosen.includes(c.id)}
                onPress={() => setChosen((ids) => (ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id]))}
              />
            ))}
          </View>
        ) : null}
        <Field label="TITLE" style={{ marginTop: 18 }}>
          <TextInput value={title} onChangeText={setTitle} maxLength={80} style={formStyles.input} />
        </Field>
        <Field label="MESSAGE" style={{ marginTop: 12 }}>
          <TextInput value={body} onChangeText={setBody} maxLength={1000} multiline style={[formStyles.input, { minHeight: 110, textAlignVertical: 'top' }]} />
        </Field>
        <ErrorLine text={error} />
        <PrimaryButton label={`Send to ${audience}`} onPress={send} busy={busy} disabled={!ready} style={{ marginTop: 18 }} />
      </ScrollView>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 22, paddingBottom: 40 },
  label: { fontFamily: fonts.extraBold, fontSize: 10.5, letterSpacing: 0.6, color: colors.muted, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
});
