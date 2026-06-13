import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import ContactCard from '@/components/ContactCard';
import { colors, spacing, radius, typography } from '@/constants/theme';

interface Contact {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

export default function ContactsScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [searchTab, setSearchTab] = useState<'name' | 'phone'>('name');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!userId) return;
    fetchContacts();
  }, [userId]);

  const fetchContacts = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('contacts')
      .select('profiles!contacts_contact_user_id_fkey(id, display_name, username, avatar_url)')
      .eq('owner_id', userId)
      .eq('status', 'accepted');

    setContacts((data ?? []).map((r: any) => r.profiles).filter(Boolean));
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);

    let data: Contact[] = [];

    if (searchTab === 'phone') {
      const raw = searchQuery.trim().replace(/[\s\-()]/g, '');
      const variants = new Set<string>();
      variants.add(raw);
      const digits = raw.replace(/^\+/, '');
      if (digits.length === 10) { variants.add(`+1${digits}`); variants.add(digits); }
      if (digits.length === 11 && digits.startsWith('1')) { variants.add(`+${digits}`); variants.add(digits.slice(1)); }

      const results = await Promise.all(
        [...variants].map((v) =>
          supabase.from('profiles').select('id, display_name, username, avatar_url')
            .eq('phone', v).neq('id', userId!).limit(5)
        )
      );
      const seen = new Set<string>();
      for (const { data: rows } of results) {
        for (const r of rows ?? []) {
          if (!seen.has(r.id)) { seen.add(r.id); data.push(r); }
        }
      }
    } else {
      const q = searchQuery.trim();
      const [{ data: byUsername }, { data: byEmail }] = await Promise.all([
        supabase.from('profiles').select('id, display_name, username, avatar_url')
          .ilike('username', `%${q}%`).neq('id', userId!).limit(8),
        supabase.from('profiles').select('id, display_name, username, avatar_url')
          .ilike('email', `%${q}%`).neq('id', userId!).limit(8),
      ]);
      const seen = new Set<string>();
      for (const r of [...(byUsername ?? []), ...(byEmail ?? [])]) {
        if (!seen.has(r.id)) { seen.add(r.id); data.push(r); }
      }
    }

    setSearchResults(data);
    setSearching(false);
  };

  const addContact = async (contact: Contact) => {
    if (!userId) return;
    const { error } = await supabase.from('contacts').insert({
      owner_id: userId,
      contact_user_id: contact.id,
      status: 'accepted',
    });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setShowAdd(false);
    setSearchQuery('');
    setSearchResults([]);
    fetchContacts();
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addButton} onPress={() => setShowAdd(true)}>
        <Text style={styles.addButtonText}>+ Add Contact</Text>
      </TouchableOpacity>

      <View style={styles.qrRow}>
        <TouchableOpacity style={styles.qrBtn} onPress={() => router.push('/profile/qr')}>
          <Text style={styles.qrBtnText}>📲  My QR Code</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.qrBtn} onPress={() => router.push('/profile/scan')}>
          <Text style={styles.qrBtnText}>📷  Scan QR</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.findFriendsBtn} onPress={() => router.push('/contacts/find-friends')}>
        <Text style={styles.findFriendsBtnText}>👥  Find Friends from Contacts</Text>
      </TouchableOpacity>

      {contacts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={[typography.h3, styles.emptyTitle]}>No contacts yet</Text>
          <Text style={typography.bodySmall}>Add friends by username, email, or phone number.</Text>
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ContactCard
              id={item.id}
              displayName={item.display_name}
              username={item.username}
              avatarUrl={item.avatar_url}
              onPress={() => router.push(`/profile/${item.id}`)}
              onWalkiePress={() => router.push('/(tabs)/walkie')}
            />
          )}
        />
      )}

      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={[typography.h3]}>Add Contact</Text>
            <TouchableOpacity onPress={() => { setShowAdd(false); setSearchResults([]); setSearchQuery(''); }}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, searchTab === 'name' && styles.tabActive]}
              onPress={() => { setSearchTab('name'); setSearchQuery(''); setSearchResults([]); }}
            >
              <Text style={[styles.tabText, searchTab === 'name' && styles.tabTextActive]}>
                Username / Email
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, searchTab === 'phone' && styles.tabActive]}
              onPress={() => { setSearchTab('phone'); setSearchQuery(''); setSearchResults([]); }}
            >
              <Text style={[styles.tabText, searchTab === 'phone' && styles.tabTextActive]}>
                Phone Number
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder={searchTab === 'phone' ? '+12025551234' : 'Search by username or email...'}
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              keyboardType={searchTab === 'phone' ? 'phone-pad' : 'default'}
              onSubmitEditing={searchUsers}
              returnKeyType="search"
            />
            <TouchableOpacity style={styles.searchBtn} onPress={searchUsers}>
              {searching ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={styles.searchBtnText}>Search</Text>
              )}
            </TouchableOpacity>
          </View>

          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ContactCard
                id={item.id}
                displayName={item.display_name}
                username={item.username}
                avatarUrl={item.avatar_url}
                trailing={
                  <TouchableOpacity style={styles.addBtn} onPress={() => addContact(item)}>
                    <Text style={styles.addBtnText}>Add</Text>
                  </TouchableOpacity>
                }
              />
            )}
            ListEmptyComponent={
              searchQuery.length > 0 && !searching ? (
                <Text style={[typography.bodySmall, styles.noResults]}>No users found.</Text>
              ) : null
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  addButton: {
    margin: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  addButtonText: { color: colors.background, fontWeight: '700', fontSize: 15 },
  qrRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  qrBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  qrBtnText: { color: colors.textSecondary, fontSize: 14 },
  findFriendsBtn: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  findFriendsBtnText: { color: colors.textSecondary, fontSize: 14 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { marginTop: spacing.sm },
  modal: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  closeBtn: { color: colors.textSecondary, fontSize: 20, padding: spacing.sm },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  tabActive: { backgroundColor: colors.surface },
  tabText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  tabTextActive: { color: colors.textPrimary, fontWeight: '700' },
  searchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: 15,
  },
  searchBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  searchBtnText: { color: colors.background, fontWeight: '700' },
  addBtn: {
    backgroundColor: colors.primaryDim,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  addBtnText: { color: colors.primary, fontWeight: '700' },
  noResults: { textAlign: 'center', padding: spacing.xl },
});
