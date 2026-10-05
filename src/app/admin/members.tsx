import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';

import { AdminScreen, adminStyles, Card, ErrorLine, ReasonModal, SmallButton, useStaffRole } from '@/components/admin-ui';
import { Field, formStyles } from '@/components/form';
import { canAct, findMembers, type Member, setStaffRole, setSuspended, type StaffRole } from '@/lib/admin';
import { fmtAgo } from '@/lib/format';
import { useSession } from '@/lib/session';

// Find a member by username, name, phone or email; suspend or lift it; the owner sets staff roles.
const ROLES: StaffRole[] = ['moderator', 'support', 'owner'];

export default function Members() {
  const role = useStaffRole();
  const { session } = useSession();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<Parameters<typeof ReasonModal>[0]['ask']>(null);

  const search = async (q = query) => {
    try {
      setItems(await findMembers(q));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not search');
    }
  };

  const act = async (run: () => Promise<unknown>) => {
    try {
      await run();
      await search();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  };

  return (
    <AdminScreen title="Members">
      <View style={{ paddingHorizontal: 22, paddingBottom: 12 }}>
        <Field label="USERNAME, NAME, PHONE OR EMAIL">
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => search()}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            style={formStyles.input}
          />
        </Field>
        <ErrorLine text={error} />
      </View>
      <FlatList
        data={items ?? []}
        keyExtractor={(m) => m.id}
        contentContainerStyle={adminStyles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={items === null ? null : <Text style={adminStyles.empty}>No members match.</Text>}
        renderItem={({ item }) => {
          const name = item.display_name ?? (item.username ? `@${item.username}` : 'No name yet');
          const isMe = item.id === session?.user.id;
          return (
            <Card>
              <Text style={adminStyles.title}>{name}</Text>
              <Text style={adminStyles.muted}>
                {[item.username && `@${item.username}`, item.phone, item.email].filter(Boolean).join(' · ')}
              </Text>
              <Text style={adminStyles.muted}>
                {[item.area, item.governorate].filter(Boolean).join(', ') || 'No area'} · joined {fmtAgo(Date.parse(item.created_at))}
              </Text>
              <Text style={adminStyles.muted}>
                {item.posts} posts · {item.orders} orders · {item.open_reports} open reports
                {item.staff_role ? ` · staff: ${item.staff_role}` : ''}
              </Text>
              {item.suspended_at ? (
                <Text style={[adminStyles.tag, { marginTop: 6 }]}>SUSPENDED: {item.suspended_reason}</Text>
              ) : null}
              <View style={adminStyles.row}>
                <SmallButton label="Open profile" onPress={() => router.push({ pathname: '/cook/[id]', params: { id: item.id } })} />
                {canAct(role) && !isMe && !item.staff_role ? (
                  item.suspended_at ? (
                    <SmallButton label="Lift suspension" onPress={() => act(() => setSuspended(item.id, false))} />
                  ) : (
                    <SmallButton
                      label="Suspend"
                      onPress={() =>
                        setAsk({
                          title: `Suspend ${name}?`,
                          action: 'Suspend',
                          run: async (reason) => {
                            await setSuspended(item.id, true, reason);
                            await search();
                          },
                        })
                      }
                    />
                  )
                ) : null}
              </View>
              {role === 'owner' && !isMe && !item.suspended_at ? (
                <View style={adminStyles.row}>
                  {ROLES.map((r) => (
                    <SmallButton key={r} label={r[0].toUpperCase() + r.slice(1)} strong={item.staff_role === r} onPress={() => act(() => setStaffRole(item.id, r))} />
                  ))}
                  {item.staff_role ? <SmallButton label="Remove staff" onPress={() => act(() => setStaffRole(item.id, null))} /> : null}
                </View>
              ) : null}
            </Card>
          );
        }}
      />
      <ReasonModal ask={ask} onClose={() => setAsk(null)} />
    </AdminScreen>
  );
}
