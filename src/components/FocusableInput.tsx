import React, { useRef, useState } from 'react';
import {
  TextInput,
  StyleSheet,
  View,
  Text,
  Animated,
  TextInputProps,
  Dimensions,
  Platform,
} from 'react-native';

interface FocusableInputProps extends TextInputProps {
  label?: string;
  error?: string;
}

const MOBILE_BREAKPOINT = 768;

export function FocusableInput({
  label,
  error,
  style,
  ...props
}: FocusableInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const borderColor = useRef(new Animated.Value(0)).current;
  const windowWidth = Dimensions.get('window').width;
  const isMobile = !Platform.isTV && windowWidth < MOBILE_BREAKPOINT;

  const handleFocus = () => {
    setIsFocused(true);
    Animated.timing(borderColor, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    Animated.timing(borderColor, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const animatedBorderColor = borderColor.interpolate({
    inputRange: [0, 1],
    outputRange: ['#444', '#fff'],
  });

  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, isMobile && styles.labelMobile]}>{label}</Text>}
      <Animated.View
        style={[
          styles.inputContainer,
          isMobile && styles.inputContainerMobile,
          { borderColor: error ? '#cc0000' : animatedBorderColor },
        ]}>
        <TextInput
          {...props}
          style={[styles.input, isMobile && styles.inputMobile, style]}
          placeholderTextColor="#666"
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </Animated.View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 17,
    marginBottom: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  labelMobile: {
    fontSize: 15,
    marginBottom: 8,
  },
  inputContainer: {
    borderWidth: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(26, 26, 26, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  inputContainerMobile: {
    borderWidth: 1.5,
    borderRadius: 8,
  },
  input: {
    color: '#fff',
    fontSize: 17,
    padding: 16,
    fontWeight: '500',
  },
  inputMobile: {
    fontSize: 16,
    padding: 12,
  },
  error: {
    color: 'rgba(255, 69, 58, 0.95)',
    fontSize: 14,
    marginTop: 6,
    fontWeight: '500',
  },
});
