import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Platform, ViewStyle } from 'react-native';
import { LiquidGlassView } from '@callstack/liquid-glass';
import {
  browseForPairingHosts,
  DiscoveredHost,
  isInvitePairingAvailable,
  sendInviteToHost,
} from '../services/invitePairing';
import { FocusableButton, FocusableInput } from './index';

interface SendInviteToTVProps {
  /** The invite code or link to deliver. */
  invite: string;
  style?: ViewStyle;
}

type Status = 'closed' | 'searching' | 'ready' | 'sending' | 'sent' | 'error';

/**
 * Sender side of LAN invite pairing (iPhone/Mac). Finds Apple TVs advertising
 * the pairing service and delivers an invite using the code shown on the TV.
 */
export function SendInviteToTV({ invite, style }: SendInviteToTVProps) {
  const available = isInvitePairingAvailable() && !Platform.isTV;

  const [status, setStatus] = useState<Status>('closed');
  const [hosts, setHosts] = useState<DiscoveredHost[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  const search = useCallback(async () => {
    setStatus('searching');
    setMessage('');
    try {
      const found = await browseForPairingHosts();
      setHosts(found);
      setSelectedId(found.length === 1 ? found[0].id : null);
      if (found.length === 0) {
        setStatus('error');
        setMessage(
          'No Apple TV found. On the Apple TV, open Mediora and choose “Receive invite”, then search again.',
        );
      } else {
        setStatus('ready');
      }
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Search failed.');
    }
  }, []);

  const open = async () => {
    setHosts([]);
    setSelectedId(null);
    setCode('');
    await search();
  };

  const handleSend = async () => {
    if (!selectedId) {
      setMessage('Choose an Apple TV first.');
      return;
    }
    if (code.trim().length < 4) {
      setMessage('Enter the code shown on the Apple TV.');
      return;
    }
    setStatus('sending');
    setMessage('');
    try {
      await sendInviteToHost(selectedId, code.trim(), invite);
      setStatus('sent');
      setMessage(
        'Invite sent. Finish the passphrase step on your Apple TV.',
      );
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error ? error.message : 'Could not send the invite.',
      );
    }
  };

  if (!available) return null;

  if (status === 'closed') {
    return (
      <FocusableButton
        title="Send to Apple TV"
        icon="tv-outline"
        variant="secondary"
        onPress={open}
        style={style}
      />
    );
  }

  return (
    <LiquidGlassView style={styles.panel} effect="clear">
      <Text style={styles.title}>Send to Apple TV</Text>

      {status === 'searching' ? (
        <Text style={styles.muted}>
          Searching for Apple TVs on your network…
        </Text>
      ) : null}

      {status === 'sent' ? (
        <Text style={styles.success}>{message}</Text>
      ) : null}

      {status !== 'sent' && hosts.length > 0 ? (
        <View style={styles.hostList}>
          {hosts.map(host => (
            <FocusableButton
              key={host.id}
              title={`${host.name}${selectedId === host.id ? ' ✓' : ''}`}
              variant={selectedId === host.id ? 'primary' : 'secondary'}
              onPress={() => setSelectedId(host.id)}
              style={styles.hostButton}
            />
          ))}
        </View>
      ) : null}

      {status !== 'sent' && hosts.length > 0 ? (
        <FocusableInput
          label="Code shown on the Apple TV"
          placeholder="e.g. 482913"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleSend}
        />
      ) : null}

      {message && status !== 'sent' ? (
        <Text style={styles.muted}>{message}</Text>
      ) : null}

      <View style={styles.buttonRow}>
        <FocusableButton
          title="Search again"
          variant="secondary"
          icon="refresh-outline"
          onPress={search}
          disabled={status === 'sending'}
          style={styles.rowButton}
        />
        {status === 'sent' ? (
          <FocusableButton
            title="Done"
            onPress={() => setStatus('closed')}
            style={styles.rowButton}
          />
        ) : (
          <FocusableButton
            title="Send"
            icon="paper-plane-outline"
            onPress={handleSend}
            loading={status === 'sending'}
            disabled={status === 'sending' || !selectedId}
            style={styles.rowButton}
          />
        )}
      </View>
    </LiquidGlassView>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: 16,
    marginTop: 12,
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  muted: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 19,
  },
  success: {
    fontSize: 14,
    color: '#30d158',
    lineHeight: 20,
  },
  hostList: {
    gap: 8,
  },
  hostButton: {
    alignSelf: 'stretch',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  rowButton: {
    flex: 1,
  },
});
