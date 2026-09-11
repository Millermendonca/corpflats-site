import React, { useState, useCallback } from "react";
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

// ── Entry Card Component ──────────────────────────────────────────────────────

function EntryCard({ entry, colors }: { entry: StatementEntry; colors: any }) {
  const isCredit = entry.entryType === "credit";
  const isAdvance = entry.payment?.type === "advance";

  return (
    <View style={[styles.entryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Ícone */}
      <View style={[
        styles.entryIcon,
        { backgroundColor: isCredit ? "#10b98115" : "#f4444415" }
      ]}>
        <Ionicons
          name={isCredit ? "arrow-up-circle" : "arrow-down-circle"}
          size={22}
          color={isCredit ? "#10b981" : "#f44444"}
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
            TxID: {entry.payment.interTxId.substring(0, 20)}…
          </Text>
        )}
      </View>

      {/* Valor + Saldo */}
      <View style={styles.entryValues}>
        <Text style={[
          styles.entryAmount,
          { color: isCredit ? "#10b981" : "#ef4444" }
        ]}>
          {isCredit ? "+" : "−"}{formatCurrency(entry.amount)}
        </Text>
        <Text style={[styles.entryBalance, { color: colors.mutedForeground }]}>
          {formatCurrency(entry.balanceAfter)}
        </Text>
      </View>
    </View>
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: 20 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Meu Financeiro</Text>
        <TouchableOpacity
          onPress={onRefresh}
          disabled={refreshing || loading}
          style={[styles.refreshBtn, { borderColor: colors.border }]}
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
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Saldo Card */}
          <View style={[
            styles.balanceCard,
            {
              backgroundColor: balancePositive ? "#10b98112" : "#ef444412",
              borderColor: balancePositive ? "#10b98130" : "#ef444430",
              marginHorizontal: 20,
            }
          ]}>
            <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>MEU SALDO A RECEBER</Text>
            <Text style={[styles.balanceAmount, { color: balancePositive ? "#10b981" : "#ef4444" }]}>
              {formatCurrency(balance)}
            </Text>
            {data?.pixKey ? (
              <Text style={[styles.pixKeyText, { color: colors.mutedForeground }]}>
                🔑 PIX: {data.pixKey.length > 30 ? data.pixKey.substring(0, 30) + "…" : data.pixKey}
              </Text>
            ) : (
              <Text style={[styles.pixKeyText, { color: "#f59e0b" }]}>
                ⚠️ Chave PIX não cadastrada (fale com a gerência)
              </Text>
            )}
          </View>

          {/* Botão enviar extrato WA */}
          <TouchableOpacity
            onPress={handleSendWhatsApp}
            disabled={sendingWa}
            style={[styles.waButton, { backgroundColor: "#25d366", marginHorizontal: 20 }]}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-whatsapp" size={20} color="#fff" />
            <Text style={styles.waButtonText}>
              {sendingWa ? "Enviando..." : "📤 Enviar Extrato pelo WhatsApp"}
            </Text>
          </TouchableOpacity>

          {/* Legenda */}
          <View style={[styles.legend, { marginHorizontal: 20 }]}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#10b981" }]} />
              <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Crédito (diária)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#ef4444" }]} />
              <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Débito (pagamento/vale)</Text>
            </View>
          </View>

          {/* Título extrato */}
          <Text style={[styles.sectionTitle, { color: colors.foreground, marginHorizontal: 20 }]}>
            Extrato de Movimentações
          </Text>

          {/* Entradas */}
          {!data?.statement?.length ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color={colors.mutedForeground} style={{ opacity: 0.4 }} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Nenhuma movimentação registrada ainda.
              </Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 20, gap: 10 }}>
              {data.statement.map((entry) => (
                <EntryCard key={entry.id} entry={entry} colors={colors} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
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
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
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
    gap: 16,
  },
  balanceCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    marginBottom: 4,
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1,
    marginBottom: 8,
  },
  pixKeyText: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  waButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: "#25d366",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  waButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  legend: {
    flexDirection: "row",
    gap: 16,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: "500",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    marginTop: 4,
    marginBottom: 4,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  entryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  entryIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  entryInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  entryDescription: {
    fontSize: 12,
    fontWeight: "700",
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
    gap: 3,
  },
  entryAmount: {
    fontSize: 13,
    fontWeight: "900",
  },
  entryBalance: {
    fontSize: 10,
    fontWeight: "500",
  },
});
