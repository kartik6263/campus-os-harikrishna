import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components';
import { useLang } from '@/lib/language';
import { color, font } from '@/theme/tokens';

function TabGlyph({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <View style={[styles.glyph, focused && styles.glyphOn]}>
      <Text style={{ fontSize: 17, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>
    </View>
  );
}

export default function TabLayout() {
  const { t } = useLang();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.marigold,
        tabBarInactiveTintColor: color.slate,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: { fontFamily: font.sansMedium, fontWeight: '500', fontSize: 11 },
        sceneStyle: { backgroundColor: color.page },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('Home', 'होम'),
          tabBarIcon: ({ focused }) => <TabGlyph glyph="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: t('Attendance', 'उपस्थिति'),
          tabBarIcon: ({ focused }) => <TabGlyph glyph="✓" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="timetable"
        options={{
          title: t('Timetable', 'समय-सारणी'),
          tabBarIcon: ({ focused }) => <TabGlyph glyph="🗓" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="fee"
        options={{
          title: t('Fee', 'शुल्क'),
          tabBarIcon: ({ focused }) => <TabGlyph glyph="₹" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('More', 'अधिक'),
          tabBarIcon: ({ focused }) => <TabGlyph glyph="⋯" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: color.surface,
    borderTopColor: color.rule,
    borderTopWidth: 1,
    height: 62,
    paddingTop: 6,
  },
  glyph: {
    width: 30,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphOn: { backgroundColor: color.marigoldLight },
});
