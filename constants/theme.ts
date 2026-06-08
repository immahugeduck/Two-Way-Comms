export const colors = {
  background: '#0A0A0A',
  surface: '#141414',
  surfaceElevated: '#1E1E1E',
  border: '#2A2A2A',
  primary: '#00D4AA',
  primaryDim: '#00D4AA22',
  danger: '#FF4444',
  dangerDim: '#FF444422',
  textPrimary: '#FFFFFF',
  textSecondary: '#888888',
  textMuted: '#555555',
  bubbleOwn: '#004D3D',
  bubbleOther: '#1E1E1E',
  online: '#00D4AA',
  walkie: '#FF6B35',
  walkieDim: '#FF6B3522',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  full: 9999,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, color: colors.textPrimary },
  h2: { fontSize: 22, fontWeight: '700' as const, color: colors.textPrimary },
  h3: { fontSize: 18, fontWeight: '600' as const, color: colors.textPrimary },
  body: { fontSize: 16, fontWeight: '400' as const, color: colors.textPrimary },
  bodySmall: { fontSize: 14, fontWeight: '400' as const, color: colors.textSecondary },
  caption: { fontSize: 12, fontWeight: '400' as const, color: colors.textMuted },
  label: { fontSize: 13, fontWeight: '600' as const, color: colors.textSecondary },
};
