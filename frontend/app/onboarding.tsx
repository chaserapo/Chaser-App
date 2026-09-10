// Chaser onboarding wizard.
//
// One route, step-managed via React state. Each step is skippable and every
// creation (farm/paddock/machinery/chemical/team) writes through the existing
// repos so nothing here is a duplicate data-model.
//
// The wizard is opened automatically for brand-new users (see AuthGate in
// app/_layout.tsx) and can be resumed from More → "Setup Chaser".

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable, KeyboardAvoidingView, Platform, TextInput, ActivityIndicator, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { v4 as uuid } from "uuid";

import { Button, Input, Chip } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/lib/auth-context";
import { repo } from "@/src/lib/storage";
import {
  ONBOARDING_STEPS, OnboardingStep, OnboardingRole, profileRepo, useOnboarding,
} from "@/src/lib/onboarding";
import { invitationsRepo } from "@/src/lib/members";
import type { Farm, Paddock, Machinery, Chemical, Operator, MachineType } from "@/src/lib/types";
import { MACHINE_TYPES, CHEMICAL_CATEGORIES } from "@/src/lib/types";

const LOGO = require("../assets/images/chaser-icon.png");

type StepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const STEP_TITLES: Record<OnboardingStep, string> = {
  role:      "Your role",
  team:      "Your team",
  farms:     "Your farms",
  paddocks:  "Your paddocks",
  machinery: "Machinery & Equipment",
  chemicals: "Chemical Store",
  finish:    "You're all set",
};

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, business } = useAuth();
  const { profile, reload, percent } = useOnboarding();
  const [stepIdx, setStepIdx] = useState<StepIndex>(0);
  const userId = session?.user?.id ?? null;

  const step: OnboardingStep = ONBOARDING_STEPS[stepIdx];

  const goTo = useCallback((n: StepIndex) => setStepIdx(n), []);
  const next = useCallback(() => setStepIdx((s) => Math.min(6, (s + 1) as StepIndex)), []);
  const back = useCallback(() => setStepIdx((s) => Math.max(0, (s - 1) as StepIndex)), []);

  async function markCurrent(kind: "done" | "skipped") {
    if (!userId || step === "finish") return;
    await profileRepo.markStep(userId, step, { [kind]: true });
    await reload();
  }

  async function finish() {
    if (!userId) return;
    await profileRepo.complete(userId);
    await reload();
    router.replace("/(tabs)");
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary, paddingTop: insets.top }}>
      <View style={styles.topBar}>
        <Image source={LOGO} style={styles.logoSmall} resizeMode="contain" />
        <View style={{ flex: 1 }}>
          <Text style={styles.brandName}>Chaser setup</Text>
          <Text style={styles.brandSub}>{business?.name ?? ""}</Text>
        </View>
        <Pressable
          onPress={finish}
          testID="onboarding-skip-all"
          hitSlop={8}
          style={styles.skipAllBtn}
        >
          <Text style={styles.skipAllText}>Skip for now</Text>
        </Pressable>
      </View>

      <View style={styles.progressWrap}>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${percent}%` }]} />
        </View>
        <Text style={styles.progressText}>Step {stepIdx + 1} of {ONBOARDING_STEPS.length} · {STEP_TITLES[step]}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
          keyboardShouldPersistTaps="handled"
        >
          {step === "role" && (
            <RoleStep userId={userId} initial={profile?.role ?? null} onDone={async () => { await markCurrent("done"); next(); }} />
          )}
          {step === "team" && (
            <TeamStep onDone={async () => { await markCurrent("done"); next(); }} onSkip={async () => { await markCurrent("skipped"); next(); }} />
          )}
          {step === "farms" && (
            <FarmsStep onDone={async () => { await markCurrent("done"); next(); }} onSkip={async () => { await markCurrent("skipped"); next(); }} />
          )}
          {step === "paddocks" && (
            <PaddocksStep onDone={async () => { await markCurrent("done"); next(); }} onSkip={async () => { await markCurrent("skipped"); next(); }} />
          )}
          {step === "machinery" && (
            <MachineryStep onDone={async () => { await markCurrent("done"); next(); }} onSkip={async () => { await markCurrent("skipped"); next(); }} />
          )}
          {step === "chemicals" && (
            <ChemicalsStep onDone={async () => { await markCurrent("done"); next(); }} onSkip={async () => { await markCurrent("skipped"); next(); }} />
          )}
          {step === "finish" && (
            <FinishStep onFinish={finish} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {step !== "finish" && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Pressable onPress={back} disabled={stepIdx === 0} hitSlop={8} testID="onboarding-back">
            <Text style={[styles.backLink, stepIdx === 0 && { opacity: 0.35 }]}>‹ Back</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => goTo(6)} hitSlop={8} testID="onboarding-jump-finish">
            <Text style={styles.jumpLink}>Review summary ›</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/* ─────────────── STEP 1: ROLE ─────────────── */

function RoleStep({ userId, initial, onDone }: { userId: string | null; initial: OnboardingRole | null; onDone: () => Promise<void>; }) {
  const [role, setRole] = useState<OnboardingRole | null>(initial);
  const [busy, setBusy] = useState(false);
  const opts: { id: OnboardingRole; label: string; icon: string }[] = [
    { id: "owner",      label: "Farm Owner",   icon: "account-hard-hat" },
    { id: "manager",    label: "Farm Manager", icon: "account-tie" },
    { id: "contractor", label: "Contractor",   icon: "truck" },
    { id: "other",      label: "Other",        icon: "account-question-outline" },
  ];
  async function save() {
    if (!userId || !role) return;
    setBusy(true);
    try { await profileRepo.setRole(userId, role); await onDone(); }
    finally { setBusy(false); }
  }
  return (
    <View>
      <Text style={styles.stepTitle}>What best describes your role?</Text>
      <Text style={styles.stepBody}>This helps Chaser tailor the app to how you work. You can change it later in Settings.</Text>
      {opts.map((o) => (
        <Pressable
          key={o.id}
          onPress={() => setRole(o.id)}
          testID={`role-${o.id}`}
          style={[styles.optionRow, role === o.id && styles.optionRowActive]}
        >
          <Icon name={o.icon as any} size={22} color={role === o.id ? colors.onBrandPrimary : colors.brandPrimary} />
          <Text style={[styles.optionText, role === o.id && { color: colors.onBrandPrimary }]}>{o.label}</Text>
          {role === o.id ? <Icon name="check-circle" size={22} color={colors.onBrandPrimary} /> : null}
        </Pressable>
      ))}
      <View style={{ height: spacing.lg }} />
      <Button title="Continue" onPress={save} disabled={!role || busy} loading={busy} testID="role-continue-btn" />
    </View>
  );
}

/* ─────────────── STEP 2: TEAM ─────────────── */

function TeamStep({ onDone, onSkip }: { onDone: () => Promise<void>; onSkip: () => Promise<void>; }) {
  const [hasTeam, setHasTeam] = useState<null | boolean>(null);
  const [teamSize, setTeamSize] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [members, setMembers] = useState<{ first: string; last: string; email: string; phone: string; role: string }[]>([]);
  const [draft, setDraft] = useState({ first: "", last: "", email: "", phone: "", role: "operator" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addMember() {
    setError(null);
    const first = draft.first.trim();
    const last = draft.last.trim();
    const email = draft.email.trim().toLowerCase();
    const phone = draft.phone.trim();
    if (!first && !last && !email && !phone) return;
    // Save an operator row on this business so the person shows up in job assignment.
    try {
      setBusy(true);
      const business = await repo.getBusiness();
      if (!business) throw new Error("No active business");
      const displayName = [first, last].filter(Boolean).join(" ").trim() || email || "Team member";
      const op: Operator = {
        id: uuid(),
        business_id: business.id,
        name: displayName,
        first_name: first || undefined,
        last_name: last || undefined,
        email: email || undefined,
        phone: phone || undefined,
        role: draft.role || undefined,
        created_at: new Date().toISOString(),
      };
      await repo.operators.save(op);
      // If an email was provided, also fire off a Supabase invite so they can log in.
      if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        try {
          await invitationsRepo.invite(email, draft.role === "manager" ? "manager" : "operator");
          setNotice(`Added ${displayName} and sent an invite to ${email}.`);
        } catch (e: any) {
          console.warn("invite failed", e);
          setNotice(`Added ${displayName}. Couldn't send the invite email — you can retry from the Team page.`);
        }
      } else {
        setNotice(`Added ${displayName} to your team roster.`);
      }
      setMembers((m) => [...m, { first, last, email, phone, role: draft.role }]);
      setDraft({ first: "", last: "", email: "", phone: "", role: "operator" });
      setShowAdd(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to add team member");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Text style={styles.stepTitle}>Do you manage a team?</Text>
      <Text style={styles.stepBody}>Add teammates so you can assign jobs and keep everyone on the same page.</Text>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
        <Pressable onPress={() => setHasTeam(false)} testID="team-no" style={[styles.chipBig, hasTeam === false && styles.chipBigActive]}>
          <Icon name="account-outline" size={20} color={hasTeam === false ? colors.onBrandPrimary : colors.brandPrimary} />
          <Text style={[styles.chipBigText, hasTeam === false && { color: colors.onBrandPrimary }]}>No, just me</Text>
        </Pressable>
        <Pressable onPress={() => setHasTeam(true)} testID="team-yes" style={[styles.chipBig, hasTeam === true && styles.chipBigActive]}>
          <Icon name="account-group" size={20} color={hasTeam === true ? colors.onBrandPrimary : colors.brandPrimary} />
          <Text style={[styles.chipBigText, hasTeam === true && { color: colors.onBrandPrimary }]}>Yes, I have a team</Text>
        </Pressable>
      </View>

      {hasTeam === true && (
        <>
          <View style={{ height: spacing.lg }} />
          <Input label="Roughly how many people are in your team?" value={teamSize} onChangeText={setTeamSize} keyboardType="number-pad" testID="team-size" />

          {members.length > 0 && (
            <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
              {members.map((m, i) => (
                <View key={i} style={styles.memberRow}>
                  <Icon name="account-circle" size={22} color={colors.brandPrimary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{[m.first, m.last].filter(Boolean).join(" ") || m.email || "Team member"}</Text>
                    <Text style={styles.memberSub}>{m.email || m.phone || "—"} · {m.role}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {error ? <Text style={styles.errorNotice}>{error}</Text> : null}

          {showAdd ? (
            <View style={styles.formCard}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}><Input label="First name" value={draft.first} onChangeText={(v) => setDraft({ ...draft, first: v })} testID="member-first" /></View>
                <View style={{ flex: 1 }}><Input label="Last name" value={draft.last} onChangeText={(v) => setDraft({ ...draft, last: v })} testID="member-last" /></View>
              </View>
              <Input label="Email (invite will be sent if provided)" value={draft.email} onChangeText={(v) => setDraft({ ...draft, email: v })} keyboardType="email-address" autoCapitalize="none" testID="member-email" />
              <Input label="Phone (optional)" value={draft.phone} onChangeText={(v) => setDraft({ ...draft, phone: v })} keyboardType="phone-pad" testID="member-phone" />
              <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                <Chip label="Operator" active={draft.role === "operator"} onPress={() => setDraft({ ...draft, role: "operator" })} testID="member-role-operator" />
                <Chip label="Manager"  active={draft.role === "manager"}  onPress={() => setDraft({ ...draft, role: "manager" })} testID="member-role-manager" />
                <Chip label="Contractor" active={draft.role === "contractor"} onPress={() => setDraft({ ...draft, role: "contractor" })} testID="member-role-contractor" />
              </View>
              <View style={{ height: spacing.sm }} />
              <Button title="Add this person" icon="account-plus" onPress={addMember} loading={busy} testID="member-save-btn" />
              <View style={{ height: 4 }} />
              <Button title="Cancel" variant="outline" onPress={() => setShowAdd(false)} testID="member-cancel-btn" />
            </View>
          ) : (
            <Button title="Add a person" icon="account-plus-outline" variant="secondary" onPress={() => setShowAdd(true)} testID="add-team-member-btn" />
          )}
        </>
      )}

      <View style={{ height: spacing.lg }} />
      <Button title="Continue" onPress={onDone} testID="team-continue-btn" />
      <View style={{ height: 6 }} />
      <Button title="I'll do this later" variant="outline" onPress={onSkip} testID="team-skip-btn" />
    </View>
  );
}

/* ─────────────── STEP 3: FARMS ─────────────── */

function FarmsStep({ onDone, onSkip }: { onDone: () => Promise<void>; onSkip: () => Promise<void>; }) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ name: "", region: "", address: "", notes: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => { repo.farms.active().then(setFarms).catch(() => {}); }, []);

  async function saveFarm() {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      const business = await repo.getBusiness();
      if (!business) throw new Error("No active business");
      const f: Farm = {
        id: uuid(),
        business_id: business.id,
        name: draft.name.trim(),
        region: draft.region.trim() || undefined,
        address: draft.address.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        created_at: new Date().toISOString(),
      };
      await repo.farms.save(f);
      setFarms((xs) => [...xs, f]);
      setDraft({ name: "", region: "", address: "", notes: "" });
      setShowForm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Text style={styles.stepTitle}>Add your farms</Text>
      <Text style={styles.stepBody}>Add one farm to get started. You can add the rest anytime.</Text>

      {farms.length > 0 && (
        <View style={{ gap: 6, marginTop: spacing.sm }}>
          {farms.map((f) => (
            <View key={f.id} style={styles.memberRow}>
              <Icon name="barn" size={22} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{f.name}</Text>
                {f.region ? <Text style={styles.memberSub}>{f.region}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      )}

      {showForm ? (
        <View style={styles.formCard}>
          <Input label="Farm name" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="Home Block" testID="farm-name" />
          <Input label="Region / district (optional)" value={draft.region} onChangeText={(v) => setDraft({ ...draft, region: v })} placeholder="Wimmera, VIC" testID="farm-region" />
          <Input label="Address (optional)" value={draft.address} onChangeText={(v) => setDraft({ ...draft, address: v })} testID="farm-address" />
          <View style={{ height: spacing.sm }} />
          <Button title="Save farm" icon="content-save" onPress={saveFarm} loading={busy} disabled={!draft.name.trim()} testID="farm-save-btn" />
          <View style={{ height: 4 }} />
          <Button title="Cancel" variant="outline" onPress={() => setShowForm(false)} testID="farm-cancel-btn" />
        </View>
      ) : (
        <Button title={farms.length === 0 ? "Add farm" : "Add another farm"} icon="plus-circle-outline" variant="secondary" onPress={() => setShowForm(true)} testID="add-farm-btn" />
      )}

      <View style={{ height: spacing.lg }} />
      <Button title="Continue" onPress={onDone} testID="farms-continue-btn" />
      <View style={{ height: 6 }} />
      <Button title="I'll do this later" variant="outline" onPress={onSkip} testID="farms-skip-btn" />
    </View>
  );
}

/* ─────────────── STEP 4: PADDOCKS ─────────────── */

function PaddocksStep({ onDone, onSkip }: { onDone: () => Promise<void>; onSkip: () => Promise<void>; }) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ farm_id: "", name: "", area: "", crop: "", variety: "" });
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    Promise.all([repo.farms.active(), repo.paddocks.active()]).then(([fs, ps]) => {
      setFarms(fs); setPaddocks(ps);
      if (fs.length > 0 && !draft.farm_id) setDraft((d) => ({ ...d, farm_id: fs[0].id }));
    }).catch(() => {});
  }, []);

  async function savePaddock() {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      const business = await repo.getBusiness();
      if (!business) throw new Error("No active business");
      const p: Paddock = {
        id: uuid(),
        business_id: business.id,
        farm_id: draft.farm_id || null,
        name: draft.name.trim(),
        area_ha: parseFloat(draft.area) || undefined,
        crop: draft.crop.trim() || undefined,
        variety: draft.variety.trim() || undefined,
        created_at: new Date().toISOString(),
      };
      await repo.paddocks.save(p);
      setPaddocks((xs) => [...xs, p]);
      setDraft({ ...draft, name: "", area: "", crop: "", variety: "" });
      setShowForm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Text style={styles.stepTitle}>Add a couple of paddocks</Text>
      <Text style={styles.stepBody}>Adding one or two paddocks now makes Chaser much more useful straight away — you can add the rest later, and draw boundaries on the Paddocks map anytime.</Text>

      {farms.length === 0 ? (
        <Text style={styles.errorNotice}>You'll need at least one farm first — go back a step to add one.</Text>
      ) : null}

      {paddocks.length > 0 && (
        <View style={{ gap: 6, marginTop: spacing.sm }}>
          {paddocks.map((p) => {
            const f = farms.find((x) => x.id === p.farm_id);
            return (
              <View key={p.id} style={styles.memberRow}>
                <Icon name="map-marker-outline" size={22} color={colors.brandPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{p.name}</Text>
                  <Text style={styles.memberSub}>
                    {p.area_ha ? `${p.area_ha} ha` : "no area"}{p.crop ? ` · ${p.crop}` : ""}{f ? ` · ${f.name}` : ""}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {showForm ? (
        <View style={styles.formCard}>
          {farms.length > 0 && (
            <>
              <Text style={styles.formLabel}>Farm</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 6 }}>
                {farms.map((f) => (
                  <Chip key={f.id} label={f.name} active={draft.farm_id === f.id} onPress={() => setDraft({ ...draft, farm_id: f.id })} testID={`paddock-farm-${f.id}`} />
                ))}
              </ScrollView>
            </>
          )}
          <Input label="Paddock name" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="North 40" testID="paddock-name" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Input label="Area" value={draft.area} onChangeText={(v) => setDraft({ ...draft, area: v })} keyboardType="decimal-pad" suffix="ha" testID="paddock-area" /></View>
            <View style={{ flex: 1 }}><Input label="Crop (optional)" value={draft.crop} onChangeText={(v) => setDraft({ ...draft, crop: v })} testID="paddock-crop" /></View>
          </View>
          <Input label="Variety (optional)" value={draft.variety} onChangeText={(v) => setDraft({ ...draft, variety: v })} testID="paddock-variety" />
          <View style={{ height: spacing.sm }} />
          <Button title="Save paddock" icon="content-save" onPress={savePaddock} loading={busy} disabled={!draft.name.trim() || !draft.farm_id} testID="paddock-save-btn" />
          <View style={{ height: 4 }} />
          <Button title="Cancel" variant="outline" onPress={() => setShowForm(false)} testID="paddock-cancel-btn" />
        </View>
      ) : (
        <Button title={paddocks.length === 0 ? "Add paddock" : "Add another paddock"} icon="plus-circle-outline" variant="secondary" onPress={() => setShowForm(true)} disabled={farms.length === 0} testID="add-paddock-btn" />
      )}

      <View style={{ height: 4 }} />
      <Text style={styles.helperNote}>Want to draw the boundary now? You can from the Paddocks tab after setup, or edit any paddock later.</Text>

      <View style={{ height: spacing.lg }} />
      <Button title="Continue" onPress={onDone} testID="paddocks-continue-btn" />
      <View style={{ height: 6 }} />
      <Button title="I'll do this later" variant="outline" onPress={onSkip} testID="paddocks-skip-btn" />
    </View>
  );
}

/* ─────────────── STEP 5: MACHINERY ─────────────── */

function MachineryStep({ onDone, onSkip }: { onDone: () => Promise<void>; onSkip: () => Promise<void>; }) {
  const [items, setItems] = useState<Machinery[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<{ name: string; type: MachineType | ""; hours: string; make: string; model: string }>({ name: "", type: "", hours: "", make: "", model: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => { repo.machinery.list().then(setItems).catch(() => {}); }, []);

  async function saveMachine() {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      const business = await repo.getBusiness();
      if (!business) throw new Error("No active business");
      const m: Machinery = {
        id: uuid(),
        business_id: business.id,
        name: draft.name.trim(),
        machine_type: (draft.type || undefined) as MachineType | undefined,
        make: draft.make.trim() || undefined,
        model: draft.model.trim() || undefined,
        current_hours: parseFloat(draft.hours) || undefined,
        created_at: new Date().toISOString(),
      };
      await repo.machinery.save(m);
      setItems((xs) => [...xs, m]);
      setDraft({ name: "", type: "", hours: "", make: "", model: "" });
      setShowForm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Text style={styles.stepTitle}>Add your machinery</Text>
      <Text style={styles.stepBody}>Add the equipment you use regularly so you can track jobs, servicing and records.</Text>

      {items.length > 0 && (
        <View style={{ gap: 6, marginTop: spacing.sm }}>
          {items.map((m) => (
            <View key={m.id} style={styles.memberRow}>
              <Icon name="tractor-variant" size={22} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{m.name}</Text>
                <Text style={styles.memberSub}>
                  {m.machine_type ?? "Machine"}{m.make ? ` · ${m.make}` : ""}{m.model ? ` ${m.model}` : ""}{m.current_hours != null ? ` · ${m.current_hours}h` : ""}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {showForm ? (
        <View style={styles.formCard}>
          <Input label="Name / nickname" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="Big Green" testID="mach-name" />
          <Text style={styles.formLabel}>Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 6 }}>
            {MACHINE_TYPES.map((t) => (
              <Chip key={t} label={t} active={draft.type === t} onPress={() => setDraft({ ...draft, type: t })} testID={`mach-type-${t}`} />
            ))}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Input label="Make" value={draft.make} onChangeText={(v) => setDraft({ ...draft, make: v })} testID="mach-make" /></View>
            <View style={{ flex: 1 }}><Input label="Model" value={draft.model} onChangeText={(v) => setDraft({ ...draft, model: v })} testID="mach-model" /></View>
          </View>
          <Input label="Current hours (optional)" value={draft.hours} onChangeText={(v) => setDraft({ ...draft, hours: v })} keyboardType="decimal-pad" suffix="h" testID="mach-hours" />
          <View style={{ height: spacing.sm }} />
          <Button title="Save machine" icon="content-save" onPress={saveMachine} loading={busy} disabled={!draft.name.trim()} testID="mach-save-btn" />
          <View style={{ height: 4 }} />
          <Button title="Cancel" variant="outline" onPress={() => setShowForm(false)} testID="mach-cancel-btn" />
        </View>
      ) : (
        <Button title={items.length === 0 ? "Add machinery" : "Add another machine"} icon="plus-circle-outline" variant="secondary" onPress={() => setShowForm(true)} testID="add-machine-btn" />
      )}

      <View style={{ height: spacing.lg }} />
      <Button title="Continue" onPress={onDone} testID="mach-continue-btn" />
      <View style={{ height: 6 }} />
      <Button title="I'll do this later" variant="outline" onPress={onSkip} testID="mach-skip-btn" />
    </View>
  );
}

/* ─────────────── STEP 6: CHEMICALS ─────────────── */

function ChemicalsStep({ onDone, onSkip }: { onDone: () => Promise<void>; onSkip: () => Promise<void>; }) {
  const [items, setItems] = useState<Chemical[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<{ name: string; category: string; ai: string; apvma: string }>({ name: "", category: "Herbicide", ai: "", apvma: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => { repo.chemicals.active().then(setItems).catch(() => {}); }, []);

  async function saveChem() {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      const business = await repo.getBusiness();
      if (!business) throw new Error("No active business");
      const c: Chemical = {
        id: uuid(),
        business_id: business.id,
        product_name: draft.name.trim(),
        product_type: (draft.category as any) || undefined,
        active_ingredient: draft.ai.trim() || undefined,
        apvma_number: draft.apvma.trim() || undefined,
        created_at: new Date().toISOString(),
      };
      await repo.chemicals.save(c);
      setItems((xs) => [...xs, c]);
      setDraft({ name: "", category: "Herbicide", ai: "", apvma: "" });
      setShowForm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Text style={styles.stepTitle}>Add chemicals you use often</Text>
      <Text style={styles.stepBody}>Add a few common products now to make spray jobs faster to create. No quantities required at this stage.</Text>

      {items.length > 0 && (
        <View style={{ gap: 6, marginTop: spacing.sm }}>
          {items.map((c) => (
            <View key={c.id} style={styles.memberRow}>
              <Icon name="flask-outline" size={22} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{c.product_name}</Text>
                <Text style={styles.memberSub}>{c.product_type ?? "Chemical"}{c.active_ingredient ? ` · ${c.active_ingredient}` : ""}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {showForm ? (
        <View style={styles.formCard}>
          <Input label="Product name" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="Roundup Ultra" testID="chem-name" />
          <Text style={styles.formLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 6 }}>
            {CHEMICAL_CATEGORIES.map((c) => (
              <Chip key={c} label={c} active={draft.category === c} onPress={() => setDraft({ ...draft, category: c })} testID={`chem-cat-${c}`} />
            ))}
          </ScrollView>
          <Input label="Active ingredient (optional)" value={draft.ai} onChangeText={(v) => setDraft({ ...draft, ai: v })} placeholder="Glyphosate 570 g/L" testID="chem-ai" />
          <Input label="APVMA number (optional)" value={draft.apvma} onChangeText={(v) => setDraft({ ...draft, apvma: v })} testID="chem-apvma" />
          <View style={{ height: spacing.sm }} />
          <Button title="Save chemical" icon="content-save" onPress={saveChem} loading={busy} disabled={!draft.name.trim()} testID="chem-save-btn" />
          <View style={{ height: 4 }} />
          <Button title="Cancel" variant="outline" onPress={() => setShowForm(false)} testID="chem-cancel-btn" />
        </View>
      ) : (
        <Button title={items.length === 0 ? "Add chemical" : "Add another chemical"} icon="plus-circle-outline" variant="secondary" onPress={() => setShowForm(true)} testID="add-chem-btn" />
      )}

      <View style={{ height: spacing.lg }} />
      <Button title="Continue" onPress={onDone} testID="chems-continue-btn" />
      <View style={{ height: 6 }} />
      <Button title="I'll do this later" variant="outline" onPress={onSkip} testID="chems-skip-btn" />
    </View>
  );
}

/* ─────────────── STEP 7: FINISH ─────────────── */

function FinishStep({ onFinish }: { onFinish: () => Promise<void>; }) {
  const [profile, setProfile] = useState<any>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [machs, setMachs] = useState<Machinery[]>([]);
  const [chems, setChems] = useState<Chemical[]>([]);
  const [ops, setOps] = useState<Operator[]>([]);
  const { userId } = useOnboarding();

  useEffect(() => {
    (async () => {
      const [f, p, m, c, o] = await Promise.all([
        repo.farms.active(), repo.paddocks.active(), repo.machinery.list(), repo.chemicals.active(), repo.operators.active(),
      ]);
      setFarms(f); setPaddocks(p); setMachs(m); setChems(c); setOps(o);
      if (userId) setProfile(await profileRepo.get(userId));
    })().catch(() => {});
  }, [userId]);

  const roleLabel = useMemo(() => {
    switch (profile?.role) {
      case "owner": return "Farm Owner";
      case "manager": return "Farm Manager";
      case "contractor": return "Contractor";
      case "other": return "Other";
      default: return "Not set";
    }
  }, [profile]);

  return (
    <View>
      <View style={styles.finishHero}>
        <View style={styles.finishBadge}><Icon name="check-decagram" size={40} color={colors.brandPrimary} /></View>
        <Text style={styles.finishTitle}>You're ready to start chasing.</Text>
        <Text style={styles.finishBody}>Here's what you set up. You can always add more from the Farms, Paddocks, Machinery and Chemicals tabs.</Text>
      </View>

      <View style={styles.summary}>
        <SummaryRow icon="account-tie" label="Role" value={roleLabel} />
        <SummaryRow icon="account-group" label="Team members" value={ops.filter((o) => !o.is_default_user).length.toString()} />
        <SummaryRow icon="barn" label="Farms" value={farms.length.toString()} />
        <SummaryRow icon="map-marker-outline" label="Paddocks" value={paddocks.length.toString()} />
        <SummaryRow icon="tractor-variant" label="Machinery" value={machs.length.toString()} />
        <SummaryRow icon="flask-outline" label="Chemicals" value={chems.length.toString()} />
      </View>

      <View style={{ height: spacing.lg }} />
      <Button title="Go to Chaser" icon="arrow-right" onPress={onFinish} testID="finish-onboarding-btn" size="lg" />
    </View>
  );
}

function SummaryRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Icon name={icon as any} size={20} color={colors.brandPrimary} />
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

/* ─────────────── STYLES ─────────────── */

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  logoSmall: { width: 32, height: 32, borderRadius: 8 },
  brandName: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  brandSub: { color: colors.muted, fontSize: 11, marginTop: 1 },
  skipAllBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  skipAllText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700" },

  progressWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  progressBg: { height: 6, backgroundColor: colors.surface, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: colors.brandPrimary, borderRadius: 999 },
  progressText: { color: colors.muted, fontSize: 11, marginTop: 6, fontWeight: "600" },

  stepTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "800", letterSpacing: -0.3, marginTop: spacing.md, marginBottom: 6 },
  stepBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },

  optionRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 14, paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 8,
  },
  optionRowActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  optionText: { flex: 1, color: colors.onSurface, fontSize: 15, fontWeight: "700" },

  chipBig: {
    flex: 1,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.border,
  },
  chipBigActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipBigText: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },

  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 12 },
  memberName: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  memberSub: { fontSize: 12, color: colors.muted, marginTop: 2 },

  formCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.md, marginBottom: spacing.sm, gap: 4 },
  formLabel: { fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: "600" },
  helperNote: { fontSize: 11, color: colors.muted, marginTop: 6, fontStyle: "italic" },
  notice: { fontSize: 12, color: colors.brandPrimary, marginTop: 8, fontWeight: "600" },
  errorNotice: { fontSize: 12, color: colors.error, marginTop: 8, fontWeight: "700" },

  finishHero: { alignItems: "center", paddingTop: spacing.xl, gap: 8 },
  finishBadge: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  finishTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "800", textAlign: "center", letterSpacing: -0.3 },
  finishBody: { color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: spacing.md, paddingHorizontal: 12 },

  summary: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, marginTop: spacing.md },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  summaryLabel: { flex: 1, color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  summaryValue: { color: colors.brandPrimary, fontSize: 15, fontWeight: "800" },

  footer: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, backgroundColor: colors.surfaceSecondary },
  backLink: { color: colors.brandPrimary, fontSize: 14, fontWeight: "700" },
  jumpLink: { color: colors.muted, fontSize: 13, fontWeight: "600" },
});
