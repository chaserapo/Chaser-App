import { View, Text, ScrollView, StyleSheet, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { ScreenHeader } from "@/src/components/header";
import { Card } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";

const CONTENT: Record<string, { title: string; effective: string; body: { heading?: string; text: string }[] }> = {
  privacy: {
    title: "Privacy Policy",
    effective: "Effective: September 2026",
    body: [
      { text: "This Privacy Policy explains how Chaser (\"Chaser\", \"we\", \"our\") collects, uses, stores and shares your personal information. Chaser is operated by Midwest Ag Supplies (ABN 21 510 804 128), Morley, WA 6032, Australia. Chaser is a farm operations app for broadacre spraying and machinery record-keeping, available to operators worldwide, and complies with the Australian Privacy Principles (APPs) under the Privacy Act 1988 (Cth)." },

      { heading: "1. What we collect", text: "• Account information: your email address, password (hashed by Supabase), business name and role (owner / manager / operator).\n• Farm data you enter: farms, paddocks, paddock boundaries, machinery, maintenance records, chemicals in your register, spray jobs, tank mixes, operators, and any photos or notes you upload.\n• Device data during a spray job: GPS latitude/longitude at weather-capture and when recording paddock boundaries.\n• Weather data: retrieved from public weather APIs using the coordinates of your current location.\n• Team invitations: when you invite a team member we send a one-time invitation email to the address you provide via our email service provider (Resend).\n• Subscription status: if you subscribe to Chaser, Apple's App Store handles your payment directly — we never see or store your card details, only whether your subscription is active." },

      { heading: "2. How we use your information", text: "We use the information you enter solely to operate Chaser for you and your team: to authenticate you, to store your farm records, to display your data back to you and any team members you have granted access to, to send transactional emails such as invitations, and to check your subscription status. We do not use your data to train AI models. We do not sell your data. We do not use it for advertising or profiling." },

      { heading: "3. Where your data is stored", text: "Your data is stored in a Supabase-hosted PostgreSQL database. Each farm business's data is protected by row-level security (RLS), so team members from other businesses cannot access your records. Supabase's data centres may be outside your country — by using Chaser you consent to this cross-border storage." },

      { heading: "4. Who can see your data", text: "Only you and the team members you have invited (and accepted) into your farm business can read your farm data. Chaser support staff can, with your consent, access your data to investigate a support request. Sub-processors are: Supabase (database, authentication), weather data providers including Open-Meteo (coordinates only, no account), Resend (transactional email delivery), and Apple (App Store subscription billing)." },

      { heading: "5. Location & permissions", text: "Chaser only reads your device GPS when you explicitly capture weather, record a paddock boundary, or record a spray job. Location is not tracked in the background. If you deny the location permission, Chaser falls back to a default regional weather lookup and you can still enter data manually." },

      { heading: "6. Your rights", text: "You may delete your Chaser account at any time from More → Account → Delete my account, or request access, correction or export of your data by contacting chaserapp@outlook.com. If you sign out, your data remains in your business's account until you or another owner deletes it. If you are an invited member and are removed from a business, you will lose access to that business's records but will retain your own login." },

      { heading: "7. Retention", text: "We retain your data for as long as your account remains active. Deleted records are soft-deleted for up to 30 days to allow recovery, then permanently removed on request. Backups may retain data for up to 90 days." },

      { heading: "8. Security", text: "We use HTTPS/TLS for all data in transit, Supabase-managed encryption at rest, salted-and-hashed passwords, and RLS to isolate each business's data. No system is perfectly secure; we recommend a strong, unique password and that you notify us immediately if you suspect unauthorised access." },

      { heading: "9. Complaints", text: "If you believe we have handled your personal information contrary to the APPs, contact chaserapp@outlook.com. If you are not satisfied with our response you may complain to the Office of the Australian Information Commissioner (OAIC) at oaic.gov.au." },

      { heading: "10. Changes", text: "We will announce material changes to this policy inside the app. Continued use of Chaser after a change means you accept the updated policy." },

      { heading: "Contact", text: "Midwest Ag Supplies (Chaser)\nABN 21 510 804 128\nMorley, WA 6032, Australia\nchaserapp@outlook.com" },
    ],
  },
  terms: {
    title: "Terms of Service & Agricultural Disclaimer",
    effective: "Effective: September 2026",
    body: [
      { text: "These Terms govern your use of Chaser. By creating an account or using Chaser you agree to these Terms. Chaser is operated by Midwest Ag Supplies (ABN 21 510 804 128), Morley, WA 6032, Australia." },

      { heading: "1. What Chaser is", text: "Chaser is a record-keeping and workflow tool that helps you plan, run and log farm spraying and machinery operations. Chaser is a productivity tool — it is not an agronomist, not a chemical adviser, and not a regulatory reporting system." },

      { heading: "2. Agricultural disclaimer — read carefully", text: "IMPORTANT. Chaser does not provide agronomic advice, product recommendations, dose calculations that override the product label, or any suggestion of whether a spray is safe, effective or legal in your circumstances.\n\nEvery product, rate, unit, weather threshold and spray decision you enter is your own decision. You must always:\n• follow the current registered product label,\n• follow APVMA, state and local regulations,\n• follow all applicable off-label / permit conditions,\n• consider weather conditions, spray drift, temperature inversions and buffer zones, and\n• seek qualified agronomic advice where appropriate.\n\nChaser's calculators (spray rate, tank mix, delta-T, nozzle guide) are provided as convenience utilities. Outputs are indicative only. Always verify against your own measurements before making purchases, applications or compliance submissions." },

      { heading: "3. GPS, weather and area figures", text: "GPS-captured coordinates, drive-recorded paddock boundaries, hectare calculations, and weather values retrieved from Open-Meteo are indicative only. Verify against ground truth or a qualified surveyor before using them for compliance, insurance, chemical procurement or legal purposes." },

      { heading: "4. Your account & team", text: "You are responsible for keeping your login secure and for the actions of everyone you invite to your farm business. Owners can invite, remove and change the roles of team members. Removing a member revokes their access to the business's data immediately. You can delete your own Chaser account at any time from More → Account → Delete my account." },

      { heading: "5. Subscription & billing", text: "Chaser offers a free trial period, after which continued access requires a paid auto-renewing subscription billed through the Apple App Store at the price shown at sign-up. Payment is charged to your Apple ID account at confirmation of purchase. Your subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current billing period. Your account will be charged for renewal within 24 hours prior to the end of the current period, at the then-current price. You can manage or cancel your subscription, and turn off auto-renewal, at any time in your device's App Store account settings — doing so does not refund any unused portion of a current period. If you don't cancel before a free trial ends, it converts automatically into a paid subscription." },

      { heading: "6. Acceptable use", text: "You will not: (a) upload data you don't have the right to store, (b) use Chaser to breach agricultural, environmental or chemical regulations, (c) attempt to bypass row-level security or access another business's data, (d) reverse engineer or scrape the service, or (e) resell access to Chaser without our written consent." },

      { heading: "7. Availability", text: "Chaser is provided \"as is\". We aim for high availability but do not guarantee uninterrupted service. Planned maintenance, network outages, or upstream provider outages (Supabase, weather data providers, Resend) may temporarily interrupt access. Chaser stores an offline copy of your active spray job so a temporary outage does not lose your data." },

      { heading: "8. Limitation of liability", text: "To the maximum extent permitted by Australian law, Chaser is not liable for any loss (including loss of crop, revenue, business, data, chemical spend, drift damage, regulatory penalty or personal injury) arising from your use of Chaser or from any decision you made in reliance on information displayed by Chaser. Nothing in these Terms excludes any non-excludable statutory rights you may have under the Australian Consumer Law." },

      { heading: "9. Termination", text: "You may stop using Chaser and delete your account at any time (More → Account → Delete my account), or request deletion of your data by contacting chaserapp@outlook.com. We may suspend or terminate an account that breaches these Terms, subject to reasonable notice unless there is an active security or legal issue." },

      { heading: "10. Governing law", text: "These Terms are governed by the laws of Western Australia, Australia. You submit to the non-exclusive jurisdiction of the courts of Western Australia and Australia." },

      { heading: "11. Changes to these Terms", text: "We will announce material changes inside the app. Continued use of Chaser after a change means you accept the updated Terms." },

      { heading: "Contact", text: "Midwest Ag Supplies (Chaser)\nABN 21 510 804 128\nMorley, WA 6032, Australia\nchaserapp@outlook.com" },
    ],
  },
  support: {
    title: "Help & Support",
    effective: "",
    body: [
      { text: "If something isn't working or you have feedback, get in touch — we read every message." },
      { heading: "Email", text: "chaserapp@outlook.com — include a short description of what happened, what you expected, and the name of your farm business. Screenshots welcome." },
      { heading: "Losing reception mid-job?", text: "Chaser stores an offline copy of your active spray job on your device. Keep spraying — as soon as you're back in range the app will retry the sync automatically. You'll see a \"Saved locally\" banner while it waits." },
      { heading: "GPS or map not working", text: "Grant location permission for Chaser in your device settings so we can capture weather at your paddock and record drive boundaries. If the map won't load, check you have data reception; the map tiles are served from the internet." },
      { heading: "Emergency during a live spray job", text: "Chaser is not an emergency service. For any medical, safety or major spray incident, contact your local emergency services first, then follow your farm's incident procedure." },
    ],
  },
};

export default function LegalPage() {
  const insets = useSafeAreaInsets();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const doc = CONTENT[(slug as string) || "privacy"] ?? CONTENT.privacy;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title={doc.title} back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        {doc.effective ? <Text style={styles.effective}>{doc.effective}</Text> : null}
        <Card>
          {doc.body.map((p, i) => (
            <View key={i} style={{ marginBottom: spacing.md }}>
              {p.heading ? <Text style={styles.h}>{p.heading}</Text> : null}
              <Text style={styles.p}>{p.text}</Text>
            </View>
          ))}
          {doc.title === "Help & Support" ? (
            <Text style={[styles.p, { color: colors.brandPrimary, marginTop: spacing.sm }]} onPress={() => Linking.openURL("mailto:chaserapp@outlook.com")} testID="support-email-link">
              Tap here to open your mail app
            </Text>
          ) : null}
        </Card>
        <Text style={styles.footer}>Chaser · Behind every good operation</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  effective: { color: colors.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.sm, fontWeight: "700" },
  h: { color: colors.onSurface, fontSize: 14, fontWeight: "800", marginBottom: 6 },
  p: { color: colors.onSurface, fontSize: 13, lineHeight: 20 },
  footer: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: spacing.xl, fontStyle: "italic" },
});
