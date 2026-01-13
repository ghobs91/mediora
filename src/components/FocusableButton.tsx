import React, { useRef, useState, useEffect } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
  ViewStyle,
  View,
  Platform,
} from 'react-native';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import Icon from 'react-native-vector-icons/Ionicons';

interface FocusableButtonProps {
  title: string | React.ReactNode;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  hasTVPreferredFocus?: boolean;
  icon?: string;
}

export function FocusableButton({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  style,
  hasTVPreferredFocus = false,
  icon,
}: FocusableButtonProps) {
  const [isFocused, setIsFocused] = useState(false);
  const scaleValue = useRef(new Animated.Value(1)).current;

  // Debug: Log liquid glass support once
  useEffect(() => {
    console.log('[FocusableButton] Liquid Glass Supported:', isLiquidGlassSupported);
    console.log('[FocusableButton] Platform:', Platform.OS, Platform.Version);
  }, []);

  const handleFocus = () => {
    setIsFocused(true);
    Animated.spring(scaleValue, {
      toValue: 1.08,
      useNativeDriver: true,
      friction: 7,
      tension: 100,
    }).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
      friction: 7,
      tension: 100,
    }).start();
  };

  const sizeStyles = {
    small: { paddingHorizontal: 16, paddingVertical: 8 },
    medium: { paddingHorizontal: 24, paddingVertical: 12 },
    large: { paddingHorizontal: 32, paddingVertical: 16 },
  };

  const textSizes = {
    small: 14,
    medium: 16,
    large: 20,
  };

  const getVariantStyles = () => {
    if (disabled) {
      return {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.15)',
      };
    }

    // If liquid glass is supported, use transparent backgrounds (glass handles the blur)
    // Otherwise use semi-transparent colored backgrounds with enhanced vibrancy
    const variants = {
      primary: {
        backgroundColor: isLiquidGlassSupported 
          ? 'transparent' 
          : (isFocused ? 'rgba(10, 132, 255, 0.85)' : 'rgba(10, 132, 255, 0.75)'),
        borderColor: isFocused ? 'rgba(255, 255, 255, 0.8)' : 'rgba(10, 132, 255, 0.6)',
      },
      secondary: {
        backgroundColor: isLiquidGlassSupported
          ? 'transparent'
          : (isFocused ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.12)'),
        borderColor: isFocused ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.3)',
      },
      danger: {
        backgroundColor: isLiquidGlassSupported
          ? 'transparent'
          : (isFocused ? 'rgba(255, 69, 58, 0.85)' : 'rgba(255, 69, 58, 0.7)'),
        borderColor: isFocused ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 69, 58, 0.6)',
      },
    };

    return variants[variant];
  };

  const getTextColor = () => {
    if (disabled) return '#888';
    if (isFocused) return '#000';
    if (variant === 'secondary') return '#fff';
    return '#fff';
  };

  const glassEffect = variant === 'secondary' ? 'clear' : 'regular';

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPress={onPress}
      disabled={disabled || loading}
      hasTVPreferredFocus={hasTVPreferredFocus}>
      <Animated.View
        style={[
          {
            transform: [{ scale: scaleValue }],
            shadowColor: isFocused ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.3)',
            shadowOffset: { width: 0, height: isFocused ? 12 : 6 },
            shadowOpacity: isFocused ? 1 : 0.4,
            shadowRadius: isFocused ? 28 : 12,
            elevation: isFocused ? 16 : 6,
          },
        ]}>
        {isLiquidGlassSupported ? (
          <LiquidGlassView
            style={[
              styles.button,
              sizeStyles[size],
              getVariantStyles(),
              {
                flexDirection: 'row',
                gap: 8,
              },
              style,
            ]}
            effect={glassEffect}
            interactive={!disabled}
            tintColor={variant === 'primary' ? 'rgba(10, 132, 255, 0.4)' : variant === 'danger' ? 'rgba(255, 69, 58, 0.4)' : undefined}>
            {loading ? (
              <ActivityIndicator color={getTextColor()} />
            ) : (
              <>
                {icon && <Icon name={icon} size={24} color={getTextColor()} />}
                {typeof title === 'string' ? (
                  <Text
                    style={[
                      styles.text,
                      { fontSize: textSizes[size], color: getTextColor() },
                    ]}>
                    {title}
                  </Text>
                ) : (
                  title
                )}
              </>
            )}
          </LiquidGlassView>
        ) : (
          <View
            style={[
              styles.button,
              sizeStyles[size],
              getVariantStyles(),
              {
                flexDirection: 'row',
                gap: 8,
                backgroundColor: getVariantStyles().backgroundColor,
              },
              style,
            ]}>
            {loading ? (
              <ActivityIndicator color={getTextColor()} />
            ) : (
              <>
                {icon && <Icon name={icon} size={24} color={getTextColor()} />}
                {typeof title === 'string' ? (
                  <Text
                    style={[
                      styles.text,
                      { fontSize: textSizes[size], color: getTextColor() },
                    ]}>
                    {title}
                  </Text>
                ) : (
                  title
                )}
              </>
            )}
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
    overflow: 'hidden',
  },
  text: {
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
