import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Share,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { LiquidGlassView } from '@callstack/liquid-glass';
import { useSettings, useServices } from '../context';
import { FocusableButton, FocusableInput, QRCode } from '../components';
import {
  generateInvite,
  getStoredInvites,
  deleteStoredInvite,
} from '../services/invites';
import { GeneratedInvite } from '../types';
import { generateInvitePassphrase } from '../utils/inviteCode';
import { useDeviceType } from '../hooks/useResponsive';

/**
 * Invites: lets an admin generate invite codes that bundle their Jellyfin
 * (fresh user), Sonarr, and Radarr settings into a single shareable code/link
 * with a QR code. Generated invites are kept locally for review.
 */

interface InvitesContentProps {
  isStandaloneScreen?: boolean;
}

export function InvitesSection() {
  return <InvitesContent />;
}

export function InvitesScreen() {
  return <InvitesContent isStandaloneScreen />;
}

function InvitesContent({ isStandaloneScreen = false }: InvitesContentProps) {
  const { settings } = useSettings();
  const { jellyfin } = useServices();
  const { isMobile } = useDeviceType();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [invites, setInvites] = useState<GeneratedInvite[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [passphraseInput, setPassphraseInput] = useState(() =>
    generateInvitePassphrase(6),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [justGenerated, setJustGenerated] = useState<GeneratedInvite | null>(
    null,
  );

  const refreshInvites = useCallback(async () => {
    const stored = await getStoredInvites();
    setInvites(stored);
  }, []);

  useEffect(() => {
    refreshInvites();
  }, [refreshInvites]);

  useEffect(() => {
    let cancelled = false;
    const checkAdmin = async () => {
      if (!jellyfin) {
        setIsAdmin(false);
        return;
      }
      const admin = await jellyfin.isCurrentUserAdmin();
      if (!cancelled) setIsAdmin(admin);
    };
    checkAdmin();
    return () => {
      cancelled = true;
    };
  }, [jellyfin]);

  const handleGenerate = async () => {
    if (!jellyfin || !settings.jellyfin) {
      setGenerateError('Connect to Jellyfin first.');
      return;
    }
    if (!nameInput.trim()) {
      setGenerateError('Enter a name for the person you are inviting.');
      return;
    }

    setIsGenerating(true);
    setGenerateError('');
    try {
      const { invite } = await generateInvite({
        name: nameInput,
        passphrase: passphraseInput,
        settings,
        jellyfin,
      });
      setJustGenerated(invite);
      setExpandedId(invite.id);
      setNameInput('');
      // Fresh passphrase suggestion for the next invite.
      setPassphraseInput(generateInvitePassphrase(6));
      await refreshInvites();
    } catch (error) {
      console.error('[Invites] Generation failed:', error);
      setGenerateError(
        error instanceof Error ? error.message : 'Failed to generate invite.',
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = (invite: GeneratedInvite) => {
    Alert.alert(
      'Delete invite',
      `Delete the invite for ${invite.name}? This only removes the record from this device — the Jellyfin user "${invite.username}" and any devices already connected are unaffected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteStoredInvite(invite.id);
            if (justGenerated?.id === invite.id) setJustGenerated(null);
            await refreshInvites();
          },
        },
      ],
    );
  };

  const handleShare = async (invite: GeneratedInvite) => {
    const message = `Mediora invite for ${invite.name}: ${invite.inviteUrl}`;
    if (Platform.OS === 'ios' && !Platform.isTV) {
      try {
        await Share.share({ message });
      } catch (error) {
        console.error('[Invites] Share failed:', error);
      }
    } else {
      Alert.alert(
        'Invite link',
        `Send this link to ${invite.name}:\n\n${invite.inviteUrl}`,
      );
    }
  };

  const redeemButton = (
    <FocusableButton
      title="Redeem an invite code"
      variant="secondary"
      icon="ticket-outline"
      onPress={() => navigation.navigate('InviteRedeem', { code: undefined })}
      style={styles.redeemButton}
    />
  );

  const contentPadding = isStandaloneScreen
    ? {
        paddingTop: isMobile ? insets.top + 72 : 48,
        paddingBottom: isMobile ? insets.bottom + 24 : 48,
        paddingHorizontal: isMobile ? 16 : 48,
      }
    : undefined;

  const content = (
    <>
      <Text style={[styles.heading, isMobile && styles.headingMobile]}>
        Invites
      </Text>
      <Text style={styles.subheading}>
        Generate an invite code to share your Mediora setup — a new Jellyfin
        account is created and bundled with your Jellyfin, Sonarr, and Radarr
        settings.
      </Text>

      {/* ── Generate (admin only) ─────────────────────────────── */}
      {isAdmin === null ? (
        <ActivityIndicator color="#fff" style={styles.loading} />
      ) : isAdmin ? (
        <LiquidGlassView style={styles.generateCard} effect="clear">
          <Text style={styles.cardTitle}>Generate new invite</Text>
          {settings.sonarr || settings.radarr ? null : (
            <Text style={styles.noteText}>
              Tip: connect Sonarr and Radarr in Settings first so requests
              are included in the invite.
            </Text>
          )}
          <FocusableInput
            label="Invitee name"
            placeholder="e.g. sister"
            value={nameInput}
            onChangeText={setNameInput}
            onSubmitEditing={handleGenerate}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            hasTVPreferredFocus={isAdmin && invites.length === 0}
          />
          <FocusableInput
            label="Passphrase"
            placeholder="e.g. 482913"
            value={passphraseInput}
            onChangeText={setPassphraseInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
          />
          <Text style={styles.passphraseHint}>
            The invitee must enter this passphrase along with the invite
            code. Share it separately from the link — by phone, in person,
            or a different messaging app.
          </Text>
          {generateError ? (
            <Text style={styles.errorText}>{generateError}</Text>
          ) : null}
          <FocusableButton
            title={isGenerating ? 'Generating...' : 'Generate invite'}
            onPress={handleGenerate}
            loading={isGenerating}
            disabled={isGenerating || !nameInput.trim()}
            style={styles.generateButton}
          />
        </LiquidGlassView>
      ) : (
        <LiquidGlassView style={styles.generateCard} effect="clear">
          <Text style={styles.cardTitle}>Generate invites</Text>
          <Text style={styles.noteText}>
            Your Jellyfin account must be an administrator to generate
            invites.
          </Text>
        </LiquidGlassView>
      )}

      {/* ── Just-generated invite ─────────────────────────────── */}
      {justGenerated && (
        <InviteCard
          invite={justGenerated}
          isExpanded={expandedId === justGenerated.id}
          onToggle={() =>
            setExpandedId(
              expandedId === justGenerated.id ? null : justGenerated.id,
            )
          }
          onShare={handleShare}
          onDelete={handleDelete}
          highlight
          isMobile={isMobile}
        />
      )}

      {/* ── Stored invites ────────────────────────────────────── */}
      {invites.length > 0 && (
        <Text style={styles.sectionTitle}>Previous invites</Text>
      )}
      {invites
        .filter(i => i.id !== justGenerated?.id)
        .map(invite => (
          <InviteCard
            key={invite.id}
            invite={invite}
            isExpanded={expandedId === invite.id}
            onToggle={() =>
              setExpandedId(expandedId === invite.id ? null : invite.id)
            }
            onShare={handleShare}
            onDelete={handleDelete}
            isMobile={isMobile}
          />
        ))}

      {invites.length === 0 && !justGenerated && (
        <Text style={styles.emptyText}>
          No invites yet. Generate one to get started.
        </Text>
      )}

      {/* ── Redeem ────────────────────────────────────────────── */}
      {redeemButton}
    </>
  );

  return (
    <View style={styles.wrapper}>
      {isStandaloneScreen && isMobile && (
        <View style={[styles.backButtonContainer, { top: insets.top + 8 }]}>
          <LiquidGlassView
            style={styles.backButtonGlass}
            effect="regular"
            tintColor="rgba(255, 255, 255, 0.25)">
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}>
              <Icon name="arrow-back" size={28} color="rgba(60, 60, 67, 0.85)" />
            </TouchableOpacity>
          </LiquidGlassView>
        </View>
      )}

      {isStandaloneScreen ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={contentPadding}
          keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      ) : (
        <View>{content}</View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------

interface InviteCardProps {
  invite: GeneratedInvite;
  isExpanded: boolean;
  onToggle: () => void;
  onShare: (invite: GeneratedInvite) => void;
  onDelete: (invite: GeneratedInvite) => void;
  isMobile: boolean;
  highlight?: boolean;
}

function InviteCard({
  invite,
  isExpanded,
  onToggle,
  onShare,
  onDelete,
  isMobile,
  highlight = false,
}: InviteCardProps) {
  const created = new Date(invite.createdAt);
  const dateLabel = isNaN(created.getTime())
    ? ''
    : created.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

  return (
    <LiquidGlassView
      style={[styles.inviteCard, highlight && styles.inviteCardHighlight]}
      effect="clear">
      <TouchableOpacity
        style={styles.inviteHeader}
        onPress={onToggle}
        activeOpacity={0.7}>
        <View style={styles.inviteHeaderInfo}>
          <Text style={styles.inviteName}>{invite.name}</Text>
          <Text style={styles.inviteMeta}>
            {invite.username} · {invite.serverUrl}
            {dateLabel ? ` · ${dateLabel}` : ''}
          </Text>
        </View>
        <Icon
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={22}
          color="rgba(255, 255, 255, 0.6)"
        />
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.inviteExpanded}>
          <View style={styles.qrRow}>
            <View style={styles.qrWrap}>
              <QRCode
                value={invite.inviteUrl}
                size={isMobile ? 190 : 240}
              />
            </View>
            <View style={styles.credentialColumn}>
              <CredentialRow label="Username" value={invite.username} />
              <CredentialRow label="Password" value={invite.password} />
              <CredentialRow label="Passphrase" value={invite.passphrase} />
              <CredentialRow label="Jellyfin" value={invite.serverUrl} />
            </View>
          </View>

          <Text style={styles.linkLabel}>Invite link</Text>
          <Text style={styles.linkText} selectable>
            {invite.inviteUrl}
          </Text>
          <Text style={styles.linkHint}>
            Send this link to the invitee — opening it on their iPhone or Mac
            sets everything up automatically. On Apple TV, enter the link
            manually or scan the QR code from another device. Share the
            passphrase separately: both are required to redeem.
          </Text>

          <View style={styles.cardButtons}>
            <FocusableButton
              title="Share"
              icon="share-outline"
              onPress={() => onShare(invite)}
              style={styles.cardButton}
            />
            <FocusableButton
              title="Delete"
              variant="danger"
              icon="trash-outline"
              onPress={() => onDelete(invite)}
              style={styles.cardButton}
            />
          </View>
        </View>
      )}
    </LiquidGlassView>
  );
}

function CredentialRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.credentialRow}>
      <Text style={styles.credentialLabel}>{label}</Text>
      <Text style={styles.credentialValue} selectable numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: {
    flex: 1,
  },
  heading: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  headingMobile: {
    fontSize: 26,
  },
  subheading: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 720,
  },
  loading: {
    marginVertical: 24,
  },
  generateCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: 20,
    marginBottom: 24,
    maxWidth: 720,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  noteText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.55)',
    lineHeight: 20,
    marginBottom: 12,
  },
  passphraseHint: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.45)',
    lineHeight: 19,
    marginTop: 10,
    marginBottom: 4,
  },
  errorText: {
    color: '#ff453a',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  generateButton: {
    marginTop: 16,
    alignSelf: 'flex-start',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.45)',
    fontStyle: 'italic',
    marginBottom: 24,
  },
  redeemButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  inviteCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 12,
    maxWidth: 720,
    overflow: 'hidden',
  },
  inviteCardHighlight: {
    borderColor: '#30d158',
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  inviteHeaderInfo: {
    flex: 1,
    marginRight: 12,
  },
  inviteName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  inviteMeta: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.55)',
  },
  inviteExpanded: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  qrRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  qrWrap: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 0,
  },
  credentialColumn: {
    flex: 1,
    gap: 10,
    paddingTop: 4,
  },
  credentialRow: {
    flexDirection: 'column',
  },
  credentialLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  credentialValue: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  linkLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  linkText: {
    fontSize: 13,
    color: '#a78bfa',
    marginBottom: 6,
  },
  linkHint: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    lineHeight: 19,
    marginBottom: 12,
  },
  cardButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cardButton: {
    flex: 1,
  },
  backButtonContainer: {
    position: 'absolute',
    left: 16,
    zIndex: 200,
  },
  backButtonGlass: {
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
