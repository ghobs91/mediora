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
- **tvOS**: no custom URL schemes, so onboarding leads with two options that
  avoid typing the long code:
  - **iCloud (same Apple ID)**: redeem on the invitee's iPhone/Mac, and the
    tvOS iCloud restore pulls the settings onto their Apple TV. Onboarding has
    a "Check again" button that re-reads iCloud on demand.
  - **LAN pairing (any Apple ID)**: the Apple TV hosts a pairing session and
    shows a short 6-digit code; on the invitee's iPhone/Mac, Mediora's
    "Send to Apple TV" finds the TV over Bonjour and delivers the invite.
    The passphrase is still entered on the TV (it is short and numeric).
  Typing the code/link manually remains available as a fallback.
- After the code is entered, the invitee types the passphrase (decryption is
  fully local/offline), reviews the invite, then the device authenticates
  against Jellyfin with the invite credentials (each device gets its own
  access token + device id) and applies Jellyfin, Sonarr, and Radarr settings
  in a single local write.

## Design notes

- **One code per person**: there is no server-side state, so the same code can
  be redeemed on multiple devices (her iPhone, Mac, Apple TV all share the one
  Jellyfin user).
- **Code format** (v2): `mediora://invite?c=<base64url(envelope)>` where
  `envelope = magic "ME" | version | PBKDF2 iterations (BE32) | salt (16) |
  nonce (24) | XChaCha20-Poly1305 ciphertext+tag`. The ciphertext is a gzipped
  **compact positional binary payload** (field names never appear on the wire;
  strings are varint-length-prefixed, numbers are LEB128). This makes codes
  roughly 40–50% shorter than the v1 format (e.g. an invite with Jellyfin +
  Sonarr + Radarr is ~300 characters instead of ~455). v1 codes (gzipped JSON
  plaintext, same envelope) and legacy v0 codes (`base64url(gzip(JSON))`,
  unencrypted) are still accepted on decode.
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
| LAN pairing JS API | `src/services/invitePairing.ts` |
| Sender UI (iPhone/Mac "Send to Apple TV") | `src/components/SendInviteToTV.tsx` |
| LAN pairing native module (Bonjour + TCP) | `ios/mediora/InvitePairingModule.swift`, `.m` |
| First-run onboarding | `src/screens/OnboardingScreen.tsx` |
| Generate/list invites UI | `src/screens/InvitesScreen.tsx` |
| Standalone redeem screen | `src/screens/InviteRedeemScreen.tsx` |
| Atomic settings apply | `src/context/SettingsContext.tsx` (`applyInviteSettings`) |
| Deep links + routes | `src/navigation/AppNavigator.tsx`, `App.tsx` |
| URL scheme registration | `ios/mediora/Info.plist`, `ios/mediora/AppDelegate.swift` |
