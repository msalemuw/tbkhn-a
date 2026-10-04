import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DishList } from '@/components/dish-list';
import { colors, fonts } from '@/constants/theme';

// Screen s6: Home feed of the communities you follow.
export default function Home() {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo}>TBKHN A</Text>
        <View style={styles.headerRight}>
          <Pressable style={styles.locPill} accessibilityLabel="Choose your location">
            <MaterialIcons name="location-on" size={16} color={colors.teal} />
            <Text style={styles.locText}>Your area</Text>
          </Pressable>
          <Pressable accessibilityLabel="Orders" onPress={() => router.push('/orders')} hitSlop={8}>
            <MaterialIcons name="receipt-long" size={24} color={colors.ink} />
          </Pressable>
          <Pressable accessibilityLabel="Messages">
            <MaterialIcons name="chat-bubble-outline" size={24} color={colors.ink} />
          </Pressable>
        </View>
      </View>
      {/* Stories and the full post feed come next; for now Home shows today's dishes. */}
      <DishList header={<Text style={styles.feedTitle}>Cooking today near you</Text>} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  logo: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  locPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.tealSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  locText: { fontFamily: fonts.bold, fontSize: 13, color: colors.teal },
  feedTitle: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.ink },
});
