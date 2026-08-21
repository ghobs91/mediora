import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { LiquidGlassView } from '@callstack/liquid-glass';
import { InviteRedeemForm } from '../components';
import { RootStackParamList } from '../types';
import { useDeviceType } from '../hooks/useResponsive';

/**
 * Standalone "Redeem invite code" screen for devices that already have a
 * setup. Onboarding uses the same InviteRedeemForm inline.
 */
export function InviteRedeemScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'InviteRedeem'>>();
  const insets = useSafeAreaInsets();
  const { isMobile } = useDeviceType();

  const initialCode = route.params?.code;

  const handleSuccess = () => {
    // Navigate home so the user lands in the main app.
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Home');
    }
  };

  const scrollContentStyle = {
    flexGrow: 1,
    justifyContent: 'center' as const,
    paddingTop: isMobile ? insets.top + 80 : 48,
    paddingBottom: isMobile ? insets.bottom + 24 : 48,
    paddingHorizontal: isMobile ? 20 : 48,
  };

  return (
    <View style={styles.wrapper}>
      {isMobile && (
        <View style={[styles.backButtonContainer, { top: insets.top + 8 }]}>
          <LiquidGlassView
            style={styles.backButtonGlass}
            effect="regular"
            tintColor="rgba(255, 255, 255, 0.25)">
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}>
              <Icon name="arrow-back" size={28} color="rgba(60, 60, 67, 0.85)" />
            </TouchableOpacity>
          </LiquidGlassView>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={scrollContentStyle}>
        <InviteRedeemForm
          initialCode={initialCode}
          onSuccess={handleSuccess}
          hasTVPreferredFocus={true}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: {
    flex: 1,
  },
  backButtonContainer: {
    position: 'absolute',
    left: 16,
    zIndex: 200,
  },
  backButtonGlass: {
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
