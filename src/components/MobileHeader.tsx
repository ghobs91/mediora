import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidGlassView } from '@callstack/liquid-glass';
import Icon from 'react-native-vector-icons/Ionicons';

interface MobileHeaderProps {
  title?: string;
  onMenuPress: () => void;
  rightButton?: React.ReactNode;
}

export function MobileHeader({ title, onMenuPress, rightButton }: MobileHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <LiquidGlassView
      style={[styles.header, { paddingTop: insets.top }]}
      effect="regular"
      tintColor="rgba(255, 255, 255, 0.15)">
      <View style={styles.headerContent}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={onMenuPress}
          activeOpacity={0.7}>
          <Icon name="menu" size={26} color="rgba(0, 0, 0, 0.85)" />
        </TouchableOpacity>

        {title && (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        )}

        <View style={styles.rightContainer}>
          {rightButton}
        </View>
      </View>
    </LiquidGlassView>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
    shadowColor: 'rgba(0, 0, 0, 0.15)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 16,
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: 'rgba(0, 0, 0, 0.9)',
    letterSpacing: 0.3,
  },
  rightContainer: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
