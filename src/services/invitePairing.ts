import { NativeModules, Platform } from 'react-native';

const { InvitePairingModule } = NativeModules;

export interface PairingHost {
  /** Short 6-digit code shown on the Apple TV. */
  code: string;
  /** Display name advertised over Bonjour. */
  name: string;
}

export interface DiscoveredHost {
  id: string;
  name: string;
}

/**
 * LAN invite pairing moves an invite from a phone/Mac onto an Apple TV without
 * typing the long invite code on the TV remote. The TV hosts (advertises over
 * Bonjour + shows a short code); the phone discovers it and sends the invite.
 *
 * Apple platforms only — the native module is absent on Android.
 */
export function isInvitePairingAvailable(): boolean {
  if (!InvitePairingModule) return false;
  return Platform.OS === 'ios' || Platform.isTV || Platform.OS === 'macos';
}

/** tvOS: start advertising and get the pairing code to display. */
export function startPairingHost(): Promise<PairingHost> {
  return InvitePairingModule.startHosting();
}

/** tvOS: stop advertising and reject any in-flight `waitForPairedInvite`. */
export function stopPairingHost(): Promise<void> {
  return InvitePairingModule.stopHosting();
}

/** tvOS: resolve with the invite string once a phone sends one. */
export async function waitForPairedInvite(): Promise<string> {
  const result = await InvitePairingModule.waitForInvite();
  return result.invite as string;
}

/** Sender: find Apple TVs advertising the pairing service on this network. */
export async function browseForPairingHosts(
  timeoutMs: number = 4000,
): Promise<DiscoveredHost[]> {
  const result = await InvitePairingModule.browse(timeoutMs);
  return (result.hosts ?? []) as DiscoveredHost[];
}

/** Sender: deliver an invite (URL or bare code) to the chosen host. */
export function sendInviteToHost(
  hostId: string,
  code: string,
  invite: string,
): Promise<void> {
  return InvitePairingModule.send(hostId, code, invite);
}
