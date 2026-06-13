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
  const [phone, setPhone] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneStep, setPhoneStep] = useState<'idle' | 'enter' | 'sending' | 'verify' | 'verifying'>('idle');
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
      .select('display_name, username, avatar_url, phone')
      .eq('id', user.id)
      .single();
    if (data) {
      setDisplayName(data.display_name);
      setUsername(data.username);
      setAvatarUrl(data.avatar_url);
      setPhone(data.phone ?? null);
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

  const sendPhoneOtp = async () => {
    const normalized = phoneInput.replace(/[\s\-()]/g, '');
    if (!normalized.startsWith('+') || normalized.length < 8) {
      Alert.alert('Invalid Format', 'Use international format: +12025551234');
      return;
    }
    setPhoneStep('sending');
    const { error } = await supabase.auth.updateUser({ phone: normalized });
    if (error) {
      Alert.alert('Error', error.message);
      setPhoneStep('enter');
      return;
    }
    setPhoneInput(normalized);
    setPhoneStep('verify');
  };

  const verifyPhoneOtp = async () => {
    if (!phoneOtp.trim() || !userId) return;
    setPhoneStep('verifying');
    const { error } = await supabase.auth.verifyOtp({
      phone: phoneInput,
      token: phoneOtp.trim(),
      type: 'phone_change',
    });
    if (error) {
      Alert.alert('Verification Failed', error.message);
      setPhoneStep('verify');
      return;
    }
    await supabase.from('profiles').update({ phone: phoneInput }).eq('id', userId);
    setPhone(phoneInput);
    setPhoneOtp('');
    setPhoneStep('idle');
    Alert.alert('Verified!', 'Phone number added to your profile.');
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

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>PHONE NUMBER</Text>

          {phoneStep === 'idle' && (
            phone ? (
              <View style={styles.phoneVerifiedRow}>
                <Text style={styles.phoneVerifiedText}>{phone} ✓</Text>
                <TouchableOpacity onPress={() => { setPhoneInput(phone); setPhoneStep('enter'); }}>
                  <Text style={styles.phoneLinkText}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addPhoneBtn} onPress={() => setPhoneStep('enter')}>
                <Text style={styles.addPhoneBtnText}>+ Add Phone Number</Text>
              </TouchableOpacity>
            )
          )}

          {(phoneStep === 'enter' || phoneStep === 'sending') && (
            <>
              <TextInput
                style={styles.input}
                value={phoneInput}
                onChangeText={setPhoneInput}
                placeholder="+12025551234"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                autoCorrect={false}
              />
              <Text style={styles.fieldHint}>International format: +[country code][number]</Text>
              <TouchableOpacity
                style={[styles.otpBtn, phoneStep === 'sending' && styles.btnDisabled]}
                onPress={sendPhoneOtp}
                disabled={phoneStep === 'sending'}
              >
                {phoneStep === 'sending' ? (
                  <ActivityIndicator color={colors.background} size="small" />
                ) : (
                  <Text style={styles.otpBtnText}>Send Verification Code</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPhoneStep('idle')}>
                <Text style={styles.phoneLinkText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {(phoneStep === 'verify' || phoneStep === 'verifying') && (
            <>
              <Text style={[typography.bodySmall, styles.otpHint]}>
                Enter the 6-digit code sent to {phoneInput}
              </Text>
              <TextInput
                style={styles.input}
                value={phoneOtp}
                onChangeText={setPhoneOtp}
                placeholder="000000"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={6}
              />
              <TouchableOpacity
                style={[styles.otpBtn, phoneStep === 'verifying' && styles.btnDisabled]}
                onPress={verifyPhoneOtp}
                disabled={phoneStep === 'verifying'}
              >
                {phoneStep === 'verifying' ? (
                  <ActivityIndicator color={colors.background} size="small" />
                ) : (
                  <Text style={styles.otpBtnText}>Verify Code</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPhoneStep('enter')}>
                <Text style={styles.phoneLinkText}>Change number</Text>
              </TouchableOpacity>
            </>
          )}
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
  phoneVerifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  phoneVerifiedText: { color: colors.primary, fontSize: 15 },
  phoneLinkText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  addPhoneBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  addPhoneBtnText: { color: colors.textSecondary, fontSize: 15 },
  otpBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  otpBtnText: { color: colors.background, fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.6 },
  otpHint: { color: colors.textMuted, textAlign: 'center' },
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
