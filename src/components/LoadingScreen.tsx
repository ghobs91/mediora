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
          !isLiquidGlassSupported && { backgroundColor: 'rgba(255, 255, 255, 0.1)' }
        ]}
        {...(isLiquidGlassSupported && {
          effect: 'regular',
        })}>
        <ActivityIndicator size="large" color="rgba(255, 255, 255, 0.9)" />
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
    padding: 40,
    borderRadius: 32,
    backgroundColor: 'rgba(28, 28, 30, 0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.3)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 32,
    alignItems: 'center',
    gap: 20,
  },
  text: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(255, 255, 255, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});
