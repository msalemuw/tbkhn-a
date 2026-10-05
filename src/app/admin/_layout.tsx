import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AdminScreen, StaffRoleContext, useFetchedStaffRole } from '@/components/admin-ui';
import { colors, fonts } from '@/constants/theme';

// Admin screens open only for staff; the database checks the role again on every call.
export default function AdminLayout() {
  const role = useFetchedStaffRole();

  if (role === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.teal} />
      </View>
    );
  }
  if (!role) {
    return (
      <AdminScreen title="Admin">
        <Text style={styles.note}>This area is for tabkheen A staff only.</Text>
      </AdminScreen>
    );
  }
  return (
    <StaffRoleContext.Provider value={role}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }} />
    </StaffRoleContext.Provider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  note: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.muted, paddingHorizontal: 22 },
});
