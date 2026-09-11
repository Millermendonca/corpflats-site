import React from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const insets = useSafeAreaInsets();

  // Garante que o menu inferior fique sempre visível e com altura confortável em qualquer celular
  const bottomPadding = Math.max(insets.bottom, isIOS ? 14 : 8);
  const tabHeight = 54 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarHideOnKeyboard: false, // Menus sempre aparecem
        tabBarStyle: {
          position: 'relative', // Fixo no rodapé, sem sobrepor conteúdo
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: tabHeight,
          paddingBottom: bottomPadding,
          paddingTop: 8,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: isDark ? 0.25 : 0.08,
          shadowRadius: 4,
          zIndex: 9999,
        },
        tabBarLabelStyle: {
          fontSize: 10.5,
          fontWeight: '700',
          letterSpacing: -0.2,
          marginTop: 2,
        },
      }}
    >
      {/* 1. Limpeza */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Limpeza',
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name={focused ? 'sparkles' : 'sparkle'}
                tintColor={color}
                size={22}
              />
            ) : (
              <Ionicons
                name={focused ? 'sparkles' : 'sparkles-outline'}
                size={22}
                color={color}
              />
            ),
        }}
      />

      {/* 2. Lista de Compras */}
      <Tabs.Screen
        name="compras"
        options={{
          title: 'Compras',
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name={focused ? 'cart.fill' : 'cart'}
                tintColor={color}
                size={22}
              />
            ) : (
              <Ionicons
                name={focused ? 'cart' : 'cart-outline'}
                size={22}
                color={color}
              />
            ),
        }}
      />

      {/* 3. Extrato */}
      <Tabs.Screen
        name="financeiro"
        options={{
          title: 'Extrato',
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name={focused ? 'wallet.pass.fill' : 'wallet.pass'}
                tintColor={color}
                size={22}
              />
            ) : (
              <Ionicons
                name={focused ? 'wallet' : 'wallet-outline'}
                size={22}
                color={color}
              />
            ),
        }}
      />

      {/* 4. Manutenções */}
      <Tabs.Screen
        name="manutencoes"
        options={{
          title: 'Manutenções',
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name={focused ? 'wrench.and.screwdriver.fill' : 'wrench.and.screwdriver'}
                tintColor={color}
                size={22}
              />
            ) : (
              <Ionicons
                name={focused ? 'construct' : 'construct-outline'}
                size={22}
                color={color}
              />
            ),
        }}
      />

      {/* 5. Mais */}
      <Tabs.Screen
        name="mais"
        options={{
          title: 'Mais',
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name={focused ? 'ellipsis.circle.fill' : 'ellipsis.circle'}
                tintColor={color}
                size={22}
              />
            ) : (
              <Ionicons
                name={focused ? 'grid' : 'grid-outline'}
                size={22}
                color={color}
              />
            ),
        }}
      />

      {/* Rotas secundárias ocultas da barra */}
      <Tabs.Screen
        name="tasks"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="observations"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

