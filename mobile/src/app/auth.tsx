import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/lib/theme';

type Mode = 'login' | 'register';

export default function AuthScreen() {
  const router = useRouter();
  const { signIn, signUp } = useSession();

  const [mode, setMode] = useState<Mode>('login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';

  async function submit() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (isRegister) {
        const { needsVerification } = await signUp(firstName.trim(), lastName.trim(), email.trim(), password);
        if (needsVerification) {
          setNotice('Account created. Check your email to verify, then sign in.');
          setMode('login');
          return;
        }
      } else {
        await signIn(email.trim(), password);
      }
      router.replace('/library');
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>ivoryscribe</Text>
          <Text style={styles.tagline}>A focused space to write.</Text>

          <View style={styles.card}>
            <Text style={styles.heading}>{isRegister ? 'Create account' : 'Welcome back'}</Text>

            {isRegister && (
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.flex]}
                  placeholder="First name"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="words"
                  value={firstName}
                  onChangeText={setFirstName}
                />
                <TextInput
                  style={[styles.input, styles.flex]}
                  placeholder="Last name"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="words"
                  value={lastName}
                  onChangeText={setLastName}
                />
              </View>
            )}

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            {error && <Text style={styles.error}>{error}</Text>}
            {notice && <Text style={styles.notice}>{notice}</Text>}

            <Pressable
              style={({ pressed }) => [styles.button, (busy || pressed) && styles.buttonPressed]}
              onPress={submit}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.accentText} />
              ) : (
                <Text style={styles.buttonText}>{isRegister ? 'Create account' : 'Sign in'}</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                setMode(isRegister ? 'login' : 'register');
                setError(null);
                setNotice(null);
              }}
              hitSlop={8}
            >
              <Text style={styles.switch}>
                {isRegister ? 'Have an account? Sign in' : "New here? Create an account"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function cleanError(e: unknown): string {
  const raw = e instanceof Error ? e.message : 'Something went wrong';
  // request() prefixes network/status noise like "[NETWORK]" / "[401]".
  return raw.replace(/^\[[^\]]+\]\s*/, '');
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
  brand: { color: colors.text, fontSize: 34, fontWeight: '700', textAlign: 'center' },
  tagline: { color: colors.muted, fontSize: 15, textAlign: 'center', marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heading: { color: colors.text, fontSize: 20, fontWeight: '600', marginBottom: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: colors.accentText, fontSize: 16, fontWeight: '600' },
  switch: { color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
  error: { color: colors.danger, fontSize: 14 },
  notice: { color: colors.accent, fontSize: 14 },
});
