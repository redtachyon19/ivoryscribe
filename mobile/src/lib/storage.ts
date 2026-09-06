import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Cross-platform key/value store for small secrets (the auth session).
//  - native (iOS/Android): expo-secure-store, backed by Keychain / Keystore.
//  - web: localStorage (expo-secure-store has no web implementation, which is
//    why SecureStore.*Async throws "is not a function" in the browser preview).
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        // Private mode / storage disabled — session just won't persist.
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        // Ignore.
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
