import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
  SectionList,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getOrCreateDirectChat } from '@/lib/messages';
import { colors, spacing, radius, typography } from '@/constants/theme';

interface AppUser {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  phone: string;
  deviceName: string;
}

interface NotOnApp {
  deviceName: string;
  phone: string;
}

function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/^\+/, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 8) return `+${digits}`;
  return null;
}

export default function FindFriendsScreen() {
  const router = useRouter();
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState('');
  const [onApp, setOnApp] = useState<AppUser[]>([]);
  const [notOnApp, setNotOnApp] = useState<NotOnApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setMyUserId(data.user.id);
      const { data: prof } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', data.user.id)
        .single();
      if (prof) setMyUsername(prof.username);
    });
  }, []);

  const scan = async () => {
    if (!myUserId) return;

    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to contacts to find friends on 2Way.');
      return;
    }

    setLoading(true);

    const { data: deviceContacts } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
    });

    // Build map of normalized phone → device name
    const phoneToName = new Map<string, string>();
    for (const c of deviceContacts) {
      const name = c.name ?? 'Unknown';
      for (const p of c.phoneNumbers ?? []) {
        const normalized = normalizePhone(p.number ?? '');
        if (normalized && !phoneToName.has(normalized)) {
          phoneToName.set(normalized, name);
        }
      }
    }

    const phones = [...phoneToName.keys()];

    if (phones.length === 0) {
      setLoading(false);
      setScanned(true);
      return;
    }

    // Batch query in chunks of 50
    const CHUNK = 50;
    const foundUsers: AppUser[] = [];
    for (let i = 0; i < phones.length; i += CHUNK) {
      const chunk = phones.slice(i, i + CHUNK);
      const { data: rows } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, phone')
        .in('phone', chunk)
        .neq('id', myUserId);
      for (const row of rows ?? []) {
        if (row.phone) {
          foundUsers.push({
            ...row,
            deviceName: phoneToName.get(row.phone) ?? row.display_name,
          });
        }
      }
    }

    const foundPhones = new Set(foundUsers.map((u) => u.phone));
    const invite: NotOnApp[] = [];
    for (const [phone, name] of phoneToName) {
      if (!foundPhones.has(phone)) {
        invite.push({ deviceName: name, phone });
      }
    }

    setOnApp(foundUsers);
    setNotOnApp(invite.slice(0, 50));
    setLoading(false);
    setScanned(true);
  };

  const addContact = async (user: AppUser) => {
    if (!myUserId) return;
    const { error } = await supabase.from('contacts').insert({
      owner_id: myUserId,
      contact_user_id: user.id,
      status: 'accepted',
    });
    if (error && (error as any).code !== '23505') {
      Alert.alert('Error', error.message);
      return;
    }
    Alert.alert('Added!', `${user.display_name} added to your contacts.`);
  };

  const openChat = async (user: AppUser) => {
    if (!myUserId) return;
    const chatId = await getOrCreateDirectChat(myUserId, user.id, 'standard');
    router.push(`/chats/${chatId}`);
  };

  const invite = async (item: NotOnApp) => {
    await Share.share({
      message: `Hey ${item.deviceName}! I use 2Way for secure messaging. Download the app and search for my username: @${myUsername}\n\nGet it at: https://2way.app`,
    });
  };

  if (!scanned) {
    return (
      <View style={styles.center}>
        <Text style={styles.heroIcon}>👥</Text>
        <Text style={[typography.h2, styles.heroTitle]}>Find Friends</Text>
        <Text style={[typography.body, styles.heroSub]}>
          See which of your contacts are already on 2Way, or invite them to join.
        </Text>
        <TouchableOpacity style={styles.scanBtn} onPress={scan} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.scanBtnText}>Scan My Contacts</Text>
          )}
        </TouchableOpacity>
        <Text style={[typography.caption, styles.privacyNote]}>
          Phone numbers are checked against 2Way's database. Names are never uploaded.
        </Text>
      </View>
    );
  }

  const sections = [
    ...(onApp.length > 0 ? [{ title: `ON 2WAY (${onApp.length})`, data: onApp, type: 'app' as const }] : []),
    ...(notOnApp.length > 0 ? [{ title: `INVITE TO 2WAY (${notOnApp.length})`, data: notOnApp, type: 'invite' as const }] : []),
  ];

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item, i) => ('id' in item ? item.id : item.phone) + i}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item, section }) => {
          if (section.type === 'app') {
            const u = item as AppUser;
            return (
              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>{u.deviceName}</Text>
                  <Text style={styles.rowSub}>@{u.username}</Text>
                </View>
                <View style={styles.rowActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => addContact(u)}>
                    <Text style={styles.actionBtnText}>Add</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => openChat(u)}>
                    <Text style={styles.actionBtnSecondaryText}>Message</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }
          const inv = item as NotOnApp;
          return (
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName}>{inv.deviceName}</Text>
                <Text style={styles.rowSub}>{inv.phone}</Text>
              </View>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnInvite]} onPress={() => invite(inv)}>
                <Text style={styles.actionBtnText}>Invite</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[typography.body, { color: colors.textMuted }]}>No contacts found on 2Way yet.</Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: spacing.xxl }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  heroIcon: { fontSize: 56 },
  heroTitle: { color: colors.textPrimary, textAlign: 'center' },
  heroSub: { color: colors.textSecondary, textAlign: 'center' },
  scanBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.md,
  },
  scanBtnText: { color: colors.background, fontWeight: '700', fontSize: 16 },
  privacyNote: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  sectionHeader: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  sectionTitle: { ...typography.label, color: colors.textMuted, letterSpacing: 1, fontSize: 11 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowInfo: { flex: 1 },
  rowName: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  rowSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: spacing.xs },
  actionBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  actionBtnText: { color: colors.background, fontWeight: '700', fontSize: 13 },
  actionBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnSecondaryText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  actionBtnInvite: { backgroundColor: colors.primary },
  empty: { padding: spacing.xl, alignItems: 'center' },
});
