import { Audio, AVPlaybackStatus } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';

let activeRecording: Audio.Recording | null = null;
let recordingStartTime: number | null = null;

export async function requestMicrophonePermission(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
}

export async function startRecording(): Promise<void> {
  const granted = await requestMicrophonePermission();
  if (!granted) throw new Error('Microphone permission denied');

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  const { recording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY
  );
  activeRecording = recording;
  recordingStartTime = Date.now();
}

export function getRecordingDurationMs(): number {
  if (!recordingStartTime) return 0;
  return Date.now() - recordingStartTime;
}

export async function stopRecording(): Promise<string | null> {
  if (!activeRecording) return null;

  await activeRecording.stopAndUnloadAsync();
  const uri = activeRecording.getURI();
  activeRecording = null;
  recordingStartTime = null;

  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

  return uri ?? null;
}

export async function cancelRecording(): Promise<void> {
  if (!activeRecording) return;
  try {
    await activeRecording.stopAndUnloadAsync();
  } catch {}
  const uri = activeRecording.getURI();
  activeRecording = null;
  recordingStartTime = null;

  // Delete the temp file
  if (uri) {
    try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
  }
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
}

export async function uploadAudio(
  localUri: string,
  chatId: string
): Promise<string | null> {
  const fileName = `${chatId}/${Date.now()}.m4a`;
  const fileInfo = await FileSystem.getInfoAsync(localUri);
  if (!fileInfo.exists) return null;

  const response = await fetch(localUri);
  const blob = await response.blob();

  const { data, error } = await supabase.storage
    .from('voice-messages')
    .upload(fileName, blob, { contentType: 'audio/m4a', upsert: false });

  if (error) throw error;

  const { data: publicUrlData } = supabase.storage
    .from('voice-messages')
    .getPublicUrl(data.path);

  // Clean up local temp file
  try { await FileSystem.deleteAsync(localUri, { idempotent: true }); } catch {}

  return publicUrlData.publicUrl;
}

export interface AudioPlayerHandle {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  unload: () => Promise<void>;
  getDuration: () => number; // ms
  getPosition: () => number; // ms
  isPlaying: () => boolean;
}

export async function createAudioPlayer(
  url: string,
  onStatusUpdate?: (status: { isPlaying: boolean; positionMs: number; durationMs: number; didFinish: boolean }) => void
): Promise<AudioPlayerHandle> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  });

  let durationMs = 0;
  let positionMs = 0;
  let playing = false;

  const { sound } = await Audio.Sound.createAsync(
    { uri: url },
    { shouldPlay: false },
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      durationMs = status.durationMillis ?? 0;
      positionMs = status.positionMillis;
      playing = status.isPlaying;
      const didFinish = status.didJustFinish ?? false;
      onStatusUpdate?.({ isPlaying: playing, positionMs, durationMs, didFinish });
    }
  );

  return {
    play: async () => { await sound.playAsync(); },
    pause: async () => { await sound.pauseAsync(); },
    stop: async () => { await sound.stopAsync(); },
    unload: async () => { await sound.unloadAsync(); },
    getDuration: () => durationMs,
    getPosition: () => positionMs,
    isPlaying: () => playing,
  };
}

export function formatAudioDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
