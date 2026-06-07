import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '@/lib/supabase';
import { useRouter, useSegments } from 'expo-router';
import { colors } from '@/constants/theme';
import {
  registerForPushNotificationsAsync,
  storePushToken,
  removePushToken,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  removeSubscription,
  clearBadge,
} from '@/lib/notifications';
import { ensureKeyPair } from '@/lib/keystore';
import type { Subscription } from 'expo-notifications';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const pushToken = useRef<string | null>(null);
  const notifReceivedSub = useRef<Subscription | null>(null);
  const notifResponseSub = useRef<Subscription | null>(null);

  // Auth state listener — handles redirects, push token, and E2E key lifecycle
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const inAuthGroup = segments[0] === 'auth';

      if (!session) {
        if (pushToken.current) {
          await removePushToken(pushToken.current);
          pushToken.current = null;
        }
        if (!inAuthGroup) router.replace('/auth/login');
      } else {
        // Generate or restore E2E key pair for this user
        ensureKeyPair(session.user.id).catch(() => {
          // Non-fatal: app still works with in_transit encryption
        });

        // Register for push notifications
        const token = await registerForPushNotificationsAsync();
        if (token) {
          pushToken.current = token;
          await storePushToken(session.user.id, token);
        }

        if (inAuthGroup) router.replace('/(tabs)/chats');
      }
    });

    return () => subscription.unsubscribe();
  }, [segments]);

  // Notification listeners
  useEffect(() => {
    notifReceivedSub.current = addNotificationReceivedListener(() => {
      clearBadge();
    });

    notifResponseSub.current = addNotificationResponseReceivedListener((response) => {
      const chatId = response.notification.request.content.data?.chatId as string | undefined;
      if (chatId) router.push(`/chats/${chatId}`);
    });

    return () => {
      if (notifReceivedSub.current) removeSubscription(notifReceivedSub.current);
      if (notifResponseSub.current) removeSubscription(notifResponseSub.current);
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { color: colors.textPrimary, fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="auth/login" options={{ headerShown: false }} />
        <Stack.Screen name="auth/signup" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="chats/[chatId]"
          options={{ title: '', headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="chats/new-group"
          options={{ title: 'New Group', headerBackTitle: 'Cancel', presentation: 'modal' }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
