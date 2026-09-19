import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import Icon from "@react-native-vector-icons/material-design-icons";
import { colors, radius, spacing } from "@/src/theme";
import { searchApvmaProducts, type ApvmaProduct } from "@/src/lib/apvma";

// Optional assist for the "add a chemical" forms: search Australia's public
// APVMA product registry and tap a result to pre-fill the form, instead of
// typing everything by hand. Typing it yourself always stays the default -
// this is purely additive and fails quietly (empty results) if the registry
// is unreachable.
export function ApvmaSearch({ onSelect }: { onSelect: (p: ApvmaProduct) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApvmaProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [failed, setFailed] = useState(false);
  const [addedName, setAddedName] = useState<string | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (addedTimer.current) clearTimeout(addedTimer.current); }, []);

  async function runSearch() {
    const q = query.trim();
    if (q.length < 3) return;
    setSearching(true);
    setSearched(true);
    setFailed(false);
    try {
      const r = await searchApvmaProducts(q);
      setResults(r);
    } catch {
      setFailed(true);
    } finally {
      setSearching(false);
    }
  }

  function pick(p: ApvmaProduct) {
    onSelect(p);
    // Collapse the results and show a brief confirmation - tapping a result
    // otherwise gives no feedback that anything happened.
    setResults([]);
    setSearched(false);
    setQuery("");
    setAddedName(p.productName);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAddedName(null), 2500);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Search the APVMA registry (optional)</Text>
      <View style={styles.row}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={runSearch}
          placeholder="e.g. Roundup, Weedmaster"
          placeholderTextColor={colors.muted}
          style={styles.input}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          testID="apvma-search-input"
        />
        <Pressable
          onPress={runSearch}
          style={[styles.searchBtn, (searching || query.trim().length < 3) && styles.searchBtnDisabled]}
          disabled={searching || query.trim().length < 3}
          testID="apvma-search-btn"
        >
          {searching ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Icon name="magnify" size={20} color={colors.onBrandPrimary} />}
        </Pressable>
      </View>
      <Text style={styles.hint}>Or skip this and just type the product details below yourself.</Text>

      {addedName ? (
        <View style={styles.addedRow} testID="apvma-added-confirm">
          <Icon name="check-circle" size={16} color={colors.success} />
          <Text style={styles.addedText}>{addedName} added — check the fields below.</Text>
        </View>
      ) : null}
      {searched && !searching && failed ? (
        <Text style={styles.empty}>Couldn&apos;t reach the registry right now — no problem, type the details below.</Text>
      ) : null}
      {searched && !searching && !failed && results.length === 0 ? (
        <Text style={styles.empty}>No matches. Try a different spelling, or type the details below.</Text>
      ) : null}
      {results.map((p) => (
        <Pressable key={p.pcode} onPress={() => pick(p)} style={styles.resultRow} testID={`apvma-result-${p.pcode}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.resultName}>{p.productName}</Text>
            <Text style={styles.resultMeta}>{[p.holder, p.category].filter(Boolean).join(" · ")} · APVMA {p.pcode}</Text>
          </View>
          <Icon name="plus-circle-outline" size={20} color={colors.brandPrimary} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: "600" },
  row: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary, paddingHorizontal: 12, fontSize: 14, color: colors.onSurface,
  },
  searchBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  searchBtnDisabled: { opacity: 0.5 },
  hint: { fontSize: 11, color: colors.muted, fontStyle: "italic", marginTop: 6 },
  addedRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  addedText: { fontSize: 12, color: colors.success, fontWeight: "700" },
  empty: { fontSize: 12, color: colors.muted, marginTop: spacing.sm, fontStyle: "italic" },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 },
  resultName: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  resultMeta: { fontSize: 11, color: colors.muted, marginTop: 2, textTransform: "capitalize" },
});
