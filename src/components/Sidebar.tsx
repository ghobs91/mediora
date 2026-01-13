import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Modal, Pressable } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import Icon from 'react-native-vector-icons/Ionicons';
import { scaleSize, scaleFontSize } from '../utils/scaling';
import { useDeviceType } from '../hooks/useResponsive';

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
  const drawerOpenRef = useRef(() => setIsDrawerOpen(true));

  // Update ref when state setter changes
  React.useEffect(() => {
    drawerOpenRef.current = () => setIsDrawerOpen(true);
  }, []);

  // Only expose drawer open function when this component's screen is focused
  React.useEffect(() => {
    if (isFocused && isMobile) {
      (window as any).__openMobileDrawer = drawerOpenRef.current;
    }
  }, [isFocused, isMobile]);

  // On mobile, only show items not in bottom tabs
  // On TV/Desktop, show all navigation items
  const allNavItems = [
    { name: 'Home', route: 'Home', icon: 'home-outline', showInTabs: true },
    { name: 'TV Shows', route: 'TVShows', icon: 'tv-outline', section: 'library', showInTabs: true },
    { name: 'Movies', route: 'Movies', icon: 'film-outline', section: 'library', showInTabs: true },
    { name: 'Live TV', route: 'LiveTV', icon: 'radio-outline', showInTabs: true },
    { name: 'Search', route: 'Search', icon: 'search-outline', showInTabs: true },
    { name: 'Jellyfin', route: 'JellyfinSettings', icon: 'server-outline', showInTabs: false },
    { name: 'Sonarr', route: 'SonarrSettings', icon: 'tv-outline', showInTabs: false },
    { name: 'Radarr', route: 'RadarrSettings', icon: 'film-outline', showInTabs: false },
    { name: 'Live TV Settings', route: 'LiveTVSettings', icon: 'radio-outline', showInTabs: false },
  ];
  
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

  const renderNavItems = () => (
    <>
      {navItems.map((item, index) => {
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
            hasTVPreferredFocus={index === 0}
            tvParallaxProperties={Platform.isTV ? {
              enabled: false,
            } : undefined}>
            <View style={[
              styles.navItemInner,
              isFocused && styles.navItemInnerFocused,
            ]}>
              <Icon
                name={item.icon}
                size={isMobile ? 24 : scaleSize(26)}
                color={isActive && !isFocused ? '#a78bfa' : isFocused ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'}
                style={isMobile ? styles.mobileNavIcon : styles.navIcon}
              />
              <Text
                style={[
                  isMobile ? styles.mobileNavText : styles.navText,
                  isActive && !isFocused && (isMobile ? styles.mobileNavTextActive : styles.navTextActive),
                  isFocused && styles.navTextFocused,
                ]}>
                {item.name}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </>
  );

  // Mobile: Render drawer only (header handled by screens)
  if (isMobile) {
    return (
      <>
        {/* Mobile Drawer Modal */}
        <Modal
          visible={isDrawerOpen}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsDrawerOpen(false)}>
          <Pressable
            style={styles.drawerOverlay}
            onPress={() => setIsDrawerOpen(false)}>
            <Pressable
              style={[styles.drawer, { paddingTop: insets.top + 16 }]}
              onPress={(e) => e.stopPropagation()}>
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
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  }

  // Desktop/Tablet/TV: Render fixed sidebar
  return (
    <LiquidGlassView
      style={styles.sidebar}
      effect={isLiquidGlassSupported ? 'clear' : 'none'}>
      <View style={styles.header}>
        <Text style={styles.logo}>Mediora</Text>
      </View>
      
      <ScrollView style={styles.navContainer} showsVerticalScrollIndicator={false}>
        {renderNavItems()}
      </ScrollView>
    </LiquidGlassView>
  );
}

const styles = StyleSheet.create({
  // Fixed Sidebar Styles (Desktop/Tablet/TV)
  sidebar: {
    width: scaleSize(240),
    backgroundColor: 'rgba(18, 18, 20, 0.85)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.12)',
    paddingTop: scaleSize(48),
    shadowColor: 'rgba(139, 92, 246, 0.4)',
    shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 28,
    elevation: 16,
  },
  header: {
    paddingHorizontal: scaleSize(24),
    paddingBottom: scaleSize(28),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
    marginBottom: scaleSize(20),
  },
  logo: {
    fontSize: scaleFontSize(32),
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1.2,
    textShadowColor: 'rgba(139, 92, 246, 1)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 16,
  },
  navContainer: {
    flex: 1,
    paddingHorizontal: scaleSize(16),
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: scaleSize(16),
    paddingHorizontal: scaleSize(20),
    borderRadius: scaleSize(12),
    marginBottom: scaleSize(8),
    backgroundColor: 'transparent',
  },
  navItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navItemInnerFocused: {
    transform: [{ scale: 1.05 }],
  },
  navItemActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    borderLeftWidth: scaleSize(4),
    borderLeftColor: '#a78bfa',
    borderWidth: 1.5,
    borderColor: 'rgba(167, 139, 250, 0.5)',
    shadowColor: 'rgba(139, 92, 246, 0.8)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
  },
  navItemFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderLeftWidth: scaleSize(4),
    borderLeftColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    transform: [{ scale: 1.05 }],
    shadowColor: 'rgba(255, 255, 255, 1)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
  },
  navIcon: {
    marginRight: scaleSize(16),
    width: scaleSize(28),
  },
  navText: {
    fontSize: scaleFontSize(19),
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  navTextActive: {
    color: '#e9d5ff',
    fontWeight: '700',
    fontSize: scaleFontSize(20),
  },
  navTextFocused: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: scaleFontSize(20),
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
