import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Button, Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/lib/auth-context";

export function MigrationScreen() {
  const insets = useSafeAreaInsets();
  const { migration, retryMigration, signOut, clearMigrationSuccess } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl + insets.bottom, justifyContent: "center" }}>
      {migration.kind === "running" ? (
        <>
          <View style={styles.centerBrand}>
            <View style={styles.iconCloud}><ActivityIndicator size="large" color={colors.brandPrimary} /></View>
            <Text style={styles.title}>Setting up your cloud workspace</Text>
            <Text style={styles.sub}>{migration.progress.step}</Text>
          </View>
          <Card>
            <Text style={styles.progressLabel}>
              {migration.progress.completedTables} of {migration.progress.totalTables || "—"} tables
            </Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: migration.progress.totalTables > 0 ? `${(migration.progress.completedTables / migration.progress.totalTables) * 100}%` : "0%" }]} />
            </View>
            <Text style={styles.uploadCount}>{migration.progress.uploaded} records uploaded</Text>
            <Text style={styles.disclaimer}>Your local data stays on this device until we&apos;re finished — nothing is being deleted.</Text>
          </Card>
        </>
      ) : migration.kind === "error" ? (
        <>
          <View style={styles.centerBrand}>
            <View style={[styles.iconCloud, { backgroundColor: "#FEE2E2" }]}><Icon name="cloud-alert" size={36} color={colors.error} /></View>
            <Text style={styles.title}>Migration didn&apos;t finish</Text>
            <Text style={styles.sub}>Your local data is safe. You can retry now or sign out and try again later.</Text>
          </View>
          <Card>
            <Text style={styles.errorText}>{migration.message}</Text>
          </Card>
          <View style={{ height: spacing.md }} />
          <Button title="Retry migration" icon="cloud-sync" onPress={retryMigration} testID="retry-migration-btn" />
          <View style={{ height: spacing.sm }} />
          <Button title="Sign out" variant="outline" onPress={signOut} testID="signout-from-error-btn" />
        </>
      ) : migration.kind === "success" ? (
        <>
          <View style={styles.centerBrand}>
            <View style={[styles.iconCloud, { backgroundColor: colors.brandSecondary }]}><Icon name="cloud-check" size={36} color={colors.brandPrimary} /></View>
            <Text style={styles.title}>Cloud sync active</Text>
            <Text style={styles.sub}>
              {migration.rowsMigrated} record{migration.rowsMigrated === 1 ? "" : "s"} across {migration.tablesMigrated} table{migration.tablesMigrated === 1 ? "" : "s"} uploaded safely.
            </Text>
          </View>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="shield-check-outline" size={18} color={colors.brandPrimary} />
              <Text style={styles.bullet}>Your existing local data has been kept as a backup.</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm }}>
              <Icon name="account-multiple-outline" size={18} color={colors.brandPrimary} />
              <Text style={styles.bullet}>Data is now protected by row-level security per farm business.</Text>
            </View>
          </Card>
          <View style={{ height: spacing.md }} />
          <Button title="Continue to HectareHQ" icon="arrow-right" onPress={clearMigrationSuccess} testID="continue-to-app-btn" />
        </>
      ) : (
        <View style={styles.centerBrand}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centerBrand: { alignItems: "center", marginBottom: spacing.xl },
  iconCloud: { width: 72, height: 72, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md, textAlign: "center" },
  sub: { color: colors.muted, marginTop: 6, textAlign: "center", fontSize: 14, lineHeight: 20 },
  progressLabel: { fontSize: 13, color: colors.onSurfaceTertiary, fontWeight: "600", marginBottom: 8 },
  barTrack: { height: 10, borderRadius: 999, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  barFill: { height: 10, backgroundColor: colors.brandPrimary },
  uploadCount: { marginTop: spacing.sm, fontSize: 12, color: colors.muted, fontWeight: "600" },
  disclaimer: { marginTop: spacing.md, fontSize: 12, color: colors.muted, lineHeight: 17, fontStyle: "italic" },
  errorText: { color: colors.error, fontWeight: "600" },
  bullet: { flex: 1, color: colors.onSurface, fontSize: 13, lineHeight: 18 },
});
