import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser } from '@workspace/api-client-react';
import { unregisterPushToken } from '@/hooks/usePushNotifications';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const USER_KEY = '@camareiras:user';

function apiUrl(path: string): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? '';
  return `https://${domain}${path}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initAuth();
  }, []);

  async function initAuth() {
    // Show cached user instantly while we verify with the server
    try {
      const cached = await AsyncStorage.getItem(USER_KEY);
      if (cached) setUser(JSON.parse(cached));
    } catch {}

    try {
      const res = await fetch(apiUrl('/api/auth/me'), { credentials: 'include' });
      if (res.ok) {
        const data: AuthUser = await res.json();
        setUser(data);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(data));
      } else {
        setUser(null);
        await AsyncStorage.removeItem(USER_KEY);
      }
    } catch {
      // Network error — keep cached user so the app still works offline-ish
    } finally {
      setIsLoading(false);
    }
  }

  async function login(username: string, password: string) {
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as any).error || 'Usuário ou senha inválidos');
    }
    const data: AuthUser = await res.json();
    setUser(data);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data));
  }

  async function logout() {
    // Remove push token before logging out so notifications stop arriving
    await unregisterPushToken().catch(() => {});
    try {
      await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
    } catch {}
    setUser(null);
    await AsyncStorage.removeItem(USER_KEY);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
