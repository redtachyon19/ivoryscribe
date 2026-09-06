import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useSession } from '@/lib/session';
import { colors, font, size, space } from '@/lib/theme';
import { AppText } from '@/components/ui';
import { getDocument, updateDocument } from '@shared/api';

type LoadState = 'loading' | 'ready' | 'error';

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const token = session?.token ?? '';

  const [state, setState] = useState<LoadState>('loading');
  const [title, setTitle] = useState('');
  const [initialHtml, setInitialHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Latest editor HTML, kept in a ref so typing in the WebView doesn't re-render
  // React (which would remount the WebView and lose caret/state).
  const contentRef = useRef('');
  const loadedIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !id || loadedIdRef.current === id) return;
    loadedIdRef.current = id;
    setState('loading');
    try {
      const doc = await getDocument(token, id);
      if (!doc) {
        setError('Document not found.');
        setState('error');
        return;
      }
      setTitle(doc.title);
      contentRef.current = doc.content ?? '';
      setInitialHtml(doc.content ?? '');
      setState('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\[[^\]]+\]\s*/, '') : 'Failed to load');
      setState('error');
    }
  }, [token, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type: string; html?: string };
      if (msg.type === 'content' && typeof msg.html === 'string') {
        contentRef.current = msg.html;
      }
    } catch {
      // Ignore malformed bridge messages.
    }
  }, []);

  const save = useCallback(async () => {
    if (!token || !id || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateDocument(token, id, { title: title.trim() || 'Untitled', content: contentRef.current });
      setSavedAt(new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\[[^\]]+\]\s*/, '') : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [token, id, title, saving]);

  const html = useMemo(() => (state === 'ready' ? buildEditorHtml(initialHtml) : ''), [state, initialHtml]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Pressable onPress={save} hitSlop={8} disabled={saving || state !== 'ready'}>
              <AppText style={[styles.save, (saving || state !== 'ready') && styles.saveDisabled]}>
                {saving ? 'Saving…' : 'Save'}
              </AppText>
            </Pressable>
          ),
        }}
      />

      {state === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      {state === 'error' && (
        <View style={styles.center}>
          <AppText variant="muted" style={styles.errorText}>
            {error ?? 'Something went wrong.'}
          </AppText>
        </View>
      )}

      {state === 'ready' && (
        <>
          <TextInput
            style={styles.title}
            value={title}
            onChangeText={setTitle}
            placeholder="Untitled"
            placeholderTextColor={colors.inkFaint}
            selectionColor={colors.accent}
          />
          <View style={styles.statusRow}>
            {error ? (
              <AppText variant="small" style={styles.errorText}>
                {error}
              </AppText>
            ) : (
              <AppText variant="small">{savedAt ? `Saved at ${savedAt}` : 'Draft · not yet saved'}</AppText>
            )}
          </View>
          <WebView
            originWhitelist={['*']}
            source={{ html }}
            onMessage={onMessage}
            style={styles.webview}
            keyboardDisplayRequiresUserAction={false}
            hideKeyboardAccessoryView
          />
        </>
      )}
    </View>
  );
}

// Minimal contentEditable editor served into the WebView, styled to match the
// app's ivory paper. This is the seam where the real TipTap bundle will live —
// same bridge contract (seed innerHTML, post { type: 'content', html } on input).
function buildEditorHtml(initial: string): string {
  const seed = JSON.stringify(initial || '<p><br></p>');
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: ${colors.bg}; }
  body { display: flex; flex-direction: column; }
  #toolbar {
    display: flex; gap: 6px; padding: 8px 12px; flex-wrap: wrap;
    background: ${colors.surface}; border-bottom: 1px solid ${colors.border};
    position: sticky; top: 0;
  }
  #toolbar button {
    background: transparent; color: ${colors.ink};
    border: 1px solid ${colors.border}; border-radius: 6px;
    font-family: Georgia, serif; font-size: 15px; min-width: 40px; height: 34px; padding: 0 10px;
  }
  #toolbar button:active { background: ${colors.accent}; color: #fff; border-color: ${colors.accent}; }
  #editor {
    flex: 1; overflow-y: auto; padding: 22px 20px 80px;
    color: ${colors.ink}; font-family: Georgia, 'Times New Roman', serif;
    font-size: 19px; line-height: 1.65; outline: none; caret-color: ${colors.accent};
  }
  #editor:empty::before { content: 'Start writing…'; color: ${colors.inkFaint}; }
  #editor h1 { font-size: 30px; margin: 0 0 12px; } #editor h2 { font-size: 24px; margin: 0 0 10px; }
  #editor p { margin: 0 0 14px; }
  #editor ul { padding-left: 22px; }
</style>
</head>
<body>
  <div id="toolbar">
    <button onclick="cmd('bold')" style="font-weight:700">B</button>
    <button onclick="cmd('italic')" style="font-style:italic">I</button>
    <button onclick="cmd('underline')" style="text-decoration:underline">U</button>
    <button onclick="block('h1')">H1</button>
    <button onclick="block('h2')">H2</button>
    <button onclick="block('p')">¶</button>
    <button onclick="cmd('insertUnorderedList')">•</button>
  </div>
  <div id="editor" contenteditable="true"></div>
  <script>
    var editor = document.getElementById('editor');
    editor.innerHTML = ${seed};
    function post() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'content', html: editor.innerHTML }));
      }
    }
    function cmd(c) { document.execCommand(c, false, null); editor.focus(); post(); }
    function block(tag) { document.execCommand('formatBlock', false, tag); editor.focus(); post(); }
    editor.addEventListener('input', post);
  </script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  title: {
    color: colors.ink,
    fontFamily: font.serifBold,
    fontSize: size.xxl,
    paddingHorizontal: space.md,
    paddingTop: space.xs,
  },
  statusRow: { paddingHorizontal: space.md, paddingBottom: space.xs },
  errorText: { color: colors.danger },
  webview: { flex: 1, backgroundColor: colors.bg },
  save: { color: colors.accent, fontFamily: font.uiBold, fontSize: size.md, paddingHorizontal: space.xs },
  saveDisabled: { color: colors.inkSubtle },
});
