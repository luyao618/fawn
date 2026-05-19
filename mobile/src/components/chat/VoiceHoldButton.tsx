import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';

import { transcribeVoice } from '../../shared/api/chat';
import {
  colors,
  fontFamily,
  layout,
  radii,
  shadows,
  spacing,
} from '../../shared/theme';
import { RecordingOverlay } from './RecordingOverlay';

interface Props {
  /** Called with recognized Chinese text after a successful transcription.
   * The caller is responsible for writing the value into the chat draft —
   * this component never auto-sends. */
  onTranscribed: (text: string) => void;
  /** Fires the moment release is processed (post-stop, pre-ASR). Lets the
   * caller paint a placeholder user bubble so the user sees feedback during
   * the network roundtrip. */
  onUploadStart?: () => void;
  /** Fires if the upload ends without a transcribed text (network error,
   * empty result, cancel). Lets the caller remove its placeholder bubble. */
  onUploadEnd?: (success: boolean) => void;
  /** Disable while another action (image upload, SSE send) is in flight. */
  disabled?: boolean;
}

/** Minimum hold duration before recording arms (filters accidental taps). */
const HOLD_MIN_MS = 80;
/** Vertical swipe-up distance past which release cancels the upload. */
const CANCEL_DY = -50;
/** Max recording length before auto-stop (spec AC4 / AC9). */
const MAX_RECORDING_MS = 60_000;
/** Foot/tail of the user-visible recording status timer. */
const ELAPSED_TICK_MS = 250;

/**
 * 16kHz mono m4a/aac matches the backend ASR submit body (codec:raw,
 * rate:16000, bits:16, channel:1). Derived from HIGH_QUALITY preset with
 * sample rate + channel count downgraded for ASR efficiency.
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

/**
 * Doubao-style hold-to-talk button.
 *
 * Gesture: `Gesture.Simultaneous(LongPress, Pan)` — LongPress arms at 80ms,
 * Pan starts firing `onUpdate` after the same delay (`activateAfterLongPress`)
 * so the cancel-swipe is only active while the recording is on. RNGH state
 * lives in the native module, so Modal opening (the overlay) does NOT
 * terminate the gesture — that was the broken assumption in v1 (Pressable
 * + responder system + Modal).
 */
export function VoiceHoldButton({ onTranscribed, onUploadStart, onUploadEnd, disabled }: Props) {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const [stage, setStage] = useState<'idle' | 'recording' | 'uploading'>('idle');
  const [cancelArmed, setCancelArmed] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Refs read inside gesture worklets / async closures — avoid stale state.
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const cancelArmedRef = useRef(cancelArmed);
  cancelArmedRef.current = cancelArmed;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const finishingRef = useRef(false); // synchronous idempotency guard

  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);

  // === RNGH composed gesture ===
  // Stable identity (deps=[]) — re-binding mid-gesture would drop touches.
  // disabled is read through disabledRef so capture is always fresh without
  // re-creating the gesture object.
  // `.runOnJS(true)` makes every callback run on the JS thread instead of
  // a Reanimated worklet — eliminates the react-native-worklets dependency
  // and the associated TurboModule init clash with Reanimated v4 on this
  // Expo SDK 54 native arch build.
  const gesture = useMemo(() => {
    const longPress = Gesture.LongPress()
      .runOnJS(true)
      .minDuration(HOLD_MIN_MS)
      .maxDistance(10000) // distance owned by Pan, not LongPress
      .shouldCancelWhenOutside(false)
      .onStart(() => {
        if (disabledRef.current) return;
        beginRecording();
      });

    const pan = Gesture.Pan()
      .runOnJS(true)
      .activateAfterLongPress(HOLD_MIN_MS)
      .onUpdate((e) => {
        updateCancelArmed(e.translationY);
      })
      .onEnd(() => {
        handleRelease();
      })
      .onFinalize((_, success) => {
        // Covers OS interrupt / cancel where onEnd did not fire.
        // handleRelease is idempotent via finishingRef so a duplicate call
        // on success paths is a no-op.
        if (!success) handleRelease();
      });

    return Gesture.Simultaneous(longPress, pan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateCancelArmed(translationY: number) {
    if (stageRef.current !== 'recording') return;
    const armed = translationY <= CANCEL_DY;
    if (armed !== cancelArmedRef.current) setCancelArmed(armed);
  }

  function handleRelease() {
    if (stageRef.current !== 'recording') return;
    void finishRecording(cancelArmedRef.current);
  }

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

  function clearLifecycleTimers() {
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
    if (stageRef.current !== 'idle') return;
    const ok = await ensurePermission();
    // Re-check stage — user may have lifted finger during the permission dialog.
    if (!ok || stageRef.current !== 'idle') return;
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      Alert.alert('录音失败', err instanceof Error ? err.message : '请稍后重试');
      return;
    }
    setStage('recording');
    setCancelArmed(false);
    setElapsedMs(0);
    startedAt.current = Date.now();
    elapsedTimer.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAt.current);
    }, ELAPSED_TICK_MS);
    // autoStop always uploads (decision in plan: prefer not losing what the
    // user already said even if their finger was in cancel position at the 60s mark).
    autoStopTimer.current = setTimeout(() => {
      void finishRecording(false);
    }, MAX_RECORDING_MS);
  }

  async function finishRecording(cancelled: boolean) {
    // Idempotency — onEnd, onFinalize(!success), and autoStop can all race.
    if (finishingRef.current) return;
    finishingRef.current = true;
    clearLifecycleTimers();
    try {
      try {
        await recorder.stop();
      } catch {
        // recorder may already be stopped by the auto-stop branch; ignore.
      }
      if (cancelled) return;
      const uri = recorder.uri;
      if (!uri) return;
      setStage('uploading');
      onUploadStart?.();
      let uploadOk = false;
      try {
        // Temporary log to verify cancel path stays silent — see AC7 in plan.
        console.log('[voice] POST transcribe', uri);
        const { text } = await transcribeVoice({
          uri,
          name: 'voice.m4a',
          type: 'audio/m4a',
        });
        if (text.trim().length > 0) {
          uploadOk = true;
          onTranscribed(text);
        }
      } catch (err) {
        const errInfo = err as { response?: { data?: { detail?: string } } };
        const message =
          errInfo?.response?.data?.detail ?? '语音识别失败，请稍后再试';
        Alert.alert('语音识别失败', message);
      } finally {
        onUploadEnd?.(uploadOk);
      }
    } finally {
      setStage('idle');
      setCancelArmed(false);
      setElapsedMs(0);
      finishingRef.current = false;
    }
  }

  // Defensive cleanup on unmount: clear timers + stop any in-flight recorder.
  useEffect(() => {
    return () => {
      clearLifecycleTimers();
      recorder.stop().catch(() => undefined);
    };
  }, [recorder]);

  const labelText =
    stage === 'uploading' ? '按住 说话' : stage === 'recording' ? '正在录音…' : '按住 说话';

  return (
    <>
      <GestureDetector gesture={gesture}>
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel="按住说话"
          accessibilityHint="按住开始录音，松手发送，向上滑动取消"
          style={[
            styles.button,
            disabled && styles.buttonDisabled,
            stage === 'recording' && styles.buttonActive,
          ]}
        >
          <Text style={[styles.label, stage === 'recording' && styles.labelActive]}>
            {labelText}
          </Text>
        </View>
      </GestureDetector>
      <RecordingOverlay
        visible={stage === 'recording'}
        cancelArmed={cancelArmed}
        elapsedMs={elapsedMs}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    minHeight: layout.iconButton,
    borderRadius: radii.input,
    backgroundColor: colors['warm-gray'],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['4'],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonActive: {
    backgroundColor: colors['fawn-amber'],
    ...shadows.card,
  },
  label: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 15,
    lineHeight: 20,
    color: colors['soft-charcoal'],
  },
  labelActive: {
    color: colors['on-brand'],
  },
});
