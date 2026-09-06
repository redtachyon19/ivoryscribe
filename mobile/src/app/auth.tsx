import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/lib/session';
import { colors, space } from '@/lib/theme';
import { AppText, Card, Field, PrimaryButton, TextButton } from '@/components/ui';

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
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBlock}>
            <AppText variant="display" style={styles.brand}>
              ivoryscribe
            </AppText>
            <AppText variant="muted" style={styles.tagline}>
              A focused space to write.
            </AppText>
          </View>

          <Card>
            <AppText variant="heading" style={styles.cardHeading}>
              {isRegister ? 'Create your account' : 'Welcome back'}
            </AppText>

            {isRegister && (
              <View style={styles.nameRow}>
                <Field
                  style={styles.flex}
                  placeholder="First name"
                  autoCapitalize="words"
                  value={firstName}
                  onChangeText={setFirstName}
                />
                <Field
                  style={styles.flex}
                  placeholder="Last name"
                  autoCapitalize="words"
                  value={lastName}
                  onChangeText={setLastName}
                />
              </View>
            )}

            <Field
              placeholder="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={styles.stackedField}
            />
            <Field
              placeholder="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={styles.stackedField}
            />

            {error && (
              <AppText variant="small" style={styles.error}>
                {error}
              </AppText>
            )}
            {notice && (
              <AppText variant="small" style={styles.notice}>
                {notice}
              </AppText>
            )}

            <PrimaryButton
              label={isRegister ? 'Create account' : 'Sign in'}
              busy={busy}
              onPress={submit}
              style={styles.submit}
            />

            <TextButton
              label={isRegister ? 'Have an account?  Sign in' : 'New here?  Create an account'}
              onPress={() => {
                setMode(isRegister ? 'login' : 'register');
                setError(null);
                setNotice(null);
              }}
              style={styles.switch}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function cleanError(e: unknown): string {
  const raw = e instanceof Error ? e.message : 'Something went wrong';
  return raw.replace(/^\[[^\]]+\]\s*/, '');
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: space.lg, gap: space.xl },
  brandBlock: { alignItems: 'center', gap: space.xs },
  brand: { textAlign: 'center' },
  tagline: { textAlign: 'center' },
  cardHeading: { marginBottom: space.md },
  nameRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  stackedField: { marginBottom: space.sm },
  submit: { marginTop: space.xs },
  switch: { marginTop: space.md },
  error: { color: colors.danger },
  notice: { color: colors.accent },
});
