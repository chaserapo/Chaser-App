import { Tabs } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { colors } from "@/src/theme";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, size }) => <Icon name="home-variant" size={size} color={color} /> }} />
      <Tabs.Screen name="spray" options={{ title: "Spray", tabBarIcon: ({ color, size }) => <Icon name="sprinkler-variant" size={size} color={color} /> }} />
      <Tabs.Screen name="records" options={{ title: "Records", tabBarIcon: ({ color, size }) => <Icon name="clipboard-text-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="machinery" options={{ title: "Machinery", tabBarIcon: ({ color, size }) => <Icon name="tractor-variant" size={size} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color, size }) => <Icon name="dots-horizontal" size={size} color={color} /> }} />
    </Tabs>
  );
}
