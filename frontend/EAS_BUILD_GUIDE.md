# Chaser — Standalone EAS Build & Submit Guide

This is the reference for building & publishing Chaser to the App Store and Google Play using **your own** Expo, Apple Developer and Google Play accounts — completely independently of Emergent.

Everything below runs from a checkout of this repo.

---

## 0. Prerequisites (one-time)

| Tool | How | Notes |
|---|---|---|
| **Node 20+** | `nvm install 20 && nvm use 20` | Match the Expo SDK requirements |
| **Yarn** | `corepack enable && corepack prepare yarn@stable --activate` | This project's `packageManager` is Yarn |
| **EAS CLI** | `npm i -g eas-cli@latest` | Global. Version >= 12 |
| **Xcode 16+** | Mac App Store | Only if you want simulator builds locally |
| **Apple Developer Program** | https://developer.apple.com/programs — AUD ~$165/yr | Required for iOS builds & TestFlight |
| **Google Play Console** | https://play.google.com/console — one-off USD $25 | Required for Play Store submission |
| **Expo account** | https://expo.dev/signup | Free for personal, $99/mo for teams |

---

## 1. Fork / clone this repo, then link to your Expo project

```bash
cd frontend
yarn install
eas login              # sign in to your own Expo account
eas init               # creates the Expo project on your account and writes projectId
```

`eas init` will edit `app.json` for you — replace **`REPLACE_WITH_EAS_PROJECT_ID`** in
`extra.eas.projectId` and **`REPLACE_WITH_EXPO_ACCOUNT_USERNAME`** in `owner` if it
doesn't already do so automatically.

---

## 2. Confirm the identifiers

Already configured in `app.json` — check these match your Apple & Google console entries:

| Field | Value |
|---|---|
| App name | **Chaser** |
| Slug | **chaser** |
| iOS bundle identifier | **`au.com.chaserag.chaser`** |
| Android package name | **`au.com.chaserag.chaser`** |
| iOS build number | 1 (auto-increments on production builds) |
| Android versionCode | 1 (auto-increments on production builds) |
| App version | 1.0.0 |

---

## 3. iOS credentials

You have two options — EAS-managed (recommended, simplest) or bring-your-own.

**Option A · EAS manages it (recommended)**
```bash
eas credentials              # walkthrough to attach your Apple ID
# select iOS → Production → Set up a new adhoc/distribution certificate → Yes
```
EAS will generate & upload the Distribution Certificate and Provisioning Profile
to your Apple account automatically.

**Option B · Bring your own**
Place your `.p8` (App Store Connect API Key), `distribution.cer` and
`profile.mobileprovision` and follow the EAS CLI prompts.

---

## 4. Android credentials

```bash
eas credentials              # select Android → Production → Generate new keystore
```
Back up the keystore that EAS generates — losing it means you can never update the
app on Play Store under the same package name.

For automated submission you also need a **Google Play service account** JSON key:
1. Google Cloud Console → IAM → Service Accounts → Create.
2. Grant it the **Service Account User** role, download the JSON.
3. In Play Console → Setup → API access → Link the service account and grant it
   "Release manager" permissions.
4. Save the JSON as `frontend/google-play-service-account.json` — this file is
   git-ignored on purpose. `eas.json` already points to it.

---

## 5. Build

```bash
cd frontend

# One at a time
eas build --platform ios --profile production
eas build --platform android --profile production

# Or both in parallel
eas build --platform all --profile production
```

Builds run in the cloud. When each finishes EAS gives you a downloadable `.ipa`
(iOS) and `.aab` (Android). No local Xcode/Android Studio required.

The `production` profile has `autoIncrement: true`, so **every production build
automatically bumps `buildNumber` (iOS) and `versionCode` (Android)** — you never
need to edit them by hand between builds.

To bump the human-visible version, edit `app.json` → `expo.version` (e.g. from
`1.0.0` → `1.0.1`) and commit.

---

## 6. Environment variables & Supabase keys

The `EXPO_PUBLIC_*` variables (Supabase URL + anon key + backend URL) are baked
into the JS bundle at build time. They are already declared inline in
`eas.json` under each profile's `env` block — safe because these are the
**public** Supabase keys (RLS is what protects your data, not the anon key).

**Never** put the Supabase *service_role* key or the Google Play service
account inline — those go into `eas secret:create` as EAS Secrets.

To rotate the Supabase URL/key later, edit `eas.json` and re-run
`eas build --platform all --profile production`. If you'd prefer to keep them
completely out of the repo:
```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value 'https://vcbwhlfbmqmwzntpnsjs.supabase.co'
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value 'sb_publishable_...'
eas secret:create --scope project --name EXPO_PUBLIC_BACKEND_URL --value 'https://api.your-domain.com.au'
```
…then delete the `env` block from `eas.json`. EAS Secrets take precedence.

`EXPO_PUBLIC_SENTRY_DSN` is declared the same way but left blank — Sentry is
disabled until it's set. A Sentry DSN is not secret (it can only submit
events, not read them), so it's safe to inline in `eas.json` like the
Supabase keys once you have a project:
```bash
eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN --value 'https://examplePublicKey@o0.ingest.sentry.io/0'
```
or paste it directly into each profile's `env` block in `eas.json`. Also set
it in your local shell/`.env` when running `expo start` if you want Sentry
active in dev.

---

## 7. Submit to the stores

**Before running these**, edit `eas.json` → `submit.production` and replace:
- `REPLACE_WITH_APPLE_ID_EMAIL` with your Apple ID email
- `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` — the numeric ASC App ID (App Store Connect → App → App Information → General → "Apple ID")
- `REPLACE_WITH_APPLE_TEAM_ID` — 10-char team ID (developer.apple.com → Membership)

Then:
```bash
eas submit --platform ios          # uploads .ipa to TestFlight
eas submit --platform android      # uploads .aab to Play Console → Internal track (as draft)
```

The Android track defaults to `internal` + `draft` so nothing goes public
without you manually promoting it in Play Console.

---

## 8. Permissions declared (nothing to add — they're all in `app.json`)

| Permission | Purpose | iOS Info.plist key | Android manifest |
|---|---|---|---|
| Location (when in use) | Weather auto-capture at paddock, drive-recorded paddock boundaries | `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription` | `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` |
| Camera | Future — attach photos to spray records / machinery documents | `NSCameraUsageDescription` | `CAMERA` |
| Photo library | Future — attach existing photos to records | `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription` | `READ_MEDIA_IMAGES`, `READ/WRITE_EXTERNAL_STORAGE` |

Push notifications are **not** currently wired into Chaser. When you're ready
to add them, run `npx expo install expo-notifications`, add the plugin to
`app.json` and add `NSUserNotificationsUsageDescription` to `ios.infoPlist`.

---

## 9. Offline / GPS / Maps / Existing features

All preserved — no functional or UI changes were made in this setup pass.
Everything that works in the current Emergent-hosted preview will work in the
EAS-built binary:

- Local shadow of active spray jobs (`src/lib/offline-queue.ts`)
- MapLibre WebView paddock boundaries
- Drive-boundary GPS capture
- Realtime sync via Supabase Realtime channels
- Tank-mix calculator, spray records, machinery, chemicals, team

---

## 10. Sync the code to your own GitHub

This is a **manual step** and must be done from the Emergent UI:

1. In this Emergent workspace, click **`Save to GitHub`** (top-right toolbar).
2. Pick your GitHub account / org and target repo (create `chaser` if needed).
3. Emergent will push the entire `/app` tree.
4. On your Mac / build machine: `git clone <your-repo> && cd chaser/frontend && yarn install`.
5. Follow steps 1–7 above from there.

Every time you make a code change in Emergent, push again via the same
`Save to GitHub` button to keep the GitHub copy in sync.

---

## 11. Round-trip smoke test

Once your first production build finishes:
- Install the iOS build on your device via **TestFlight** (share via link — no
  App Store submission needed for internal testing)
- Install the Android `.aab` after generating an APK via `eas build --profile
  preview --platform android`
- Sign in with your existing Chaser beta account and confirm every tab loads,
  active spray job resumes offline, and the paddock map renders

You're now fully independent of Emergent for the build & release path.
