// Chaser onboarding wizard.
// New users can set up the essential parts of their operation without having
// to repeat the same information later in the app.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable, KeyboardAvoidingView, Platform, Image,
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
import { geocodeAddress } from "@/src/lib/geocoding";
import { supabase } from "@/src/lib/supabase";
import type { Farm, Paddock, Machinery, Chemical, Operator, MachineType } from "@/src/lib/types";
import { MACHINE_TYPES, CHEMICAL_CATEGORIES } from "@/src/lib/types";
import { ApvmaSearch } from "@/src/features/chemicals/ApvmaSearch";
import { mapApvmaCategory, type ApvmaProduct } from "@/src/lib/apvma";

const LOGO = require("../assets/images/chaser-icon.png");

type StepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const STEP_TITLES: Record<OnboardingStep, string> = {
  role: "Your role",
  team: "Your team",
  farms: "Your farms",
  paddocks: "Your paddocks",
  machinery: "Machinery & Equipment",
  chemicals: "Chemical Store",
  finish: "You're all set",
};

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, business } = useAuth();
  const { profile, reload, percent } = useOnboarding();
  const [stepIdx, setStepIdx] = useState<StepIndex>(0);
  const userId = session?.user?.id ?? null;
  const step: OnboardingStep = ONBOARDING_STEPS[stepIdx];

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
        <Pressable onPress={finish} testID="onboarding-skip-all" hitSlop={8} style={styles.skipAllBtn}>
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
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          {step === "role" && <RoleStep userId={userId} initial={profile?.role ?? null} onDone={async () => { await markCurrent("done"); next(); }} />}
          {step === "team" && <TeamStep onDone={async () => { await markCurrent("done"); next(); }} onSkip={async () => { await markCurrent("skipped"); next(); }} />}
          {step === "farms" && <FarmsStep onDone={async () => { await markCurrent("done"); next(); }} onSkip={async () => { await markCurrent("skipped"); next(); }} />}
          {step === "paddocks" && <PaddocksStep onDone={async () => { await markCurrent("done"); next(); }} onSkip={async () => { await markCurrent("skipped"); next(); }} />}
          {step === "machinery" && <MachineryStep onDone={async () => { await markCurrent("done"); next(); }} onSkip={async () => { await markCurrent("skipped"); next(); }} />}
          {step === "chemicals" && <ChemicalsStep onDone={async () => { await markCurrent("done"); next(); }} onSkip={async () => { await markCurrent("skipped"); next(); }} />}
          {step === "finish" && <FinishStep onFinish={finish} />}
        </ScrollView>
      </KeyboardAvoidingView>

      {step !== "finish" && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Pressable onPress={back} disabled={stepIdx === 0} hitSlop={8} testID="onboarding-back">
            <Text style={[styles.backLink, stepIdx === 0 && { opacity: 0.35 }]}>‹ Back</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => setStepIdx(6)} hitSlop={8} testID="onboarding-jump-finish">
            <Text style={styles.jumpLink}>Review summary ›</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function RoleStep({ userId, initial, onDone }: { userId: string | null; initial: OnboardingRole | null; onDone: () => Promise<void> }) {
  const [role, setRole] = useState<OnboardingRole | null>(initial);
  const [busy, setBusy] = useState(false);
  const opts: { id: OnboardingRole; label: string; icon: string }[] = [
    { id: "owner", label: "Farm Owner", icon: "account-hard-hat" },
    { id: "manager", label: "Farm Manager", icon: "account-tie" },
    { id: "contractor", label: "Contractor", icon: "truck" },
    { id: "other", label: "Other", icon: "account-question-outline" },
  ];
  async function save() {
    if (!userId || !role) return;
    setBusy(true);
    try { await profileRepo.setRole(userId, role); await onDone(); } finally { setBusy(false); }
  }
  return (
    <View>
      <Text style={styles.stepTitle}>What best describes your role?</Text>
      <Text style={styles.stepBody}>This helps Chaser tailor the app to how you work. You can change it later.</Text>
      {opts.map((o) => (
        <Pressable key={o.id} onPress={() => setRole(o.id)} style={[styles.optionRow, role === o.id && styles.optionRowActive]} testID={`role-${o.id}`}>
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

function TeamStep({ onDone, onSkip }: { onDone: () => Promise<void>; onSkip: () => Promise<void> }) {
  const [hasTeam, setHasTeam] = useState<boolean | null>(null);
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
    setBusy(true);
    try {
      const business = await repo.getBusiness();
      if (!business) throw new Error("No active business");
      const displayName = [first, last].filter(Boolean).join(" ").trim() || email || "Team member";
      const op: Operator = { id: uuid(), business_id: business.id, name: displayName, first_name: first || undefined, last_name: last || undefined, email: email || undefined, phone: phone || undefined, role: draft.role, created_at: new Date().toISOString() };
      await repo.operators.save(op);
      if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        try { await invitationsRepo.invite(email, draft.role === "manager" ? "manager" : "operator"); setNotice(`Added ${displayName} and sent an invite.`); }
        catch { setNotice(`Added ${displayName}. The invite can be retried from Team.`); }
      } else setNotice(`Added ${displayName} to your team.`);
      setMembers((m) => [...m, { first, last, email, phone, role: draft.role }]);
      setDraft({ first: "", last: "", email: "", phone: "", role: "operator" });
      setShowAdd(false);
    } catch (e: any) { setError(e?.message ?? "Failed to add team member"); }
    finally { setBusy(false); }
  }

  return (
    <View>
      <Text style={styles.stepTitle}>Do you manage a team?</Text>
      <Text style={styles.stepBody}>Add teammates so you can assign jobs and keep everyone on the same page.</Text>
      <View style={styles.twoChoices}>
        <Choice active={hasTeam === false} label="No, just me" icon="account-outline" onPress={() => setHasTeam(false)} />
        <Choice active={hasTeam === true} label="Yes, I have a team" icon="account-group" onPress={() => setHasTeam(true)} />
      </View>
      {hasTeam === true && <>
        <View style={{ height: spacing.md }} />
        <Input label="Roughly how many people?" value={teamSize} onChangeText={setTeamSize} keyboardType="number-pad" />
        {members.map((m, i) => <View key={i} style={styles.memberRow}><Icon name="account-circle" size={22} color={colors.brandPrimary} /><View style={{ flex: 1 }}><Text style={styles.memberName}>{[m.first, m.last].filter(Boolean).join(" ") || m.email}</Text><Text style={styles.memberSub}>{m.role}</Text></View></View>)}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {error ? <Text style={styles.errorNotice}>{error}</Text> : null}
        {showAdd ? <View style={styles.formCard}>
          <View style={styles.row}><View style={{ flex: 1 }}><Input label="First name" value={draft.first} onChangeText={(v) => setDraft({ ...draft, first: v })} /></View><View style={{ flex: 1 }}><Input label="Last name" value={draft.last} onChangeText={(v) => setDraft({ ...draft, last: v })} /></View></View>
          <Input label="Email (optional)" value={draft.email} onChangeText={(v) => setDraft({ ...draft, email: v })} keyboardType="email-address" autoCapitalize="none" />
          <Input label="Phone (optional)" value={draft.phone} onChangeText={(v) => setDraft({ ...draft, phone: v })} keyboardType="phone-pad" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}><Chip label="Operator" active={draft.role === "operator"} onPress={() => setDraft({ ...draft, role: "operator" })} /><Chip label="Manager" active={draft.role === "manager"} onPress={() => setDraft({ ...draft, role: "manager" })} /><Chip label="Contractor" active={draft.role === "contractor"} onPress={() => setDraft({ ...draft, role: "contractor" })} /></ScrollView>
          <Button title="Add this person" icon="account-plus" onPress={addMember} loading={busy} />
          <Button title="Cancel" variant="outline" onPress={() => setShowAdd(false)} />
        </View> : <Button title="Add a person" icon="account-plus-outline" variant="secondary" onPress={() => setShowAdd(true)} />}
      </>}
      <View style={{ height: spacing.lg }} /><Button title="Continue" onPress={onDone} /><View style={{ height: 6 }} /><Button title="I'll do this later" variant="outline" onPress={onSkip} />
    </View>
  );
}

function FarmsStep({ onDone, onSkip }: { onDone: () => Promise<void>; onSkip: () => Promise<void> }) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ name: "", region: "", address: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [pinNote, setPinNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { repo.farms.active().then(setFarms).catch(() => {}); }, []);

  async function saveFarm() {
    if (!draft.name.trim()) return;
    setBusy(true); setPinNote(null); setError(null);
    try {
      const business = await repo.getBusiness();
      if (!business) throw new Error("No active business");
      const f: Farm = { id: uuid(), business_id: business.id, name: draft.name.trim(), region: draft.region.trim() || undefined, address: draft.address.trim() || undefined, notes: draft.notes.trim() || undefined, created_at: new Date().toISOString() };
      await repo.farms.save(f);
      const addressQuery = [draft.address.trim(), draft.region.trim()].filter(Boolean).join(", ");
      if (addressQuery) {
        const geo = await geocodeAddress(addressQuery);
        if (geo) {
          const { error: pinError } = await supabase.from("weather_locations").insert({ business_id: business.id, farm_id: f.id, lat: geo.lat, lon: geo.lon, label: f.name, location_type: "farm", is_approximate: false, is_active: true });
          if (pinError) throw pinError;
          setPinNote(`✓ Map pin saved at ${geo.label.split(",").slice(0, 3).join(",")}`);
        } else setPinNote("Couldn't find that address. You can set the location later.");
      }
      setFarms((xs) => [...xs, f]);
      setDraft({ name: "", region: "", address: "", notes: "" });
    } catch (e: any) { setError(e?.message ?? "Couldn't save farm"); }
    finally { setBusy(false); }
  }

  return <View>
    <Text style={styles.stepTitle}>Add your farms</Text><Text style={styles.stepBody}>Add one farm to get started. Chaser uses the location for mapping and weather.</Text>
    <View style={{ gap: 6 }}>{farms.map((f) => <View key={f.id} style={styles.memberRow}><Icon name="barn" size={22} color={colors.brandPrimary} /><View><Text style={styles.memberName}>{f.name}</Text>{f.region ? <Text style={styles.memberSub}>{f.region}</Text> : null}</View></View>)}</View>
    {showForm ? <View style={styles.formCard}>
      <Input label="Farm name" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="Home Farm" />
      <Input label="Area / State (optional)" value={draft.region} onChangeText={(v) => setDraft({ ...draft, region: v })} placeholder="Coorow, WA" />
      <Input label="Address / location (optional)" value={draft.address} onChangeText={(v) => setDraft({ ...draft, address: v })} placeholder="Road, town or property address" />
      <Text style={styles.formHint}>Chaser will save a map pin for this farm.</Text>{pinNote ? <Text style={styles.pinNote}>{pinNote}</Text> : null}{error ? <Text style={styles.errorNotice}>{error}</Text> : null}
      <Button title="Save farm" icon="content-save" onPress={saveFarm} loading={busy} disabled={!draft.name.trim()} /><Button title="Done adding farms" variant="outline" onPress={() => setShowForm(false)} />
    </View> : <Button title={farms.length ? "Add another farm" : "Add farm"} icon="plus-circle-outline" variant="secondary" onPress={() => setShowForm(true)} />}
    <View style={{ height: spacing.lg }} /><Button title="Continue" onPress={onDone} /><View style={{ height: 6 }} /><Button title="I'll do this later" variant="outline" onPress={onSkip} />
  </View>;
}

function PaddocksStep({ onDone, onSkip }: { onDone: () => Promise<void>; onSkip: () => Promise<void> }) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ farm_id: "", name: "", area: "", crop: "", variety: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { Promise.all([repo.farms.active(), repo.paddocks.active()]).then(([fs, ps]) => { setFarms(fs); setPaddocks(ps); if (fs[0]) setDraft((d) => ({ ...d, farm_id: d.farm_id || fs[0].id })); }).catch(() => {}); }, []);

  async function savePaddock() {
    if (!draft.name.trim() || !draft.farm_id) return;
    setBusy(true); setError(null);
    try {
      const business = await repo.getBusiness(); if (!business) throw new Error("No active business");
      const p: Paddock = { id: uuid(), business_id: business.id, farm_id: draft.farm_id, name: draft.name.trim(), area_ha: parseFloat(draft.area) || undefined, crop: draft.crop.trim() || undefined, variety: draft.variety.trim() || undefined, created_at: new Date().toISOString() };
      await repo.paddocks.save(p);
      setPaddocks((xs) => [...xs, p]); setDraft((d) => ({ ...d, name: "", area: "", crop: "", variety: "" })); setShowForm(false);
    } catch (e: any) { setError(e?.message ?? "Couldn't save paddock"); }
    finally { setBusy(false); }
  }

  return <View>
    <Text style={styles.stepTitle}>Add a couple of paddocks</Text><Text style={styles.stepBody}>They&apos;ll appear on the Farm map straight away. The pin starts at the farm location until you draw the real boundary.</Text>
    {!farms.length ? <Text style={styles.errorNotice}>Add a farm first.</Text> : null}
    <View style={{ gap: 6 }}>{paddocks.map((p) => <View key={p.id} style={styles.memberRow}><Icon name="map-marker-outline" size={22} color={colors.brandPrimary} /><View><Text style={styles.memberName}>{p.name}</Text><Text style={styles.memberSub}>{p.area_ha ? `${p.area_ha} ha` : "No area"}</Text></View></View>)}</View>
    {showForm ? <View style={styles.formCard}>
      <Text style={styles.formLabel}>Farm</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{farms.map((f) => <Chip key={f.id} label={f.name} active={draft.farm_id === f.id} onPress={() => setDraft({ ...draft, farm_id: f.id })} />)}</ScrollView>
      <Input label="Paddock name" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="North 40" />
      <View style={styles.row}><View style={{ flex: 1 }}><Input label="Area" value={draft.area} onChangeText={(v) => setDraft({ ...draft, area: v })} keyboardType="decimal-pad" suffix="ha" /></View><View style={{ flex: 1 }}><Input label="Crop (optional)" value={draft.crop} onChangeText={(v) => setDraft({ ...draft, crop: v })} /></View></View>
      <Input label="Variety (optional)" value={draft.variety} onChangeText={(v) => setDraft({ ...draft, variety: v })} />{error ? <Text style={styles.errorNotice}>{error}</Text> : null}
      <Button title="Save paddock" icon="content-save" onPress={savePaddock} loading={busy} disabled={!draft.name.trim() || !draft.farm_id} /><Button title="Cancel" variant="outline" onPress={() => setShowForm(false)} />
    </View> : <Button title={paddocks.length ? "Add another paddock" : "Add paddock"} icon="plus-circle-outline" variant="secondary" onPress={() => setShowForm(true)} disabled={!farms.length} />}
    <View style={{ height: spacing.lg }} /><Button title="Continue" onPress={onDone} /><View style={{ height: 6 }} /><Button title="I'll do this later" variant="outline" onPress={onSkip} />
  </View>;
}

type MachineryDraft = {
  name: string; type: MachineType | ""; hours: string; make: string; model: string;
  pulls: boolean | null; towMachineId: string;
  implementName: string; implementType: string; implementMake: string; implementModel: string; implementWidth: string;
  tank: string; boom: string; spacingMm: string; speed: string; waterRate: string;
};
const EMPTY_MACHINE: MachineryDraft = { name: "", type: "", hours: "", make: "", model: "", pulls: null, towMachineId: "", implementName: "", implementType: "", implementMake: "", implementModel: "", implementWidth: "", tank: "", boom: "", spacingMm: "", speed: "", waterRate: "" };

function MachineryStep({ onDone, onSkip }: { onDone: () => Promise<void>; onSkip: () => Promise<void> }) {
  const [items, setItems] = useState<Machinery[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<MachineryDraft>(EMPTY_MACHINE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { repo.machinery.list().then(setItems).catch(() => {}); }, []);

  const canTow = draft.type === "Tractor" || draft.type === "Ute/Vehicle" || draft.type === "Other";
  const isSprayer = draft.type === "Self-propelled sprayer" || draft.type === "Tow-behind sprayer";
  const isTowSprayer = draft.type === "Tow-behind sprayer";
  const towingOptions = items.filter((m) => m.machine_type === "Tractor" || m.machine_type === "Ute/Vehicle" || m.machine_type === "Other");

  async function saveMachine() {
    if (!draft.name.trim()) { setError("Give the machine a name before saving."); return; }
    if (!draft.type) { setError("Select a machinery type before saving."); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const business = await repo.getBusiness();
      if (!business) throw new Error("Your Chaser business isn't ready yet. Go back or sign in again, then retry.");
      const id = uuid();
      const machine = {
        id, business_id: business.id, name: draft.name.trim(), machine_type: draft.type,
        make: draft.make.trim() || undefined, model: draft.model.trim() || undefined,
        current_hours: parseFloat(draft.hours) || undefined,
        paired_towing_machine_id: isTowSprayer && draft.towMachineId ? draft.towMachineId : undefined,
        tank_capacity_l: isSprayer ? parseFloat(draft.tank) || undefined : undefined,
        boom_width_m: isSprayer ? parseFloat(draft.boom) || undefined : undefined,
        nozzle_spacing_m: isSprayer && parseFloat(draft.spacingMm) ? parseFloat(draft.spacingMm) / 1000 : undefined,
        default_speed_kmh: isSprayer ? parseFloat(draft.speed) || undefined : undefined,
        default_water_rate_lha: isSprayer ? parseFloat(draft.waterRate) || undefined : undefined,
        created_at: new Date().toISOString(),
      } as Machinery & Record<string, any>;
      await repo.machinery.save(machine as any);
      const saved: Machinery[] = [machine];

      if (canTow && draft.pulls === true && draft.implementName.trim()) {
        const implement = {
          id: uuid(), business_id: business.id, name: draft.implementName.trim(), machine_type: "Implement" as MachineType,
          make: draft.implementMake.trim() || undefined, model: draft.implementModel.trim() || undefined,
          equipment_subtype: draft.implementType.trim() || undefined,
          working_width_m: parseFloat(draft.implementWidth) || undefined,
          paired_towing_machine_id: id,
          created_at: new Date().toISOString(),
        } as Machinery & Record<string, any>;
        await repo.machinery.save(implement as any);
        saved.push(implement);
      }

      setItems((xs) => [...xs, ...saved]);
      setNotice(saved.length > 1 ? `Saved ${machine.name} and linked ${saved[1].name}.` : `Saved ${machine.name}.`);
      setDraft(EMPTY_MACHINE);
    } catch (e: any) {
      setError(`Couldn't save machinery: ${e?.message ?? String(e)}`);
    } finally { setBusy(false); }
  }

  return <View>
    <Text style={styles.stepTitle}>Add your machinery</Text>
    <Text style={styles.stepBody}>Add the machines and implements you use regularly. Chaser will link towing machines and equipment so jobs make more sense later.</Text>
    <View style={{ gap: 6 }}>{items.map((m: any) => <View key={m.id} style={styles.memberRow}><Icon name={m.machine_type === "Implement" ? "tools" : "tractor-variant"} size={22} color={colors.brandPrimary} /><View style={{ flex: 1 }}><Text style={styles.memberName}>{m.name}</Text><Text style={styles.memberSub}>{m.machine_type ?? "Machine"}{m.make ? ` · ${m.make}` : ""}{m.model ? ` ${m.model}` : ""}{m.current_hours != null ? ` · ${m.current_hours} h` : ""}</Text></View></View>)}</View>
    {notice ? <Text style={styles.notice}>{notice}</Text> : null}{error ? <Text style={styles.errorNotice}>{error}</Text> : null}

    {showForm ? <View style={styles.formCard}>
      <Input label="Name / nickname" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="Big Green" testID="mach-name" />
      <Text style={styles.formLabel}>Type</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{MACHINE_TYPES.map((t) => <Chip key={t} label={t} active={draft.type === t} onPress={() => setDraft({ ...draft, type: t, pulls: null, towMachineId: "" })} />)}</ScrollView>
      <View style={styles.row}><View style={{ flex: 1 }}><Input label="Make" value={draft.make} onChangeText={(v) => setDraft({ ...draft, make: v })} /></View><View style={{ flex: 1 }}><Input label="Model" value={draft.model} onChangeText={(v) => setDraft({ ...draft, model: v })} /></View></View>
      <Input label="Current hours (optional)" value={draft.hours} onChangeText={(v) => setDraft({ ...draft, hours: v })} keyboardType="decimal-pad" suffix="h" />

      {canTow ? <View style={styles.subCard}>
        <Text style={styles.subTitle}>Attached / towed equipment</Text><Text style={styles.formHint}>Does this machine regularly pull an implement or other equipment?</Text>
        <View style={styles.twoChoices}><Choice active={draft.pulls === true} label="Yes" icon="link-variant" onPress={() => setDraft({ ...draft, pulls: true })} /><Choice active={draft.pulls === false} label="No" icon="minus-circle-outline" onPress={() => setDraft({ ...draft, pulls: false })} /></View>
        {draft.pulls === true ? <>
          <Input label="Implement / equipment name" value={draft.implementName} onChangeText={(v) => setDraft({ ...draft, implementName: v })} placeholder="Seeder, scarifier, chaser bin..." />
          <Input label="Equipment type" value={draft.implementType} onChangeText={(v) => setDraft({ ...draft, implementType: v })} placeholder="Air seeder / ripper / spreader / trailer" />
          <View style={styles.row}><View style={{ flex: 1 }}><Input label="Make" value={draft.implementMake} onChangeText={(v) => setDraft({ ...draft, implementMake: v })} /></View><View style={{ flex: 1 }}><Input label="Model" value={draft.implementModel} onChangeText={(v) => setDraft({ ...draft, implementModel: v })} /></View></View>
          <Input label="Working width (optional)" value={draft.implementWidth} onChangeText={(v) => setDraft({ ...draft, implementWidth: v })} keyboardType="decimal-pad" suffix="m" />
          <Text style={styles.formHint}>The implement is saved as its own machinery record and linked to this towing machine.</Text>
        </> : null}
      </View> : null}

      {isTowSprayer ? <View style={styles.subCard}>
        <Text style={styles.subTitle}>What normally pulls this sprayer?</Text>
        {towingOptions.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}><Chip label="Not set" active={!draft.towMachineId} onPress={() => setDraft({ ...draft, towMachineId: "" })} />{towingOptions.map((m) => <Chip key={m.id} label={m.name} active={draft.towMachineId === m.id} onPress={() => setDraft({ ...draft, towMachineId: m.id })} />)}</ScrollView> : <Text style={styles.formHint}>Add the tractor first if you want to link it now. You can also link it later.</Text>}
      </View> : null}

      {isSprayer ? <View style={styles.subCard}>
        <Text style={styles.subTitle}>Sprayer setup</Text>
        <View style={styles.row}><View style={{ flex: 1 }}><Input label="Tank capacity" value={draft.tank} onChangeText={(v) => setDraft({ ...draft, tank: v })} keyboardType="decimal-pad" suffix="L" /></View><View style={{ flex: 1 }}><Input label="Boom width" value={draft.boom} onChangeText={(v) => setDraft({ ...draft, boom: v })} keyboardType="decimal-pad" suffix="m" /></View></View>
        <Input label="Nozzle spacing" value={draft.spacingMm} onChangeText={(v) => setDraft({ ...draft, spacingMm: v })} keyboardType="decimal-pad" suffix="mm" />
        <View style={styles.row}><View style={{ flex: 1 }}><Input label="Typical speed" value={draft.speed} onChangeText={(v) => setDraft({ ...draft, speed: v })} keyboardType="decimal-pad" suffix="km/h" /></View><View style={{ flex: 1 }}><Input label="Typical water rate" value={draft.waterRate} onChangeText={(v) => setDraft({ ...draft, waterRate: v })} keyboardType="decimal-pad" suffix="L/ha" /></View></View>
        <Text style={styles.formHint}>More detailed nozzle, PWM, Tri-Jet/Quadri-Jet and spot-spray setup can be completed from Machinery after setup.</Text>
      </View> : null}

      {error ? <Text style={styles.errorNotice}>{error}</Text> : null}
      <Button title="Save machine" icon="content-save" onPress={saveMachine} loading={busy} disabled={!draft.name.trim() || !draft.type} testID="mach-save-btn" />
      <Button title="Done adding machines" variant="outline" onPress={() => { setShowForm(false); setError(null); }} />
    </View> : <Button title={items.length ? "Add another machine" : "Add machinery"} icon="plus-circle-outline" variant="secondary" onPress={() => { setShowForm(true); setError(null); }} />}

    <View style={{ height: spacing.lg }} /><Button title="Continue" onPress={onDone} /><View style={{ height: 6 }} /><Button title="I'll do this later" variant="outline" onPress={onSkip} />
  </View>;
}

function ChemicalsStep({ onDone, onSkip }: { onDone: () => Promise<void>; onSkip: () => Promise<void> }) {
  const [items, setItems] = useState<Chemical[]>([]); const [showForm, setShowForm] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", category: "Herbicide", ai: "", apvma: "", stockQty: "", stockUnit: "" });
  useEffect(() => { repo.chemicals.active().then(setItems).catch(() => {}); }, []);
  async function save() { if (!draft.name.trim()) return; setBusy(true); setError(null); try { const business = await repo.getBusiness(); if (!business) throw new Error("No active business"); const c: Chemical = { id: uuid(), business_id: business.id, product_name: draft.name.trim(), product_type: draft.category as any, active_ingredient: draft.ai.trim() || undefined, apvma_number: draft.apvma.trim() || undefined, stock_qty: draft.stockQty ? parseFloat(draft.stockQty) : undefined, stock_unit: draft.stockUnit.trim() || undefined, created_at: new Date().toISOString() }; await repo.chemicals.save(c); setItems((x) => [...x, c]); setDraft({ name: "", category: "Herbicide", ai: "", apvma: "", stockQty: "", stockUnit: "" }); setShowForm(false); } catch (e: any) { setError(e?.message ?? "Couldn't save chemical"); } finally { setBusy(false); } }
  function applyApvma(p: ApvmaProduct) { setDraft((d) => ({ ...d, name: p.productName, apvma: p.pcode || d.apvma, category: mapApvmaCategory(p.category) ?? d.category })); }
  return <View><Text style={styles.stepTitle}>Add chemicals you use often</Text><Text style={styles.stepBody}>Add a few common products now to make spray jobs quicker. Don&apos;t have the details handy? Skip this and add them later.</Text><View style={{ gap: 6 }}>{items.map((c) => <View key={c.id} style={styles.memberRow}><Icon name="flask-outline" size={22} color={colors.brandPrimary} /><View><Text style={styles.memberName}>{c.product_name}</Text><Text style={styles.memberSub}>{c.product_type}{c.stock_qty != null ? ` · ${c.stock_qty} ${c.stock_unit ?? ""}`.trimEnd() : ""}</Text></View></View>)}</View>{showForm ? <View style={styles.formCard}><ApvmaSearch onSelect={applyApvma} /><Input label="Product name" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} /><Text style={styles.formLabel}>Category</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{CHEMICAL_CATEGORIES.map((c) => <Chip key={c} label={c} active={draft.category === c} onPress={() => setDraft({ ...draft, category: c })} />)}</ScrollView><Input label="Active ingredient (optional)" value={draft.ai} onChangeText={(v) => setDraft({ ...draft, ai: v })} /><Input label="APVMA number (optional)" value={draft.apvma} onChangeText={(v) => setDraft({ ...draft, apvma: v })} /><View style={{ flexDirection: "row", gap: 8 }}><View style={{ flex: 1 }}><Input label="Stock quantity (optional)" value={draft.stockQty} onChangeText={(v) => setDraft({ ...draft, stockQty: v })} keyboardType="decimal-pad" /></View><View style={{ flex: 1 }}><Input label="Unit" value={draft.stockUnit} onChangeText={(v) => setDraft({ ...draft, stockUnit: v })} placeholder="packs, L, kg" /></View></View>{error ? <Text style={styles.errorNotice}>{error}</Text> : null}<Button title="Save chemical" icon="content-save" onPress={save} loading={busy} /><Button title="Cancel" variant="outline" onPress={() => setShowForm(false)} /></View> : <Button title={items.length ? "Add another chemical" : "Add chemical"} icon="plus-circle-outline" variant="secondary" onPress={() => setShowForm(true)} />}<View style={{ height: spacing.lg }} /><Button title="Continue" onPress={onDone} /><View style={{ height: 6 }} /><Button title="I'll do this later" variant="outline" onPress={onSkip} /></View>;
}

function FinishStep({ onFinish }: { onFinish: () => Promise<void> }) {
  const [profile, setProfile] = useState<any>(null); const [farms, setFarms] = useState<Farm[]>([]); const [paddocks, setPaddocks] = useState<Paddock[]>([]); const [machs, setMachs] = useState<Machinery[]>([]); const [chems, setChems] = useState<Chemical[]>([]); const [ops, setOps] = useState<Operator[]>([]); const { userId } = useOnboarding();
  useEffect(() => { (async () => { const [f, p, m, c, o] = await Promise.all([repo.farms.active(), repo.paddocks.active(), repo.machinery.list(), repo.chemicals.active(), repo.operators.active()]); setFarms(f); setPaddocks(p); setMachs(m); setChems(c); setOps(o); if (userId) setProfile(await profileRepo.get(userId)); })().catch(() => {}); }, [userId]);
  const roleLabel = useMemo(() => ({ owner: "Farm Owner", manager: "Farm Manager", contractor: "Contractor", other: "Other" }[profile?.role as string] ?? "Not set"), [profile]);
  return <View><View style={styles.finishHero}><View style={styles.finishBadge}><Icon name="check-decagram" size={40} color={colors.brandPrimary} /></View><Text style={styles.finishTitle}>You&apos;re ready to start chasing.</Text><Text style={styles.finishBody}>Here&apos;s what you set up. You can add or edit everything later.</Text></View><View style={styles.summary}><SummaryRow icon="account-tie" label="Role" value={roleLabel} /><SummaryRow icon="account-group" label="Team members" value={ops.filter((o) => !o.is_default_user).length.toString()} /><SummaryRow icon="barn" label="Farms" value={farms.length.toString()} /><SummaryRow icon="map-marker-outline" label="Paddocks" value={paddocks.length.toString()} /><SummaryRow icon="tractor-variant" label="Machinery & equipment" value={machs.length.toString()} /><SummaryRow icon="flask-outline" label="Chemicals" value={chems.length.toString()} /></View><View style={{ height: spacing.lg }} /><Button title="Go to Chaser" icon="arrow-right" onPress={onFinish} size="lg" /></View>;
}

function SummaryRow({ icon, label, value }: { icon: string; label: string; value: string }) { return <View style={styles.summaryRow}><Icon name={icon as any} size={20} color={colors.brandPrimary} /><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>; }
function Choice({ active, label, icon, onPress }: { active: boolean; label: string; icon: string; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.chipBig, active && styles.chipBigActive]}><Icon name={icon as any} size={20} color={active ? colors.onBrandPrimary : colors.brandPrimary} /><Text style={[styles.chipBigText, active && { color: colors.onBrandPrimary }]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  logoSmall: { width: 32, height: 32, borderRadius: 8 }, brandName: { color: colors.onSurface, fontSize: 16, fontWeight: "800" }, brandSub: { color: colors.muted, fontSize: 11, marginTop: 1 },
  skipAllBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, skipAllText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700" },
  progressWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md }, progressBg: { height: 6, backgroundColor: colors.surface, borderRadius: 999, overflow: "hidden" }, progressFill: { height: 6, backgroundColor: colors.brandPrimary, borderRadius: 999 }, progressText: { color: colors.muted, fontSize: 11, marginTop: 6, fontWeight: "600" },
  stepTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "800", letterSpacing: -0.3, marginTop: spacing.md, marginBottom: 6 }, stepBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 8 }, optionRowActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }, optionText: { flex: 1, color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  twoChoices: { flexDirection: "row", gap: spacing.sm, marginTop: 6 }, chipBig: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 50, paddingHorizontal: 8, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border }, chipBigActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }, chipBigText: { color: colors.onSurface, fontSize: 13, fontWeight: "700", textAlign: "center" },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 12 }, memberName: { fontSize: 14, fontWeight: "700", color: colors.onSurface }, memberSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  formCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.md, marginBottom: spacing.sm, gap: 7 }, subCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 7, marginTop: 6 }, subTitle: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  formLabel: { fontSize: 12, color: colors.muted, marginBottom: 3, fontWeight: "600" }, formHint: { fontSize: 11, color: colors.muted, fontStyle: "italic", marginTop: 2 }, pinNote: { fontSize: 11, color: colors.brandPrimary, fontWeight: "700", marginTop: 4 }, notice: { fontSize: 12, color: colors.brandPrimary, marginTop: 8, fontWeight: "700" }, errorNotice: { fontSize: 12, color: colors.error, marginTop: 8, fontWeight: "700" },
  row: { flexDirection: "row", gap: 8 }, chips: { gap: 6, paddingBottom: 4 },
  finishHero: { alignItems: "center", paddingTop: spacing.xl, gap: 8 }, finishBadge: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm }, finishTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "800", textAlign: "center" }, finishBody: { color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: spacing.md },
  summary: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, marginTop: spacing.md }, summaryRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }, summaryLabel: { flex: 1, color: colors.onSurface, fontSize: 14, fontWeight: "600" }, summaryValue: { color: colors.brandPrimary, fontSize: 15, fontWeight: "800" },
  footer: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, backgroundColor: colors.surfaceSecondary }, backLink: { color: colors.brandPrimary, fontSize: 14, fontWeight: "700" }, jumpLink: { color: colors.muted, fontSize: 13, fontWeight: "600" },
});
