import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { LiquidGlassView } from '@callstack/liquid-glass';
import { useSettings } from '../context';
import { FocusableButton, FocusableInput } from '../components';
import { SonarrService } from '../services';
import { useDeviceType } from '../hooks/useResponsive';
import { scaleFontSize, scaleSize } from '../utils/scaling';

export function MedioraServerSettingsScreen() {
  const { settings, updateMediarrServer, updateBackendMode } = useSettings();
  const { isMobile } = useDeviceType();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [serverUrl, setServerUrl] = useState(
    settings.mediarrServer?.serverUrl || '',
  );
  const [apiKey, setApiKey] = useState(settings.mediarrServer?.apiKey || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const isActive = settings.backendMode === 'mediarr-server';

  const normalizeUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return `http://${trimmed}`;
    }
    return trimmed;
  };

  const handleTest = async () => {
    if (!serverUrl.trim() || !apiKey.trim()) return;

    setIsTesting(true);
    setTestResult(null);
    setErrorMessage('');

    try {
      // mediora-server speaks the Sonarr v3 API, so a Sonarr system-status
      // check verifies both reachability and the API key.
      const service = new SonarrService(normalizeUrl(serverUrl), apiKey.trim());
      const result = await service.testConnection();

      setTestResult(result);

      if (!result) {
        setErrorMessage(
          'Connection failed. Verify the URL and API key from your mediora-server .env (SONARR_RADARR_API_KEY).',
        );
      }
    } catch (error) {
      console.error('[Settings] Mediora Server test error:', error);
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
        await updateMediarrServer({
          serverUrl: normalizeUrl(serverUrl),
          apiKey: apiKey.trim(),
        });
        // Connecting here means "use mediora-server for requests", so switch
        // the backend mode to take effect immediately.
        await updateBackendMode('mediarr-server');
      } else {
        await updateMediarrServer(null);
        await updateBackendMode('mediarr');
      }
    } catch (error) {
      console.error('Failed to save mediora-server settings:', error);
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
            <Icon name="cloud-outline" size={24} color="rgba(10, 132, 255, 0.95)" />
            <Text style={styles.sectionTitle}>Mediora Server Settings</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Connect directly to mediora-server to request movies and TV shows
            for download. It replaces separate Sonarr and Radarr servers.
          </Text>
          {isActive && (
            <Text style={styles.activeNote}>
              Mediora Server is the active backend.
            </Text>
          )}
          <FocusableInput
            label="Server URL"
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://localhost:4000"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FocusableInput
            label="API Key"
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="Enter your mediora-server API key"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
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
    fontSize: scaleFontSize(18),
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sectionDescription: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: scaleFontSize(16),
    marginBottom: scaleSize(24),
    lineHeight: scaleFontSize(24),
    fontWeight: '500',
  },
  activeNote: {
    color: 'rgba(48, 209, 88, 0.95)',
    fontSize: scaleFontSize(15),
    marginBottom: scaleSize(16),
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 16,
  },
  testResult: {
    fontSize: scaleFontSize(15),
    marginBottom: scaleSize(16),
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
