import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidGlassView } from '@callstack/liquid-glass';
import Icon from 'react-native-vector-icons/Ionicons';
import { FocusableButton, InviteRedeemForm } from '../components';
import { consumeInviteUrl } from '../utils/inviteCode';
import { useDeviceType } from '../hooks/useResponsive';

interface OnboardingScreenProps {
  /** Reveals the main app so the user can configure manually in Settings. */
  onSetupManually: () => void;
}

/**
 * First-run experience shown when no Jellyfin connection is configured:
 * redeem an invite code (deep links handled here) or set up manually.
 */
export function OnboardingScreen({ onSetupManually }: OnboardingScreenProps) {
  const [view, setView] = useState<'welcome' | 'redeem'>('welcome');
  const [deepLinkCode, setDeepLinkCode] = useState<string | undefined>(
    undefined,
  );
  const insets = useSafeAreaInsets();
  const { isMobile } = useDeviceType();

  // Handle deep links: initial URL on cold start + URL events while running.
  useEffect(() => {
    let isMounted = true;

    const handleUrl = (url: string | null) => {
      if (!url) return;
      const code = consumeInviteUrl(url);
      if (code && isMounted) {
        setDeepLinkCode(code);
        setView('redeem');
      }
    };

    Linking.getInitialURL()
      .then(handleUrl)
      .catch(err =>
        console.error('[Onboarding] Failed to read initial URL:', err),
      );

    const subscription = Linking.addEventListener('url', event =>
      handleUrl(event.url),
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  const handleBackToWelcome = () => {
    setView('welcome');
    setDeepLinkCode(undefined);
  };

  const scrollContentStyle = {
    flexGrow: 1,
    justifyContent: 'center' as const,
    paddingTop: insets.top + (isMobile ? 24 : 48),
    paddingBottom: insets.bottom + (isMobile ? 24 : 48),
    paddingHorizontal: isMobile ? 20 : 48,
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={scrollContentStyle}>
        <View style={styles.inner}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Icon name="play" size={40} color="#fff" />
            </View>
            <Text style={[styles.title, isMobile && styles.titleMobile]}>
              Welcome to Mediora
            </Text>
            <Text style={styles.subtitle}>
              Your media hub for Jellyfin, Sonarr, and Radarr.
            </Text>
          </View>

          {view === 'welcome' ? (
            <LiquidGlassView style={styles.card} effect="clear">
              <Text style={styles.cardTitle}>Let's get connected</Text>
              <Text style={styles.cardText}>
                If someone shared an invite with you, enter it and everything
                will be configured automatically. Otherwise, set up your
                servers manually.
              </Text>

              <FocusableButton
                title="Enter invite code"
                icon="ticket-outline"
                onPress={() => setView('redeem')}
                hasTVPreferredFocus
                style={styles.cardButton}
              />
              <FocusableButton
                title="Set up manually"
                variant="secondary"
                icon="settings-outline"
                onPress={onSetupManually}
                style={styles.cardButton}
              />
            </LiquidGlassView>
          ) : (
            <LiquidGlassView style={styles.card} effect="clear">
              <InviteRedeemForm
                initialCode={deepLinkCode}
                hasTVPreferredFocus={Platform.isTV}
              />
              <FocusableButton
                title="Back"
                variant="secondary"
                onPress={handleBackToWelcome}
                style={styles.backButton}
              />
            </LiquidGlassView>
          )}
        </View>
      </ScrollView>
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
  inner: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBadge: {
    width: 84,
    height: 84,
    borderRadius: 22,
    backgroundColor: 'rgba(10, 132, 255, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  titleMobile: {
    fontSize: 28,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 8,
    textAlign: 'center',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: 24,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  cardText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 22,
    marginBottom: 20,
  },
  cardButton: {
    marginBottom: 12,
    alignSelf: 'stretch',
  },
  backButton: {
    marginTop: 8,
    alignSelf: 'stretch',
  },
});
