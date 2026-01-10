import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Modal, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { scaleSize, scaleFontSize } from '../utils/scaling';
import { useDeviceType } from '../hooks/useResponsive';

interface SidebarProps {
  currentRoute: string;
}

export function Sidebar({ currentRoute }: SidebarProps) {
  const navigation = useNavigation<any>();
  const [focusedItem, setFocusedItem] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { isMobile } = useDeviceType();
  const insets = useSafeAreaInsets();

  const navItems = [
    { name: 'Home', route: 'Home', icon: 'home-outline' },
    { name: 'TV Shows', route: 'TVShows', icon: 'tv-outline', section: 'library' },
    { name: 'Movies', route: 'Movies', icon: 'film-outline', section: 'library' },
    { name: 'Live TV', route: 'LiveTV', icon: 'radio-outline' },
    { name: 'Search', route: 'Search', icon: 'search-outline' },
    { name: 'Settings', route: 'Settings', icon: 'settings-outline' },
  ];

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

  // Mobile: Render hamburger menu button and drawer
  if (isMobile) {
    return (
      <>
        {/* Hamburger Menu Button */}
        <TouchableOpacity
          style={[styles.hamburgerButton, { top: insets.top + 8 }]}
          onPress={() => setIsDrawerOpen(true)}
          activeOpacity={0.7}>
          <Icon name="menu" size={28} color="#fff" />
        </TouchableOpacity>

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
    <View style={styles.sidebar}>
      <View style={styles.header}>
        <Text style={styles.logo}>Mediora</Text>
      </View>
      
      <ScrollView style={styles.navContainer} showsVerticalScrollIndicator={false}>
        {renderNavItems()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fixed Sidebar Styles (Desktop/Tablet/TV)
  sidebar: {
    width: scaleSize(240),
    backgroundColor: 'rgba(18, 18, 20, 0.98)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(139, 92, 246, 0.3)',
    paddingTop: scaleSize(48),
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  header: {
    paddingHorizontal: scaleSize(24),
    paddingBottom: scaleSize(28),
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(139, 92, 246, 0.4)',
    marginBottom: scaleSize(20),
  },
  logo: {
    fontSize: scaleFontSize(32),
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1.2,
    textShadowColor: 'rgba(139, 92, 246, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
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
    backgroundColor: 'rgba(139, 92, 246, 0.35)',
    borderLeftWidth: scaleSize(6),
    borderLeftColor: '#a78bfa',
    borderWidth: 3,
    borderColor: 'rgba(167, 139, 250, 0.7)',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  navItemFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderLeftWidth: scaleSize(6),
    borderLeftColor: '#ffffff',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    transform: [{ scale: 1.1 }],
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
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

  // Mobile Hamburger Button
  hamburgerButton: {
    position: 'absolute',
    left: 16,
    zIndex: 100,
    padding: 8,
    backgroundColor: 'rgba(18, 18, 20, 0.9)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
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
    backgroundColor: 'rgba(18, 18, 20, 0.98)',
    paddingHorizontal: 20,
    borderRightWidth: 2,
    borderRightColor: 'rgba(139, 92, 246, 0.3)',
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(139, 92, 246, 0.4)',
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
