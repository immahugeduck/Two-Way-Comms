import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getOrCreateDirectChat } from '@/lib/messages';
import { sendVoiceMessage } from '@/lib/messages';
import { startRecording, stopRecording, uploadAudio } from '@/lib/audio';
import WalkieButton from '@/components/WalkieButton';
import ContactCard from '@/components/ContactCard';
import { colors, spacing, typography } from '@/constants/theme';

interface Contact {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

export default function WalkieScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);

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
      .select('contact_user_id, profiles!contacts_contact_user_id_fkey(id, display_name, username, avatar_url)')
      .eq('owner_id', userId)
      .eq('status', 'accepted');

    const list: Contact[] = (data ?? []).map((r: any) => r.profiles).filter(Boolean);
    setContacts(list);
  };

  const selectContact = async (contact: Contact) => {
    if (!userId) return;
    setActiveContact(contact);
    const chatId = await getOrCreateDirectChat(userId, contact.id);
    setActiveChatId(chatId);
  };

  const handleAudioSent = async (audioUrl: string) => {
    if (!activeChatId || !userId) return;
    await sendVoiceMessage(activeChatId, userId, audioUrl);
  };

  return (
    <View style={styles.container}>
      <View style={styles.pttSection}>
        <Text style={[typography.h2, styles.heading]}>
          {activeContact ? `Talking to ${activeContact.display_name}` : 'Push to Talk'}
        </Text>

        {activeChatId ? (
          <>
            <WalkieButton chatId={activeChatId} onAudioSent={handleAudioSent} size="large" />
            <TouchableOpacity style={styles.changeBtn} onPress={() => {
              setActiveContact(null);
              setActiveChatId(null);
            }}>
              <Text style={[typography.bodySmall, styles.changeBtnText]}>Change Contact</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderIcon}>📻</Text>
            <Text style={typography.bodySmall}>Select a contact below to start</Text>
          </View>
        )}
      </View>

      <View style={styles.contactsSection}>
        <Text style={[typography.label, styles.sectionLabel]}>RECENT CONTACTS</Text>
        {contacts.length === 0 ? (
          <View style={styles.emptyContacts}>
            <Text style={typography.bodySmall}>No contacts yet. Add some from Contacts tab.</Text>
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
                onPress={() => selectContact(item)}
                onWalkiePress={() => selectContact(item)}
              />
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pttSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.xl,
  },
  heading: { textAlign: 'center' },
  placeholder: { alignItems: 'center', gap: spacing.sm },
  placeholderIcon: { fontSize: 64 },
  changeBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  changeBtnText: { color: colors.primary },
  contactsSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    maxHeight: 280,
  },
  sectionLabel: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    letterSpacing: 1,
  },
  emptyContacts: {
    padding: spacing.xl,
    alignItems: 'center',
  },
});
