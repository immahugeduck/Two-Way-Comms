import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Share,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getOrCreateDirectChat } from '@/lib/messages';
import { colors, spacing, radius, typography } from '@/constants/theme';

interface DeviceContact {
  name: string;
  phone: string;
  normalized: string;
}

interface MatchedUser {
  id: string;
  display_name: string;
  username: string;
  phone: string;
  deviceName: string;
  isContact: boolean;
}

type ScreenState = 'idle' | 'loading' | 'done' | 'no_permission';

type ListItem =
  | { kind: 'header'; label: string }
  | { kind: 'on_app'; user: MatchedUser }
  | { kind: 'not_on_app'; contact: DeviceContact }
  | { kind: 'empty' };

function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/^\+/, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 8) return `+${digits}`;
  return null;
}

const CHUNK = 50;

export default function FindFriendsScreen() {
  const router = useRouter();
  const [myId, setMyId] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState('');
  const [state, setState] = useState<ScreenState>('idle');
  const [onApp, setOnApp] = useState<MatchedUser[]>([]);
  const [notOnApp, setNotOnApp] = useState<DeviceContact[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setMyId(data.user.id);
      const { data: p } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', data.user.id)
        .single();
      if (p) setMyUsername(p.username);
    });
  }, []);

  const scan = async () => {
    setState('loading');

    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      setState('no_permission');
      return;
    }

    const { data: deviceContacts } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
    });

    // Build normalized phone → contact info map
    const phoneMap = new Map<string, DeviceContact>();
    for (const c of deviceContacts) {
      const name = c.name ?? '';
      for (const ph of c.phoneNumbers ?? []) {
        if (!ph.number) continue;
        const norm = normalizePhone(ph.number);
        if (norm && !phoneMap.has(norm)) {
          phoneMap.set(norm, { name, phone: ph.number, normalized: norm });
        }
      }
    }

    if (phoneMap.size === 0) {
      setState('done');
      return;
    }

    // Load existing contacts so we know who's already added
    const { data: existingRows } = await supabase
      .from('contacts')
      .select('contact_user_id')
      .eq('owner_id', myId!);
    const contactSet = new Set((existingRows ?? []).map((r) => r.contact_user_id));

    // Batch-query profiles by phone number in chunks
    const allPhones = Array.from(phoneMap.keys());
    const matched: MatchedUser[] = [];
    const matchedPhones = new Set<string>();

    for (let i = 0; i < allPhones.length; i += CHUNK) {
      const chunk = allPhones.slice(i, i + CHUNK);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username, phone')
        .in('phone', chunk)
        .neq('id', myId!);

      for (const p of profiles ?? []) {
        if (!p.phone) continue;
        const dc = phoneMap.get(p.phone);
        matched.push({
          id: p.id,
          display_name: p.display_name,
          username: p.username,
          phone: p.phone,
          deviceName: dc?.name ?? p.display_name,
          isContact: contactSet.has(p.id),
        });
        matchedPhones.add(p.phone);
      }
    }

    const unmatched = Array.from(phoneMap.values())
      .filter((dc) => !matchedPhones.has(dc.normalized))
      .slice(0, 50);

    setOnApp(matched);
    setNotOnApp(unmatched);
    setState('done');
  };

  const addContact = async (user: MatchedUser) => {
    if (!myId) return;
    await supabase.from('contacts').insert({
      owner_id: myId,
      contact_user_id: user.id,
      status: 'accepted',
    });
    setOnApp((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, isContact: true } : u))
    );
  };

  const openChat = async (user: MatchedUser) => {
    if (!myId) return;
    const chatId = await getOrCreateDirectChat(myId, user.id);
    router.push(`/chats/${chatId}`);
  };

  const invite = async () => {
    await Share.share({
      message:
        `Hey! I use 2Way for private, encrypted messaging.\n\n` +
        `To connect with me:\n` +
        `1. Download 2Way (search "2Way Secure Chat" in App Store or Google Play)\n` +
        `2. Create an account\n` +
        `3. Search for my username: @${myUsername}\n\n` +
        `Let's chat securely! 🔒`,
      title: 'Join me on 2Way',
    });
  };

  // ── Render: idle / no_permission / loading ─────────────────────────────────

  if (state === 'idle' || state === 'no_permission') {
    return (
      <View style={styles.center}>
        <Text style={styles.bigIcon}>{state === 'no_permission' ? '🔒' : '👥'}</Text>
        <Text style={[typography.h3, styles.centeredText]}>
          {state === 'no_permission' ? 'Contacts Access Needed' : 'Find Friends on 2Way'}
        </Text>
        <Text style={[typography.bodySmall, styles.centeredNote]}>
          {state === 'no_permission'
            ? 'Allow 2Way to access your contacts so we can find your friends.'
            : '2Way checks which of your contacts already use the app. Nothing is uploaded to our servers.'}
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={scan}>
          <Text style={styles.primaryBtnText}>
            {state === 'no_permission' ? 'Try Again' : 'Scan My Contacts'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[typography.bodySmall, styles.loadingNote]}>
          Scanning your contacts...
        </Text>
      </View>
    );
  }

  // ── Render: done ──────────────────────────────────────────────────────────

  const listData: ListItem[] = [];

  if (onApp.length > 0) {
    listData.push({ kind: 'header', label: `ON 2WAY  (${onApp.length})` });
    for (const u of onApp) listData.push({ kind: 'on_app', user: u });
  }

  if (notOnApp.length > 0) {
    listData.push({ kind: 'header', label: `INVITE TO 2WAY  (${notOnApp.length})` });
    for (const c of notOnApp) listData.push({ kind: 'not_on_app', contact: c });
  }

  if (listData.length === 0) {
    listData.push({ kind: 'empty' });
  }

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === 'header') {
      return <Text style={styles.sectionHeader}>{item.label}</Text>;
    }

    if (item.kind === 'empty') {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.bigIcon}>🌐</Text>
          <Text style={[typography.bodySmall, styles.centeredNote]}>
            None of your contacts are on 2Way yet.{'\n'}Invite them!
          </Text>
          <TouchableOpacity style={styles.inviteAllBtn} onPress={invite}>
            <Text style={styles.inviteAllBtnText}>Send Invite</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (item.kind === 'on_app') {
      const u = item.user;
      const initials = u.display_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
      return (
        <View style={styles.row}>
          <View style={styles.avatar}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
          <View style={styles.rowInfo}>
            <Text style={[typography.body, { color: colors.textPrimary }]}>{u.deviceName}</Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>@{u.username}</Text>
          </View>
          {u.isContact ? (
            <TouchableOpacity style={styles.msgBtn} onPress={() => openChat(u)}>
              <Text style={styles.msgBtnText}>Message</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.addBtn} onPress={() => addContact(u)}>
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    // not_on_app
    const c = item.contact;
    return (
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: colors.surfaceElevated }]}>
          <Text style={[styles.initials, { color: colors.textMuted }]}>
            {(c.name[0] ?? '?').toUpperCase()}
          </Text>
        </View>
        <View style={styles.rowInfo}>
          <Text style={[typography.body, { color: colors.textPrimary }]}>{c.name}</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{c.phone}</Text>
        </View>
        <TouchableOpacity style={styles.inviteBtn} onPress={invite}>
          <Text style={styles.inviteBtnText}>Invite</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      data={listData}
      keyExtractor={(item, i) => {
        if (item.kind === 'on_app') return `on-${item.user.id}`;
        if (item.kind === 'not_on_app') return `off-${item.contact.normalized}`;
        return `${item.kind}-${i}`;
      }}
      renderItem={renderItem}
      ListFooterComponent={<View style={{ height: spacing.xxl }} />}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  bigIcon: { fontSize: 52 },
  centeredText: { color: colors.textPrimary, textAlign: 'center' },
  centeredNote: { color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  loadingNote: { color: colors.textMuted, marginTop: spacing.md },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  primaryBtnText: { color: colors.background, fontWeight: '700', fontSize: 15 },
  sectionHeader: {
    ...typography.label,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
    letterSpacing: 0.8,
    fontSize: 11,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { ...typography.body, color: colors.primary, fontWeight: '700' },
  rowInfo: { flex: 1 },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  addBtnText: { color: colors.background, fontWeight: '700', fontSize: 13 },
  msgBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  msgBtnText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  inviteBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  inviteBtnText: { color: colors.textSecondary, fontSize: 13 },
  emptyCard: {
    alignItems: 'center',
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  inviteAllBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  inviteAllBtnText: { color: colors.textSecondary, fontSize: 14 },
});
