import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Animated,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getOrCreateDirectChat } from '@/lib/messages';
import { colors, spacing, radius, typography } from '@/constants/theme';

type ScanState = 'scanning' | 'resolving' | 'found' | 'not_found' | 'already_contact';

interface FoundUser {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

const QR_PREFIX = 'twoway://user/';

export default function ScanQRScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [userId, setUserId] = useState<string | null>(null);
  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [adding, setAdding] = useState(false);
  const hasScanned = useRef(false);
  const cardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const showCard = () => {
    Animated.spring(cardAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 60,
      friction: 8,
    }).start();
  };

  const resetScan = () => {
    Animated.timing(cardAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      hasScanned.current = false;
      setFoundUser(null);
      setScanState('scanning');
    });
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (hasScanned.current || !data.startsWith(QR_PREFIX)) return;
    hasScanned.current = true;

    const username = data.slice(QR_PREFIX.length).trim().toLowerCase();
    if (!username) { hasScanned.current = false; return; }

    setScanState('resolving');

    // Look up user by username
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .eq('username', username)
      .single();

    if (!profile || profile.id === userId) {
      setScanState('not_found');
      showCard();
      return;
    }

    // Check if already a contact
    if (userId) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('owner_id', userId)
        .eq('contact_user_id', profile.id)
        .single();

      if (existing) {
        setFoundUser(profile);
        setScanState('already_contact');
        showCard();
        return;
      }
    }

    setFoundUser(profile);
    setScanState('found');
    showCard();
  };

  const handleAddContact = async () => {
    if (!userId || !foundUser) return;
    setAdding(true);
    await supabase.from('contacts').insert({
      owner_id: userId,
      contact_user_id: foundUser.id,
      status: 'accepted',
    });
    setAdding(false);
    navigateToChat();
  };

  const navigateToChat = async () => {
    if (!userId || !foundUser) return;
    const chatId = await getOrCreateDirectChat(userId, foundUser.id);
    router.replace(`/chats/${chatId}`);
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.permissionScreen]}>
        <Text style={styles.permissionIcon}>📷</Text>
        <Text style={[typography.h3, styles.permissionTitle]}>Camera Access Needed</Text>
        <Text style={[typography.bodySmall, styles.permissionText]}>
          2Way needs camera access to scan QR codes.
        </Text>
        <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
          <Text style={styles.grantBtnText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cardTranslateY = cardAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });

  const initials = foundUser?.display_name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '?';

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanState === 'scanning' ? handleBarcodeScanned : undefined}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />

      {/* Viewfinder overlay */}
      <View style={styles.overlay}>
        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <Text style={styles.viewfinderLabel}>
          {scanState === 'resolving' ? 'Looking up user...' : 'Point at a 2Way QR code'}
        </Text>
      </View>

      {scanState === 'resolving' && (
        <ActivityIndicator
          color={colors.primary}
          size="large"
          style={styles.resolver}
        />
      )}

      {/* Slide-up result card */}
      {(scanState === 'found' || scanState === 'not_found' || scanState === 'already_contact') && (
        <Animated.View
          style={[styles.resultCard, { transform: [{ translateY: cardTranslateY }] }]}
        >
          {scanState === 'not_found' ? (
            <>
              <Text style={styles.notFoundIcon}>🔍</Text>
              <Text style={[typography.h3, styles.notFoundTitle]}>User Not Found</Text>
              <Text style={[typography.bodySmall, styles.notFoundText]}>
                This QR code doesn&apos;t match any 2Way user.
              </Text>
              <TouchableOpacity style={styles.retryBtn} onPress={resetScan}>
                <Text style={styles.retryBtnText}>Try Again</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* User profile preview */}
              <View style={styles.userRow}>
                {foundUser?.avatar_url ? (
                  <Image source={{ uri: foundUser.avatar_url }} style={styles.foundAvatar} />
                ) : (
                  <View style={styles.foundAvatarPlaceholder}>
                    <Text style={styles.foundInitials}>{initials}</Text>
                  </View>
                )}
                <View style={styles.userInfo}>
                  <Text style={[typography.h3]}>{foundUser?.display_name}</Text>
                  <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
                    @{foundUser?.username}
                  </Text>
                </View>
              </View>

              {scanState === 'already_contact' ? (
                <>
                  <Text style={[typography.caption, styles.alreadyNote]}>
                    Already in your contacts
                  </Text>
                  <TouchableOpacity style={styles.primaryBtn} onPress={navigateToChat}>
                    <Text style={styles.primaryBtnText}>Open Chat</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryBtn, adding && { opacity: 0.6 }]}
                  onPress={handleAddContact}
                  disabled={adding}
                >
                  {adding ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <Text style={styles.primaryBtnText}>Add Contact &amp; Chat</Text>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.dismissBtn} onPress={resetScan}>
                <Text style={styles.dismissBtnText}>Scan Another</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const CORNER_SIZE = 24;
const CORNER_WIDTH = 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Permission screen
  permissionScreen: {
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  permissionIcon: { fontSize: 48 },
  permissionTitle: { color: colors.textPrimary },
  permissionText: { textAlign: 'center', color: colors.textSecondary },
  grantBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  grantBtnText: { color: colors.background, fontWeight: '700', fontSize: 15 },

  // Viewfinder
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  viewfinder: {
    width: 220,
    height: 220,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: colors.primary,
  },
  cornerTL: {
    top: 0, left: 0,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderTopLeftRadius: radius.xs,
  },
  cornerTR: {
    top: 0, right: 0,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderTopRightRadius: radius.xs,
  },
  cornerBL: {
    bottom: 0, left: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderBottomLeftRadius: radius.xs,
  },
  cornerBR: {
    bottom: 0, right: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderBottomRightRadius: radius.xs,
  },
  viewfinderLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  resolver: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
  },

  // Result card
  resultCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  notFoundIcon: { fontSize: 40 },
  notFoundTitle: { color: colors.textPrimary },
  notFoundText: { textAlign: 'center', color: colors.textSecondary },

  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    alignSelf: 'stretch',
  },
  foundAvatar: { width: 52, height: 52, borderRadius: 26 },
  foundAvatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foundInitials: { ...typography.h3, color: colors.primary },
  userInfo: { flex: 1 },
  alreadyNote: { color: colors.textMuted },

  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  primaryBtnText: { color: colors.background, fontWeight: '700', fontSize: 15 },

  retryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xs,
  },
  retryBtnText: { color: colors.textSecondary, fontSize: 15 },

  dismissBtn: { paddingVertical: spacing.sm },
  dismissBtnText: { color: colors.textMuted, fontSize: 14 },
});
