import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { LiquidGlassView } from '@callstack/liquid-glass';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSettings } from '../context';
import { JellyfinService } from '../services';
import { InvitePayload } from '../types';
import {
  decodeInviteCode,
  extractInviteCode,
  inspectInviteCode,
} from '../utils/inviteCode';
import { FocusableButton, FocusableInput } from './index';

interface InviteRedeemFormProps {
  /** Pre-filled code (e.g. from a deep link). */
  initialCode?: string;
  /** Called after settings are applied successfully. */
  onSuccess?: () => void;
  /** Give the first interactive element TV focus. */
  hasTVPreferredFocus?: boolean;
}

type RedeemStage =
  | 'input' // code entry
  | 'passphrase' // code parsed, passphrase required
  | 'confirm' // payload decrypted, awaiting confirmation
  | 'connecting'
  | 'done';

/**
 * Shared invite redemption flow:
 * enter code -> (passphrase if encrypted) -> review payload -> authenticate
 * against Jellyfin -> apply Jellyfin + Sonarr + Radarr settings locally.
 */
export function InviteRedeemForm({
  initialCode,
  onSuccess,
  hasTVPreferredFocus = false,
}: InviteRedeemFormProps) {
  const { settings, applyInviteSettings } = useSettings();

  const [stage, setStage] = useState<RedeemStage>('input');
  const [codeInput, setCodeInput] = useState(initialCode ?? '');
  const [extractedCode, setExtractedCode] = useState<string | null>(null);
  const [passphraseInput, setPassphraseInput] = useState('');
  const [payload, setPayload] = useState<InvitePayload | null>(null);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  const willReplaceExisting = useMemo(() => {
    return (
      !!(
        settings.jellyfin ||
        settings.sonarr ||
        settings.radarr ||
        settings.mediarrServer
      )
    );
  }, [
    settings.jellyfin,
    settings.sonarr,
    settings.radarr,
    settings.mediarrServer,
  ]);

  const handleSubmitCode = async () => {
    setError('');
    try {
      const code = extractInviteCode(codeInput);
      if (!code) {
        throw new Error(
          'That doesn\'t look like a valid invite code. Check the code or link and try again.',
        );
      }

      const kind = inspectInviteCode(code);
      if (kind === 'legacy') {
        // Unencrypted legacy code: decode directly.
        const parsed = await decodeInviteCode(code);
        setPayload(parsed);
        setStage('confirm');
      } else {
        setExtractedCode(code);
        setPassphraseInput('');
        setStage('passphrase');
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Invalid invite code.',
      );
    }
  };

  const handleSubmitPassphrase = async () => {
    if (!extractedCode) return;
    setError('');
    try {
      const parsed = await decodeInviteCode(extractedCode, passphraseInput);
      setPayload(parsed);
      setStage('confirm');
    } catch (decryptError) {
      setError(
        decryptError instanceof Error
          ? decryptError.message
          : 'Could not decrypt the invite code.',
      );
    }
  };

  const handleConfirm = async () => {
    if (!payload) return;
    setError('');
    setStage('connecting');

    try {
      // Authenticate with the invite's Jellyfin credentials so each device
      // gets its own access token + device id (the password itself is not
      // stored on the device).
      const service = new JellyfinService(payload.jellyfin.serverUrl);
      const authResponse = await service.authenticateByName(
        payload.jellyfin.username,
        payload.jellyfin.password,
      );

      await applyInviteSettings({
        jellyfin: {
          serverUrl: payload.jellyfin.serverUrl,
          accessToken: authResponse.AccessToken,
          userId: authResponse.User.Id,
          serverId: authResponse.ServerId,
          deviceId: service.getDeviceId(),
        },
        backendMode: payload.backendMode ?? 'mediarr',
        mediarrServer: payload.mediarrServer
          ? { ...payload.mediarrServer }
          : undefined,
        sonarr: payload.sonarr
          ? {
              serverUrl: payload.sonarr.serverUrl,
              apiKey: payload.sonarr.apiKey,
              rootFolderPath: payload.sonarr.rootFolderPath,
              qualityProfileId: payload.sonarr.qualityProfileId,
            }
          : undefined,
        radarr: payload.radarr
          ? {
              serverUrl: payload.radarr.serverUrl,
              apiKey: payload.radarr.apiKey,
              rootFolderPath: payload.radarr.rootFolderPath,
              qualityProfileId: payload.radarr.qualityProfileId,
            }
          : undefined,
      });

      setStage('done');
      setSuccessMessage(`Welcome, ${payload.name}! You're connected.`);
      onSuccess?.();
    } catch (connectError) {
      console.error('[Invite] Redemption failed:', connectError);
      setStage('confirm');
      const message =
        connectError instanceof Error ? connectError.message : 'Connection failed';
      setError(
        `Could not connect to the Jellyfin server.\n\n${message}\n\n` +
          'Make sure this device is on the same Tailscale network as the server, then try again.',
      );
    }
  };

  const handleResetToInput = () => {
    setStage('input');
    setExtractedCode(null);
    setPayload(null);
    setError('');
    setCodeInput('');
    setPassphraseInput('');
  };

  // ── Done state ──────────────────────────────────────────────────────────
  if (stage === 'done') {
    return (
      <View style={styles.centered}>
        <Icon name="checkmark-circle" size={64} color="#30d158" />
        <Text style={styles.successTitle}>You're all set!</Text>
        <Text style={styles.successText}>{successMessage}</Text>
        <FocusableButton
          title="Continue"
          onPress={() => onSuccess?.()}
          hasTVPreferredFocus={hasTVPreferredFocus}
          style={styles.doneButton}
        />
      </View>
    );
  }

  // ── Confirm + connecting state ──────────────────────────────────────────
  if ((stage === 'confirm' || stage === 'connecting') && payload) {
    return (
      <View style={styles.formContainer}>
        <Text style={styles.title}>Review invite</Text>
        <Text style={styles.description}>
          This invite will connect this device to:
        </Text>

        <LiquidGlassView style={styles.summaryCard} effect="clear">
          <SummaryRow label="Invite for" value={payload.name} />
          <SummaryRow label="Jellyfin" value={payload.jellyfin.serverUrl} />
          <SummaryRow label="Username" value={payload.jellyfin.username} />
          <SummaryRow
            label={
              payload.backendMode === 'mediarr-server'
                ? 'Mediora Server'
                : 'Backend'
            }
            value={
              payload.backendMode === 'mediarr-server'
                ? payload.mediarrServer?.serverUrl || 'Not included'
                : 'Legacy Sonarr + Radarr'
            }
          />
          <SummaryRow
            label="Sonarr"
            value={payload.sonarr ? payload.sonarr.serverUrl : 'Not included'}
          />
          <SummaryRow
            label="Radarr"
            value={payload.radarr ? payload.radarr.serverUrl : 'Not included'}
          />
        </LiquidGlassView>

        {willReplaceExisting && (
          <Text style={styles.warningText}>
            This will replace the existing connection settings on this device.
          </Text>
        )}

        {stage === 'confirm' && error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        <View style={styles.buttonRow}>
          <FocusableButton
            title="Back"
            variant="secondary"
            onPress={handleResetToInput}
            disabled={stage === 'connecting'}
            style={styles.flexButton}
          />
          <FocusableButton
            title="Connect"
            onPress={handleConfirm}
            loading={stage === 'connecting'}
            disabled={stage === 'connecting'}
            hasTVPreferredFocus={hasTVPreferredFocus}
            style={styles.flexButton}
          />
        </View>
      </View>
    );
  }

  // ── Passphrase state ────────────────────────────────────────────────────
  if (stage === 'passphrase') {
    return (
      <View style={styles.formContainer}>
        <Text style={styles.title}>Enter passphrase</Text>
        <Text style={styles.description}>
          This invite is protected with a passphrase. It was shared with you
          separately from the invite link (by the person who invited you).
        </Text>

        <FocusableInput
          label="Passphrase"
          placeholder="e.g. 482913"
          value={passphraseInput}
          onChangeText={setPassphraseInput}
          onSubmitEditing={handleSubmitPassphrase}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          error={error}
          hasTVPreferredFocus={hasTVPreferredFocus}
        />

        <View style={styles.buttonRow}>
          <FocusableButton
            title="Back"
            variant="secondary"
            onPress={handleResetToInput}
            style={styles.flexButton}
          />
          <FocusableButton
            title="Continue"
            onPress={handleSubmitPassphrase}
            disabled={!passphraseInput.trim()}
            style={styles.flexButton}
          />
        </View>
      </View>
    );
  }

  // ── Input state ─────────────────────────────────────────────────────────
  return (
    <View style={styles.formContainer}>
      <Text style={styles.title}>Enter invite code</Text>
      <Text style={styles.description}>
        Paste the invite link or code you received. Scanning the QR code or
        opening the link on this device fills it in automatically.
      </Text>

      <FocusableInput
        label="Invite code or link"
        placeholder="mediora://invite?c=..."
        value={codeInput}
        onChangeText={setCodeInput}
        onSubmitEditing={handleSubmitCode}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        error={error}
        hasTVPreferredFocus={hasTVPreferredFocus}
      />

      {error && !payload ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}

      <FocusableButton
        title="Continue"
        onPress={handleSubmitCode}
        disabled={!codeInput.trim()}
        style={styles.continueButton}
      />
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 22,
    marginBottom: 20,
  },
  errorText: {
    color: '#ff453a',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  warningText: {
    color: '#ffd60a',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    padding: 16,
    gap: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    fontWeight: '600',
  },
  summaryValue: {
    color: '#fff',
    fontSize: 14,
    flexShrink: 1,
    textAlign: 'right',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  flexButton: {
    flex: 1,
  },
  continueButton: {
    marginTop: 20,
  },
  doneButton: {
    marginTop: 12,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
  },
  successText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
});
