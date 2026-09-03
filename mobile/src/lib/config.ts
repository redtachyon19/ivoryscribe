import Constants from 'expo-constants';
import { configureApi } from '@shared/api';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string };

// Backend base URL.
//  - iOS simulator reaches the host machine via localhost.
//  - Android emulator uses 10.0.2.2 for the host.
//  - A physical device needs your machine's LAN IP (e.g. http://192.168.1.20:4000).
// Override without editing code via EXPO_PUBLIC_API_URL, or app.json > expo.extra.apiUrl.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || extra.apiUrl || 'http://localhost:4000';

// Point the shared API client at the backend. Called once from the root layout
// before any screen renders. Mobile does this here instead of reading
// import.meta.env / window.location the way the web apps do.
export function initApiConfig() {
  configureApi({
    baseUrl: API_URL,
    isDev: __DEV__,
  });
}
