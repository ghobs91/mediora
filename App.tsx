/**
 * Mediora - Apple tvOS Media App
 * A media center app for browsing Jellyfin, searching TMDB,
 * and requesting content via Sonarr/Radarr
 */

import React from 'react';
import { StatusBar, StyleSheet, View, LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';
import { SettingsProvider, ServicesProvider, useSettings } from './src/context';
import { AppNavigator } from './src/navigation';
import { LoadingScreen } from './src/components';

// Enable native screens for better performance
enableScreens();

// Ignore specific warnings that are common in tvOS development
LogBox.ignoreLogs([
  'Sending `onAnimatedValueUpdate` with no listeners registered',
  'Non-serializable values were found in the navigation state',
]);

function AppContent() {
  const { isLoading } = useSettings();

  if (isLoading) {
    return <LoadingScreen message="Loading Mediora..." />;
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
