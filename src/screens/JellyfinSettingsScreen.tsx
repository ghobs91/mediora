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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { LiquidGlassView } from '@callstack/liquid-glass';
import { useSettings } from '../context';
import { FocusableButton, FocusableInput } from '../components';
import { JellyfinService } from '../services';
import { useDeviceType } from '../hooks/useResponsive';
import { DEV_CONFIG } from '../config/dev';

export function JellyfinSettingsScreen() {
  const { settings, updateJellyfinSettings, clearJellyfinSettings } = useSettings();
  const { isMobile } = useDeviceType();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [serverUrl, setServerUrl] = useState(__DEV__ ? DEV_CONFIG.jellyfin.url : '');
  const [quickConnectCode, setQuickConnectCode] = useState<string | null>(null);
  const [_quickConnectSecret, setQuickConnectSecret] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginMethod, setLoginMethod] = useState<'quickconnect' | 'manual'>('quickconnect');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState({ current: 0, total: 0 });
  const [discoveredServers, setDiscoveredServers] = useState<Array<{address: string; name: string; id: string}>>([]);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isConnected = !!settings.jellyfin?.accessToken;

  const handleUseDemoServer = () => {
    const demoServerUrl = 'https://demo.jellyfin.org/stable';
    setServerUrl(demoServerUrl);
    setUsername('demo');
    setPassword('');
    setLoginMethod('manual');
    setError(null);
    setTestResult(null);
    setDiscoveredServers([]);
    
    Alert.alert(
      'Demo Server Configured',
      'Demo server URL and credentials have been set.\n\nClick "Test Connection" to verify, then click "Login" to connect.\n\n• Username: demo\n• Password: (leave empty)',
      [{ text: 'OK' }]
    );
  };

  const handleDiscoverServers = async () => {
    setIsDiscovering(true);
    setError(null);
    setDiscoveredServers([]);
    setDiscoveryProgress({ current: 0, total: 0 });
    
    try {
      console.log('[Settings] Starting server discovery...');
      const servers = await JellyfinService.discoverServers(
        15000,
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
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('[Settings] Response status:', response.status);
      
      const contentType = response.headers.get('content-type') || '';
      
      if (response.ok) {
        const responseText = await response.text();
        
        if (contentType.includes('text/html') || responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
          setError('Server returned HTML instead of JSON.\n\nTry using HTTPS instead of HTTP.');
          setTestResult('⚠ Server redirecting to HTML page');
        } else {
          const data = JSON.parse(responseText);
          console.log('[Settings] Server info:', data);
          setTestResult(`✓ Connected to Jellyfin ${data.Version || 'server'}\nServer Name: ${data.ServerName || 'Unknown'}`);
        }
      } else {
        const text = await response.text();
        console.log('[Settings] Error response body:', text);
        
        if (contentType.includes('text/html') || text.includes('<!DOCTYPE') || text.includes('<html')) {
          setError('Server returned HTML page. Try using HTTPS instead of HTTP.');
          setTestResult('⚠ Server redirecting');
        } else {
          setTestResult(`⚠ Server responded with status ${response.status}`);
        }
      }
    } catch (err) {
      console.error('[Settings] Test connection error details:', {
        name: err instanceof Error ? err.name : 'Unknown',
        message: err instanceof Error ? err.message : String(err),
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

            await updateJellyfinSettings({
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

  const handleManualLogin = async () => {
    if (!serverUrl.trim()) {
      setError('Please enter a server URL');
      return;
    }

    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    let normalizedUrl = serverUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'http://' + normalizedUrl;
    }

    setIsConnecting(true);
    setError(null);
    setTestResult(null);

    try {
      console.log('[Settings] Logging in with username/password to:', normalizedUrl);
      const service = new JellyfinService(normalizedUrl);
      const authResponse = await service.authenticateByName(username.trim(), password.trim());

      await updateJellyfinSettings({
        serverUrl: normalizedUrl,
        accessToken: authResponse.AccessToken,
        userId: authResponse.User.Id,
        serverId: authResponse.ServerId,
        deviceId: service.getDeviceId(),
      });

      setIsConnecting(false);
      setUsername('');
      setPassword('');
    } catch (err) {
      console.error('[Settings] Login error:', err);
      setIsConnecting(false);
      setError(err instanceof Error ? err.message : 'Failed to login');
    }
  };

  const handleDisconnect = async () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    await clearJellyfinSettings();
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

  const dynamicStyles = {
    contentContainer: {
      paddingTop: isMobile ? insets.top + 72 : 48,
      paddingBottom: isMobile ? insets.bottom + 100 : 48,
    },
    sectionContent: {
      paddingHorizontal: isMobile ? 16 : 48,
    },
  };

  if (isConnected) {
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
          <View style={dynamicStyles.sectionContent}>
            <View style={styles.sectionForm}>
              <View style={styles.connectedInfo}>
                <Text style={styles.connectedLabel}>Connected to Jellyfin</Text>
                <Text style={styles.connectedValue}>{settings.jellyfin?.serverUrl}</Text>
              </View>
              <FocusableButton
                title="Disconnect"
                onPress={handleDisconnect}
                variant="danger"
                size="large"
              />
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (quickConnectCode) {
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
          <View style={dynamicStyles.sectionContent}>
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
          </View>
        </ScrollView>
      </View>
    );
  }

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
        <View style={dynamicStyles.sectionContent}>
          <View style={styles.sectionForm}>
            {/* Server Connection Section */}
            <View style={styles.settingsSection}>
              <View style={styles.sectionHeader}>
                <Icon name="server-outline" size={24} color="rgba(10, 132, 255, 0.95)" />
                <Text style={styles.sectionTitle}>Jellyfin Server Connection</Text>
              </View>
              <Text style={styles.sectionDescription}>
                Choose how to connect to your Jellyfin server
              </Text>

              <View style={styles.demoContainer}>
                <FocusableButton
                  title="Use Demo Server"
                  onPress={handleUseDemoServer}
                  disabled={isConnecting || isTesting}
                  variant="secondary"
                  size="medium"
                  icon="flask"
                />
                <Text style={styles.demoHint}>
                  Configure the public Jellyfin demo server for testing
                </Text>
              </View>

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
              <FocusableButton
                title="Test Connection"
                onPress={handleTestConnection}
                loading={isTesting}
                disabled={isTesting || isConnecting}
                variant="secondary"
                size="medium"
              />
            </View>

            <View style={styles.sectionDivider} />

            {/* Login Credentials Section */}
            <View style={styles.settingsSection}>
              <View style={styles.sectionHeader}>
                <Icon name="key-outline" size={24} color="rgba(10, 132, 255, 0.95)" />
                <Text style={styles.sectionTitle}>Login Credentials</Text>
              </View>
              <Text style={styles.sectionDescription}>
                Authenticate with your Jellyfin account
              </Text>

              <View style={styles.loginMethodContainer}>
                <Text style={styles.loginMethodLabel}>Choose authentication method:</Text>
                <View style={styles.loginMethodButtons}>
                  <FocusableButton
                    title="Quick Connect"
                    onPress={() => setLoginMethod('quickconnect')}
                    variant={loginMethod === 'quickconnect' ? 'primary' : 'secondary'}
                    size="medium"
                    style={styles.loginMethodButton}
                  />
                  <FocusableButton
                    title="Username & Password"
                    onPress={() => setLoginMethod('manual')}
                    variant={loginMethod === 'manual' ? 'primary' : 'secondary'}
                    size="medium"
                    style={styles.loginMethodButton}
                  />
                </View>
              </View>

              {loginMethod === 'quickconnect' && (
                <View style={styles.loginMethodContent}>
                  <Text style={styles.loginMethodDescription}>
                    Use Quick Connect to authenticate without entering your password. 
                    You'll receive a code to enter in your Jellyfin dashboard.
                  </Text>
                  <FocusableButton
                    title="Connect with Quick Connect"
                    onPress={handleConnect}
                    loading={isConnecting}
                    disabled={isConnecting || isTesting || !serverUrl.trim()}
                    size="medium"
                  />
                </View>
              )}

              {loginMethod === 'manual' && (
                <View style={styles.loginMethodContent}>
                  <Text style={styles.loginMethodDescription}>
                    Enter your Jellyfin username and password to authenticate.
                  </Text>
                  <FocusableInput
                    label="Username"
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Enter your username"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <FocusableInput
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                  />
                  <FocusableButton
                    title="Login"
                    onPress={handleManualLogin}
                    loading={isConnecting}
                    disabled={isConnecting || isTesting || !serverUrl.trim() || !username.trim()}
                    size="medium"
                  />
                </View>
              )}
            </View>
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
    backgroundColor: '#000',
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
  sectionDescription: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    marginBottom: 24,
    lineHeight: 24,
    fontWeight: '500',
  },
  connectedInfo: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: 'rgba(26, 26, 26, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(48, 209, 88, 0.3)',
    shadowColor: 'rgba(48, 209, 88, 0.5)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  connectedLabel: {
    color: 'rgba(48, 209, 88, 0.95)',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  connectedValue: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontWeight: '500',
  },
  quickConnectTitle: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  quickConnectCode: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 12,
    marginBottom: 20,
    fontFamily: 'monospace',
    textShadowColor: 'rgba(10, 132, 255, 0.5)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  quickConnectInstructions: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    fontWeight: '500',
  },
  spinner: {
    marginBottom: 20,
  },
  waitingText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: '500',
  },
  settingsSection: {
    marginBottom: 24,
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
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginVertical: 24,
  },
  demoContainer: {
    marginBottom: 24,
  },
  demoHint: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    marginTop: 8,
    fontStyle: 'italic',
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
  testResultContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  testResultIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  testResult: {
    fontSize: 15,
    marginBottom: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: 'rgba(255, 69, 58, 0.95)',
    flex: 1,
  },
  testSuccess: {
    color: 'rgba(48, 209, 88, 0.95)',
  },
  loginMethodContainer: {
    marginBottom: 20,
  },
  loginMethodLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  loginMethodButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  loginMethodButton: {
    flex: 1,
    minWidth: 140,
  },
  loginMethodContent: {
    marginTop: 14,
  },
  loginMethodDescription: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
    fontStyle: 'italic',
  },
});
