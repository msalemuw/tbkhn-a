import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';

import { AdminScreen, adminStyles, Card, ErrorLine, ReasonModal, SmallButton, useStaffRole } from '@/components/admin-ui';
import { Field, formStyles } from '@/components/form';
import { canAct, listMembers, type Member, type MemberFilter, setStaffRole, setSuspended, setVerified, type StaffRole } from '@/lib/admin';
import { fmtAgo } from '@/lib/format';
import { useSession } from '@/lib/session';
import { refreshVerified } from '@/lib/verified';

// The member list (newest first), opened from the Admin tiles as all, new this week or suspended; search by username, name, phone or email; suspend or lift it; switch the verified tick; the owner sets staff roles.
const ROLES: StaffRole[] = ['moderator', 'support', 'owner'];

export default function Members() {
  const role = useStaffRole();
  const { session } = useSession();
  const params = useLocalSearchParams<{ filter?: string }>();
  const filter: MemberFilter = params.filter === 'new' || params.filter === 'suspended' ? params.filter : 'all';
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<(Member & { total: number })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<Parameters<typeof ReasonModal>[0]['ask']>(null);

  // Loads the first page, or the next one when `more` is set.
  const search = async (more = false) => {
    try {
      const page = await listMembers(filter, query.trim(), more ? (items?.length ?? 0) : 0);
      setItems(more ? [...(items ?? []), ...page] : page);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    }
  };

  // Opens on the list; typing searches after a short pause.
  useEffect(() => {
    const id = setTimeout(() => search(), query ? 350 : 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filter]);

  const act = async (run: () => Promise<unknown>) => {
    try {
      await run();
      await search();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  };

  return (
    <AdminScreen title={filter === 'new' ? 'New this week' : filter === 'suspended' ? 'Suspended' : 'Members'}>
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
        ListHeaderComponent={items && items.length ? <Text style={adminStyles.muted}>Showing {items.length} of {items[0].total}</Text> : null}
        ListEmptyComponent={items === null ? null : <Text style={adminStyles.empty}>No members match.</Text>}
        ListFooterComponent={items && items.length < (items[0]?.total ?? 0) ? <SmallButton label="Show more" onPress={() => search(true)} /> : null}
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
              <View style={adminStyles.row}>
                <SmallButton
                  label={item.verified_at ? 'Verified: on (tap to turn off)' : 'Verified: off (tap to turn on)'}
                  strong={!!item.verified_at}
                  onPress={() => act(async () => { await setVerified(item.id, !item.verified_at); await refreshVerified(); })}
                />
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
