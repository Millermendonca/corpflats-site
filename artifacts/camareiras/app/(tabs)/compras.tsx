import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

interface ShoppingItem {
  id: string;
  title: string;
  quantity?: string;
  category?: string;
  notes?: string;
  completed: boolean;
  createdBy: {
    id: number;
    name: string;
    role: string;
  };
  createdAt: string;
  completedBy?: {
    id: number;
    name: string;
    role: string;
  } | null;
  completedAt?: string | null;
}

const CATEGORIES = [
  { label: "Limpeza", color: "#10b981", bg: "#10b98118" },
  { label: "Cama & Banho", color: "#6366f1", bg: "#6366f118" },
  { label: "Manutenção", color: "#f59e0b", bg: "#f59e0b18" },
  { label: "Cozinha", color: "#ec4899", bg: "#ec489918" },
  { label: "Geral", color: "#64748b", bg: "#64748b18" },
];

function apiUrl(path: string): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  return `https://${domain}${path}`;
}

function formatDateBr(isoStr?: string | null): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoStr.substring(0, 10);
  }
}

export default function ComprasScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"pending" | "completed" | "all">("pending");

  // Modal Novo Item
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [newCategory, setNewCategory] = useState("Limpeza");
  const [newNotes, setNewNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/shopping-list"), { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      console.error("[Compras] Erro ao buscar lista:", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchItems();
  }, [fetchItems]);

  // Alterna status (dar baixa / reabrir)
  const handleToggle = async (item: ShoppingItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Atualização otimista local
    const nextCompleted = !item.completed;
    setItems(prev =>
      prev.map(i =>
        i.id === item.id
          ? {
              ...i,
              completed: nextCompleted,
              completedAt: nextCompleted ? new Date().toISOString() : null,
              completedBy: nextCompleted ? { id: user?.id || 1, name: user?.name || user?.username || "Eu", role: user?.role || "camareira" } : null,
            }
          : i
      )
    );

    try {
      const res = await fetch(apiUrl(`/api/shopping-list/${item.id}/toggle`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ completed: nextCompleted }),
      });
      if (res.ok) {
        const updated = await res.json();
        setItems(prev => prev.map(i => (i.id === item.id ? updated : i)));
      } else {
        fetchItems();
      }
    } catch {
      fetchItems();
    }
  };

  // Excluir item
  const handleDelete = (item: ShoppingItem) => {
    Alert.alert(
      "Excluir Item",
      `Deseja remover "${item.title}" da lista de compras?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setItems(prev => prev.filter(i => i.id !== item.id));
            try {
              await fetch(apiUrl(`/api/shopping-list/${item.id}`), {
                method: "DELETE",
                credentials: "include",
              });
            } catch {
              fetchItems();
            }
          },
        },
      ]
    );
  };

  // Criar novo item
  const handleCreate = async () => {
    if (!newTitle.trim()) {
      Alert.alert("Atenção", "Informe o nome do item a comprar.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl("/api/shopping-list"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: newTitle.trim(),
          quantity: "",
          category: "Limpeza",
          notes: newNotes.trim(),
        }),
      });
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setModalOpen(false);
        setNewTitle("");
        setNewNotes("");
        fetchItems();
      } else {
        Alert.alert("Erro", "Não foi possível adicionar o item.");
      }
    } catch (err: any) {
      Alert.alert("Erro", "Falha de conexão com o servidor.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (filter === "pending") return items.filter(i => !i.completed);
    if (filter === "completed") return items.filter(i => i.completed);
    return items;
  }, [items, filter]);

  const pendingCount = useMemo(() => items.filter(i => !i.completed).length, [items]);
  const completedCount = useMemo(() => items.filter(i => i.completed).length, [items]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>Lista de Compras</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Compartilhada entre Camareiras & Adm
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setModalOpen(true)}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Pedir Item</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.filtersRow, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => setFilter("pending")}
          style={[
            styles.filterTab,
            filter === "pending" && [styles.filterTabActive, { borderBottomColor: colors.primary }],
          ]}
        >
          <Text
            style={[
              styles.filterTabText,
              { color: filter === "pending" ? colors.primary : colors.mutedForeground },
            ]}
          >
            Pendentes ({pendingCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFilter("completed")}
          style={[
            styles.filterTab,
            filter === "completed" && [styles.filterTabActive, { borderBottomColor: colors.primary }],
          ]}
        >
          <Text
            style={[
              styles.filterTabText,
              { color: filter === "completed" ? colors.primary : colors.mutedForeground },
            ]}
          >
            Comprados ({completedCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFilter("all")}
          style={[
            styles.filterTab,
            filter === "all" && [styles.filterTabActive, { borderBottomColor: colors.primary }],
          ]}
        >
          <Text
            style={[
              styles.filterTabText,
              { color: filter === "all" ? colors.primary : colors.mutedForeground },
            ]}
          >
            Todos ({items.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Carregando compras...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cart-outline" size={54} color={colors.mutedForeground} style={{ opacity: 0.4 }} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {filter === "pending" ? "Nenhum item pendente!" : "Nenhum item encontrado."}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                {filter === "pending"
                  ? "Tudo em dia! Se faltar algo na limpeza ou nos flats, clique em 'Pedir Item'."
                  : "Adicione novos itens para manter a governança abastecida."}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const catObj = CATEGORIES.find(c => c.label.toLowerCase() === (item.category || "").toLowerCase()) || CATEGORIES[0];
            return (
              <View
                style={[
                  styles.itemCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: item.completed ? colors.border : colors.border,
                    opacity: item.completed ? 0.75 : 1,
                  },
                ]}
              >
                {/* Big Checkbox to give baixa */}
                <TouchableOpacity
                  onPress={() => handleToggle(item)}
                  style={[
                    styles.checkbox,
                    {
                      borderColor: item.completed ? "#10b981" : colors.mutedForeground,
                      backgroundColor: item.completed ? "#10b981" : "transparent",
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  {item.completed && <Ionicons name="checkmark" size={16} color="#fff" />}
                </TouchableOpacity>

                {/* Content */}
                <View style={styles.itemBody}>
                  <View style={styles.itemTitleRow}>
                    <Text
                      style={[
                        styles.itemTitle,
                        {
                          color: item.completed ? colors.mutedForeground : colors.foreground,
                          textDecorationLine: item.completed ? "line-through" : "none",
                        },
                      ]}
                      numberOfLines={2}
                    >
                      {item.title}
                    </Text>

                    {item.quantity ? (
                      <View style={[styles.qtyBadge, { backgroundColor: colors.muted }]}>
                        <Text style={[styles.qtyBadgeText, { color: colors.foreground }]}>{item.quantity}</Text>
                      </View>
                    ) : null}
                  </View>

                  {item.notes ? (
                    <Text style={[styles.itemNotes, { color: colors.mutedForeground }]} numberOfLines={2}>
                      📝 {item.notes}
                    </Text>
                  ) : null}

                  {/* Metadata: Category + Author + Baixa */}
                  <View style={styles.metaRow}>
                    <View style={[styles.catBadge, { backgroundColor: catObj.bg }]}>
                      <Text style={[styles.catBadgeText, { color: catObj.color }]}>{item.category || "Limpeza"}</Text>
                    </View>

                    <Text style={[styles.authorText, { color: colors.mutedForeground }]} numberOfLines={1}>
                      Por {item.createdBy?.name || "Colaborador"} • {formatDateBr(item.createdAt)}
                    </Text>
                  </View>

                  {/* Baixa info if completed */}
                  {item.completed && (
                    <View style={styles.completedInfo}>
                      <Ionicons name="checkmark-circle" size={13} color="#10b981" />
                      <Text style={styles.completedInfoText}>
                        Comprado por {item.completedBy?.name || "Admin"} ({formatDateBr(item.completedAt)})
                      </Text>
                    </View>
                  )}
                </View>

                {/* Delete button */}
                <TouchableOpacity
                  onPress={() => handleDelete(item)}
                  style={styles.deleteBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      {/* Modal: Adicionar Item à Lista */}
      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Novo Item de Compra</Text>
                <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                  Todos da governança e recepção verão este pedido
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalOpen(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Item Name */}
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>O que está faltando comprar? *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Ex: Água Sanitária, Sabonete líquido, Esponja..."
                placeholderTextColor={colors.mutedForeground}
                value={newTitle}
                onChangeText={setNewTitle}
                autoFocus
              />

              {/* Notes */}
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>Observação / Detalhes (opcional)</Text>
              <TextInput
                style={[styles.input, styles.inputNotes, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Ex: Está quase acabando na rouparia do 5º andar"
                placeholderTextColor={colors.mutedForeground}
                value={newNotes}
                onChangeText={setNewNotes}
                multiline
                numberOfLines={2}
              />

              {/* Buttons */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => setModalOpen(false)}
                  style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.modalCancelText, { color: colors.foreground }]}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleCreate}
                  disabled={submitting || !newTitle.trim()}
                  style={[
                    styles.modalSubmitBtn,
                    { backgroundColor: colors.primary, opacity: submitting || !newTitle.trim() ? 0.6 : 1 },
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.modalSubmitText}>Adicionar à Lista</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
  },
  addBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  filtersRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    marginBottom: 10,
  },
  filterTab: {
    paddingVertical: 10,
    marginRight: 18,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  filterTabActive: {},
  filterTabText: {
    fontSize: 13,
    fontWeight: "700",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "500",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
    gap: 10,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  itemBody: {
    flex: 1,
    gap: 4,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "800",
    flex: 1,
    lineHeight: 20,
  },
  qtyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    flexShrink: 0,
  },
  qtyBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  itemNotes: {
    fontSize: 12,
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    flexWrap: "wrap",
  },
  catBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  catBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  authorText: {
    fontSize: 11,
    fontWeight: "500",
    flex: 1,
  },
  completedInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  completedInfoText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#10b981",
  },
  deleteBtn: {
    padding: 4,
    flexShrink: 0,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    padding: 22,
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "600",
  },
  inputNotes: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  catPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  catPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  catPillText: {
    fontSize: 12,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    marginBottom: 10,
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
