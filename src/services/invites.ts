import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings, GeneratedInvite, InvitePayload } from '../types';
import { JellyfinService } from './jellyfin';
import {
  buildInviteCode,
  buildInviteUrl,
  generateInvitePassword,
  sanitizeUsername,
} from '../utils/inviteCode';

const INVITES_STORAGE_KEY = '@mediora/invites';

// ---------------------------------------------------------------------------
// Local persistence of generated invites (on the admin's device only)
// ---------------------------------------------------------------------------

export async function getStoredInvites(): Promise<GeneratedInvite[]> {
  try {
    const stored = await AsyncStorage.getItem(INVITES_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[Invites] Failed to load stored invites:', error);
    return [];
  }
}

export async function saveStoredInvites(invites: GeneratedInvite[]): Promise<void> {
  await AsyncStorage.setItem(INVITES_STORAGE_KEY, JSON.stringify(invites));
}

export async function addStoredInvite(invite: GeneratedInvite): Promise<void> {
  const invites = await getStoredInvites();
  await saveStoredInvites([invite, ...invites]);
}

export async function deleteStoredInvite(id: string): Promise<void> {
  const invites = await getStoredInvites();
  await saveStoredInvites(invites.filter(i => i.id !== id));
}

// ---------------------------------------------------------------------------
// Invite generation
// ---------------------------------------------------------------------------

export interface GenerateInviteResult {
  invite: GeneratedInvite;
  payload: InvitePayload;
}

/**
 * Generate a new invite:
 *  1. Create a fresh Jellyfin user (username derived from the invitee name,
 *     random password) using the admin's connected account.
 *  2. Grant that user access to all libraries.
 *  3. Bundle Jellyfin + Sonarr + Radarr settings into a compressed,
 *     passphrase-encrypted invite code.
 *  4. Persist the invite locally so the admin can review/share it later.
 *
 * The passphrase is chosen by the admin and shared with the invitee
 * out-of-band — it is never embedded in the code/link.
 */
export async function generateInvite(options: {
  name: string;
  passphrase: string;
  settings: AppSettings;
  jellyfin: JellyfinService;
}): Promise<GenerateInviteResult> {
  const { name, passphrase, settings, jellyfin } = options;

  if (!settings.jellyfin) {
    throw new Error('Connect to Jellyfin before generating invites.');
  }

  const inviteName = name.trim();
  if (!inviteName) {
    throw new Error('Enter a name for the person you are inviting.');
  }

  const normalizedPassphrase = passphrase.trim();
  if (normalizedPassphrase.length < 4) {
    throw new Error(
      'Choose a passphrase of at least 4 characters. Share it with the invitee separately from the link.',
    );
  }

  const username = sanitizeUsername(inviteName);
  const password = generateInvitePassword(16);

  // 1. Create the Jellyfin user (fails if the account isn't an admin or the
  //    username already exists).
  const createdUser = await jellyfin.createUser(username, password);

  // 2. Grant access to all libraries.
  await jellyfin.grantUserAllLibraries(createdUser.Id);

  // 3. Build the invite payload from the admin's current settings.
  const payload: InvitePayload = {
    v: 1,
    name: inviteName,
    backendMode: settings.backendMode ?? 'mediarr',
    mediarrServer: settings.mediarrServer
      ? { ...settings.mediarrServer }
      : null,
    jellyfin: {
      serverUrl: settings.jellyfin.serverUrl,
      username,
      password,
    },
    sonarr: settings.sonarr
      ? {
          serverUrl: settings.sonarr.serverUrl,
          apiKey: settings.sonarr.apiKey,
          rootFolderPath: settings.sonarr.rootFolderPath,
          qualityProfileId: settings.sonarr.qualityProfileId,
        }
      : null,
    radarr: settings.radarr
      ? {
          serverUrl: settings.radarr.serverUrl,
          apiKey: settings.radarr.apiKey,
          rootFolderPath: settings.radarr.rootFolderPath,
          qualityProfileId: settings.radarr.qualityProfileId,
        }
      : null,
  };

  const code = await buildInviteCode(payload, normalizedPassphrase);
  const invite: GeneratedInvite = {
    id:
      Date.now().toString(36) +
      Math.random().toString(36).substring(2, 8),
    name: inviteName,
    username,
    password,
    passphrase: normalizedPassphrase,
    serverUrl: settings.jellyfin.serverUrl,
    code,
    inviteUrl: buildInviteUrl(code),
    createdAt: new Date().toISOString(),
  };

  // 4. Persist locally.
  await addStoredInvite(invite);

  return { invite, payload };
}
