export const LightThemeColors = {
    primary: '#10B981', // Emerald-500
    primaryDark: '#0F766E', // Teal-700
    primaryLight: '#34D399', // Emerald-400
    secondary: '#0F766E',
    accent: '#06B6D4', // Cyan-500
    background: '#F1F5F9', // Slate-100 — app-wide bg
    surface: '#FFFFFF',
    text: '#0F172A', // Slate-900
    textSecondary: '#64748B', // Slate-500
    textMuted: '#94A3B8', // Slate-400
    border: '#E2E8F0', // Slate-200
    borderLight: '#F1F5F9', // Slate-100
    error: '#EF4444',
    success: '#10B981',
    white: '#FFFFFF',
};

export const DarkThemeColors = {
    primary: '#0F766E',
    primaryDark: '#134E4A',
    primaryLight: '#22D3EE',
    secondary: '#0F766E',
    accent: '#22D3EE',
    background: '#0F172A',
    surface: '#1E293B',
    text: '#F1F5F9',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    border: '#334155',
    borderLight: '#1E293B',
    error: '#F87171',
    success: '#34D399',
    white: '#FFFFFF',
};

// Default export for files that do not use useColorScheme
export const Colors = LightThemeColors;

export const Spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
};

export const BorderRadius = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 999,
};

export const Shadows = {
    soft: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 2,
    },
    medium: {
        shadowColor: '#0F766E',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 5,
    },
};

export const Typography = {
    h1: {
        fontSize: 28,
        fontWeight: '800' as const,
        color: Colors.text,
        letterSpacing: -0.5,
    },
    h2: {
        fontSize: 24,
        fontWeight: '700' as const,
        color: Colors.text,
        letterSpacing: -0.3,
    },
    h3: {
        fontSize: 18,
        fontWeight: '700' as const,
        color: Colors.text,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '800' as const,
        color: Colors.textMuted,
        letterSpacing: 1.2,
        textTransform: 'uppercase' as const,
    },
    body: {
        fontSize: 15,
        color: Colors.text,
        lineHeight: 22,
    },
    caption: {
        fontSize: 12,
        color: Colors.textSecondary,
    },
};
