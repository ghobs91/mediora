import React, { useState } from 'react';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
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

const Stack = createNativeStackNavigator<RootStackParamList>();

// Layout wrapper that handles sidebar visibility (for non-mobile)
function ScreenWithNav({ children, currentRoute }: { children: React.ReactNode; currentRoute: string }) {
  const { showSidebar, isMobile } = useDeviceType();

  const openDrawer = () => {
    if (isMobile && (window as any).__openMobileDrawer) {
      (window as any).__openMobileDrawer();
    }
  };

  return (
    <View style={styles.container}>
      {showSidebar && <Sidebar currentRoute={currentRoute} onOpenDrawer={openDrawer} />}
      <View style={styles.content}>
        {children}
      </View>
      {!showSidebar && <Sidebar currentRoute={currentRoute} onOpenDrawer={openDrawer} />}
    </View>
  );
}

// Wrapper components that include the sidebar
function HomeWithNav() {
  return (
    <ScreenWithNav currentRoute="Home">
      <HomeScreen />
    </ScreenWithNav>
  );
}

function TVShowsWithNav() {
  return (
    <ScreenWithNav currentRoute="TVShows">
      <LibraryScreen filterType="tvshows" />
    </ScreenWithNav>
  );
}

function MoviesWithNav() {
  return (
    <ScreenWithNav currentRoute="Movies">
      <LibraryScreen filterType="movies" />
    </ScreenWithNav>
  );
}

function SearchWithNav() {
  return (
    <ScreenWithNav currentRoute="Search">
      <SearchScreen />
    </ScreenWithNav>
  );
}

function SettingsWithNav() {
  return (
    <ScreenWithNav currentRoute="Settings">
      <SettingsScreen />
    </ScreenWithNav>
  );
}

function JellyfinSettingsWithNav() {
  return (
    <ScreenWithNav currentRoute="JellyfinSettings">
      <JellyfinSettingsScreen />
    </ScreenWithNav>
  );
}

function SonarrSettingsWithNav() {
  return (
    <ScreenWithNav currentRoute="SonarrSettings">
      <SonarrSettingsScreen />
    </ScreenWithNav>
  );
}

function RadarrSettingsWithNav() {
  return (
    <ScreenWithNav currentRoute="RadarrSettings">
      <RadarrSettingsScreen />
    </ScreenWithNav>
  );
}

function LiveTVSettingsWithNav() {
  return (
    <ScreenWithNav currentRoute="LiveTVSettings">
      <LiveTVSettingsScreen />
    </ScreenWithNav>
  );
}

function LiveTVWithNav() {
  return (
    <ScreenWithNav currentRoute="LiveTV">
      <LiveTVScreen />
    </ScreenWithNav>
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
  const { isMobile } = useDeviceType();
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={isMobile ? "MainTabs" : "Home"}
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#000' },
            animation: 'none',
          }}>
          {/* Mobile: Use bottom tab navigator for main screens */}
          {isMobile && (
            <Stack.Screen name="MainTabs" component={MobileTabNavigator} />
          )}
          {/* TV/Desktop: Use sidebar navigation */}
          {!isMobile && (
            <>
              <Stack.Screen name="Home" component={HomeWithNav} />
              <Stack.Screen name="TVShows" component={TVShowsWithNav} />
              <Stack.Screen name="Movies" component={MoviesWithNav} />
              <Stack.Screen name="Search" component={SearchWithNav} />
            </>
          )}
          {/* Common screens for both mobile and TV/Desktop */}
          <Stack.Screen name="Search" component={SearchWithNav} />
          <Stack.Screen name="LiveTV" component={LiveTVWithNav} />
          <Stack.Screen name="Settings" component={SettingsWithNav} />
          <Stack.Screen name="JellyfinSettings" component={JellyfinSettingsWithNav} />
          <Stack.Screen name="SonarrSettings" component={SonarrSettingsWithNav} />
          <Stack.Screen name="RadarrSettings" component={RadarrSettingsWithNav} />
          <Stack.Screen name="LiveTVSettings" component={LiveTVSettingsWithNav} />
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
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    backgroundColor: '#000',
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
