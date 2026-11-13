import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

function apiUrl(path: string): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  return `https://${domain}${path}`;
}

export default function MaisScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const router = useRouter();

  // Modal Alterar Senha
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSubmitting, setPwSubmitting] = useState(false);

  // Modal Tarefas Preventivas Rápido
  const [tasksModalOpen, setTasksModalOpen] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      "Sair do Aplicativo",
      "Tem certeza de que deseja encerrar sua sessão?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sair",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await logout();
            router.replace("/login");
          },
        },
      ]
    );
  };

  const handleChangePassword = async () => {
    if (!currentPw || !newPw) {
      Alert.alert("Atenção", "Preencha a senha atual e a nova senha.");
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert("Atenção", "A confirmação da nova senha não confere.");
      return;
    }
    if (newPw.length < 4) {
      Alert.alert("Atenção", "A nova senha deve ter no mínimo 4 caracteres.");
      return;
    }

    setPwSubmitting(true);
    try {
      const res = await fetch(apiUrl("/api/auth/change-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Sucesso!", "Sua senha foi alterada com sucesso.");
        setPwModalOpen(false);
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
      } else {
        Alert.alert("Erro", data.error || "Não foi possível alterar a senha.");
      }
    } catch {
      Alert.alert("Erro", "Falha de conexão.");
    } finally {
      setPwSubmitting(false);
    }
  };

  const openWhatsApp = (phone: string, text: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const cleanPhone = phone.replace(/\D/g, "");
    const url = `whatsapp://send?phone=55${cleanPhone}&text=${encodeURIComponent(text)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert("WhatsApp", "Não foi possível abrir o WhatsApp neste aparelho.");
    });
  };

  const name = user?.name || user?.username || "Colaboradora";
  const initial = name.charAt(0).toUpperCase();

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Mais Opções</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 40 }]} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>{name}</Text>
            <Text style={[styles.profileRole, { color: colors.primary }]}>
              {user?.role === "admin" ? "Administrador" : "Governança & Camareiras"}
            </Text>
            <Text style={[styles.profileUsername, { color: colors.mutedForeground }]}>
              Login: @{user?.username}
            </Text>
          </View>
        </View>

        {/* Section: Operações */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>OPERAÇÃO & GOVERNANÇA</Text>
        <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Extrato */}
          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: colors.border }]}
            onPress={() => router.push("/(tabs)/financeiro")}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, { backgroundColor: "#10b98115" }]}>
              <Ionicons name="wallet-outline" size={20} color="#10b981" />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>Meu Extrato Financeiro</Text>
              <Text style={[styles.menuSublabel, { color: colors.mutedForeground }]}>
                Consulte saldo de diárias e comprovantes PIX
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Compras */}
          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: colors.border }]}
            onPress={() => router.push("/(tabs)/compras")}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, { backgroundColor: "#6366f115" }]}>
              <Ionicons name="cart-outline" size={20} color="#6366f1" />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>Lista de Compras</Text>
              <Text style={[styles.menuSublabel, { color: colors.mutedForeground }]}>
                Pedir produtos de limpeza, papel e insumos
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Manutenções */}
          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: colors.border }]}
            onPress={() => router.push("/(tabs)/manutencoes")}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, { backgroundColor: "#f59e0b15" }]}>
              <Ionicons name="construct-outline" size={20} color="#f59e0b" />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>Manutenções & Avarias</Text>
              <Text style={[styles.menuSublabel, { color: colors.mutedForeground }]}>
                Relatar problemas, vazamentos e lâmpadas
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Section: Contatos Úteis */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>CONTATOS RÁPIDOS NO WHATSAPP</Text>
        <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: colors.border }]}
            onPress={() => openWhatsApp("22997124021", `Olá Recepção, aqui é ${name} da Governança.`)}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, { backgroundColor: "#25d36615" }]}>
              <Ionicons name="logo-whatsapp" size={20} color="#25d366" />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>Recepção do Hotel</Text>
              <Text style={[styles.menuSublabel, { color: colors.mutedForeground }]}>
                Falar com a equipe do balcão / check-in
              </Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => openWhatsApp("22997124021", `Olá Gerência, aqui é ${name} da Governança.`)}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, { backgroundColor: "#25d36615" }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#25d366" />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>Gerência & Administração</Text>
              <Text style={[styles.menuSublabel, { color: colors.mutedForeground }]}>
                Dúvidas financeiras, escalas ou urgências
              </Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Section: Configurações & Conta */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>MINHA CONTA</Text>
        <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: colors.border }]}
            onPress={() => setPwModalOpen(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, { backgroundColor: colors.muted }]}>
              <Ionicons name="key-outline" size={20} color={colors.foreground} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>Alterar Senha de Acesso</Text>
              <Text style={[styles.menuSublabel, { color: colors.mutedForeground }]}>
                Modifique sua senha de login
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, { backgroundColor: "#ef444415" }]}>
              <Ionicons name="log-out-outline" size={20} color="#ef4444" />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={[styles.menuLabel, { color: "#ef4444" }]}>Sair do Aplicativo</Text>
              <Text style={[styles.menuSublabel, { color: colors.mutedForeground }]}>
                Encerrar sessão neste celular
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#ef4444" />
          </TouchableOpacity>
        </View>

        {/* App Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerBrand, { color: colors.mutedForeground }]}>CorpFlats • Governança</Text>
          <Text style={[styles.footerVersion, { color: colors.mutedForeground }]}>Versão 2.6.0</Text>
        </View>
      </ScrollView>

      {/* Modal Alterar Senha */}
      <Modal visible={pwModalOpen} animationType="slide" transparent onRequestClose={() => setPwModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Alterar Minha Senha</Text>
              <TouchableOpacity onPress={() => setPwModalOpen(false)}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: colors.foreground }]}>Senha Atual</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Digite sua senha atual"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              value={currentPw}
              onChangeText={setCurrentPw}
            />

            <Text style={[styles.inputLabel, { color: colors.foreground, marginTop: 10 }]}>Nova Senha</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Mínimo 4 caracteres"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              value={newPw}
              onChangeText={setNewPw}
            />

            <Text style={[styles.inputLabel, { color: colors.foreground, marginTop: 10 }]}>Confirmar Nova Senha</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Repita a nova senha"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              value={confirmPw}
              onChangeText={setConfirmPw}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setPwModalOpen(false)}
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.foreground }]}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleChangePassword}
                disabled={pwSubmitting}
                style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }]}
              >
                {pwSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>Salvar Senha</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  scroll: {
    paddingHorizontal: 20,
    gap: 14,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 22,
    fontWeight: "900",
    color: "#fff",
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: 17,
    fontWeight: "900",
  },
  profileRole: {
    fontSize: 12,
    fontWeight: "700",
  },
  profileUsername: {
    fontSize: 11,
    fontWeight: "500",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: 6,
    marginLeft: 4,
  },
  cardGroup: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  menuTextCol: {
    flex: 1,
    gap: 2,
  },
  menuLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
  menuSublabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  footer: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 2,
  },
  footerBrand: {
    fontSize: 12,
    fontWeight: "700",
  },
  footerVersion: {
    fontSize: 11,
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalContent: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  modalCancelBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: "700",
  },
  modalSubmitBtn: {
    flex: 2,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  modalSubmitText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
});
