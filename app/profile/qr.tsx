import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Share,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius, typography } from '@/constants/theme';

interface Profile {
  display_name: string;
  username: string;
  avatar_url: string | null;
}

export default function MyQRScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('display_name, username, avatar_url')
      .eq('id', user.id)
      .single();
    if (data) setProfile(data);
    setLoading(false);
  };

  const handleShare = async () => {
    if (!profile) return;
    await Share.share({
      message: `Add me on 2Way: twoway://user/${profile.username}`,
      title: '2Way Contact',
    });
  };

  const qrValue = profile ? `twoway://user/${profile.username}` : 'twoway://user/loading';

  const initials = profile?.display_name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '?';

  return (
    <View style={styles.container}>
      <Text style={[typography.caption, styles.hint]}>
        Let others scan this to add you as a contact
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <View style={styles.card}>
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.initials}>{initials}</Text>
              </View>
            )}
          </View>

          <Text style={[typography.h3, styles.name]}>{profile?.display_name}</Text>
          <Text style={[typography.bodySmall, styles.username]}>@{profile?.username}</Text>

          {/* QR code on white background for maximum scanner compatibility */}
          <View style={styles.qrWrap}>
            <QRCode
              value={qrValue}
              size={200}
              color="#000000"
              backgroundColor="#FFFFFF"
            />
          </View>

          <Text style={[typography.caption, styles.scanLabel]}>Scan with 2Way to connect</Text>
        </View>
      )}

      <TouchableOpacity style={styles.shareBtn} onPress={handleShare} disabled={!profile}>
        <Text style={styles.shareBtnText}>Share Link</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.scanBtn} onPress={() => router.push('/profile/scan')}>
        <Text style={styles.scanBtnText}>📷  Scan Someone&apos;s Code</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  hint: {
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    width: '100%',
    gap: spacing.sm,
  },
  avatarWrap: { marginBottom: spacing.xs },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { ...typography.h3, color: colors.primary },
  name: { color: colors.textPrimary },
  username: { color: colors.textMuted, marginBottom: spacing.md },
  qrWrap: {
    padding: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
  },
  scanLabel: {
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  shareBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  shareBtnText: { color: colors.background, fontWeight: '700', fontSize: 15 },
  scanBtn: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  scanBtnText: { color: colors.textSecondary, fontSize: 15 },
});
