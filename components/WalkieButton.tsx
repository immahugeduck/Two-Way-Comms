import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius, typography } from '@/constants/theme';
import { startRecording, stopRecording, cancelRecording, uploadAudio, formatAudioDuration, getRecordingDurationMs } from '@/lib/audio';

const CANCEL_THRESHOLD = -70; // px upward drag to cancel
const MIN_RECORDING_MS = 500;
const MAX_RECORDING_MS = 5 * 60 * 1000; // 5 min

interface Props {
  chatId: string;
  onAudioSent: (audioUrl: string) => void;
  size?: 'normal' | 'large';
}

export default function WalkieButton({ chatId, onAudioSent, size = 'normal' }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [durationDisplay, setDurationDisplay] = useState('0:00');

  const scale = useRef(new Animated.Value(1)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const slideY = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef<Animated.CompositeAnimation | null>(null);
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingActive = useRef(false);
  // Mutable refs so panResponder always calls the latest version of these callbacks
  const beginRecordingRef = useRef<() => void>(() => {});
  const finishRecordingRef = useRef<(cancel: boolean) => void>(() => {});

  const btnSize = size === 'large' ? 140 : 80;

  const startPulse = () => {
    pulseAnim.current?.stop();
    pulseAnim.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.5, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulseAnim.current.start();
  };

  const stopPulse = () => {
    pulseAnim.current?.stop();
    Animated.timing(pulseScale, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  };

  const startDurationTicker = () => {
    setDurationDisplay('0:00');
    durationTimer.current = setInterval(() => {
      setDurationDisplay(formatAudioDuration(getRecordingDurationMs()));
    }, 100);
  };

  const stopDurationTicker = () => {
    if (durationTimer.current) {
      clearInterval(durationTimer.current);
      durationTimer.current = null;
    }
    setDurationDisplay('0:00');
  };

  const beginRecording = useCallback(async () => {
    if (recordingActive.current || isSending) return;
    setError(null);
    setIsCanceling(false);

    try {
      await startRecording();
      recordingActive.current = true;
      setIsRecording(true);

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Animated.spring(scale, { toValue: 0.9, useNativeDriver: true }).start();
      startPulse();
      startDurationTicker();

      // Auto-send at max duration
      autoSendTimer.current = setTimeout(() => {
        finishRecording(false);
      }, MAX_RECORDING_MS);
    } catch (e: any) {
      setError(e.message ?? 'Could not start recording');
    }
  }, [isSending]);

  const finishRecording = useCallback(async (cancel: boolean) => {
    if (!recordingActive.current) return;
    recordingActive.current = false;

    if (autoSendTimer.current) {
      clearTimeout(autoSendTimer.current);
      autoSendTimer.current = null;
    }

    const elapsed = getRecordingDurationMs();
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    Animated.spring(slideY, { toValue: 0, useNativeDriver: true }).start();
    stopPulse();
    stopDurationTicker();
    setIsRecording(false);
    setIsCanceling(false);

    if (cancel || elapsed < MIN_RECORDING_MS) {
      await cancelRecording();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const uri = await stopRecording();
    if (!uri) return;

    setIsSending(true);
    try {
      const url = await uploadAudio(uri, chatId);
      if (url) onAudioSent(url);
    } catch {
      setError('Failed to send voice message');
    } finally {
      setIsSending(false);
    }
  }, [chatId, onAudioSent]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        beginRecordingRef.current();
      },
      onPanResponderMove: (_, gs) => {
        if (!recordingActive.current) return;
        const dy = Math.min(0, gs.dy);
        slideY.setValue(dy);
        setIsCanceling(gs.dy < CANCEL_THRESHOLD);
      },
      onPanResponderRelease: (_, gs) => {
        finishRecordingRef.current(gs.dy < CANCEL_THRESHOLD);
      },
      onPanResponderTerminate: () => {
        finishRecordingRef.current(true);
      },
    })
  ).current;

  // Keep refs in sync with the latest callback instances
  useEffect(() => { beginRecordingRef.current = beginRecording; }, [beginRecording]);
  useEffect(() => { finishRecordingRef.current = finishRecording; }, [finishRecording]);

  useEffect(() => {
    return () => {
      if (recordingActive.current) cancelRecording();
      stopDurationTicker();
      if (autoSendTimer.current) clearTimeout(autoSendTimer.current);
    };
  }, []);

  const ringOpacity = isRecording ? (isCanceling ? 0.15 : 0.3) : 0;
  const btnColor = isCanceling ? colors.danger : isRecording ? '#FF4500' : colors.walkie;

  return (
    <View style={styles.container}>
      {/* Cancel hint */}
      {isRecording && (
        <Animated.View style={[styles.hint, { transform: [{ translateY: slideY }] }]}>
          <Text style={[typography.caption, isCanceling ? styles.cancelActive : styles.cancelHint]}>
            {isCanceling ? '✕ Release to cancel' : '↑ Slide up to cancel'}
          </Text>
        </Animated.View>
      )}

      {/* Duration */}
      {isRecording && (
        <Text style={styles.duration}>{durationDisplay}</Text>
      )}

      {/* Pulse ring */}
      <Animated.View
        style={[
          styles.pulseRing,
          {
            width: btnSize * 1.7,
            height: btnSize * 1.7,
            borderRadius: (btnSize * 1.7) / 2,
            backgroundColor: btnColor,
            opacity: ringOpacity,
            transform: [{ scale: pulseScale }],
          },
        ]}
      />

      {/* Button */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.button,
          {
            width: btnSize,
            height: btnSize,
            borderRadius: btnSize / 2,
            backgroundColor: btnColor,
            transform: [{ scale }],
          },
        ]}
      >
        <Text style={[styles.icon, size === 'large' && styles.iconLarge]}>
          {isSending ? '⏳' : isRecording ? '🔴' : '🎙'}
        </Text>
        {!isRecording && (
          <Text style={[styles.label, size === 'large' && styles.labelLarge]}>
            Hold to Talk
          </Text>
        )}
      </Animated.View>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  hint: {
    position: 'absolute',
    top: -36,
    alignItems: 'center',
  },
  cancelHint: {
    color: colors.textMuted,
  },
  cancelActive: {
    color: colors.danger,
    fontWeight: '700',
  },
  duration: {
    position: 'absolute',
    top: -20,
    color: colors.danger,
    fontWeight: '700',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  pulseRing: {
    position: 'absolute',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.walkie,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 14,
      },
      android: { elevation: 10 },
    }),
  },
  icon: {
    fontSize: 28,
  },
  iconLarge: {
    fontSize: 46,
  },
  label: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  labelLarge: {
    fontSize: 13,
    marginTop: 4,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
