import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSettings, useServices } from '../context';
import { FocusableButton, FocusableInput } from '../components';
import { JellyfinService, SonarrService, RadarrService } from '../services';

type SettingsSection = 'jellyfin' | 'sonarr' | 'radarr';

export function SettingsScreen() {
  const {
    settings,
    updateJellyfinSettings,
    updateSonarrSettings,
    updateRadarrSettings,
    clearJellyfinSettings,
  } = useSettings();
  const { isJellyfinConnected, isSonarrConnected, isRadarrConnected } =
    useServices();

  const [activeSection, setActiveSection] = useState<SettingsSection>('jellyfin');

  return (
    <ScrollView style={styles.container}>
      {/* Section Tabs */}
      <View style={styles.tabsContainer}>
        <SettingsTab
          title="Jellyfin"
          isSelected={activeSection === 'jellyfin'}
          isConnected={isJellyfinConnected}
          onPress={() => setActiveSection('jellyfin')}
        />
        <SettingsTab
          title="Sonarr"
          isSelected={activeSection === 'sonarr'}
          isConnected={isSonarrConnected}
          onPress={() => setActiveSection('sonarr')}
        />
        <SettingsTab
          title="Radarr"
          isSelected={activeSection === 'radarr'}
          isConnected={isRadarrConnected}
          onPress={() => setActiveSection('radarr')}
        />
      </View>

      {/* Section Content */}
      <View style={styles.sectionContent}>
        {activeSection === 'jellyfin' && (
          <JellyfinSettings
            settings={settings.jellyfin}
            onUpdate={updateJellyfinSettings}
            onClear={clearJellyfinSettings}
          />
        )}
        {activeSection === 'sonarr' && (
          <SonarrSettings
            settings={settings.sonarr}
            onUpdate={updateSonarrSettings}
          />
        )}
        {activeSection === 'radarr' && (
          <RadarrSettings
            settings={settings.radarr}
            onUpdate={updateRadarrSettings}
          />
        )}
      </View>
    </ScrollView>
  );
}

interface SettingsTabProps {
  title: string;
  isSelected: boolean;
  isConnected: boolean;
  onPress: () => void;
}

function SettingsTab({
  title,
  isSelected,
  isConnected,
  onPress,
}: SettingsTabProps) {
  const titleContent = isConnected ? (
    <View style={styles.tabTitleContainer}>
      <Text style={styles.tabTitleText}>{title}</Text>
      <Icon name="checkmark-circle" size={18} color="#30d158" style={styles.tabCheckIcon} />
    </View>
  ) : title;

  return (
    <FocusableButton
      title={titleContent}
      onPress={onPress}
      variant={isSelected ? 'primary' : 'secondary'}
      size="medium"
      style={styles.tab}
    />
  );
}

// Jellyfin Settings Section
interface JellyfinSettingsProps {
  settings: {
    serverUrl: string;
    accessToken: string;
    userId: string;
    serverId: string;
    deviceId: string;
  } | null;
  onUpdate: (settings: {
    serverUrl: string;
    accessToken: string;
    userId: string;
    serverId: string;
    deviceId: string;
  } | null) => Promise<void>;
  onClear: () => Promise<void>;
}

function JellyfinSettings({ settings, onUpdate, onClear }: JellyfinSettingsProps) {
  const [serverUrl, setServerUrl] = useState('');
  const [quickConnectCode, setQuickConnectCode] = useState<string | null>(null);
  const [_quickConnectSecret, setQuickConnectSecret] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isConnected = !!settings?.accessToken;

  const handleTestConnection = async () => {
    if (!serverUrl.trim()) {
      setError('Please enter a server URL');
      return;
    }

    let normalizedUrl = serverUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'http://' + normalizedUrl;
    }

    setIsTesting(true);
    setError(null);
    setTestResult(null);

    try {
      console.log('[Settings] Testing connection to:', normalizedUrl);
      const testUrl = `${normalizedUrl}/System/Info/Public`;
      console.log('[Settings] Fetching:', testUrl);
      
      // Add timeout to fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('[Settings] Response status:', response.status);
      console.log('[Settings] Response headers:', JSON.stringify([...response.headers.entries()]));
      
      if (response.ok) {
        const data = await response.json();
        console.log('[Settings] Server info:', data);
        setTestResult(`✓ Connected to Jellyfin ${data.Version || 'server'}\nServer Name: ${data.ServerName || 'Unknown'}`);
      } else {
        const text = await response.text();
        console.log('[Settings] Error response body:', text);
        setTestResult(`⚠ Server responded with status ${response.status}`);
      }
    } catch (err) {
      console.error('[Settings] Test connection error details:', {
        name: err instanceof Error ? err.name : 'Unknown',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      
      let errorMsg = 'Connection test failed';
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorMsg = 'Connection timed out after 10 seconds';
        } else if (err.message.includes('Network request failed')) {
          errorMsg = 'Network request failed. Try:\n• Check server is accessible from Safari\n• Verify Tailscale is running\n• Try local IP instead (192.168.x.x)';
        } else {
          errorMsg = err.message;
        }
      }
      
      setError(errorMsg);
      setTestResult('✗ Cannot reach server');
    } finally {
      setIsTesting(false);
    }
  };

  const handleConnect = async () => {
    if (!serverUrl.trim()) {
      setError('Please enter a server URL');
      return;
    }

    // Validate and normalize URL
    let normalizedUrl = serverUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'http://' + normalizedUrl;
    }

    setIsConnecting(true);
    setError(null);
    setTestResult(null);

    try {
      console.log('[Settings] Connecting to Jellyfin server:', normalizedUrl);
      const service = new JellyfinService(normalizedUrl);
      const initResponse = await service.initiateQuickConnect();

      setQuickConnectCode(initResponse.Code);
      setQuickConnectSecret(initResponse.Secret);

      // Start polling for authentication
      pollingRef.current = setInterval(async () => {
        try {
          const status = await service.checkQuickConnectStatus(
            initResponse.Secret,
          );

          if (status.Authenticated) {
            clearInterval(pollingRef.current!);
            pollingRef.current = null;

            const authResponse = await service.authenticateWithQuickConnect(
              initResponse.Secret,
            );

            await onUpdate({
              serverUrl: normalizedUrl,
              accessToken: authResponse.AccessToken,
              userId: authResponse.User.Id,
              serverId: authResponse.ServerId,
              deviceId: service.getDeviceId(),
            });

            setQuickConnectCode(null);
            setQuickConnectSecret(null);
            setIsConnecting(false);
          }
        } catch (pollError) {
          console.error('Polling error:', pollError);
        }
      }, 2000);

      // Stop polling after 5 minutes
      setTimeout(() => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setQuickConnectCode(null);
          setQuickConnectSecret(null);
          setIsConnecting(false);
          setError('Quick Connect timed out. Please try again.');
        }
      }, 5 * 60 * 1000);
    } catch (err) {
      console.error('[Settings] Connection error:', err);
      setIsConnecting(false);
      setQuickConnectCode(null);
      setQuickConnectSecret(null);
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  };

  const handleDisconnect = async () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    await onClear();
    setQuickConnectCode(null);
    setQuickConnectSecret(null);
    setServerUrl('');
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  if (isConnected) {
    return (
      <View style={styles.sectionForm}>
        <View style={styles.connectedInfo}>
          <Text style={styles.connectedLabel}>Connected to Jellyfin</Text>
          <Text style={styles.connectedValue}>{settings.serverUrl}</Text>
        </View>
        <FocusableButton
          title="Disconnect"
          onPress={handleDisconnect}
          variant="danger"
          size="large"
        />
      </View>
    );
  }

  if (quickConnectCode) {
    return (
      <View style={styles.sectionForm}>
        <Text style={styles.quickConnectTitle}>Quick Connect Code</Text>
        <Text style={styles.quickConnectCode}>{quickConnectCode}</Text>
        <Text style={styles.quickConnectInstructions}>
          Enter this code in your Jellyfin dashboard under:{'\n'}
          Settings → Quick Connect → Enter Code
        </Text>
        <ActivityIndicator
          size="large"
          color="#fff"
          style={styles.spinner}
        />
        <Text style={styles.waitingText}>Waiting for authorization...</Text>
        <FocusableButton
          title="Cancel"
          onPress={() => {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            setQuickConnectCode(null);
            setQuickConnectSecret(null);
            setIsConnecting(false);
          }}
          variant="secondary"
          size="medium"
        />
      </View>
    );
  }

  return (
    <View style={styles.sectionForm}>
      <Text style={styles.sectionDescription}>
        Connect to your Jellyfin server using Quick Connect
      </Text>
      <Text style={styles.helperText}>
        Enter your server URL (e.g., http://192.168.1.100:8096 or https://jellyfin.mydomain.com)
      </Text>
      <FocusableInput
        label="Server URL"
        value={serverUrl}
        onChangeText={setServerUrl}
        placeholder="http://192.168.1.100:8096"
        autoCapitalize="none"
        autoCorrect={false}
        error={error || undefined}
      />
      {testResult && (
        <View style={styles.testResultContainer}>
          <Icon
            name={testResult.startsWith('✓') ? 'checkmark-circle' : testResult.startsWith('✗') ? 'close-circle' : 'warning'}
            size={24}
            color={testResult.startsWith('✓') ? '#30d158' : '#ff453a'}
            style={styles.testResultIcon}
          />
          <Text style={[styles.testResult, testResult.startsWith('✓') ? styles.testSuccess : null]}>
            {testResult.replace(/^[✓✗⚠]\s*/, '')}
          </Text>
        </View>
      )}
      <View style={styles.buttonRow}>
        <FocusableButton
          title="Test Connection"
          onPress={handleTestConnection}
          loading={isTesting}
          disabled={isTesting || isConnecting}
          variant="secondary"
          size="medium"
        />
        <FocusableButton
          title="Connect with Quick Connect"
          onPress={handleConnect}
          loading={isConnecting}
          disabled={isConnecting || isTesting}
          size="medium"
        />
      </View>
    </View>
  );
}

// Sonarr Settings Section
interface SonarrSettingsProps {
  settings: {
    serverUrl: string;
    apiKey: string;
    rootFolderPath: string;
    qualityProfileId: number;
  } | null;
  onUpdate: (
    settings: {
      serverUrl: string;
      apiKey: string;
      rootFolderPath: string;
      qualityProfileId: number;
    } | null,
  ) => Promise<void>;
}

function SonarrSettings({ settings, onUpdate }: SonarrSettingsProps) {
  // Force correct values - ignore any cached settings
  const [serverUrl, setServerUrl] = useState('http://100.121.105.34:8989');
  const [apiKey, setApiKey] = useState('6f44fe8b240547fcb116234394486060');
  const [rootFolderPath, setRootFolderPath] = useState(
    settings?.rootFolderPath || '',
  );
  const [qualityProfileId, setQualityProfileId] = useState(
    settings?.qualityProfileId?.toString() || '1',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

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
      
      console.log('[Settings] Testing Sonarr connection:', { url: normalizedUrl, apiKey: apiKey.substring(0, 8) + '...' });
      console.log('[Settings] API Key full length:', apiKey.trim().length);
      console.log('[Settings] API Key has spaces:', apiKey !== apiKey.trim());
      
      const service = new SonarrService(normalizedUrl, apiKey.trim());
      const result = await service.testConnection();
      
      console.log('[Settings] Sonarr test result:', result);
      setTestResult(result);

      if (result) {
        // Auto-populate root folder and quality profile
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
        
        // Auto-save settings after successful test
        if (rootFolders.length > 0 || qualityProfiles.length > 0) {
          await onUpdate({
            serverUrl: serverUrl.trim(),
            apiKey: apiKey.trim(),
            rootFolderPath: rootFolders.length > 0 ? rootFolders[0].path : rootFolderPath.trim(),
            qualityProfileId: qualityProfiles.length > 0 ? qualityProfiles[0].id : (parseInt(qualityProfileId, 10) || 1),
          });
        }
      } else {
        setErrorMessage('Connection failed. Verify the API key is copied exactly from Sonarr Settings → General → Security → API Key');
      }
    } catch (error) {
      console.error('[Settings] Sonarr test error:', error);
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
        await onUpdate({
          serverUrl: serverUrl.trim(),
          apiKey: apiKey.trim(),
          rootFolderPath: rootFolderPath.trim(),
          qualityProfileId: parseInt(qualityProfileId, 10) || 1,
        });
      } else {
        await onUpdate(null);
      }
    } catch (error) {
      console.error('Failed to save Sonarr settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.sectionForm}>
      <Text style={styles.sectionDescription}>
        Connect to Sonarr to request TV shows for download
      </Text>
      <FocusableInput
        label="Server URL"
        value={serverUrl}
        onChangeText={setServerUrl}
        placeholder="http://localhost:8989"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <FocusableInput
        label="API Key"
        value={apiKey}
        onChangeText={setApiKey}
        placeholder="Enter your Sonarr API key"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <FocusableInput
        label="Root Folder Path"
        value={rootFolderPath}
        onChangeText={setRootFolderPath}
        placeholder="/tv"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <FocusableInput
        label="Quality Profile ID"
        value={qualityProfileId}
        onChangeText={setQualityProfileId}
        placeholder="1"
        keyboardType="numeric"
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
  );
}

// Radarr Settings Section
interface RadarrSettingsProps {
  settings: {
    serverUrl: string;
    apiKey: string;
    rootFolderPath: string;
    qualityProfileId: number;
  } | null;
  onUpdate: (
    settings: {
      serverUrl: string;
      apiKey: string;
      rootFolderPath: string;
      qualityProfileId: number;
    } | null,
  ) => Promise<void>;
}

function RadarrSettings({ settings, onUpdate }: RadarrSettingsProps) {
  // Force correct values - ignore any cached settings
  const [serverUrl, setServerUrl] = useState('http://100.121.105.34:7878');
  const [apiKey, setApiKey] = useState('f142c8ab86c74ffd851dc63dbf538aa5');
  const [rootFolderPath, setRootFolderPath] = useState(
    settings?.rootFolderPath || '',
  );
  const [qualityProfileId, setQualityProfileId] = useState(
    settings?.qualityProfileId?.toString() || '1',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

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
      
      console.log('[Settings] Testing Radarr connection:', { url: normalizedUrl, apiKey: apiKey.substring(0, 8) + '...' });
      
      const service = new RadarrService(normalizedUrl, apiKey.trim());
      const result = await service.testConnection();
      
      console.log('[Settings] Radarr test result:', result);
      setTestResult(result);

      if (result) {
        // Auto-populate root folder and quality profile
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
        
        // Auto-save settings after successful test
        if (rootFolders.length > 0 || qualityProfiles.length > 0) {
          await onUpdate({
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
        await onUpdate({
          serverUrl: serverUrl.trim(),
          apiKey: apiKey.trim(),
          rootFolderPath: rootFolderPath.trim(),
          qualityProfileId: parseInt(qualityProfileId, 10) || 1,
        });
      } else {
        await onUpdate(null);
      }
    } catch (error) {
      console.error('Failed to save Radarr settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.sectionForm}>
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
      <FocusableInput
        label="Quality Profile ID"
        value={qualityProfileId}
        onChangeText={setQualityProfileId}
        placeholder="1"
        keyboardType="numeric"
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 48,
    paddingTop: 28,
    marginBottom: 36,
  },
  tab: {
    marginRight: 18,
  },
  tabTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabTitleText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  tabCheckIcon: {
    marginLeft: 6,
  },
  tabText: {
    color: '#fff',
  },
  testResultContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  testResultIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  sectionContent: {
    paddingHorizontal: 48,
    paddingBottom: 48,
  },
  sectionForm: {
    maxWidth: 600,
  },
  sectionDescription: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 18,
    marginBottom: 28,
    lineHeight: 26,
    fontWeight: '500',
  },
  helperText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 15,
    marginBottom: 18,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 20,
  },
  testResult: {
    fontSize: 17,
    marginBottom: 18,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  testSuccess: {
    color: 'rgba(48, 209, 88, 0.95)',
  },
  testFailure: {
    color: 'rgba(255, 69, 58, 0.95)',
  },
  connectedInfo: {
    marginBottom: 28,
    padding: 24,
    backgroundColor: 'rgba(26, 26, 26, 0.6)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(48, 209, 88, 0.3)',
    shadowColor: 'rgba(48, 209, 88, 0.5)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  connectedLabel: {
    color: 'rgba(48, 209, 88, 0.95)',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  connectedValue: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 17,
    fontWeight: '500',
  },
  quickConnectTitle: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  quickConnectCode: {
    color: '#fff',
    fontSize: 72,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 20,
    marginBottom: 28,
    fontFamily: 'monospace',
    textShadowColor: 'rgba(10, 132, 255, 0.5)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  quickConnectInstructions: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 36,
    fontWeight: '500',
  },
  spinner: {
    marginBottom: 20,
  },
  waitingText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 17,
    textAlign: 'center',
    marginBottom: 28,
    fontWeight: '500',
  },
});
