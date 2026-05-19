import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';

import { transcribeVoice } from '../../shared/api/chat';
import {
  colors,
  iconButtonRadius,
  layout,
  radii,
  shadows,
  spacing,
  typography,
} from '../../shared/theme';

interface Props {
  /** Called with recognized Chinese text after a successful transcription.
   * Caller is responsible for writing the value into the chat draft — this
   * component never auto-sends the message. */
  onTranscribed: (text: string) => void;
  /** Disable mic while another action (image upload / SSE send) is in flight. */
  disabled?: boolean;
}

/** Minimum hold duration before recording starts; filters accidental taps. */
const LONG_PRESS_DELAY_MS = 150;
/** Max recording duration before auto-stop and upload (spec AC4). */
const MAX_RECORDING_MS = 60_000;
/** Vertical swipe-up distance (in dp) past which release cancels the upload. */
const CANCEL_SWIPE_DP = 60;

/**
 * 16kHz mono m4a/aac — matches the backend ASR submit body (codec:raw, rate:16000,
 * bits:16, channel:1). Derived from HIGH_QUALITY preset with sample rate and
 * channel count downgraded for ASR efficiency (1/3 bandwidth vs default 44.1k stereo).
 */
const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
};

export function MicButton({ onTranscribed, disabled }: Props) {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const [stage, setStage] = useState<'idle' | 'recording' | 'uploading'>('idle');
  const [cancelArmed, setCancelArmed] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimestamp = useRef<number>(0);
  // Capture the latest cancel state inside the async stop handler without
  // re-binding the handler each render (the long-press lifecycle is owned by
  // Pressable callbacks, not React state).
  const cancelArmedRef = useRef(false);
  cancelArmedRef.current = cancelArmed;

  // Defensive cleanup on unmount: stop any in-flight recording so we never
  // leave the AVAudioSession active behind us. `recorder.stop()` is a no-op
  // (and rejects, hence the catch) when the recorder is already stopped, so
  // calling it unconditionally is safe and avoids subscribing to recorder
  // state just to gate this branch.
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (autoStopTimer.current) clearTimeout(autoStopTimer.current);
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
      recorder.stop().catch(() => undefined);
    };
  }, [recorder]);

  async function ensurePermission(): Promise<boolean> {
    const result = await requestRecordingPermissionsAsync();
    if (result.status === 'granted') return true;
    Alert.alert(
      '需要麦克风权限',
      '请在系统设置中允许 Fawn 使用麦克风后再试。',
      [
        { text: '取消', style: 'cancel' },
        { text: '去设置', onPress: () => Linking.openSettings() },
      ],
    );
    return false;
  }

  function clearTimers() {
    if (autoStopTimer.current) {
      clearTimeout(autoStopTimer.current);
      autoStopTimer.current = null;
    }
    if (elapsedTimer.current) {
      clearInterval(elapsedTimer.current);
      elapsedTimer.current = null;
    }
  }

  async function beginRecording() {
    const ok = await ensurePermission();
    if (!ok) return;
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      Alert.alert('录音失败', err instanceof Error ? err.message : '请稍后重试');
      setStage('idle');
      return;
    }
    setStage('recording');
    startTimestamp.current = Date.now();
    setElapsedMs(0);
    setCancelArmed(false);
    elapsedTimer.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimestamp.current);
    }, 250);
    autoStopTimer.current = setTimeout(() => {
      finishRecording(/*cancelled=*/ false);
    }, MAX_RECORDING_MS);
  }

  async function finishRecording(cancelled: boolean) {
    clearTimers();
    try {
      await recorder.stop();
    } catch {
      // ignore — recorder may already be stopped by the auto-stop branch.
    }
    if (cancelled) {
      setStage('idle');
      setCancelArmed(false);
      setElapsedMs(0);
      return;
    }
    const uri = recorder.uri;
    if (!uri) {
      setStage('idle');
      return;
    }
    setStage('uploading');
    try {
      const { text } = await transcribeVoice({
        uri,
        name: 'voice.m4a',
        type: 'audio/m4a',
      });
      if (text.trim().length > 0) onTranscribed(text);
    } catch (err) {
      const message =
        // axios-style error: prefer the backend's Chinese detail when present.
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? '语音识别失败，请稍后再试';
      Alert.alert('语音识别失败', message);
    } finally {
      setStage('idle');
      setCancelArmed(false);
      setElapsedMs(0);
    }
  }

  function handlePressIn() {
    if (disabled || stage !== 'idle') return;
    // Defer the actual start to LONG_PRESS_DELAY_MS so a quick tap does not
    // arm the recorder; matches the spec's "长按 ≥150ms" interaction model.
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      void beginRecording();
    }, LONG_PRESS_DELAY_MS);
  }

  function handlePressOut() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      return;
    }
    if (stage !== 'recording') return;
    void finishRecording(cancelArmedRef.current);
  }

  // Track upward finger drag during the press to arm/disarm cancellation.
  // Pressable does not expose touch deltas directly, so we use onTouchMove on
  // the wrapping overlay (mounted only while recording).
  function handleTouchMove(event: { nativeEvent: { pageY: number } }) {
    if (stage !== 'recording') return;
    const draggedY = event.nativeEvent.pageY;
    const armed = startTimestamp.current > 0 && draggedY < startCoord.current - CANCEL_SWIPE_DP;
    if (armed !== cancelArmedRef.current) setCancelArmed(armed);
  }

  // pageY of the initial touch — used as the baseline for the cancel swipe.
  const startCoord = useRef(0);
  function handleTouchStart(event: { nativeEvent: { pageY: number } }) {
    startCoord.current = event.nativeEvent.pageY;
  }

  const seconds = Math.floor(Math.min(elapsedMs, MAX_RECORDING_MS) / 1000);

  return (
    <>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        disabled={disabled || stage === 'uploading'}
        accessibilityRole="button"
        accessibilityLabel="按住说话"
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
          (stage === 'recording' || stage === 'uploading') && styles.buttonActive,
        ]}
      >
        {stage === 'uploading' ? (
          <ActivityIndicator size="small" color={colors['on-brand']} />
        ) : (
          <Ionicons
            name="mic"
            size={20}
            color={stage === 'recording' ? colors['on-brand'] : colors['dark-gray']}
          />
        )}
      </Pressable>

      <Modal
        visible={stage === 'recording'}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.overlay} pointerEvents="none">
          <View style={[styles.banner, cancelArmed && styles.bannerCancel]}>
            <Text style={styles.bannerHint}>
              {cancelArmed ? '松手取消' : '松手发送，上移取消'}
            </Text>
            <Text style={styles.bannerTimer}>
              {`${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`}
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: layout.iconButton,
    height: layout.iconButton,
    borderRadius: iconButtonRadius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors['warm-gray'],
  },
  buttonPressed: {
    backgroundColor: colors['nursery-mint'],
  },
  buttonActive: {
    backgroundColor: colors['fawn-amber'],
    ...shadows.card,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: spacing['10'] ?? spacing['8'],
  },
  banner: {
    backgroundColor: colors['card-translucent'],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors['frosted-border'],
    paddingHorizontal: spacing['5'],
    paddingVertical: spacing['3'],
    alignItems: 'center',
    gap: spacing['1'],
    ...shadows.float,
  },
  bannerCancel: {
    backgroundColor: colors['warning-amber-light'],
    borderColor: colors['warning-amber'],
  },
  bannerHint: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors['soft-charcoal'],
  },
  bannerTimer: {
    ...typography.body,
    fontWeight: '700',
    color: colors['fawn-amber'],
  },
});
