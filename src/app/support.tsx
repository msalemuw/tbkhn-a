import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, Field, formStyles, PrimaryButton } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { fetchMySupportTickets, fetchSupportThread, sendSupport, type SupportMessage, type SupportTicket } from '@/lib/support';

const STATUS: Record<SupportTicket['status'], string> = { open: 'We’re looking at it', pending: 'We replied', closed: 'Closed' };

function dateLabel(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Help & support. Works signed out too (from the sign-in screens): then we ask for an email or phone to answer to.
export default function Support() {
  const { session } = useSession();
  const params = useLocalSearchParams<{ id?: string }>();
  const [ticketId, setTicketId] = useState<string | null>(params.id ?? null);
  const [composing, setComposing] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    if (!session) return;
    setFailed(false);
    fetchMySupportTickets().then(setTickets).catch(() => setFailed(true));
  }, [session]);
  useFocusEffect(load);

  if (!session) return <NewMessage signedIn={false} onSent={() => {}} />;
  if (ticketId) {
    return <Thread id={ticketId} subject={tickets?.find((t) => t.id === ticketId)?.subject} onBack={() => { setTicketId(null); load(); }} />;
  }
  if (composing || (tickets && tickets.length === 0 && !failed)) {
    return <NewMessage signedIn onSent={(id) => { setComposing(false); setTicketId(id); }} onCancel={tickets?.length ? () => setComposing(false) : undefined} />;
  }
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.pad}>
        <BackHeader title="Help & support" />
      </View>
      {tickets === null && !failed ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.teal} /> : null}
      {failed ? <Text style={[formStyles.error, styles.pad]}>Check your connection and try again.</Text> : null}
      <ScrollView contentContainerStyle={styles.pad}>
        {(tickets ?? []).map((t) => (
          <Pressable key={t.id} style={styles.card} onPress={() => setTicketId(t.id)} accessibilityRole="button">
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle} numberOfLines={1}>{t.subject}</Text>
              <Text style={[styles.tag, t.status === 'pending' && styles.tagNew]}>{STATUS[t.status]}</Text>
            </View>
            {t.last_body ? <Text style={styles.cardSub} numberOfLines={2}>{t.last_sender === 'staff' ? 'tabkheen A: ' : ''}{t.last_body}</Text> : null}
            <Text style={styles.when}>{dateLabel(t.updated_at)}</Text>
          </Pressable>
        ))}
        <PrimaryButton label="Write to us" onPress={() => setComposing(true)} style={{ marginTop: 14 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function NewMessage({ signedIn, onSent, onCancel }: { signedIn: boolean; onSent: (id: string) => void; onCancel?: () => void }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentSignedOut, setSentSignedOut] = useState(false);

  async function send() {
    setError('');
    setBusy(true);
    const r = await sendSupport({ subject: subject.trim(), body: body.trim(), contact: signedIn ? undefined : contact.trim() });
    setBusy(false);
    if ('error' in r) return setError(r.error);
    if (signedIn) onSent(r.id);
    else setSentSignedOut(true);
  }

  if (sentSignedOut) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.pad}>
          <BackHeader title="Help & support" />
          <Text style={[formStyles.title, { marginTop: 22 }]}>Thank you</Text>
          <Text style={formStyles.sub}>We got your message and will answer on {contact.trim()}.</Text>
          <PrimaryButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ marginTop: 24 }} />
        </View>
      </SafeAreaView>
    );
  }
  const ready = subject.trim().length > 0 && body.trim().length > 0 && (signedIn || contact.trim().length >= 5);
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <BackHeader title="Help & support" onBack={onCancel} />
          <Text style={[formStyles.sub, { marginBottom: 16 }]}>Tell us what happened and we will answer here{signedIn ? '' : ', on the email or phone you leave'}.</Text>
          <Field label="SUBJECT" required>
            <TextInput value={subject} onChangeText={setSubject} maxLength={100} placeholder="For example: I can’t sign in" placeholderTextColor={colors.faint} style={formStyles.input} accessibilityLabel="Subject" />
          </Field>
          <Field label="MESSAGE" required style={{ marginTop: 12 }}>
            <TextInput value={body} onChangeText={setBody} maxLength={2000} multiline placeholder="Write your message" placeholderTextColor={colors.faint} style={[formStyles.input, styles.multi]} accessibilityLabel="Message" />
          </Field>
          {!signedIn ? (
            <Field label="YOUR EMAIL OR PHONE" required style={{ marginTop: 12 }}>
              <TextInput value={contact} onChangeText={setContact} maxLength={200} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="So we can answer you" placeholderTextColor={colors.faint} style={formStyles.input} accessibilityLabel="Your email or phone" />
            </Field>
          ) : null}
          {error ? <Text style={formStyles.error}>{error}</Text> : null}
          <PrimaryButton label="Send" onPress={send} busy={busy} disabled={!ready} style={{ marginTop: 18 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Thread({ id, subject, onBack }: { id: string; subject?: string; onBack: () => void }) {
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    fetchSupportThread(id).then(setMessages).catch(() => setError('Check your connection and try again.'));
  }, [id]);
  useFocusEffect(load);

  async function send() {
    setError('');
    setBusy(true);
    const r = await sendSupport({ body: reply.trim(), ticketId: id });
    setBusy(false);
    if ('error' in r) return setError(r.error);
    setReply('');
    load();
  }
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <BackHeader title={subject ?? 'Help & support'} onBack={onBack} />
          {messages === null && !error ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.teal} /> : null}
          <View style={{ marginTop: 16, gap: 10 }}>
            {(messages ?? []).map((m, i) => (
              <View key={i} style={[styles.bubble, m.sender === 'member' ? styles.mine : styles.theirs]}>
                <Text style={styles.bubbleText}>{m.body}</Text>
                <Text style={styles.when}>{m.sender === 'staff' ? 'tabkheen A · ' : ''}{dateLabel(m.created_at)}</Text>
              </View>
            ))}
          </View>
          <Field label="YOUR REPLY" style={{ marginTop: 18 }}>
            <TextInput value={reply} onChangeText={setReply} maxLength={2000} multiline placeholder="Write a reply" placeholderTextColor={colors.faint} style={[formStyles.input, styles.multi]} accessibilityLabel="Your reply" />
          </Field>
          {error ? <Text style={formStyles.error}>{error}</Text> : null}
          <PrimaryButton label="Send" onPress={send} busy={busy} disabled={!reply.trim()} style={{ marginTop: 14 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  pad: { padding: 22, paddingTop: 0 },
  multi: { minHeight: 110, textAlignVertical: 'top' },
  card: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, padding: 14, marginTop: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontFamily: fonts.extraBold, fontSize: 15, color: colors.ink },
  cardSub: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.muted, marginTop: 4, lineHeight: 19 },
  tag: { fontFamily: fonts.extraBold, fontSize: 11, color: colors.muted },
  tagNew: { color: colors.teal },
  when: { fontFamily: fonts.semiBold, fontSize: 11.5, color: colors.muted, marginTop: 6 },
  bubble: { maxWidth: '88%', borderRadius: 14, padding: 12 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.lightBlue },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.line },
  bubbleText: { fontFamily: fonts.medium, fontSize: 14.5, color: colors.ink, lineHeight: 21 },
});
