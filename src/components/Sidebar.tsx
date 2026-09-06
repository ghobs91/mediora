import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Modal, Pressable, Animated } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import Icon from 'react-native-vector-icons/Ionicons';
import { scaleSize, scaleFontSize } from '../utils/scaling';
import { useDeviceType } from '../hooks/useResponsive';
import { useSettings } from '../context';

interface SidebarProps {
  currentRoute: string;
  onOpenDrawer?: () => void;
}

export function Sidebar({ currentRoute, onOpenDrawer }: SidebarProps) {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const [focusedItem, setFocusedItem] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { isMobile } = useDeviceType();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const drawerOpenRef = useRef(() => setIsDrawerOpen(true));
  const slideAnim = useRef(new Animated.Value(-320)).current;

  // Update ref when state setter changes
  React.useEffect(() => {
    drawerOpenRef.current = () => setIsDrawerOpen(true);
  }, []);

  // Animate drawer open/close
  useEffect(() => {
    if (isDrawerOpen) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -320,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [isDrawerOpen, slideAnim]);

  // Only expose drawer open function when this component's screen is focused
  React.useEffect(() => {
    if (isFocused && isMobile) {
      (window as any).__openMobileDrawer = drawerOpenRef.current;
    }
  }, [isFocused, isMobile]);

  // On mobile, only show items not in bottom tabs
  // On TV/Desktop, show all navigation items
  const mainNavItems = [
    { name: 'Search', route: 'Search', icon: 'search-outline', showInTabs: true },
    { name: 'Home', route: 'Home', icon: 'home-outline', showInTabs: true },
    { name: 'Live TV', route: 'LiveTV', icon: 'radio-outline', showInTabs: true },
  ];

  const libraryItems = [
    { name: 'TV Shows', route: 'TVShows', icon: 'tv-outline', showInTabs: true },
    { name: 'Movies', route: 'Movies', icon: 'film-outline', showInTabs: true },
  ];

  const settingsItems = [
    { name: 'Jellyfin', route: 'JellyfinSettings', icon: 'server-outline', showInTabs: false },
    { name: 'Mediora Server', route: 'MedioraServerSettings', icon: 'cloud-outline', showInTabs: false },
    { name: 'Sonarr', route: 'SonarrSettings', icon: 'albums-outline', showInTabs: false },
    { name: 'Radarr', route: 'RadarrSettings', icon: 'film-outline', showInTabs: false },
    { name: 'Live TV Settings', route: 'LiveTVSettings', icon: 'settings-outline', showInTabs: false },
    { name: 'Invites', route: 'Invites', icon: 'ticket-outline', showInTabs: false },
  ];

  // In mediora-server mode the unified backend replaces Sonarr/Radarr,
  // so hide the legacy entries to avoid configuring a dead path.
  const showLegacyArr = settings.backendMode !== 'mediarr-server';
  const visibleSettingsItems = settingsItems.filter(
    item =>
      showLegacyArr ||
      (item.route !== 'SonarrSettings' && item.route !== 'RadarrSettings'),
  );

  const allNavItems = [...mainNavItems, ...libraryItems, ...visibleSettingsItems];

  const navItems = isMobile
    ? allNavItems.filter(item => !item.showInTabs)
    : allNavItems;

  const handleFocus = useCallback((route: string) => {
    setFocusedItem(route);
  }, []);

  const handleBlur = useCallback((route: string) => {
    setTimeout(() => {
      setFocusedItem(current => {
        if (current === route) {
          return null;
        }
        return current;
      });
    }, 50);
  }, []);

  const handleNavigate = useCallback((route: string) => {
    navigation.navigate(route);
    if (isMobile) {
      setIsDrawerOpen(false);
    }
  }, [navigation, isMobile]);

  const renderSearchItem = () => {
    const isActive = currentRoute === 'Search';
    const isSearchFocused = focusedItem === 'Search';

    return (
      <TouchableOpacity
        style={[
          styles.searchItem,
          isActive && styles.searchItemActive,
          isSearchFocused && styles.navItemFocused,
        ]}
        onPress={() => handleNavigate('Search')}
        onFocus={() => handleFocus('Search')}
        onBlur={() => handleBlur('Search')}
        activeOpacity={0.7}
        focusable={true}
        tvParallaxProperties={Platform.isTV ? { enabled: false } : undefined}>
        <Icon
          name="search-outline"
          size={Platform.isTV ? scaleSize(19) : 15}
          color="rgba(255, 255, 255, 0.48)"
          style={styles.searchIcon}
        />
        <Text style={styles.searchText}>Search</Text>
      </TouchableOpacity>
    );
  };

  const renderNavItem = (item: any, index: number, isFirst: boolean = false) => {
    const isActive = currentRoute === item.route;
    const isFocused = focusedItem === item.route;

    return (
      <TouchableOpacity
        key={item.route}
        style={[
          isMobile ? styles.mobileNavItem : styles.navItem,
          isActive && (isMobile ? styles.mobileNavItemActive : styles.navItemActive),
          isFocused && styles.navItemFocused,
        ]}
        onPress={() => handleNavigate(item.route)}
        onFocus={() => handleFocus(item.route)}
        onBlur={() => handleBlur(item.route)}
        activeOpacity={0.7}
        focusable={true}
        hasTVPreferredFocus={isFirst}
        tvParallaxProperties={Platform.isTV ? {
          enabled: false,
        } : undefined}>
        <Icon
          name={item.icon}
          size={isMobile ? 22 : scaleSize(24)}
          color={isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.6)'}
          style={isMobile ? styles.mobileNavIcon : styles.navIcon}
        />
        <Text
          style={[
            isMobile ? styles.mobileNavText : styles.navText,
            isActive && (isMobile ? styles.mobileNavTextActive : styles.navTextActive),
          ]}>
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderNavItems = () => {
    if (isMobile) {
      return navItems.map((item, index) => renderNavItem(item, index, index === 0));
    }

    const visibleMainItems = mainNavItems;
    const visibleLibraryItems = libraryItems;

    return (
      <>
        {visibleMainItems
          .filter(item => item.route !== 'Search')
          .map((item, index) => renderNavItem(item, index, index === 0))}

        <Text style={styles.sectionHeader}>Library</Text>
        {visibleLibraryItems.map((item, index) => renderNavItem(item, index))}

        <Text style={styles.sectionHeader}>Settings</Text>
        {visibleSettingsItems.map((item, index) => renderNavItem(item, index))}
      </>
    );
  };

  // Mobile: Render drawer only (header handled by screens)
  if (isMobile) {
    return (
      <>
        {/* Mobile Drawer Modal */}
        <Modal
          visible={isDrawerOpen}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setIsDrawerOpen(false)}>
          <Pressable
            style={styles.drawerOverlay}
            onPress={() => setIsDrawerOpen(false)}>
            <Animated.View 
              style={[
                styles.drawer, 
                { 
                  paddingTop: insets.top + 16,
                  transform: [{ translateX: slideAnim }]
                }
              ]}
              onStartShouldSetResponder={() => true}
              onTouchEnd={(e) => e.stopPropagation()}>
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerLogo}>Mediora</Text>
                <TouchableOpacity
                  onPress={() => setIsDrawerOpen(false)}
                  style={styles.closeButton}>
                  <Icon name="close" size={28} color="#fff" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.drawerNav} showsVerticalScrollIndicator={false}>
                {renderNavItems()}
              </ScrollView>
            </Animated.View>
          </Pressable>
        </Modal>
      </>
    );
  }

  // Desktop/Tablet/TV: Render floating sidebar
  // On tvOS, LiquidGlassView's 'regular' effect renders a patterned noise texture
  // that looks wrong on TV displays — use 'none' and rely on the solid background.
  const sidebarEffect = (Platform.isTV || !isLiquidGlassSupported) ? 'none' : 'regular';

  return (
    <LiquidGlassView
      style={styles.sidebar}
      effect={sidebarEffect}
      tintColor={Platform.isTV ? "rgba(28, 28, 30, 0.4)" : "rgba(28, 28, 30, 0.85)"}>
      {/* macOS Window Controls (Traffic Lights) */}
      {Platform.OS === 'macos' && (
        <View style={styles.windowControls}>
          <View style={[styles.trafficLight, styles.trafficLightRed]} />
          <View style={[styles.trafficLight, styles.trafficLightYellow]} />
          <View style={[styles.trafficLight, styles.trafficLightGreen]} />
        </View>
      )}

      <View style={styles.header}>
        {renderSearchItem()}
      </View>

      <ScrollView style={styles.navContainer} showsVerticalScrollIndicator={false}>
        {renderNavItems()}
      </ScrollView>
    </LiquidGlassView>
  );
}

const styles = StyleSheet.create({
  // Flush Sidebar Styles (Desktop/Tablet/TV) — App Store style
  sidebar: {
    flex: 1,
    width: Platform.isTV ? scaleSize(240) : 200,
    backgroundColor: Platform.isTV ? 'rgba(28, 28, 30, 0.4)' : 'rgba(28, 28, 30, 0.92)',
    borderRadius: Platform.isTV ? scaleSize(16) : 0,
    borderTopRightRadius: Platform.isTV ? scaleSize(16) : 0,
    borderBottomRightRadius: Platform.isTV ? scaleSize(16) : 0,
    paddingTop: Platform.isTV ? scaleSize(20) : 8,
    paddingBottom: Platform.isTV ? scaleSize(16) : 12,
    borderRightWidth: Platform.isTV ? 0 : 1,
    borderRightColor: 'rgba(255, 255, 255, 0.1)',
  },
  windowControls: {
    flexDirection: 'row',
    gap: Platform.isTV ? scaleSize(8) : 7,
    paddingHorizontal: Platform.isTV ? scaleSize(20) : 12,
    paddingTop: Platform.isTV ? scaleSize(8) : 4,
    paddingBottom: Platform.isTV ? scaleSize(12) : 10,
  },
  trafficLight: {
    width: scaleSize(12),
    height: scaleSize(12),
    borderRadius: scaleSize(6),
    opacity: 0.9,
  },
  trafficLightRed: {
    backgroundColor: '#FF5F57',
  },
  trafficLightYellow: {
    backgroundColor: '#FFBD2E',
  },
  trafficLightGreen: {
    backgroundColor: '#28C840',
  },
  header: {
    paddingHorizontal: Platform.isTV ? scaleSize(20) : 12,
    paddingBottom: Platform.isTV ? scaleSize(12) : 8,
    marginBottom: Platform.isTV ? scaleSize(4) : 2,
  },
  navContainer: {
    flex: 1,
    paddingHorizontal: Platform.isTV ? scaleSize(20) : 12,
  },
  searchItem: {
    height: Platform.isTV ? scaleSize(42) : 30,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Platform.isTV ? scaleSize(12) : 10,
    borderRadius: Platform.isTV ? scaleSize(21) : 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  searchItemActive: {
    borderColor: 'rgba(255, 255, 255, 0.38)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchIcon: {
    width: Platform.isTV ? scaleSize(20) : 16,
    marginRight: Platform.isTV ? scaleSize(7) : 5,
  },
  searchText: {
    fontSize: Platform.isTV ? scaleFontSize(16) : 12,
    color: 'rgba(255, 255, 255, 0.42)',
    fontWeight: '500',
  },
  sectionHeader: {
    fontSize: Platform.isTV ? scaleFontSize(13) : 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 0.3,
    marginTop: Platform.isTV ? scaleSize(20) : 18,
    marginBottom: Platform.isTV ? scaleSize(6) : 5,
    marginLeft: Platform.isTV ? scaleSize(12) : 10,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Platform.isTV ? scaleSize(10) : 7,
    paddingHorizontal: Platform.isTV ? scaleSize(12) : 10,
    borderRadius: Platform.isTV ? scaleSize(8) : 8,
    marginBottom: Platform.isTV ? scaleSize(4) : 2,
    backgroundColor: 'transparent',
  },
  navItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  navItemFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  navIcon: {
    marginRight: Platform.isTV ? scaleSize(12) : 10,
    width: Platform.isTV ? scaleSize(24) : 18,
  },
  navText: {
    fontSize: Platform.isTV ? scaleFontSize(17) : 13,
    color: 'rgba(255, 255, 255, 0.82)',
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  navTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },

  // Mobile Drawer Styles
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  drawer: {
    width: '80%',
    maxWidth: 320,
    height: '100%',
    backgroundColor: 'rgba(18, 18, 20, 0.85)',
    paddingHorizontal: 20,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: 'rgba(0, 0, 0, 0.5)',
    shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 24,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
    marginBottom: 16,
  },
  drawerLogo: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1.2,
    textShadowColor: 'rgba(139, 92, 246, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  closeButton: {
    padding: 4,
  },
  drawerNav: {
    flex: 1,
  },

  // Mobile Nav Item Styles
  mobileNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: 'transparent',
  },
  mobileNavItemActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.35)',
    borderLeftWidth: 4,
    borderLeftColor: '#a78bfa',
  },
  mobileNavIcon: {
    marginRight: 14,
    width: 26,
  },
  mobileNavText: {
    fontSize: 17,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  mobileNavTextActive: {
    color: '#e9d5ff',
    fontWeight: '700',
  },
});
