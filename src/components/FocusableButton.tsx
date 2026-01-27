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
  useWindowDimensions,
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
  const { width: windowWidth } = useWindowDimensions();

  // Responsive sizing based on device width
  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;

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
    small: { 
      paddingHorizontal: isMobile ? 12 : (isTablet ? 14 : 16), 
      paddingVertical: isMobile ? 6 : (isTablet ? 7 : 8) 
    },
    medium: { 
      paddingHorizontal: isMobile ? 16 : (isTablet ? 20 : 24), 
      paddingVertical: isMobile ? 10 : (isTablet ? 11 : 12) 
    },
    large: { 
      paddingHorizontal: isMobile ? 24 : (isTablet ? 28 : 32), 
      paddingVertical: isMobile ? 14 : (isTablet ? 15 : 16) 
    },
  };

  const textSizes = {
    small: isMobile ? 14 : (isTablet ? 16 : 18),
    medium: isMobile ? 16 : (isTablet ? 19 : 22),
    large: isMobile ? 18 : (isTablet ? 22 : 26),
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
        borderColor: isFocused ? 'rgba(147, 51, 234, 1)' : 'rgba(10, 132, 255, 0.6)',
      },
      secondary: {
        backgroundColor: isLiquidGlassSupported
          ? 'transparent'
          : (isFocused ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.12)'),
        borderColor: isFocused ? 'rgba(147, 51, 234, 1)' : 'rgba(255, 255, 255, 0.3)',
      },
      danger: {
        backgroundColor: isLiquidGlassSupported
          ? 'transparent'
          : (isFocused ? 'rgba(255, 69, 58, 0.85)' : 'rgba(255, 69, 58, 0.7)'),
        borderColor: isFocused ? 'rgba(147, 51, 234, 1)' : 'rgba(255, 69, 58, 0.6)',
      },
    };

    return variants[variant];
  };

  const getTextColor = () => {
    if (disabled) return '#888';
    // Always use white for maximum contrast
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
    borderWidth: 2.5,
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
