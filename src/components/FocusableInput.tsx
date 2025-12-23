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
    marginBottom: 16,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '500',
  },
  inputContainer: {
    borderWidth: 2,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
  },
  input: {
    color: '#fff',
    fontSize: 18,
    padding: 16,
    minWidth: 300,
  },
  error: {
    color: '#cc0000',
    fontSize: 14,
    marginTop: 4,
  },
});
