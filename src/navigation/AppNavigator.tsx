import React, { useState } from 'react';
import { NavigationContainer, useNavigation, useNavigationState } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, StyleSheet, Platform, TouchableOpacity, Text } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  HomeScreen,
  LibraryScreen,
  SearchScreen,
  SettingsScreen,
  JellyfinSettingsScreen,
  SonarrSettingsScreen,
  RadarrSettingsScreen,
  LiveTVSettingsScreen,
  PlayerScreen,
  ItemDetailsScreen,
  TMDBDetailsScreen,
  LiveTVScreen,
  LivePlayerScreen,
} from '../screens';
import { Sidebar, MobileHeader } from '../components';
import { RootStackParamList } from '../types';
import { useDeviceType } from '../hooks/useResponsive';
import { scaleSize } from '../utils/scaling';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Desktop/TV Stack Navigator - Content only (no sidebar)
function DesktopStackNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#000' },
        animation: 'none',
      }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="TVShows">
        {() => <LibraryScreen filterType="tvshows" />}
      </Stack.Screen>
      <Stack.Screen name="Movies">
        {() => <LibraryScreen filterType="movies" />}
      </Stack.Screen>
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="LiveTV" component={LiveTVScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="JellyfinSettings" component={JellyfinSettingsScreen} />
      <Stack.Screen name="SonarrSettings" component={SonarrSettingsScreen} />
      <Stack.Screen name="RadarrSettings" component={RadarrSettingsScreen} />
      <Stack.Screen name="LiveTVSettings" component={LiveTVSettingsScreen} />
      <Stack.Screen
        name="Player"
        component={PlayerScreen}
        options={{
          animation: 'fade',
        }}
      />
      <Stack.Screen
        name="LivePlayer"
        component={LivePlayerScreen}
        options={{
          animation: 'fade',
        }}
      />
      <Stack.Screen
        name="ItemDetails"
        component={ItemDetailsScreen}
        options={{
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="TMDBDetails"
        component={TMDBDetailsScreen}
        options={{
          animation: 'slide_from_right',
        }}
      />
    </Stack.Navigator>
  );
}


// Tab item configuration
const TAB_ITEMS = [
  { key: 'Home', label: 'Home', icon: 'home-outline', iconFocused: 'home' },
  { key: 'TVShows', label: 'TV Shows', icon: 'tv-outline', iconFocused: 'tv' },
  { key: 'Movies', label: 'Movies', icon: 'film-outline', iconFocused: 'film' },
  { key: 'LiveTV', label: 'Live TV', icon: 'radio-outline', iconFocused: 'radio' },
];

// Custom Liquid Glass Tab Bar Component
function LiquidGlassTabBar({ activeTab, onTabPress, onSearchPress }: { activeTab: string; onTabPress: (tab: string) => void; onSearchPress: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[tabBarStyles.container, { bottom: 20 + insets.bottom }]}>
      {/* Main Tab Bar with Liquid Glass */}
      <LiquidGlassView
        style={tabBarStyles.tabBarGlass}
        effect="regular"
        tintColor="rgba(255, 255, 255, 0.5)">
        <View style={tabBarStyles.tabBarInner}>
          {TAB_ITEMS.map((item) => {
            const isActive = activeTab === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={tabBarStyles.tabItem}
                onPress={() => onTabPress(item.key)}
                activeOpacity={0.7}>
                <Icon
                  name={isActive ? item.iconFocused : item.icon}
                  size={24}
                  color={isActive ? 'rgba(0, 0, 0, 0.9)' : 'rgba(60, 60, 67, 0.85)'}
                />
                <Text style={[
                  tabBarStyles.tabLabel,
                  isActive && tabBarStyles.tabLabelActive
                ]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </LiquidGlassView>

      {/* Separate Search Button */}
      <LiquidGlassView
        style={tabBarStyles.searchButtonGlass}
        effect="regular"
        tintColor="rgba(255, 255, 255, 0.5)">
        <TouchableOpacity
          style={tabBarStyles.searchButton}
          onPress={onSearchPress}
          activeOpacity={0.7}>
          <Icon
            name={activeTab === 'Search' ? 'search' : 'search-outline'}
            size={24}
            color={activeTab === 'Search' ? 'rgba(0, 0, 0, 0.9)' : 'rgba(60, 60, 67, 0.85)'}
          />
        </TouchableOpacity>
      </LiquidGlassView>
    </View>
  );
}

// Screen content based on active tab
function TabContent({ activeTab }: { activeTab: string }) {
  switch (activeTab) {
    case 'Home':
      return <HomeScreen key="home" />;
    case 'TVShows':
      return <LibraryScreen key="tvshows" filterType="tvshows" />;
    case 'Movies':
      return <LibraryScreen key="movies" filterType="movies" />;
    case 'LiveTV':
      return <LiveTVScreen key="livetv" />;
    case 'Search':
      return <SearchScreen key="search" />;
    default:
      return <HomeScreen key="home-default" />;
  }
}

// Mobile Tab Navigator with custom liquid glass tab bar
function MobileTabNavigator() {
  const [activeTab, setActiveTab] = useState('Home');
  const insets = useSafeAreaInsets();

  const openDrawer = () => {
    if ((window as any).__openMobileDrawer) {
      (window as any).__openMobileDrawer();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Sidebar currentRoute={activeTab} onOpenDrawer={openDrawer} />

      {/* Floating Hamburger Button */}
      <View style={[styles.floatingMenuButton, { top: insets.top + 8 }]}>
        <LiquidGlassView
          style={styles.floatingButtonGlass}
          effect="regular"
          tintColor="rgba(255, 255, 255, 0.25)">
          <TouchableOpacity
            style={styles.floatingButton}
            onPress={openDrawer}
            activeOpacity={0.7}>
            <Icon name="menu" size={26} color="rgba(60, 60, 67, 0.85)" />
          </TouchableOpacity>
        </LiquidGlassView>
      </View>

      <TabContent activeTab={activeTab} />
      <LiquidGlassTabBar
        activeTab={activeTab}
        onTabPress={setActiveTab}
        onSearchPress={() => setActiveTab('Search')}
      />
    </View>
  );
}

const tabBarStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 28,
    right: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tabBarGlass: {
    flex: 1,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
  },
  tabBarInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(60, 60, 67, 0.85)',
    marginTop: 2,
  },
  tabLabelActive: {
    color: 'rgba(0, 0, 0, 0.9)',
    fontWeight: '700',
  },
  searchButtonGlass: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
  },
  searchButton: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export function AppNavigator() {
  const { isMobile, showSidebar } = useDeviceType();
  const [currentRoute, setCurrentRoute] = useState('Home');

  // Track navigation state changes for desktop sidebar
  const handleNavigationStateChange = (state: any) => {
    if (!isMobile && state) {
      const route = state.routes[state.index];
      if (route?.name) {
        setCurrentRoute(route.name);
      }
    }
  };

  return (
    <SafeAreaProvider>
      <NavigationContainer onStateChange={handleNavigationStateChange}>
        {isMobile ? (
          <Stack.Navigator
            initialRouteName="MainTabs"
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#000' },
              animation: 'none',
            }}>
            <Stack.Screen name="MainTabs" component={MobileTabNavigator} />
            <Stack.Screen
              name="Player"
              component={PlayerScreen}
              options={{
                animation: 'fade',
              }}
            />
            <Stack.Screen
              name="LivePlayer"
              component={LivePlayerScreen}
              options={{
                animation: 'fade',
              }}
            />
            <Stack.Screen
              name="ItemDetails"
              component={ItemDetailsScreen}
              options={{
                animation: 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="TMDBDetails"
              component={TMDBDetailsScreen}
              options={{
                animation: 'slide_from_right',
              }}
            />
          </Stack.Navigator>
        ) : (
          <View style={styles.container}>
            {(() => {
              const isPlayerScreen = currentRoute === 'Player' || currentRoute === 'LivePlayer';
              return (
                <>
                  <View style={[styles.content, !isPlayerScreen && styles.contentWithSidebar]}>
                    <DesktopStackNavigator />
                  </View>
                  {!isPlayerScreen && showSidebar && (
                    <View style={styles.floatingSidebarWrapper}>
                      <Sidebar currentRoute={currentRoute} onOpenDrawer={() => { }} />
                    </View>
                  )}
                  {!isPlayerScreen && !showSidebar && <Sidebar currentRoute={currentRoute} onOpenDrawer={() => { }} />}
                </>
              );
            })()}
          </View>
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    backgroundColor: '#000',
  },
  contentWithSidebar: {
    paddingLeft: scaleSize(272), // Account for floating sidebar width + margins
  },
  floatingSidebarWrapper: {
    position: 'absolute',
    left: 16,
    top: 16,
    bottom: 16,
    zIndex: 1000,
  },
  floatingMenuButton: {
    position: 'absolute',
    left: 16,
    zIndex: 100,
  },
  floatingButtonGlass: {
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  floatingButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
