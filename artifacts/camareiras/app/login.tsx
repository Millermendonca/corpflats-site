import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!username.trim() || !password.trim()) {
      setError('Preencha todos os campos');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await login(username.trim(), password.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message ?? 'Erro ao fazer login');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  }

  const s = styles(colors, insets);

  return (
    <View style={s.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.inner}
      >
        {/* Brand */}
        <View style={s.brand}>
          <View style={s.logoBox}>
            <Ionicons name="sparkles" size={34} color="#ffffff" />
          </View>
          <Text style={s.appName}>Camareiras</Text>
          <Text style={s.tagline}>Gestão de Limpeza</Text>
        </View>

        {/* Card */}
        <View style={s.card}>
          {error && (
            <View style={s.errorRow}>
              <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <View style={s.field}>
            <Text style={s.label}>Usuário</Text>
            <View style={s.inputRow}>
              <Ionicons name="person-outline" size={17} color={colors.mutedForeground} style={s.inputIcon} />
              <TextInput
                style={s.input}
                placeholder="Nome de usuário"
                placeholderTextColor={colors.mutedForeground}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                testID="username-input"
              />
            </View>
          </View>

          <View style={s.field}>
            <Text style={s.label}>Senha</Text>
            <View style={s.inputRow}>
              <Ionicons name="lock-closed-outline" size={17} color={colors.mutedForeground} style={s.inputIcon} />
              <TextInput
                style={s.input}
                placeholder="Senha"
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                testID="password-input"
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={s.eyeBtn}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={17}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[s.loginBtn, isLoading && s.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
            testID="login-button"
          >
            {isLoading
              ? <ActivityIndicator color="#ffffff" />
              : <Text style={s.loginBtnText}>Entrar</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    inner: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0),
      paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 24,
    },
    brand: {
      alignItems: 'center',
      marginBottom: 40,
    },
    logoBox: {
      width: 76,
      height: 76,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 18,
      elevation: 10,
    },
    appName: {
      fontSize: 30,
      fontFamily: 'PlusJakartaSans_700Bold',
      fontWeight: '700' as const,
      color: colors.foreground,
      letterSpacing: -0.5,
    },
    tagline: {
      fontSize: 14,
      fontFamily: 'PlusJakartaSans_400Regular',
      color: colors.mutedForeground,
      marginTop: 4,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 3,
    },
    errorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#fef2f2',
      borderWidth: 1,
      borderColor: '#fecaca',
      borderRadius: 10,
      padding: 12,
    },
    errorText: {
      flex: 1,
      fontSize: 13,
      fontFamily: 'PlusJakartaSans_500Medium',
      color: '#ef4444',
    },
    field: {
      gap: 6,
    },
    label: {
      fontSize: 13,
      fontFamily: 'PlusJakartaSans_600SemiBold',
      color: colors.foreground,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 52,
    },
    inputIcon: {
      marginRight: 10,
    },
    input: {
      flex: 1,
      fontSize: 15,
      fontFamily: 'PlusJakartaSans_400Regular',
      color: colors.foreground,
    },
    eyeBtn: {
      padding: 4,
    },
    loginBtn: {
      height: 52,
      backgroundColor: colors.primary,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 4,
    },
    loginBtnDisabled: {
      opacity: 0.65,
    },
    loginBtnText: {
      color: '#ffffff',
      fontSize: 16,
      fontFamily: 'PlusJakartaSans_600SemiBold',
      letterSpacing: 0.2,
    },
  });
