import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSettings, useServices } from '../context';
import { FocusableButton, FocusableInput } from '../components';
import { JellyfinService, SonarrService, RadarrService, IPTV_REGIONS, IPTVCountry } from '../services';

type SettingsSection = 'jellyfin' | 'sonarr' | 'radarr' | 'livetv';

export function SettingsScreen() {
  const {
    settings,
    updateJellyfinSettings,
    updateSonarrSettings,
    updateRadarrSettings,
    updateIPTVSettings,
    clearJellyfinSettings,
  } = useSettings();
  const { isJellyfinConnected, isSonarrConnected, isRadarrConnected } =
    useServices();

  const [activeSection, setActiveSection] = useState<SettingsSection>('jellyfin');

  const hasIPTVCountries = (settings.iptv?.selectedCountries?.length ?? 0) > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
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
        <SettingsTab
          title="Live TV"
          isSelected={activeSection === 'livetv'}
          isConnected={hasIPTVCountries}
          onPress={() => setActiveSection('livetv')}
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
        {activeSection === 'livetv' && (
          <LiveTVSettings
            settings={settings.iptv}
            onUpdate={updateIPTVSettings}
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
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState({ current: 0, total: 0 });
  const [discoveredServers, setDiscoveredServers] = useState<Array<{address: string; name: string; id: string}>>([]);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isConnected = !!settings?.accessToken;

  const handleDiscoverServers = async () => {
    setIsDiscovering(true);
    setError(null);
    setDiscoveredServers([]);
    setDiscoveryProgress({ current: 0, total: 0 });
    
    try {
      console.log('[Settings] Starting server discovery...');
      const servers = await JellyfinService.discoverServers(
        15000, // 15 second timeout
        (current, total) => {
          setDiscoveryProgress({ current, total });
        }
      );
      setDiscoveredServers(servers);
      
      if (servers.length === 0) {
        setError('No servers found. Make sure Jellyfin is running and accessible on your network.');
      } else {
        console.log('[Settings] Found servers:', servers);
      }
    } catch (err) {
      console.error('[Settings] Discovery error:', err);
      setError('Server discovery failed');
    } finally {
      setIsDiscovering(false);
      setDiscoveryProgress({ current: 0, total: 0 });
    }
  };

  const handleSelectServer = (server: {address: string; name: string; id: string}) => {
    setServerUrl(server.address);
    setDiscoveredServers([]);
    setTestResult(null);
    setError(null);
  };

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
        Scan your local network or enter your server URL manually
      </Text>
      
      {/* Server Discovery */}
      <View style={styles.discoveryContainer}>
        <FocusableButton
          title="Scan Local Network"
          onPress={handleDiscoverServers}
          loading={isDiscovering}
          disabled={isDiscovering || isConnecting || isTesting}
          variant="secondary"
          size="medium"
          icon="scan"
        />
        {isDiscovering && (
          <View>
            <Text style={styles.discoveryText}>
              Scanning network... {discoveryProgress.total > 0 && `(${discoveryProgress.current}/${discoveryProgress.total})`}
            </Text>
            <Text style={styles.discoveryHint}>
              This may take 10-15 seconds
            </Text>
          </View>
        )}
      </View>

      {/* Discovered Servers List */}
      {discoveredServers.length > 0 && (
        <View style={styles.discoveredServersContainer}>
          <Text style={styles.discoveredServersTitle}>Found Servers:</Text>
          {discoveredServers.map((server) => (
            <FocusableButton
              key={server.id}
              title={
                <View style={styles.serverItemContent}>
                  <Icon name="server" size={20} color="#fff" style={styles.serverIcon} />
                  <View style={styles.serverInfo}>
                    <Text style={styles.serverName}>{server.name}</Text>
                    <Text style={styles.serverAddress}>{server.address}</Text>
                  </View>
                </View>
              }
              onPress={() => handleSelectServer(server)}
              variant="secondary"
              size="medium"
              style={styles.serverItem}
            />
          ))}
        </View>
      )}

      <Text style={styles.orText}>or enter manually:</Text>
      
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
  const { settings: allSettings } = useSettings();
  const [serverUrl, setServerUrl] = useState(settings?.serverUrl || '');
  const [apiKey, setApiKey] = useState(settings?.apiKey || '');
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

  // Prefill server URL from Jellyfin if empty
  useEffect(() => {
    if (!serverUrl && allSettings.jellyfin?.serverUrl) {
      try {
        // Extract protocol and host from Jellyfin URL
        const jellyfinUrl = allSettings.jellyfin.serverUrl;
        const match = jellyfinUrl.match(/^(https?:\/\/[^:]+)(:\d+)?/);
        if (match) {
          const baseUrl = `${match[1]}:8989`;
          setServerUrl(baseUrl);
        }
      } catch (err) {
        console.log('[Sonarr] Could not parse Jellyfin URL:', err);
      }
    }
  }, [allSettings.jellyfin?.serverUrl, serverUrl]);

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
        let normalizedUrl = serverUrl.trim();
        if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
          normalizedUrl = 'http://' + normalizedUrl;
        }
        let finalRootFolderPath = rootFolderPath.trim();
        try {
          const service = new SonarrService(normalizedUrl, apiKey.trim());
          const rootFolders = await service.getRootFolders();
          if (rootFolders.length > 0) {
            finalRootFolderPath = rootFolders[0].path;
            setRootFolderPath(finalRootFolderPath);
          }
        } catch (err) {
          console.warn('[Sonarr] Could not fetch root folders on save:', err);
        }
        await onUpdate({
          serverUrl: normalizedUrl,
          apiKey: apiKey.trim(),
          rootFolderPath: finalRootFolderPath,
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
      {/* Quality Profile ID is now handled automatically and not shown to the user */}
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
  const { settings: allSettings } = useSettings();
  const [serverUrl, setServerUrl] = useState(settings?.serverUrl || '');
  const [apiKey, setApiKey] = useState(settings?.apiKey || '');
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

  // Prefill server URL from Jellyfin if empty
  useEffect(() => {
    if (!serverUrl && allSettings.jellyfin?.serverUrl) {
      try {
        // Extract protocol and host from Jellyfin URL
        const jellyfinUrl = allSettings.jellyfin.serverUrl;
        const match = jellyfinUrl.match(/^(https?:\/\/[^:]+)(:\d+)?/);
        if (match) {
          const baseUrl = `${match[1]}:7878`;
          setServerUrl(baseUrl);
        }
      } catch (err) {
        console.log('[Radarr] Could not parse Jellyfin URL:', err);
      }
    }
  }, [allSettings.jellyfin?.serverUrl, serverUrl]);

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
        await onUpdate({
          serverUrl: normalizedUrl,
          apiKey: apiKey.trim(),
          rootFolderPath: finalRootFolderPath,
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
      {/* Quality Profile ID is now handled automatically and not shown to the user */}
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

// Live TV / IPTV Settings Section
interface LiveTVSettingsProps {
  settings: {
    selectedCountries: string[];
  } | null;
  onUpdate: (settings: { selectedCountries: string[] } | null) => Promise<void>;
}

function LiveTVSettings({ settings, onUpdate }: LiveTVSettingsProps) {
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(
    new Set(settings?.selectedCountries || [])
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const toggleCountry = (code: string) => {
    const newSelected = new Set(selectedCountries);
    if (newSelected.has(code)) {
      newSelected.delete(code);
    } else {
      newSelected.add(code);
    }
    setSelectedCountries(newSelected);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const countries = Array.from(selectedCountries);
      
      // Save to local settings
      // IPTV channels will be loaded client-side from M3U playlists
      console.log(`[Settings] Saving ${countries.length} IPTV countries: ${countries.join(', ')}`);
      
      if (countries.length > 0) {
        await onUpdate({ selectedCountries: countries });
      } else {
        await onUpdate(null);
      }
      
      Alert.alert(
        'Saved',
        `${countries.length} countries selected. Go to Live TV to see channels.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Failed to save IPTV settings:', error);
      Alert.alert('Error', 'Failed to save IPTV settings', [{ text: 'OK' }]);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredRegions = IPTV_REGIONS.map(region => ({
    ...region,
    countries: region.countries.filter(country =>
      !searchQuery ||
      country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      country.code.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(region => region.countries.length > 0);

  const selectAllInRegion = (regionName: string) => {
    const region = IPTV_REGIONS.find(r => r.name === regionName);
    if (region) {
      const newSelected = new Set(selectedCountries);
      region.countries.forEach(c => newSelected.add(c.code));
      setSelectedCountries(newSelected);
    }
  };

  const clearAllInRegion = (regionName: string) => {
    const region = IPTV_REGIONS.find(r => r.name === regionName);
    if (region) {
      const newSelected = new Set(selectedCountries);
      region.countries.forEach(c => newSelected.delete(c.code));
      setSelectedCountries(newSelected);
    }
  };

  return (
    <View style={styles.sectionForm}>
      <Text style={styles.sectionDescription}>
        Select countries to add IPTV channels to Jellyfin. 
        Channels and EPG data will be managed via Jellyfin Live TV.
      </Text>
      
      <Text style={styles.selectedCount}>
        {selectedCountries.size} {selectedCountries.size === 1 ? 'country' : 'countries'} selected
      </Text>

      <FocusableInput
        label="Search Countries"
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Type to filter countries..."
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.countryListContainer}>
        {filteredRegions.map(region => (
          <View key={region.name} style={styles.regionContainer}>
            <View style={styles.regionHeader}>
              <Text style={styles.regionTitle}>{region.name}</Text>
              <View style={styles.regionButtons}>
                <TouchableOpacity
                  onPress={() => selectAllInRegion(region.name)}
                  style={styles.regionButton}>
                  <Text style={styles.regionButtonText}>Select All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => clearAllInRegion(region.name)}
                  style={styles.regionButton}>
                  <Text style={styles.regionButtonText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.countriesGrid}>
              {region.countries.map((country: IPTVCountry) => {
                const isSelected = selectedCountries.has(country.code);
                return (
                  <TouchableOpacity
                    key={country.code}
                    style={[
                      styles.countryItem,
                      isSelected && styles.countryItemSelected,
                    ]}
                    onPress={() => toggleCountry(country.code)}>
                    <Text style={styles.countryFlag}>{country.flag}</Text>
                    <Text
                      style={[
                        styles.countryName,
                        isSelected && styles.countryNameSelected,
                      ]}
                      numberOfLines={1}>
                      {country.name}
                    </Text>
                    {isSelected && (
                      <Icon name="checkmark-circle" size={20} color="#30d158" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.buttonRow}>
        <FocusableButton
          title={`Save (${selectedCountries.size} selected)`}
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
  contentContainer: {
    paddingTop: 8,
  },
  discoveryContainer: {
    marginBottom: 24,
  },
  discoveryText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 15,
    marginTop: 12,
    fontStyle: 'italic',
  },
  discoveryHint: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 13,
    marginTop: 4,
    fontStyle: 'italic',
  },
  discoveredServersContainer: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: 'rgba(26, 26, 26, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(10, 132, 255, 0.3)',
  },
  discoveredServersTitle: {
    color: 'rgba(10, 132, 255, 0.95)',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  serverItem: {
    marginBottom: 8,
  },
  serverItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  serverIcon: {
    marginRight: 12,
  },
  serverInfo: {
    flex: 1,
  },
  serverName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  serverAddress: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
  },
  orText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 15,
    textAlign: 'center',
    marginVertical: 16,
    fontWeight: '500',
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 48,
    paddingTop: 20,
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
  // Live TV / IPTV Settings styles
  selectedCount: {
    color: 'rgba(10, 132, 255, 0.95)',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  countryListContainer: {
    marginTop: 16,
    marginBottom: 24,
  },
  regionContainer: {
    marginBottom: 24,
  },
  regionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  regionTitle: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 18,
    fontWeight: '700',
  },
  regionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  regionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  regionButtonText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    fontWeight: '500',
  },
  countriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 160,
  },
  countryItemSelected: {
    backgroundColor: 'rgba(48, 209, 88, 0.15)',
    borderColor: 'rgba(48, 209, 88, 0.5)',
  },
  countryFlag: {
    fontSize: 20,
  },
  countryName: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  countryNameSelected: {
    color: '#fff',
    fontWeight: '600',
  },
});
