import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { LiquidGlassView } from '@callstack/liquid-glass';
import { useSettings } from '../context';
import { FocusableButton, FocusableInput } from '../components';
import { RadarrService } from '../services';
import { useDeviceType } from '../hooks/useResponsive';
import { DEV_CONFIG } from '../config/dev';

export function RadarrSettingsScreen() {
  const { settings, updateRadarrSettings } = useSettings();
  const { isMobile } = useDeviceType();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [serverUrl, setServerUrl] = useState(
    settings.radarr?.serverUrl || (__DEV__ ? DEV_CONFIG.radarr.url : '')
  );
  const [apiKey, setApiKey] = useState(
    settings.radarr?.apiKey || (__DEV__ ? DEV_CONFIG.radarr.apiKey : '')
  );
  const [rootFolderPath, setRootFolderPath] = useState(
    settings.radarr?.rootFolderPath || '',
  );
  const [qualityProfileId, setQualityProfileId] = useState(
    settings.radarr?.qualityProfileId?.toString() || '1',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!serverUrl && settings.jellyfin?.serverUrl) {
      try {
        const jellyfinUrl = settings.jellyfin.serverUrl;
        const match = jellyfinUrl.match(/^(https?:\/\/[^:]+)(:\d+)?/);
        if (match) {
          const baseUrl = `${match[1]}:7878`;
          setServerUrl(baseUrl);
        }
      } catch (err) {
        console.log('[Radarr] Could not parse Jellyfin URL:', err);
      }
    }
  }, [settings.jellyfin?.serverUrl, serverUrl]);

  const handleTest = async () => {
    if (!serverUrl.trim() || !apiKey.trim()) return;

    setIsTesting(true);
    setTestResult(null);
    setErrorMessage('');

    try {
      let normalizedUrl = serverUrl.trim();
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'http://' + normalizedUrl;
      }
      
      const service = new RadarrService(normalizedUrl, apiKey.trim());
      const result = await service.testConnection();
      
      setTestResult(result);

      if (result) {
        const [rootFolders, qualityProfiles] = await Promise.all([
          service.getRootFolders(),
          service.getQualityProfiles(),
        ]);

        if (rootFolders.length > 0 && !rootFolderPath) {
          setRootFolderPath(rootFolders[0].path);
        }
        if (qualityProfiles.length > 0 && !qualityProfileId) {
          setQualityProfileId(qualityProfiles[0].id.toString());
        }
        
        if (rootFolders.length > 0 || qualityProfiles.length > 0) {
          await updateRadarrSettings({
            serverUrl: serverUrl.trim(),
            apiKey: apiKey.trim(),
            rootFolderPath: rootFolders.length > 0 ? rootFolders[0].path : rootFolderPath.trim(),
            qualityProfileId: qualityProfiles.length > 0 ? qualityProfiles[0].id : (parseInt(qualityProfileId, 10) || 1),
          });
        }
      } else {
        setErrorMessage('Connection failed. Check URL and API key.');
      }
    } catch (error) {
      console.error('[Settings] Radarr test error:', error);
      setTestResult(false);
      setErrorMessage('Network error. Server may not be reachable.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (serverUrl.trim() && apiKey.trim()) {
        let normalizedUrl = serverUrl.trim();
        if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
          normalizedUrl = 'http://' + normalizedUrl;
        }
        let finalRootFolderPath = rootFolderPath.trim();
        try {
          const service = new RadarrService(normalizedUrl, apiKey.trim());
          const rootFolders = await service.getRootFolders();
          if (rootFolders.length > 0) {
            finalRootFolderPath = rootFolders[0].path;
            setRootFolderPath(finalRootFolderPath);
          }
        } catch (err) {
          console.warn('[Radarr] Could not fetch root folders on save:', err);
        }
        await updateRadarrSettings({
          serverUrl: normalizedUrl,
          apiKey: apiKey.trim(),
          rootFolderPath: finalRootFolderPath,
          qualityProfileId: parseInt(qualityProfileId, 10) || 1,
        });
      } else {
        await updateRadarrSettings(null);
      }
    } catch (error) {
      console.error('Failed to save Radarr settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const dynamicStyles = {
    contentContainer: {
      paddingTop: isMobile ? insets.top + 72 : 48,
      paddingBottom: isMobile ? insets.bottom + 100 : 48,
      paddingHorizontal: isMobile ? 16 : 48,
    },
  };

  return (
    <View style={styles.wrapper}>
      {isMobile && (
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
      
      <ScrollView style={styles.container} contentContainerStyle={dynamicStyles.contentContainer}>
        <View style={styles.sectionForm}>
          <View style={styles.sectionHeader}>
            <Icon name="film-outline" size={24} color="rgba(10, 132, 255, 0.95)" />
            <Text style={styles.sectionTitle}>Radarr Settings</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Connect to Radarr to request movies for download
          </Text>
          <FocusableInput
            label="Server URL"
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://localhost:7878"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FocusableInput
            label="API Key"
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="Enter your Radarr API key"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <FocusableInput
            label="Root Folder Path"
            value={rootFolderPath}
            onChangeText={setRootFolderPath}
            placeholder="/movies"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {errorMessage !== '' && (
            <Text style={styles.testFailure}>
              {errorMessage}
            </Text>
          )}
          {testResult !== null && (
            <Text
              style={[
                styles.testResult,
                testResult ? styles.testSuccess : styles.testFailure,
              ]}>
              {testResult ? 'Connection successful!' : 'Connection failed'}
            </Text>
          )}
          <View style={styles.buttonRow}>
            <FocusableButton
              title="Test Connection"
              onPress={handleTest}
              loading={isTesting}
              variant="secondary"
              size="medium"
            />
            <FocusableButton
              title="Save"
              onPress={handleSave}
              loading={isSaving}
              size="medium"
            />
          </View>
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
  container: {
    flex: 1,
  },
  backButtonContainer: {
    position: 'absolute',
    left: 16,
    zIndex: 100,
  },
  backButtonGlass: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: 'rgba(139, 92, 246, 0.6)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  backButton: {
    padding: 10,
    backgroundColor: 'transparent',
  },
  sectionForm: {
    width: '100%',
    maxWidth: 600,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  sectionTitle: {
    color: 'rgba(10, 132, 255, 0.95)',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sectionDescription: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    marginBottom: 24,
    lineHeight: 24,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 16,
  },
  testResult: {
    fontSize: 15,
    marginBottom: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  testSuccess: {
    color: 'rgba(48, 209, 88, 0.95)',
  },
  testFailure: {
    color: 'rgba(255, 69, 58, 0.95)',
  },
});
