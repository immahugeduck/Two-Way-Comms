import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { createAudioPlayer, formatAudioDuration } from '@/lib/audio';
import type { AudioPlayerHandle } from '@/lib/audio';
import { colors, spacing, radius } from '@/constants/theme';

interface Props {
  url: string;
  isOwn: boolean;
  autoPlay?: boolean;
}

type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export default function AudioPlayer({ url, isOwn, autoPlay = false }: Props) {
  const [state, setState] = useState<PlayerState>('idle');
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const playerRef = useRef<AudioPlayerHandle | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const didAutoPlay = useRef(false);

  const accent = isOwn ? '#AAFFEC' : colors.primary;
  const track = isOwn ? 'rgba(255,255,255,0.2)' : colors.surfaceElevated;

  const load = useCallback(async (andPlay = false) => {
    if (playerRef.current) {
      await playerRef.current.unload();
      playerRef.current = null;
    }
    setState('loading');
    try {
      const player = await createAudioPlayer(url, (status) => {
        setPositionMs(status.positionMs);
        setDurationMs(status.durationMs);

        const progress = status.durationMs > 0 ? status.positionMs / status.durationMs : 0;
        Animated.timing(progressAnim, {
          toValue: progress,
          duration: 100,
          useNativeDriver: false,
        }).start();

        if (status.isPlaying) {
          setState('playing');
        } else if (status.didFinish) {
          setState('idle');
          progressAnim.setValue(0);
          setPositionMs(0);
        } else {
          setState((prev) => (prev === 'playing' ? 'paused' : prev));
        }
      });
      playerRef.current = player;
      setState('idle');
      if (andPlay) {
        await player.play();
        setState('playing');
      }
    } catch {
      setState('error');
    }
  }, [url]);

  useEffect(() => {
    if (autoPlay && !didAutoPlay.current) {
      didAutoPlay.current = true;
      load(true);
    }
    return () => {
      playerRef.current?.unload();
      playerRef.current = null;
    };
  }, []);

  const handlePress = async () => {
    if (state === 'loading') return;

    if (state === 'playing') {
      await playerRef.current?.pause();
      setState('paused');
      return;
    }

    if (state === 'paused') {
      await playerRef.current?.play();
      setState('playing');
      return;
    }

    // idle or error — load and play
    await load(true);
  };

  const elapsed = positionMs > 0 ? positionMs : durationMs > 0 ? 0 : 0;
  const displayTime = state === 'playing' || state === 'paused'
    ? formatAudioDuration(elapsed)
    : formatAudioDuration(durationMs);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.playBtn} onPress={handlePress} activeOpacity={0.7}>
        {state === 'loading' ? (
          <ActivityIndicator size="small" color={accent} />
        ) : state === 'error' ? (
          <Text style={[styles.playIcon, { color: colors.danger }]}>⚠</Text>
        ) : state === 'playing' ? (
          <Text style={[styles.playIcon, { color: accent }]}>⏸</Text>
        ) : (
          <Text style={[styles.playIcon, { color: accent }]}>▶</Text>
        )}
      </TouchableOpacity>

      <View style={styles.right}>
        {/* Waveform / Progress track */}
        <View style={[styles.track, { backgroundColor: track }]}>
          <Animated.View
            style={[
              styles.fill,
              {
                backgroundColor: accent,
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
          {/* Static waveform bars */}
          <View style={styles.waveOverlay}>
            {WAVEFORM.map((h, i) => (
              <View
                key={i}
                style={[
                  styles.bar,
                  {
                    height: h,
                    backgroundColor: accent,
                    opacity: 0.55,
                  },
                ]}
              />
            ))}
          </View>
        </View>

        <Text style={[styles.time, { color: isOwn ? 'rgba(255,255,255,0.6)' : colors.textMuted }]}>
          {displayTime}
        </Text>
      </View>
    </View>
  );
}

// Static decorative waveform heights
const WAVEFORM = [6, 10, 14, 8, 18, 12, 20, 10, 16, 8, 14, 20, 6, 18, 10, 14, 8, 20, 12, 16, 8, 10, 14, 6];

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
    minWidth: 180,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    fontSize: 20,
  },
  right: {
    flex: 1,
    gap: 4,
  },
  track: {
    height: 28,
    borderRadius: radius.sm,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.sm,
  },
  waveOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: spacing.xs,
    height: '100%',
  },
  bar: {
    width: 3,
    borderRadius: 2,
  },
  time: {
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});
