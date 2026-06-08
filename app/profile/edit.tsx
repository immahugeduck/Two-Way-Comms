import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius, typography } from '@/constants/theme';

export default function EditProfileScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data } = await supabase
      .from('profiles')
      .select('display_name, username, avatar_url')
      .eq('id', user.id)
      .single();
    if (data) {
      setDisplayName(data.display_name);
      setUsername(data.username);
      setAvatarUrl(data.avatar_url);
    }
  };

  const pickAndUploadAvatar = async () => {
    if (!userId) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to set a profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    setUploading(true);
    try {
      const uri = result.assets[0].uri;
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${userId}.${ext}`;

      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
      });

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, arrayBuffer, { contentType: `image/${ext}`, upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      // Cache-bust so the new image loads immediately
      const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);
      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Unknown error');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    if (!displayName.trim()) {
      Alert.alert('Required', 'Display name cannot be empty.');
      return;
    }
    if (!username.trim()) {
      Alert.alert('Required', 'Username cannot be empty.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim(),
        username: username.trim().toLowerCase(),
      })
      .eq('id', userId);
    setSaving(false);
    if (error) {
      Alert.alert('Save failed', error.message);
    } else {
      router.back();
    }
  };

  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity
        style={styles.avatarContainer}
        onPress={pickAndUploadAvatar}
        disabled={uploading}
        activeOpacity={0.8}
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
        )}
        <View style={styles.avatarBadge}>
          {uploading ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={styles.cameraIcon}>📷</Text>
          )}
        </View>
      </TouchableOpacity>
      <Text style={[typography.caption, styles.avatarHint]}>Tap to change photo</Text>

      <View style={styles.form}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>DISPLAY NAME</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            maxLength={50}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>USERNAME</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={(t) => setUsername(t.toLowerCase().replace(/\s/g, ''))}
            placeholder="username"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            maxLength={30}
          />
          <Text style={styles.fieldHint}>Letters, numbers, and underscores only</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Text style={styles.saveBtnText}>Save Changes</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.xl,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    marginTop: spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  initials: { ...typography.h2, color: colors.primary },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIcon: { fontSize: 14 },
  avatarHint: { color: colors.textMuted, marginTop: -spacing.md },
  form: { width: '100%', gap: spacing.lg },
  fieldGroup: { gap: spacing.xs },
  label: { ...typography.label, letterSpacing: 1, paddingHorizontal: spacing.xs },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: 16,
  },
  fieldHint: {
    fontSize: 11,
    color: colors.textMuted,
    paddingHorizontal: spacing.xs,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: colors.background, fontSize: 16, fontWeight: '700' },
});
