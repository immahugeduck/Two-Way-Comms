import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
} from 'react-native';
import { colors, spacing, radius, typography } from '@/constants/theme';
import { startRecording, stopRecording, uploadAudio } from '@/lib/audio';

interface Props {
  chatId: string;
  onAudioSent: (audioUrl: string) => void;
  size?: 'normal' | 'large';
}

export default function WalkieButton({ chatId, onAudioSent, size = 'normal' }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const btnSize = size === 'large' ? 140 : 88;

  const startPulse = () => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.35, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();
  };

  const stopPulse = () => {
    pulseLoop.current?.stop();
    Animated.timing(pulse, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  };

  const handlePressIn = async () => {
    setError(null);
    Animated.spring(scale, { toValue: 0.92, useNativeDriver: true }).start();
    startPulse();
    try {
      await startRecording();
      setIsRecording(true);
    } catch (e: any) {
      setError(e.message);
      stopPulse();
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    }
  };

  const handlePressOut = async () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    stopPulse();
    if (!isRecording) return;

    setIsRecording(false);
    try {
      const uri = await stopRecording();
      if (!uri) return;
      const url = await uploadAudio(uri, chatId);
      if (url) onAudioSent(url);
    } catch (e: any) {
      setError('Failed to send voice message');
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.pulse,
          {
            width: btnSize * 1.6,
            height: btnSize * 1.6,
            borderRadius: (btnSize * 1.6) / 2,
            transform: [{ scale: pulse }],
            opacity: isRecording ? 0.25 : 0,
          },
        ]}
      />
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[
            styles.button,
            { width: btnSize, height: btnSize, borderRadius: btnSize / 2 },
            isRecording && styles.buttonActive,
          ]}
        >
          <Text style={[styles.icon, size === 'large' && styles.iconLarge]}>
            {isRecording ? '🔴' : '🎙'}
          </Text>
          <Text style={[typography.label, styles.label, size === 'large' && styles.labelLarge]}>
            {isRecording ? 'Recording...' : 'Hold to Talk'}
          </Text>
        </Pressable>
      </Animated.View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    backgroundColor: colors.walkie,
  },
  button: {
    backgroundColor: colors.walkie,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.walkie,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  buttonActive: {
    backgroundColor: colors.danger,
  },
  icon: {
    fontSize: 28,
  },
  iconLarge: {
    fontSize: 44,
  },
  label: {
    color: colors.textPrimary,
    marginTop: spacing.xs,
    fontSize: 11,
  },
  labelLarge: {
    fontSize: 14,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
