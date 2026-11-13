/**
 * Semantic design tokens — synced from sibling web artifact (artifacts/limpeza/src/index.css).
 * HSL values converted to hex for React Native StyleSheet compatibility.
 */

const colors = {
  light: {
    // Legacy aliases
    text: '#0f172a',
    tint: '#2563eb',

    // Core surfaces — matches web :root vars
    background: '#f8fafc',  // 210 40% 98%
    foreground: '#0f172a',  // 222.2 84% 4.9%

    // Cards
    card: '#ffffff',
    cardForeground: '#0f172a',

    // Primary — web: 221.2 83.2% 53.3%
    primary: '#2563eb',
    primaryForeground: '#f8fafc',

    // Secondary / muted — web: 210 40% 96.1%
    secondary: '#f1f5f9',
    secondaryForeground: '#1e293b',

    muted: '#f1f5f9',
    mutedForeground: '#64748b',  // 215.4 16.3% 46.9%

    accent: '#f1f5f9',
    accentForeground: '#1e293b',

    // Destructive — web: 0 84.2% 60.2%
    destructive: '#ef4444',
    destructiveForeground: '#f8fafc',

    // Borders / inputs — web: 214.3 31.8% 91.4%
    border: '#e2e8f0',
    input: '#e2e8f0',

    // Status colours for cleaning workflow
    statusDirty: '#ef4444',
    statusWillClean: '#3b82f6',
    statusCleaning: '#f59e0b',
    statusPendingIssue: '#f97316',
    statusClean: '#10b981',
  },

  dark: {
    text: '#f8fafc',
    tint: '#3b82f6',

    background: '#0f172a',  // 222.2 84% 4.9%
    foreground: '#f8fafc',

    card: '#1e293b',
    cardForeground: '#f8fafc',

    primary: '#3b82f6',     // 217.2 91.2% 59.8%
    primaryForeground: '#0f172a',

    secondary: '#1e293b',
    secondaryForeground: '#f8fafc',

    muted: '#1e293b',       // 217.2 32.6% 17.5%
    mutedForeground: '#94a3b8',  // 215 20.2% 65.1%

    accent: '#1e293b',
    accentForeground: '#f8fafc',

    destructive: '#ef4444',
    destructiveForeground: '#f8fafc',

    border: '#1e293b',
    input: '#1e293b',

    statusDirty: '#ef4444',
    statusWillClean: '#3b82f6',
    statusCleaning: '#f59e0b',
    statusPendingIssue: '#f97316',
    statusClean: '#10b981',
  },

  // 0.75rem → 12px (matches web --radius: 0.75rem)
  radius: 12,
};

export default colors;
