import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import qrcode from 'qrcode-generator';

interface QRCodeProps {
  value: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
  quietZoneModules?: number;
}

/**
 * Pure-JS QR code rendered as a grid of Views. No native dependencies, so it
 * works identically on tvOS, iOS, and macOS.
 */
export function QRCode({
  value,
  size = 220,
  color = '#000000',
  backgroundColor = '#FFFFFF',
  quietZoneModules = 4,
}: QRCodeProps) {
  const result = useMemo(() => {
    try {
      const qr = qrcode(0, 'M'); // type 0 = auto-detect smallest version
      qr.addData(value);
      qr.make();
      const moduleCount = qr.getModuleCount();
      const modules: boolean[] = [];
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          modules.push(qr.isDark(row, col));
        }
      }
      return { moduleCount, modules };
    } catch (error) {
      console.error('[QRCode] Failed to generate QR code:', error);
      return null;
    }
  }, [value]);

  if (!result) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Unable to render QR code</Text>
      </View>
    );
  }

  const { moduleCount, modules } = result;
  const totalModules = moduleCount + quietZoneModules * 2;
  const cellSize = Math.max(2, Math.floor(size / totalModules));

  return (
    <View
      style={[
        styles.grid,
        {
          width: cellSize * totalModules,
          height: cellSize * totalModules,
          backgroundColor,
          padding: cellSize * quietZoneModules,
        },
      ]}>
      {modules.map((isDark, index) => (
        <View
          key={index}
          style={{
            width: cellSize,
            height: cellSize,
            backgroundColor: isDark ? color : backgroundColor,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 8,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  errorText: {
    color: '#ff453a',
    fontSize: 14,
  },
});
