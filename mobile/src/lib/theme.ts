// IvoryScribe mobile design language — lifted from the web app's ivory (default)
// palette in frontend/src/App.css + styles/tokens.css. Warm ivory paper, dark
// ink, pink accent, EB Garamond serif for display and Lato for UI.
export const colors = {
  bg: '#f8f3e3', // warm ivory paper
  surface: '#f4ecd5', // raised cards / dropdowns
  surfaceField: '#efe6cb', // inputs
  surfaceActive: '#e9dfbe',
  border: '#d2c49f',
  borderSubtle: '#ddd0ac',

  ink: '#1d170f', // strong text
  inkNormal: 'rgba(29,23,15,0.88)',
  inkMuted: 'rgba(29,23,15,0.60)',
  inkSubtle: 'rgba(29,23,15,0.45)',
  inkFaint: 'rgba(29,23,15,0.30)',

  accent: '#ff306a', // signature pink
  accentText: '#ffffff',
  accentSoft: 'rgba(255,48,106,0.12)',
  gold: '#b88b3f',
  danger: '#b23a34',
};

// Font family names as registered by expo-google-fonts.
export const font = {
  serifMedium: 'EBGaramond_500Medium',
  serifSemibold: 'EBGaramond_600SemiBold',
  serifBold: 'EBGaramond_700Bold',
  ui: 'Lato_400Regular',
  uiBold: 'Lato_700Bold',
};

export const size = {
  xs: 13,
  sm: 15,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  display: 36,
};

export const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 44,
};

export const radius = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
};
