import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

// ── Types ────────────────────────────────────────────────────────────────────

interface StatementEntry {
  id: string;
  entryType: "credit" | "debit";
  amount: number;
  description: string;
  entryDate: string;
  createdAt: string;
  balanceAfter: number;
  payment: {
    type: string;
    interTxId: string | null;
    interStatus: string | null;
    interSimulated: boolean;
    paidAt: string | null;
  } | null;
}

interface MaidStatement {
  userId: number;
  userName: string;
  pixKey: string;
  balance: number;
  statement: StatementEntry[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function apiUrl(path: string): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  return `https://${domain}${path}`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = dateStr.substring(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : dateStr;
}

function formatTime(isoStr?: string): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// ── Entry Card Component ──────────────────────────────────────────────────────

function EntryCard({
  entry,
  colors,
  onPress,
}: {
  entry: StatementEntry;
  colors: any;
  onPress: () => void;
}) {
  const isCredit = entry.entryType === "credit";
  const isAdvance = entry.payment?.type === "advance";

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.entryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      {/* Ícone */}
      <View
        style={[
          styles.entryIcon,
          {
            backgroundColor: isCredit
              ? "#10b98118"
              : isAdvance
              ? "#f59e0b18"
              : "#ef444418",
          },
        ]}
      >
        <Ionicons
          name={
            isCredit
              ? "arrow-up-circle"
              : isAdvance
              ? "gift-outline"
              : "arrow-down-circle"
          }
          size={22}
          color={isCredit ? "#10b981" : isAdvance ? "#d97706" : "#ef4444"}
        />
      </View>

      {/* Descrição + Data */}
      <View style={styles.entryInfo}>
        <Text style={[styles.entryDescription, { color: colors.foreground }]} numberOfLines={2}>
          {entry.description}
        </Text>
        <View style={styles.entryMeta}>
          <Text style={[styles.entryDate, { color: colors.mutedForeground }]}>
            {formatDate(entry.entryDate)}
            {entry.createdAt && formatTime(entry.createdAt) ? ` às ${formatTime(entry.createdAt)}` : ""}
          </Text>
          {isAdvance && (
            <View style={styles.advanceBadge}>
              <Text style={styles.advanceBadgeText}>Vale</Text>
            </View>
          )}
          {entry.payment?.interSimulated && (
            <View style={[styles.advanceBadge, { backgroundColor: "#f59e0b20" }]}>
              <Text style={[styles.advanceBadgeText, { color: "#d97706" }]}>Simulado</Text>
            </View>
          )}
        </View>
        {entry.payment?.interTxId && !entry.payment.interSimulated && (
          <Text style={[styles.txId, { color: colors.primary }]} numberOfLines={1}>
            TxID: {entry.payment.interTxId.substring(0, 16)}…
          </Text>
        )}
      </View>

      {/* Valor + Saldo */}
      <View style={styles.entryValues}>
        <Text
          style={[
            styles.entryAmount,
            { color: isCredit ? "#10b981" : "#ef4444" },
          ]}
        >
          {isCredit ? "+" : "−"}
          {formatCurrency(entry.amount)}
        </Text>
        <Text style={[styles.entryBalance, { color: colors.mutedForeground }]}>
          Saldo: {formatCurrency(entry.balanceAfter)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function FinanceiroScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [data, setData] = useState<MaidStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingWa, setSendingWa] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "credits" | "debits">("all");
  const [selectedEntry, setSelectedEntry] = useState<StatementEntry | null>(null);

  const fetchStatement = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const res = await fetch(apiUrl("/api/maids/statement/me"), { credentials: "include" });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err: any) {
      console.error("[Financeiro] Erro ao carregar extrato:", err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStatement();
    setRefreshing(false);
  }, [fetchStatement]);

  React.useEffect(() => {
    fetchStatement();
  }, [fetchStatement]);

  const handleSendWhatsApp = async () => {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      setSendingWa(true);
      const res = await fetch(apiUrl("/api/maids/statement/send-whatsapp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const result = await res.json();
      if (result.success || result.simulated) {
        Alert.alert(
          "✅ Extrato Enviado!",
          "Seu extrato financeiro foi enviado para o seu WhatsApp.",
          [{ text: "OK" }]
        );
      } else {
        Alert.alert("Falha", result.error || result.message || "Não foi possível enviar o extrato.");
      }
    } catch (err: any) {
      Alert.alert("Erro", "Não foi possível enviar o extrato.");
    } finally {
      setSendingWa(false);
    }
  };

  const balance = data?.balance ?? 0;
  const balancePositive = balance >= 0;

  // Filtragem e cálculos
  const statementList = data?.statement || [];
  const creditEntries = useMemo(() => statementList.filter(e => e.entryType === "credit"), [statementList]);
  const debitEntries = useMemo(() => statementList.filter(e => e.entryType === "debit"), [statementList]);

  const totalEarned = useMemo(() => creditEntries.reduce((acc, it) => acc + Number(it.amount || 0), 0), [creditEntries]);
  const totalPaid = useMemo(() => debitEntries.reduce((acc, it) => acc + Number(it.amount || 0), 0), [debitEntries]);

  const filteredEntries = useMemo(() => {
    if (filterType === "credits") return creditEntries;
    if (filterType === "debits") return debitEntries;
    return statementList;
  }, [filterType, statementList, creditEntries, debitEntries]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: 16 }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Meu Extrato</Text>
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
            Diárias e pagamentos em tempo real
          </Text>
        </View>
        <TouchableOpacity
          onPress={onRefresh}
          disabled={refreshing || loading}
          style={[styles.refreshBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <Ionicons name="refresh" size={18} color={loading || refreshing ? colors.mutedForeground : colors.primary} />
        </TouchableOpacity>
      </View>

      {loading && !data ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Carregando extrato...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Card Nubank / Inter Saldo Principal */}
          <View
            style={[
              styles.balanceCard,
              {
                backgroundColor: balancePositive ? "#10b98115" : "#ef444415",
                borderColor: balancePositive ? "#10b98135" : "#ef444435",
                marginHorizontal: 16,
              },
            ]}
          >
            <View style={styles.balanceHeaderRow}>
              <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>SALDO A RECEBER</Text>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Ao Vivo</Text>
              </View>
            </View>

            <Text style={[styles.balanceAmount, { color: balancePositive ? "#10b981" : "#ef4444" }]}>
              {formatCurrency(balance)}
            </Text>

            {data?.pixKey ? (
              <View style={styles.pixKeyPill}>
                <Text style={[styles.pixKeyText, { color: colors.foreground }]} numberOfLines={1}>
                  🔑 PIX: {data.pixKey}
                </Text>
              </View>
            ) : (
              <Text style={[styles.pixKeyText, { color: "#f59e0b" }]}>
                ⚠️ Chave PIX não cadastrada
              </Text>
            )}

            {/* Botão Enviar Extrato WhatsApp */}
            <TouchableOpacity
              onPress={handleSendWhatsApp}
              disabled={sendingWa}
              style={[styles.waButton, { backgroundColor: "#25d366" }]}
              activeOpacity={0.85}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#fff" />
              <Text style={styles.waButtonText}>
                {sendingWa ? "Enviando Extrato..." : "Enviar Extrato no WhatsApp"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Faixa Resumo (Diárias vs Pagamentos) */}
          <View style={[styles.statsRow, { marginHorizontal: 16 }]}>
            <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.statBoxHeader}>
                <Text style={[styles.statBoxLabel, { color: colors.mutedForeground }]}>DIÁRIAS</Text>
                <Ionicons name="arrow-up-circle" size={14} color="#10b981" />
              </View>
              <Text style={[styles.statBoxValue, { color: "#10b981" }]}>
                +{formatCurrency(totalEarned)}
              </Text>
              <Text style={[styles.statBoxSub, { color: colors.mutedForeground }]}>
                {creditEntries.length} quartos
              </Text>
            </View>

            <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.statBoxHeader}>
                <Text style={[styles.statBoxLabel, { color: colors.mutedForeground }]}>PAGOS / VALES</Text>
                <Ionicons name="arrow-down-circle" size={14} color="#ef4444" />
              </View>
              <Text style={[styles.statBoxValue, { color: "#ef4444" }]}>
                −{formatCurrency(totalPaid)}
              </Text>
              <Text style={[styles.statBoxSub, { color: colors.mutedForeground }]}>
                {debitEntries.length} saídas
              </Text>
            </View>
          </View>

          {/* Filtros em Pílula */}
          <View style={[styles.filterRow, { marginHorizontal: 16 }]}>
            <TouchableOpacity
              onPress={() => setFilterType("all")}
              style={[
                styles.filterPill,
                filterType === "all"
                  ? { backgroundColor: colors.foreground }
                  : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  { color: filterType === "all" ? colors.background : colors.mutedForeground },
                ]}
              >
                Todas ({statementList.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setFilterType("credits")}
              style={[
                styles.filterPill,
                filterType === "credits"
                  ? { backgroundColor: "#10b981" }
                  : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  { color: filterType === "credits" ? "#fff" : colors.mutedForeground },
                ]}
              >
                Diárias ({creditEntries.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setFilterType("debits")}
              style={[
                styles.filterPill,
                filterType === "debits"
                  ? { backgroundColor: "#ef4444" }
                  : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  { color: filterType === "debits" ? "#fff" : colors.mutedForeground },
                ]}
              >
                Saídas ({debitEntries.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Lista de Movimentações */}
          {!filteredEntries.length ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={44} color={colors.mutedForeground} style={{ opacity: 0.4 }} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Nenhuma movimentação para este filtro.
              </Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              {filteredEntries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  colors={colors}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedEntry(entry);
                  }}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Modal Detalhes do Comprovante */}
      <Modal
        visible={!!selectedEntry}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedEntry(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {selectedEntry && (
              <>
                <View style={styles.modalHeader}>
                  <View
                    style={[
                      styles.modalIcon,
                      {
                        backgroundColor:
                          selectedEntry.entryType === "credit"
                            ? "#10b98118"
                            : selectedEntry.payment?.type === "advance"
                            ? "#f59e0b18"
                            : "#ef444418",
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        selectedEntry.entryType === "credit"
                          ? "checkmark-circle"
                          : selectedEntry.payment?.type === "advance"
                          ? "gift"
                          : "wallet"
                      }
                      size={28}
                      color={
                        selectedEntry.entryType === "credit"
                          ? "#10b981"
                          : selectedEntry.payment?.type === "advance"
                          ? "#d97706"
                          : "#ef4444"
                      }
                    />
                  </View>
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>Comprovante Digital</Text>
                  <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                    {selectedEntry.entryType === "credit" ? "Crédito Diária" : "Débito Financeiro"}
                  </Text>
                </View>

                {/* Valor em destaque */}
                <View style={[styles.modalAmountBox, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.modalAmountLabel, { color: colors.mutedForeground }]}>VALOR</Text>
                  <Text
                    style={[
                      styles.modalAmountText,
                      { color: selectedEntry.entryType === "credit" ? "#10b981" : "#ef4444" },
                    ]}
                  >
                    {selectedEntry.entryType === "credit" ? "+" : "−"}
                    {formatCurrency(selectedEntry.amount)}
                  </Text>
                  <Text style={[styles.modalBalanceAfter, { color: colors.mutedForeground }]}>
                    Saldo após: {formatCurrency(selectedEntry.balanceAfter)}
                  </Text>
                </View>

                {/* Linhas de detalhes */}
                <View style={styles.modalDetails}>
                  <View style={styles.modalDetailRow}>
                    <Text style={[styles.modalDetailKey, { color: colors.mutedForeground }]}>Descrição:</Text>
                    <Text style={[styles.modalDetailVal, { color: colors.foreground }]}>{selectedEntry.description}</Text>
                  </View>
                  <View style={styles.modalDetailRow}>
                    <Text style={[styles.modalDetailKey, { color: colors.mutedForeground }]}>Data:</Text>
                    <Text style={[styles.modalDetailVal, { color: colors.foreground }]}>
                      {formatDate(selectedEntry.entryDate)}
                      {selectedEntry.createdAt && formatTime(selectedEntry.createdAt)
                        ? ` às ${formatTime(selectedEntry.createdAt)}`
                        : ""}
                    </Text>
                  </View>
                  {selectedEntry.payment?.interTxId && (
                    <View style={styles.modalDetailRow}>
                      <Text style={[styles.modalDetailKey, { color: colors.mutedForeground }]}>TxID:</Text>
                      <Text style={[styles.modalDetailVal, { color: colors.primary, fontFamily: "monospace" }]} numberOfLines={1}>
                        {selectedEntry.payment.interTxId.substring(0, 18)}…
                      </Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  onPress={() => setSelectedEntry(null)}
                  style={[styles.modalCloseBtn, { backgroundColor: colors.foreground }]}
                >
                  <Text style={[styles.modalCloseBtnText, { color: colors.background }]}>Fechar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
  scrollContent: {
    gap: 12,
  },
  balanceCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    gap: 10,
  },
  balanceHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#10b98120",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10b981",
  },
  liveText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#10b981",
  },
  balanceAmount: {
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
  },
  pixKeyPill: {
    backgroundColor: "#00000010",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  pixKeyText: {
    fontSize: 11,
    fontWeight: "600",
  },
  waButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  waButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statBox: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    gap: 3,
  },
  statBoxHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statBoxLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  statBoxValue: {
    fontSize: 16,
    fontWeight: "900",
  },
  statBoxSub: {
    fontSize: 10,
    fontWeight: "500",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 36,
    gap: 8,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 12,
    textAlign: "center",
  },
  entryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
  },
  entryIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  entryInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  entryDescription: {
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },
  entryMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  entryDate: {
    fontSize: 10,
    fontWeight: "500",
  },
  advanceBadge: {
    backgroundColor: "#f59e0b20",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  advanceBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#d97706",
  },
  txId: {
    fontSize: 9,
    fontFamily: "monospace",
    fontWeight: "600",
  },
  entryValues: {
    alignItems: "flex-end",
    flexShrink: 0,
    gap: 2,
  },
  entryAmount: {
    fontSize: 13,
    fontWeight: "900",
  },
  entryBalance: {
    fontSize: 10,
    fontWeight: "500",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  modalHeader: {
    alignItems: "center",
    gap: 4,
  },
  modalIcon: {
    width: 48,
    height: 48,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
  },
  modalSubtitle: {
    fontSize: 11,
    fontWeight: "500",
  },
  modalAmountBox: {
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    gap: 2,
  },
  modalAmountLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  modalAmountText: {
    fontSize: 24,
    fontWeight: "900",
  },
  modalBalanceAfter: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  modalDetails: {
    gap: 8,
  },
  modalDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalDetailKey: {
    fontSize: 11,
    fontWeight: "600",
  },
  modalDetailVal: {
    fontSize: 11,
    fontWeight: "700",
    maxWidth: "60%",
    textAlign: "right",
  },
  modalCloseBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseBtnText: {
    fontSize: 13,
    fontWeight: "800",
  },
});
