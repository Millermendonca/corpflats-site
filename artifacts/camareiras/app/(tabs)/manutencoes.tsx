import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  useListObservations,
  useCreateObservation,
  useListFlats,
  type Observation,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";

const CATEGORIES = [
  { value: "manutencao", label: "Manutenção Geral", icon: "build-outline" as const, color: "#f59e0b", bg: "#f59e0b15" },
  { value: "defeito", label: "Avaria / Defeito", icon: "construct-outline" as const, color: "#ef4444", bg: "#ef444415" },
  { value: "ar_condicionado", label: "Ar-Condicionado", icon: "snow-outline" as const, color: "#0ea5e9", bg: "#0ea5e915" },
  { value: "eletrica", label: "Elétrica / TV", icon: "flash-outline" as const, color: "#8b5cf6", bg: "#8b5cf615" },
  { value: "hidraulica", label: "Vazamento / Pia", icon: "water-outline" as const, color: "#06b6d4", bg: "#06b6d415" },
  { value: "outro", label: "Outro", icon: "alert-circle-outline" as const, color: "#64748b", bg: "#64748b15" },
];

function formatDateBr(isoStr?: string | null): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoStr.substring(0, 10);
  }
}

export default function ManutencoesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<"all" | "aberta" | "resolvida">("aberta");
  const [showAdd, setShowAdd] = useState(false);

  // Form state
  const [selFlatId, setSelFlatId] = useState<number | null>(null);
  const [selCategory, setSelCategory] = useState<string>("manutencao");
  const [obsText, setObsText] = useState("");
  const [flatSearch, setFlatSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const queryParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (filter !== "all") p.status = filter;
    return p;
  }, [filter]);

  const { data: observations = [], isLoading, refetch, isRefetching } = useListObservations(
    queryParams as any,
    { query: { refetchInterval: 30_000 } as any }
  );

  const { data: flats = [] } = useListFlats({ query: { staleTime: 300_000 } } as any);
  const createObs = useCreateObservation();

  const visibleFlats = useMemo(() => {
    if (!flatSearch.trim()) return flats;
    return flats.filter(f => f.number.toLowerCase().includes(flatSearch.toLowerCase()));
  }, [flats, flatSearch]);

  const resetForm = () => {
    setSelFlatId(null);
    setSelCategory("manutencao");
    setObsText("");
    setFlatSearch("");
  };

  const handleCreate = async () => {
    if (!selFlatId || !obsText.trim()) return;
    setSubmitting(true);
    try {
      await createObs.mutateAsync({
        data: { flatId: selFlatId, category: selCategory as any, text: obsText.trim() },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries();
      setShowAdd(false);
      resetForm();
    } catch (e: any) {
      console.error("Erro ao criar ocorrência:", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openCount = useMemo(() => observations.filter(o => o.status === "aberta").length, [observations]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>Manutenções</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Avarias, reparos e defeitos nos flats
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setShowAdd(true)}
          style={[styles.addBtn, { backgroundColor: "#f59e0b" }]}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Relatar Defeito</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.filtersRow, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => setFilter("aberta")}
          style={[
            styles.filterTab,
            filter === "aberta" && [styles.filterTabActive, { borderBottomColor: "#f59e0b" }],
          ]}
        >
          <Text
            style={[
              styles.filterTabText,
              { color: filter === "aberta" ? "#f59e0b" : colors.mutedForeground },
            ]}
          >
            Pendentes ({openCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFilter("resolvida")}
          style={[
            styles.filterTab,
            filter === "resolvida" && [styles.filterTabActive, { borderBottomColor: "#10b981" }],
          ]}
        >
          <Text
            style={[
              styles.filterTabText,
              { color: filter === "resolvida" ? "#10b981" : colors.mutedForeground },
            ]}
          >
            Resolvidas
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
            Todas ({observations.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#f59e0b" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Carregando manutenções...</Text>
        </View>
      ) : (
        <FlatList
          data={observations}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#f59e0b" />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="construct-outline" size={54} color={colors.mutedForeground} style={{ opacity: 0.4 }} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {filter === "aberta" ? "Nenhuma manutenção pendente!" : "Nenhuma ocorrência encontrada."}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                Se encontrar qualquer defeito ou item quebrado no quarto, clique em 'Relatar Defeito'.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const catObj = CATEGORIES.find(c => c.value === item.category) || CATEGORIES[0];
            const isResolved = item.status === "resolvida";
            return (
              <View
                style={[
                  styles.itemCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: isResolved ? colors.border : "#f59e0b40",
                  },
                ]}
              >
                <View style={styles.itemHeader}>
                  {/* Flat Badge */}
                  <View style={[styles.flatBadge, { backgroundColor: colors.muted }]}>
                    <Ionicons name="home" size={14} color={colors.primary} />
                    <Text style={[styles.flatBadgeText, { color: colors.foreground }]}>
                      Flat {item.flatNumber || String(item.flatId)}
                    </Text>
                  </View>

                  {/* Status Badge */}
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: isResolved ? "#10b98118" : "#f59e0b18",
                        borderColor: isResolved ? "#10b98140" : "#f59e0b40",
                      },
                    ]}
                  >
                    <Ionicons
                      name={isResolved ? "checkmark-circle" : "time"}
                      size={12}
                      color={isResolved ? "#10b981" : "#f59e0b"}
                    />
                    <Text style={[styles.statusText, { color: isResolved ? "#10b981" : "#f59e0b" }]}>
                      {isResolved ? "Resolvido" : "Pendente"}
                    </Text>
                  </View>
                </View>

                {/* Description */}
                <Text style={[styles.itemText, { color: colors.foreground }]}>{item.text}</Text>

                {/* Footer Metadata */}
                <View style={styles.metaRow}>
                  <View style={[styles.catBadge, { backgroundColor: catObj.bg }]}>
                    <Text style={[styles.catBadgeText, { color: catObj.color }]}>{catObj.label}</Text>
                  </View>

                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                    Por {item.authorUsername || "Camareira"} • {formatDateBr(item.createdAt)}
                  </Text>
                </View>

                {/* Resolvido info */}
                {isResolved && item.resolvedByUsername && (
                  <View style={styles.resolvedBox}>
                    <Ionicons name="checkmark-done" size={14} color="#10b981" />
                    <Text style={styles.resolvedText}>
                      Solucionado por {item.resolvedByUsername} ({formatDateBr(item.resolvedAt)})
                    </Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* Modal: Relatar Ocorrência / Defeito */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Relatar Manutenção</Text>
                <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                  A recepção e a manutenção serão avisadas imediatamente
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowAdd(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Flat Selector */}
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>Qual é o Flat? *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground, marginBottom: 8 }]}
                placeholder="Buscar número do flat (ex: 113, 212...)"
                placeholderTextColor={colors.mutedForeground}
                value={flatSearch}
                onChangeText={setFlatSearch}
              />

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {visibleFlats.map(f => {
                    const isSel = selFlatId === f.id;
                    return (
                      <TouchableOpacity
                        key={f.id}
                        onPress={() => setSelFlatId(f.id)}
                        style={[
                          styles.flatChip,
                          {
                            backgroundColor: isSel ? colors.primary : colors.muted,
                            borderColor: isSel ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.flatChipText, { color: isSel ? "#fff" : colors.foreground }]}>
                          Flat {f.number}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Category selector */}
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>Tipo de Problema</Text>
              <View style={styles.catPillsRow}>
                {CATEGORIES.map(cat => {
                  const isSel = selCategory === cat.value;
                  return (
                    <TouchableOpacity
                      key={cat.value}
                      onPress={() => setSelCategory(cat.value)}
                      style={[
                        styles.catPill,
                        {
                          borderColor: isSel ? cat.color : colors.border,
                          backgroundColor: isSel ? cat.bg : colors.muted,
                        },
                      ]}
                    >
                      <Ionicons name={cat.icon} size={14} color={isSel ? cat.color : colors.mutedForeground} />
                      <Text style={[styles.catPillText, { color: isSel ? cat.color : colors.foreground, fontWeight: isSel ? "700" : "500" }]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Description */}
              <Text style={[styles.inputLabel, { color: colors.foreground, marginTop: 12 }]}>Descrição do Problema *</Text>
              <TextInput
                style={[styles.input, styles.inputNotes, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Ex: Chuveiro não esquenta, controle da TV sumiu, porta do armário solta..."
                placeholderTextColor={colors.mutedForeground}
                value={obsText}
                onChangeText={setObsText}
                multiline
                numberOfLines={3}
              />

              {/* Actions */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => setShowAdd(false)}
                  style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.modalCancelText, { color: colors.foreground }]}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleCreate}
                  disabled={submitting || !selFlatId || !obsText.trim()}
                  style={[
                    styles.modalSubmitBtn,
                    { backgroundColor: "#f59e0b", opacity: submitting || !selFlatId || !obsText.trim() ? 0.6 : 1 },
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.modalSubmitText}>Salvar Ocorrência</Text>
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
    gap: 12,
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
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  flatBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  flatBadgeText: {
    fontSize: 13,
    fontWeight: "800",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
  },
  itemText: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  catBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  catBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  metaText: {
    fontSize: 11,
    fontWeight: "500",
    flex: 1,
  },
  resolvedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(16, 185, 129, 0.2)",
  },
  resolvedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#10b981",
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
    maxHeight: "90%",
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
    minHeight: 70,
    textAlignVertical: "top",
  },
  flatChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  flatChipText: {
    fontSize: 12,
    fontWeight: "800",
  },
  catPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  catPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
