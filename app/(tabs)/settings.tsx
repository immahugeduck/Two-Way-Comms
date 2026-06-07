import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius, typography } from '@/constants/theme';
import PrivacyBadge from '@/components/PrivacyBadge';

type TimerOption = 'off' | '5m' | '1h' | '24h' | '7d';

interface PrivacySettings {
  disappearingMessages: TimerOption;
  readReceipts: boolean;
  showPhone: boolean;
  appLock: boolean;
}

const TIMER_LABELS: Record<TimerOption, string> = {
  off: 'Off',
  '5m': '5 Minutes',
  '1h': '1 Hour',
  '24h': '24 Hours',
  '7d': '7 Days',
};

export default function SettingsScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<{ display_name: string; username: string; email: string | null } | null>(null);
  const [settings, setSettings] = useState<PrivacySettings>({
    disappearingMessages: 'off',
    readReceipts: true,
    showPhone: false,
    appLock: false,
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('display_name, username, email')
      .eq('id', user.id)
      .single();
    if (data) setProfile(data);
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/auth/login');
        },
      },
    ]);
  };

  const cycleTimer = () => {
    const options: TimerOption[] = ['off', '5m', '1h', '24h', '7d'];
    const idx = options.indexOf(settings.disappearingMessages);
    setSettings((s) => ({ ...s, disappearingMessages: options[(idx + 1) % options.length] }));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {profile && (
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileInitials}>
              {profile.display_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
            </Text>
          </View>
          <Text style={[typography.h3]}>{profile.display_name}</Text>
          <Text style={typography.bodySmall}>@{profile.username}</Text>
          {profile.email && <Text style={typography.caption}>{profile.email}</Text>}
        </View>
      )}

      <Section title="Privacy">
        <SettingRow
          icon="⏱"
          label="Disappearing Messages"
          value={TIMER_LABELS[settings.disappearingMessages]}
          onPress={cycleTimer}
        />
        <SettingToggle
          icon="👁"
          label="Read Receipts"
          value={settings.readReceipts}
          onToggle={(v) => setSettings((s) => ({ ...s, readReceipts: v }))}
        />
        <SettingToggle
          icon="📞"
          label="Show Phone Number"
          value={settings.showPhone}
          onToggle={(v) => setSettings((s) => ({ ...s, showPhone: v }))}
        />
        <SettingToggle
          icon="🔐"
          label="Lock App"
          description="Require biometrics or PIN to open"
          value={settings.appLock}
          onToggle={(v) => setSettings((s) => ({ ...s, appLock: v }))}
        />
      </Section>

      <Section title="Encryption">
        <View style={styles.encryptionInfo}>
          <PrivacyBadge status="in_transit" />
          <Text style={[typography.bodySmall, styles.encryptionNote]}>
            Messages are sent over an encrypted private channel.
            End-to-end encryption (Signal Protocol) is planned for Phase 2.
          </Text>
        </View>
      </Section>

      <Section title="Account">
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </Section>

      <Text style={[typography.caption, styles.version]}>Relay v1.0.0 — Phase 1</Text>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={sectionStyles.container}>
      <Text style={sectionStyles.title}>{title.toUpperCase()}</Text>
      <View style={sectionStyles.body}>{children}</View>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: { marginBottom: spacing.xl },
  title: { ...typography.label, paddingHorizontal: spacing.md, marginBottom: spacing.xs, letterSpacing: 1 },
  body: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' },
});

function SettingRow({ icon, label, value, onPress }: {
  icon: string; label: string; value: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={rowStyles.row} onPress={onPress}>
      <Text style={rowStyles.icon}>{icon}</Text>
      <Text style={[typography.body, rowStyles.label]}>{label}</Text>
      <Text style={[typography.bodySmall, rowStyles.value]}>{value}</Text>
      <Text style={rowStyles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

function SettingToggle({ icon, label, description, value, onToggle }: {
  icon: string; label: string; description?: string; value: boolean; onToggle: (v: boolean) => void;
}) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.icon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[typography.body]}>{label}</Text>
        {description && <Text style={typography.caption}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.textPrimary}
      />
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  icon: { fontSize: 20, marginRight: spacing.md },
  label: { flex: 1 },
  value: { color: colors.primary },
  chevron: { color: colors.textMuted, fontSize: 20, marginLeft: spacing.sm },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingVertical: spacing.xl, paddingHorizontal: spacing.md, gap: spacing.lg },
  profileCard: {
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
    paddingVertical: spacing.xl,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  profileInitials: { ...typography.h2, color: colors.primary },
  encryptionInfo: { padding: spacing.md, gap: spacing.sm },
  encryptionNote: { lineHeight: 20 },
  signOutBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  signOutText: { color: colors.danger, fontSize: 16, fontWeight: '600' },
  version: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.md },
});
