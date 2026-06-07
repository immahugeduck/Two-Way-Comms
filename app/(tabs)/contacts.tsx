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
import { getOrCreateDirectChat } from '@/lib/messages';
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
    const q = searchQuery.trim().toLowerCase();
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .or(`username.ilike.%${q}%,email.ilike.%${q}%`)
      .neq('id', userId!)
      .limit(10);

    setSearchResults(data ?? []);
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

  const openChat = async (contact: Contact) => {
    if (!userId) return;
    const chatId = await getOrCreateDirectChat(userId, contact.id);
    router.push(`/chats/${chatId}`);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addButton} onPress={() => setShowAdd(true)}>
        <Text style={styles.addButtonText}>+ Add Contact</Text>
      </TouchableOpacity>

      {contacts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={[typography.h3, styles.emptyTitle]}>No contacts yet</Text>
          <Text style={typography.bodySmall}>Add friends by username or email.</Text>
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
              onPress={() => openChat(item)}
              onWalkiePress={() => router.push('/(tabs)/walkie')}
            />
          )}
        />
      )}

      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={[typography.h3]}>Add Contact</Text>
            <TouchableOpacity onPress={() => { setShowAdd(false); setSearchResults([]); }}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by username or email..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
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
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  addButtonText: { color: colors.background, fontWeight: '700', fontSize: 15 },
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
