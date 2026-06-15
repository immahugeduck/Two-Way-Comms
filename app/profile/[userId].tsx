import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getOrCreateDirectChat } from '@/lib/messages';
import { colors, spacing, radius, typography } from '@/constants/theme';

interface Profile {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  phone: string | null;
}

export default function ProfileViewScreen() {
  const { userId: targetId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [isContact, setIsContact] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [targetId]);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !targetId) return;
    setMyUserId(user.id);

    const [{ data: prof }, { data: contact }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, phone')
        .eq('id', targetId)
        .single(),
      supabase
        .from('contacts')
        .select('id')
        .eq('owner_id', user.id)
        .eq('contact_user_id', targetId)
        .maybeSingle(),
    ]);

    if (prof) setProfile(prof);
    setIsContact(!!contact);
    setLoading(false);
  };

  const openChat = async (mode: 'standard' | 'e2e') => {
    if (!myUserId || !targetId) return;
    try {
      const chatId = await getOrCreateDirectChat(myUserId, targetId, mode);
      router.push(`/chats/${chatId}`);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not open chat. Please try again.');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!profile) return null;

  const initials = profile.display_name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.avatarWrap}>
        {profile.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
        )}
      </View>

      <Text style={[typography.h2, styles.name]}>{profile.display_name}</Text>
      <Text style={[typography.body, styles.username]}>@{profile.username}</Text>

      {isContact && profile.phone && (
        <View style={styles.phoneRow}>
          <Text style={styles.phoneIcon}>📞</Text>
          <Text style={[typography.body, styles.phoneText]}>{profile.phone}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => openChat('standard')}>
          <Text style={styles.primaryBtnText}>Send Message</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => openChat('e2e')}>
          <Text style={styles.secondaryBtnText}>🔒 Encrypted Chat</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  avatarWrap: { marginBottom: spacing.sm },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { ...typography.h2, color: colors.primary },
  name: { color: colors.textPrimary, marginTop: spacing.sm },
  username: { color: colors.textMuted },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  phoneIcon: { fontSize: 18 },
  phoneText: { color: colors.textPrimary },
  actions: {
    width: '100%',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryBtnText: { color: colors.background, fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.textSecondary, fontSize: 15 },
});
