import React, { useRef, useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';

interface FocusableButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function FocusableButton({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  style,
}: FocusableButtonProps) {
  const [isFocused, setIsFocused] = useState(false);
  const scaleValue = useRef(new Animated.Value(1)).current;

  const handleFocus = () => {
    setIsFocused(true);
    Animated.spring(scaleValue, {
      toValue: 1.05,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
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
        backgroundColor: '#444',
        borderColor: '#444',
      };
    }

    const variants = {
      primary: {
        backgroundColor: isFocused ? '#fff' : '#0066cc',
        borderColor: isFocused ? '#fff' : '#0066cc',
      },
      secondary: {
        backgroundColor: isFocused ? '#fff' : 'transparent',
        borderColor: '#fff',
      },
      danger: {
        backgroundColor: isFocused ? '#fff' : '#cc0000',
        borderColor: isFocused ? '#fff' : '#cc0000',
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

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPress={onPress}
      disabled={disabled || loading}>
      <Animated.View
        style={[
          styles.button,
          sizeStyles[size],
          getVariantStyles(),
          { transform: [{ scale: scaleValue }] },
          style,
        ]}>
        {loading ? (
          <ActivityIndicator color={getTextColor()} />
        ) : (
          <Text
            style={[
              styles.text,
              { fontSize: textSizes[size], color: getTextColor() },
            ]}>
            {title}
          </Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  text: {
    fontWeight: '600',
  },
});
