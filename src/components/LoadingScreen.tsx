import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Loading...' }: LoadingScreenProps) {
  const GlassPanel = isLiquidGlassSupported ? LiquidGlassView : View;

  return (
    <View style={styles.container}>
      <GlassPanel
        style={[
          styles.glassPanel,
          !isLiquidGlassSupported && styles.glassPanelFallback,
        ]}
        {...(isLiquidGlassSupported && {
          effect: 'regular',
          tintColor: 'rgba(255, 255, 255, 0.08)',
        })}>
        <ActivityIndicator size="large" color="rgba(255, 255, 255, 0.85)" />
        <Text style={styles.text}>{message}</Text>
      </GlassPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  glassPanel: {
    paddingVertical: 36,
    paddingHorizontal: 44,
    borderRadius: 28,
    alignItems: 'center',
    gap: 18,
    // Subtle dark shadow for depth — no white glow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  glassPanelFallback: {
    backgroundColor: 'rgba(30, 30, 32, 0.72)',
  },
  text: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 17,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});
