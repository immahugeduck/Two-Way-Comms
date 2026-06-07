import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';

let recording: Audio.Recording | null = null;
let sound: Audio.Sound | null = null;

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

  const { recording: rec } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY
  );
  recording = rec;
}

export async function stopRecording(): Promise<string | null> {
  if (!recording) return null;

  await recording.stopAndUnloadAsync();
  const uri = recording.getURI();
  recording = null;

  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

  return uri ?? null;
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

  const { data: publicUrl } = supabase.storage
    .from('voice-messages')
    .getPublicUrl(data.path);

  return publicUrl.publicUrl;
}

export async function playAudio(url: string): Promise<void> {
  if (sound) {
    await sound.unloadAsync();
    sound = null;
  }

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
  });

  const { sound: newSound } = await Audio.Sound.createAsync({ uri: url });
  sound = newSound;
  await sound.playAsync();
}

export async function stopPlayback(): Promise<void> {
  if (sound) {
    await sound.stopAsync();
    await sound.unloadAsync();
    sound = null;
  }
}
