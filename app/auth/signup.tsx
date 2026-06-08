import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius, typography } from '@/constants/theme';

export default function SignupScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!displayName || !username || !email || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.user) {
      setLoading(false);
      Alert.alert('Sign up failed', error?.message ?? 'Unknown error');
      return;
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      email,
      username: username.toLowerCase().replace(/\s/g, ''),
      display_name: displayName,
      avatar_url: null,
      phone: null,
    });

    setLoading(false);

    if (profileError) {
      Alert.alert('Profile error', profileError.message);
      return;
    }

    router.replace('/(tabs)/chats');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>📡</Text>
        <Text style={[typography.h1, styles.title]}>Create Account</Text>
        <Text style={[typography.bodySmall, styles.subtitle]}>
          Join 2Way. Stay private.
        </Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Display Name"
            placeholderTextColor={colors.textMuted}
            value={displayName}
            onChangeText={setDisplayName}
            textContentType="name"
          />
          <View style={styles.usernameRow}>
            <Text style={styles.at}>@</Text>
            <TextInput
              style={[styles.input, styles.usernameInput]}
              placeholder="username"
              placeholderTextColor={colors.textMuted}
              value={username}
              onChangeText={(t) => setUsername(t.toLowerCase().replace(/\s/g, ''))}
              autoCapitalize="none"
              textContentType="username"
            />
          </View>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <TextInput
            style={styles.input}
            placeholder="Password (min 8 chars)"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={typography.bodySmall}>Already have an account? </Text>
          <Link href="/auth/login">
            <Text style={styles.link}>Sign in</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  logo: { fontSize: 48, textAlign: 'center', marginBottom: spacing.sm },
  title: { textAlign: 'center', marginBottom: spacing.xs },
  subtitle: { textAlign: 'center', color: colors.textSecondary, marginBottom: spacing.xxl },
  form: { gap: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: 16,
    flex: 1,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  at: {
    ...typography.h3,
    color: colors.primary,
  },
  usernameInput: {},
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.background, fontSize: 16, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  link: { color: colors.primary, fontSize: 14 },
});
