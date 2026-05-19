import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamily, spacing } from '../../shared/theme';

interface RecordingOverlayProps {
  visible: boolean;
  cancelArmed: boolean;
  elapsedMs: number;
}

/**
 * Full-screen amber gradient overlay that mirrors Doubao's hold-to-talk UX.
 *
 * Wrapped in a native `Modal` so the gradient covers the entire window
 * (including the status bar area). `pointerEvents="none"` on the inner View
 * lets the underlying RNGH gesture (held in the native module) continue
 * tracking the finger uninterrupted — Modal opening does not terminate RNGH
 * gestures because RNGH bypasses the RN responder system.
 */
export function RecordingOverlay({ visible, cancelArmed, elapsedMs }: RecordingOverlayProps) {
  const insets = useSafeAreaInsets();
  const colorsPair: [string, string] = cancelArmed
    ? [colors['warning-amber-light'] + '00', colors['warning-amber'] + 'F0']
    : [colors['fawn-amber-light'] + '00', colors['fawn-amber'] + 'F0'];
  const seconds = Math.floor(Math.min(elapsedMs, 60_000) / 1000);
  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      // Required by Android; we never want the OS back gesture to dismiss
      // the overlay because dismissal is owned by the press lifecycle.
      onRequestClose={() => undefined}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <LinearGradient colors={colorsPair} style={StyleSheet.absoluteFillObject} />
        <View style={[styles.center, { paddingTop: insets.top + 120 }]}>
          <Text style={styles.hint}>
            {cancelArmed ? '松手取消' : '松手发送，上移取消'}
          </Text>
          <FakeWaveform active={visible} cancelArmed={cancelArmed} />
          <Text style={styles.timer}>{mmss}</Text>
        </View>
      </View>
    </Modal>
  );
}

const BAR_COUNT = 30;
const BAR_MIN_HEIGHT = 12;
const BAR_MAX_DELTA = 48;
const WAVEFORM_INTERVAL_MS = 250;

function randomBars(): number[] {
  return Array.from({ length: BAR_COUNT }, () => BAR_MIN_HEIGHT + Math.random() * BAR_MAX_DELTA);
}

function FakeWaveform({ active, cancelArmed }: { active: boolean; cancelArmed: boolean }) {
  const [bars, setBars] = useState<number[]>(() => randomBars());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setBars(randomBars()), WAVEFORM_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active]);
  const barColor = cancelArmed ? colors['warning-amber'] : colors['on-brand'];
  return (
    <View style={styles.waveformRow}>
      {bars.map((h, i) => (
        <View key={i} style={[styles.waveformBar, { height: h, backgroundColor: barColor }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing['8'],
  },
  hint: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 16,
    lineHeight: 22,
    color: colors['white'],
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  timer: {
    fontFamily: fontFamily.sansBold,
    fontSize: 28,
    lineHeight: 34,
    color: colors['white'],
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: BAR_MIN_HEIGHT + BAR_MAX_DELTA,
    gap: 2,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
  },
});
