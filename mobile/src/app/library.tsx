import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';

import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/lib/theme';
import { createDocument, getDocuments, type DocumentRecord } from '@shared/api';

export default function LibraryScreen() {
  const router = useRouter();
  const { session, signOut } = useSession();
  const token = session?.token ?? '';

  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      setDocs(await getDocuments(token));
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\[[^\]]+\]\s*/, '') : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  // Reload every time the screen regains focus (e.g. returning from the editor).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function newDocument() {
    if (!token || creating) return;
    setCreating(true);
    try {
      const doc = await createDocument(token, { title: 'Untitled', content: '' });
      router.push(`/editor/${doc.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\[[^\]]+\]\s*/, '') : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={signOut} hitSlop={8}>
              <Text style={styles.headerAction}>Sign out</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={newDocument} hitSlop={8} disabled={creating}>
              <Text style={[styles.headerAction, styles.headerActionAccent]}>
                {creating ? '…' : '+ New'}
              </Text>
            </Pressable>
          ),
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={docs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={docs.length === 0 ? styles.emptyContent : styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.muted}
            />
          }
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>No documents yet</Text>
              <Text style={styles.emptyBody}>Tap “+ New” to start writing.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => router.push(`/editor/${item.id}`)}
            >
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.title || 'Untitled'}
              </Text>
              <Text style={styles.rowMeta}>{formatDate(item.updatedAt)}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.xs },
  listContent: { padding: spacing.md, gap: spacing.sm },
  emptyContent: { flexGrow: 1 },
  headerAction: { color: colors.text, fontSize: 16, paddingHorizontal: spacing.xs },
  headerActionAccent: { color: colors.accent, fontWeight: '600' },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 4,
  },
  rowPressed: { backgroundColor: colors.surfaceRaised },
  rowTitle: { color: colors.text, fontSize: 17, fontWeight: '500' },
  rowMeta: { color: colors.muted, fontSize: 13 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  emptyBody: { color: colors.muted, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14, marginBottom: spacing.sm },
});
