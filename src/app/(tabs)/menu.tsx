import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DishList } from '@/components/dish-list';
import { colors, fonts } from '@/constants/theme';

// Flow 14, screen s53: Today's menu.
export default function Menu() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top']}>
      <DishList header={<Text style={styles.title}>Today’s menu</Text>} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serif, fontSize: 32, color: colors.ink },
});
