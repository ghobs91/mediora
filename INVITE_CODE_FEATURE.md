# Invite Codes

Invite codes let the owner of a Mediora setup share their configuration with
family/friends in one step. One code per person.

## How it works

### Generation (owner side)

1. In **Settings → Invites** (visible once a Jellyfin connection exists), the
   owner enters the invitee's name and a **passphrase** (a 6-digit numeric
   passphrase is suggested; anything 4+ characters works).
2. Mediora uses the owner's Jellyfin **admin** account to:
   - create a new Jellyfin user (username derived from the invitee name, random
     password) via `POST /Users/New`
   - grant that user access to all libraries (`EnableAllFolders`)
3. The Jellyfin server URL + new credentials, plus the owner's Sonarr and
   Radarr settings (URL, API key, root folder, quality profile), are bundled
   into a JSON payload, gzipped, and **encrypted with XChaCha20-Poly1305**
   using a key derived from the passphrase via PBKDF2-SHA256 (200k
   iterations, random salt). The envelope is base64url-encoded into a code:
   `mediora://invite?c=<code>`.
4. The screen shows a QR code of the link, the link itself (shareable on iOS,
   selectable elsewhere), and the generated username/password/passphrase for
   debugging. Generated invites are stored locally on the owner's device.

**The passphrase is never embedded in the link/QR** — share it separately
(phone call, in person, a different app). Both the code and the passphrase
are required to redeem.

### Redemption (invitee side)

- **First run** (no Jellyfin configured): an onboarding screen offers
  "Enter invite code" and "Set up manually".
- **iOS/macOS**: tapping the `mediora://invite` link (sent via iMessage) or
  scanning the QR opens Mediora and pre-fills the code. Requires the URL
  scheme registered in `ios/mediora/Info.plist` (`CFBundleURLTypes`).
- **tvOS**: no custom URL schemes — type the code/link with the on-screen
  keyboard, or rely on iCloud: redeeming on the invitee's iPhone/macOS saves
  settings to iCloud, and the existing tvOS iCloud restore pulls them onto
  their Apple TV automatically (same iCloud account required).
- After the code is entered, the invitee types the passphrase (decryption is
  fully local/offline), reviews the invite, then the device authenticates
  against Jellyfin with the invite credentials (each device gets its own
  access token + device id) and applies Jellyfin, Sonarr, and Radarr settings
  in a single local write.

## Design notes

- **One code per person**: there is no server-side state, so the same code can
  be redeemed on multiple devices (her iPhone, Mac, Apple TV all share the one
  Jellyfin user).
- **Code format** (v1): `mediora://invite?c=<base64url(envelope)>` where
  `envelope = magic "ME" | version | PBKDF2 iterations (BE32) | salt (16) |
  nonce (24) | XChaCha20-Poly1305 ciphertext+tag`. Legacy v0 codes
  (`base64url(gzip(JSON))`, unencrypted) are still accepted.
- **Crypto**: [@noble/hashes](https://github.com/paulmillr/noble-hashes) +
  [@noble/ciphers](https://github.com/paulmillr/noble-ciphers) — pure JS,
  audited, no native modules, safe with the react-native-tvos fork. The link
  alone is useless without the passphrase; the passphrase alone is useless
  without the link.
- **Admin-only generation**: the Invites section checks
  `GET /Users/Me` → `Policy.IsAdministrator` and only shows generation UI for
  admins; redemption is available to everyone.
- **No server component**: everything runs on-device against the owner's
  existing Jellyfin/Sonarr/Radarr servers (reachable via Tailscale).

## Files

| Area | File |
| --- | --- |
| Codec (encryption + gzip + base64url + URL parsing) | `src/utils/inviteCode.ts` |
| Generation + local invite storage | `src/services/invites.ts` |
| Jellyfin user management API | `src/services/jellyfin.ts` (user management section) |
| QR rendering (pure JS, no native deps) | `src/components/QRCode.tsx` |
| Redeem form (shared, incl. passphrase step) | `src/components/InviteRedeemForm.tsx` |
| First-run onboarding | `src/screens/OnboardingScreen.tsx` |
| Generate/list invites UI | `src/screens/InvitesScreen.tsx` |
| Standalone redeem screen | `src/screens/InviteRedeemScreen.tsx` |
| Atomic settings apply | `src/context/SettingsContext.tsx` (`applyInviteSettings`) |
| Deep links + routes | `src/navigation/AppNavigator.tsx`, `App.tsx` |
| URL scheme registration | `ios/mediora/Info.plist`, `ios/mediora/AppDelegate.swift` |
