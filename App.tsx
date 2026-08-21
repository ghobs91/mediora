/**
 * Mediora - Apple tvOS Media App
 * A media center app for browsing Jellyfin, searching TMDB,
 * and requesting content via Sonarr/Radarr
 */

import React, { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, View, LogBox } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';
import { SettingsProvider, ServicesProvider, useSettings } from './src/context';
import { AppNavigator } from './src/navigation';
import { LoadingScreen } from './src/components';
import { OnboardingScreen } from './src/screens';

// Enable native screens for better performance
enableScreens();

// Ignore specific warnings that are common in tvOS development
LogBox.ignoreLogs([
  'Sending `onAnimatedValueUpdate` with no listeners registered',
  'Non-serializable values were found in the navigation state',
]);

const ONBOARDING_SKIPPED_KEY = '@mediora/onboardingSkipped';

function AppContent() {
  const { settings, isLoading } = useSettings();
  const [onboardingStatus, setOnboardingStatus] = useState<
    'loading' | 'show' | 'hide'
  >('loading');

  // Read the skip flag: users who opt into manual setup shouldn't see
  // onboarding again on this device.
  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(ONBOARDING_SKIPPED_KEY)
      .then(skipped => {
        if (isMounted) {
          setOnboardingStatus(skipped === 'true' ? 'hide' : 'show');
        }
      })
      .catch(() => {
        if (isMounted) setOnboardingStatus('show');
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Once a connection is configured, clear the skip flag so onboarding
  // reappears if settings are later cleared.
  useEffect(() => {
    if (settings.jellyfin) {
      AsyncStorage.removeItem(ONBOARDING_SKIPPED_KEY).catch(() => {});
    }
  }, [settings.jellyfin]);

  if (isLoading || onboardingStatus === 'loading') {
    return <LoadingScreen message="Loading Mediora..." />;
  }

  // First run with no connection configured: offer invite code or manual setup.
  if (!settings.jellyfin && onboardingStatus === 'show') {
    return (
      <OnboardingScreen
        onSetupManually={() => {
          AsyncStorage.setItem(ONBOARDING_SKIPPED_KEY, 'true').catch(() => {});
          setOnboardingStatus('hide');
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <AppNavigator />
    </View>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <ServicesProvider>
          <AppContent />
        </ServicesProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});

export default App;
