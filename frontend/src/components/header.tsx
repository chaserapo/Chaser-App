import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { colors, radius, spacing } from "../theme";

export function ScreenHeader({ title, back, right }: { title: string; back?: boolean; right?: React.ReactNode }) {
  const router = useRouter();
  return (
    <View style={styles.header} testID="screen-header">
      {back ? (
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="header-back-btn">
          <Icon name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
      ) : (
        <View style={styles.iconBtn} />
      )}
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <View style={styles.iconBtn}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
  },
  title: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "700", color: colors.onSurface },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
});
