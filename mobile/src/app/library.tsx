import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';

import { useSession } from '@/lib/session';
import { colors, font, radius, size, space } from '@/lib/theme';
import { AppText } from '@/components/ui';
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
              <AppText variant="muted">Sign out</AppText>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={newDocument} hitSlop={8} disabled={creating} style={styles.newButton}>
              <AppText style={styles.newButtonText}>{creating ? '···' : '+ New'}</AppText>
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
              tintColor={colors.inkMuted}
            />
          }
          ListHeaderComponent={
            docs.length > 0 ? (
              <AppText variant="label" style={styles.sectionLabel}>
                {docs.length} {docs.length === 1 ? 'document' : 'documents'}
              </AppText>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <AppText variant="title" style={styles.emptyTitle}>
                A blank page.
              </AppText>
              <AppText variant="muted" style={styles.emptyBody}>
                Tap “+ New” to start your first document.
              </AppText>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => router.push(`/editor/${item.id}`)}
            >
              <AppText variant="heading" numberOfLines={1} style={styles.rowTitle}>
                {item.title || 'Untitled'}
              </AppText>
              <AppText variant="small">Edited {formatDate(item.updatedAt)}</AppText>
            </Pressable>
          )}
        />
      )}

      {error && (
        <View style={styles.errorBar}>
          <AppText variant="small" style={styles.errorText}>
            {error}
          </AppText>
        </View>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.xs },
  listContent: { padding: space.md, gap: space.sm },
  emptyContent: { flexGrow: 1 },
  sectionLabel: { marginBottom: space.sm, marginLeft: space.xs },
  newButton: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  newButtonText: { color: colors.accent, fontFamily: font.uiBold, fontSize: size.sm },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: 4,
  },
  rowPressed: { backgroundColor: colors.surfaceActive },
  rowTitle: { fontSize: size.lg },
  emptyTitle: { textAlign: 'center' },
  emptyBody: { textAlign: 'center' },
  errorBar: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
  },
  errorText: { color: colors.danger, textAlign: 'center' },
});
