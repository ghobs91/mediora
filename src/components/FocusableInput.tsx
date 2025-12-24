import React, { useRef, useState } from 'react';
import {
  TextInput,
  StyleSheet,
  View,
  Text,
  Animated,
  TextInputProps,
} from 'react-native';

interface FocusableInputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function FocusableInput({
  label,
  error,
  style,
  ...props
}: FocusableInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const borderColor = useRef(new Animated.Value(0)).current;

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
      {label && <Text style={styles.label}>{label}</Text>}
      <Animated.View
        style={[
          styles.inputContainer,
          { borderColor: error ? '#cc0000' : animatedBorderColor },
        ]}>
        <TextInput
          {...props}
          style={[styles.input, style]}
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
    marginBottom: 20,
  },
  label: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 17,
    marginBottom: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  inputContainer: {
    borderWidth: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(26, 26, 26, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  input: {
    color: '#fff',
    fontSize: 19,
    padding: 18,
    minWidth: 300,
    fontWeight: '500',
  },
  error: {
    color: 'rgba(255, 69, 58, 0.95)',
    fontSize: 15,
    marginTop: 6,
    fontWeight: '500',
  },
});
