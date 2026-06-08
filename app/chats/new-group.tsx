import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { createGroupChat } from '@/lib/messages';
import ContactCard from '@/components/ContactCard';
import { colors, spacing, radius, typography } from '@/constants/theme';

interface Contact {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

export default function NewGroupScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadContacts();
  }, [userId]);

  const loadContacts = async () => {
    const { data } = await supabase
      .from('contacts')
      .select('profiles!contacts_contact_user_id_fkey(id, display_name, username, avatar_url)')
      .eq('owner_id', userId!)
      .eq('status', 'accepted');

    setContacts((data ?? []).map((r: any) => r.profiles).filter(Boolean));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      Alert.alert('Name required', 'Please enter a group name.');
      return;
    }
    if (selected.size < 1) {
      Alert.alert('Add members', 'Select at least one contact to create a group.');
      return;
    }

    setLoading(true);
    try {
      const chatId = await createGroupChat(userId!, Array.from(selected), groupName.trim());
      router.replace(`/chats/${chatId}`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[typography.h3, styles.title]}>New Group</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.nameRow}>
        <Text style={styles.label}>GROUP NAME</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Team 2Way, Family Chat..."
          placeholderTextColor={colors.textMuted}
          value={groupName}
          onChangeText={setGroupName}
          maxLength={50}
        />
      </View>

      <Text style={[styles.label, styles.memberLabel]}>
        ADD MEMBERS ({selected.size} selected)
      </Text>

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => toggleSelect(item.id)} activeOpacity={0.7}>
            <ContactCard
              id={item.id}
              displayName={item.display_name}
              username={item.username}
              avatarUrl={item.avatar_url}
              trailing={
                <View style={[styles.checkbox, selected.has(item.id) && styles.checkboxSelected]}>
                  {selected.has(item.id) && <Text style={styles.checkmark}>✓</Text>}
                </View>
              }
            />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={typography.bodySmall}>No contacts yet. Add contacts first.</Text>
          </View>
        }
      />

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.createBtn, (loading || selected.size === 0 || !groupName.trim()) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={loading || selected.size === 0 || !groupName.trim()}
        >
          {loading ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.createBtnText}>
              Create Group ({selected.size + 1} members)
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {},
  cancel: { color: colors.primary, fontSize: 16 },
  nameRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
    paddingHorizontal: spacing.md,
    letterSpacing: 1,
  },
  memberLabel: {
    paddingVertical: spacing.sm,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: { color: colors.background, fontSize: 13, fontWeight: '700' },
  empty: { padding: spacing.xl, alignItems: 'center' },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  createBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: colors.background, fontWeight: '700', fontSize: 16 },
});
