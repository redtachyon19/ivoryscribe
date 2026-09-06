import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  type TextProps,
  TextInput,
  type TextInputProps,
  View,
  type ViewProps,
} from 'react-native';

import { colors, font, radius, size, space } from '@/lib/theme';

type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'muted' | 'small';

const TEXT_VARIANTS: Record<TextVariant, object> = {
  display: { fontFamily: font.serifBold, fontSize: size.display, color: colors.ink, lineHeight: size.display * 1.05 },
  title: { fontFamily: font.serifSemibold, fontSize: size.xxl, color: colors.ink, lineHeight: size.xxl * 1.1 },
  heading: { fontFamily: font.serifSemibold, fontSize: size.xl, color: colors.ink },
  body: { fontFamily: font.ui, fontSize: size.md, color: colors.inkNormal, lineHeight: size.md * 1.5 },
  label: {
    fontFamily: font.uiBold,
    fontSize: size.xs - 1,
    color: colors.inkMuted,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  muted: { fontFamily: font.ui, fontSize: size.sm, color: colors.inkMuted },
  small: { fontFamily: font.ui, fontSize: size.xs, color: colors.inkSubtle },
};

export function AppText({
  variant = 'body',
  style,
  ...rest
}: TextProps & { variant?: TextVariant }) {
  return <Text {...rest} style={[TEXT_VARIANTS[variant], style]} />;
}

export function PrimaryButton({
  label,
  busy,
  style,
  disabled,
  ...rest
}: PressableProps & { label: string; busy?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      style={(state) => [
        styles.button,
        (state.pressed || busy || disabled) && styles.buttonPressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      {busy ? (
        <ActivityIndicator color={colors.accentText} />
      ) : (
        <Text style={styles.buttonLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

export function TextButton({ label, style, ...rest }: PressableProps & { label: string }) {
  return (
    <Pressable accessibilityRole="button" hitSlop={8} style={style} {...rest}>
      <Text style={styles.textButton}>{label}</Text>
    </Pressable>
  );
}

export function Field({ style, ...rest }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.inkSubtle}
      selectionColor={colors.accent}
      style={[styles.field, style]}
      {...rest}
    />
  );
}

export function Card({ style, children, ...rest }: ViewProps & { children: ReactNode }) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  buttonPressed: { opacity: 0.82, shadowOpacity: 0.15 },
  buttonLabel: {
    color: colors.accentText,
    fontFamily: font.uiBold,
    fontSize: size.md,
    letterSpacing: 0.3,
  },
  textButton: {
    color: colors.inkMuted,
    fontFamily: font.ui,
    fontSize: size.sm,
    textAlign: 'center',
  },
  field: {
    backgroundColor: colors.surfaceField,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.ink,
    fontFamily: font.ui,
    fontSize: size.md,
    paddingHorizontal: space.md,
    paddingVertical: 13,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: space.lg,
  },
});
