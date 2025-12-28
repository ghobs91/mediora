import React, { useRef, useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
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
        backgroundColor: 'rgba(68, 68, 68, 0.3)',
        borderColor: 'rgba(68, 68, 68, 0.5)',
      };
    }

    const variants = {
      primary: {
        backgroundColor: isFocused ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 122, 255, 0.85)',
        borderColor: isFocused ? 'rgba(255, 255, 255, 1)' : 'rgba(0, 122, 255, 0.9)',
      },
      secondary: {
        backgroundColor: isFocused ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.1)',
        borderColor: isFocused ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.3)',
      },
      danger: {
        backgroundColor: isFocused ? 'rgba(255, 69, 58, 0.95)' : 'rgba(255, 69, 58, 0.85)',
        borderColor: isFocused ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 69, 58, 0.9)',
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
      activeOpacity={0.9}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPress={onPress}
      disabled={disabled || loading}
      hasTVPreferredFocus={hasTVPreferredFocus}>
      <Animated.View
        style={[
          styles.button,
          sizeStyles[size],
          getVariantStyles(),
          {
            transform: [{ scale: scaleValue }],
            shadowColor: isFocused ? '#ffffff' : '#000000',
            shadowOffset: { width: 0, height: isFocused ? 8 : 4 },
            shadowOpacity: isFocused ? 0.6 : 0.3,
            shadowRadius: isFocused ? 20 : 8,
            elevation: isFocused ? 12 : 4,
            flexDirection: 'row',
            gap: 8,
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
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    borderWidth: 3,
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
