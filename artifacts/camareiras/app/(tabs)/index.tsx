import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import {
  useListCleaningRequests,
  useUpdateCleaningStatus,
  useListPendingPeriodicTasks,
  useMarkVacant,
  type CleaningRequest,
} from '@workspace/api-client-react';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import FlatCard from '@/components/FlatCard';

function todayStr() {
  return new Date().toISOString().substring(0, 10);
}

type Section = {
  title: string;
  data: CleaningRequest[];
};

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const date = todayStr();

  const { data: requests = [], isLoading, refetch, isRefetching } = useListCleaningRequests(
    { date },
    { query: { refetchInterval: 30_000 } as any },
  );

  const { data: allTasks = [] } = useListPendingPeriodicTasks(
    undefined,
    { query: { refetchInterval: 60_000 } as any },
  );

  const updateStatus = useUpdateCleaningStatus();
  const markVacant = useMarkVacant();

  // Modal state for pending_issue
  const [pendingModal, setPendingModal] = useState<{ requestId: number } | null>(null);
  const [pendingText, setPendingText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Group flats into sections
  const sections: Section[] = useMemo(() => {
    const mine: CleaningRequest[] = [];
    const available: CleaningRequest[] = [];
    const byOthers: Record<string, CleaningRequest[]> = {};
    const done: CleaningRequest[] = [];

    for (const r of requests) {
      if (r.status === 'clean') {
        done.push(r);
      } else if (r.assignedUserId === user?.id) {
        mine.push(r);
      } else if (!r.assignedUserId) {
        available.push(r);
      } else {
        const name = r.assignedUsername ?? 'Outra';
        if (!byOthers[name]) byOthers[name] = [];
        byOthers[name].push(r);
      }
    }

    // Sort: hasCheckinToday first, then by flatNumber
    const byPriority = (a: CleaningRequest, b: CleaningRequest) => {
      if (a.hasCheckinToday && !b.hasCheckinToday) return -1;
      if (!a.hasCheckinToday && b.hasCheckinToday) return 1;
      return (a.flatNumber ?? '').localeCompare(b.flatNumber ?? '', undefined, { numeric: true });
    };
    mine.sort(byPriority);
    available.sort(byPriority);
    done.sort(byPriority);
    for (const k of Object.keys(byOthers)) byOthers[k].sort(byPriority);

    const result: Section[] = [];
    if (mine.length > 0) result.push({ title: 'Meus flats', data: mine });
    if (available.length > 0) result.push({ title: 'Disponíveis', data: available });
    for (const [name, data] of Object.entries(byOthers)) {
      result.push({ title: `Da ${name}`, data });
    }
    if (done.length > 0) result.push({ title: 'Concluídos', data: done });
    return result;
  }, [requests, user?.id]);

  const summary = useMemo(() => ({
    total: requests.length,
    clean: requests.filter(r => r.status === 'clean').length,
    cleaning: requests.filter(r => r.status === 'cleaning_now').length,
    dirty: requests.filter(r => r.status === 'dirty').length,
  }), [requests]);

  const handleStatusChange = useCallback(
    async (requestId: number, status: string) => {
      if (status === 'pending_issue') {
        setPendingModal({ requestId });
        setPendingText('');
        return;
      }
      try {
        await updateStatus.mutateAsync({ requestId, data: { status: status as any } });
        queryClient.invalidateQueries();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (e: any) {
        console.error('Status update failed:', e.message);
      }
    },
    [updateStatus, queryClient],
  );

  const handleMarkVacant = useCallback(async (requestId: number, isVacant: boolean) => {
    try {
      await markVacant.mutateAsync({ requestId, data: { isVacant } });
      queryClient.invalidateQueries();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) {
      console.error('Mark vacant failed:', e.message);
    }
  }, [markVacant, queryClient]);

  async function submitPendingIssue() {
    if (!pendingModal || !pendingText.trim()) return;
    setSubmitting(true);
    try {
      await updateStatus.mutateAsync({
        requestId: pendingModal.requestId,
        data: { status: 'pending_issue', observation: pendingText.trim() },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries();
      setPendingModal(null);
      setPendingText('');
    } catch (e: any) {
      console.error('Pending issue failed:', e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const dateLabel = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const s = makeStyles(colors, insets);

  const ListHeader = (
    <View style={[s.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
      <View style={s.headerTop}>
        <View>
          <Text style={s.greeting}>Olá, {user?.username} 👋</Text>
          <Text style={s.dateText} numberOfLines={1}>{dateLabel}</Text>
        </View>
        <TouchableOpacity style={s.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={21} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
      <View style={s.chips}>
        <View style={[s.chip, { backgroundColor: colors.muted }]}>
          <Text style={[s.chipVal, { color: colors.foreground }]}>{summary.total}</Text>
          <Text style={[s.chipLbl, { color: colors.mutedForeground }]}>Total</Text>
        </View>
        <View style={[s.chip, { backgroundColor: '#dcfce7' }]}>
          <Text style={[s.chipVal, { color: '#166534' }]}>{summary.clean}</Text>
          <Text style={[s.chipLbl, { color: '#166534' }]}>Limpos</Text>
        </View>
        <View style={[s.chip, { backgroundColor: '#fef3c7' }]}>
          <Text style={[s.chipVal, { color: '#92400e' }]}>{summary.cleaning}</Text>
          <Text style={[s.chipLbl, { color: '#92400e' }]}>Limpando</Text>
        </View>
        <View style={[s.chip, { backgroundColor: '#fee2e2' }]}>
          <Text style={[s.chipVal, { color: '#991b1b' }]}>{summary.dirty}</Text>
          <Text style={[s.chipLbl, { color: '#991b1b' }]}>Sujos</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={s.container}>
      {isLoading ? (
        <>
          {ListHeader}
          <View style={s.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id.toString()}
          renderItem={({ item }) => (
            <FlatCard
              request={item}
              currentUserId={user?.id ?? 0}
              onStatusChange={handleStatusChange}
              onMarkVacant={handleMarkVacant}
              tasks={(allTasks as any[]).filter((t: any) => t.flatId === item.flatId)}
            />
          )}
          renderSectionHeader={({ section }) => (
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>{section.title}</Text>
              <View style={s.sectionBadge}>
                <Text style={s.sectionCount}>{section.data.length}</Text>
              </View>
            </View>
          )}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={[
            s.list,
            { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100 },
          ]}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="home-outline" size={48} color={colors.mutedForeground} />
              <Text style={s.emptyTitle}>Nenhum flat para hoje</Text>
              <Text style={s.emptyHint}>Puxe para baixo para atualizar</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      )}

      {/* Pending Issue Modal — slides from bottom, keyboard aware */}
      <Modal
        visible={!!pendingModal}
        transparent
        animationType="slide"
        onRequestClose={() => setPendingModal(null)}
      >
        <Pressable style={s.overlay} onPress={() => setPendingModal(null)}>
          <KeyboardAvoidingView
            behavior="padding"
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
            style={s.overlayInner}
          >
            <Pressable style={s.modalCard} onPress={e => e.stopPropagation()}>
              <View style={s.handle} />
              <Text style={s.modalTitle}>Registrar Pendência</Text>
              <Text style={s.modalSub}>Descreva o problema encontrado no flat</Text>
              <TextInput
                style={s.modalInput}
                placeholder="Ex: Ar-condicionado com defeito..."
                placeholderTextColor={colors.mutedForeground}
                value={pendingText}
                onChangeText={setPendingText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                autoFocus
              />
              <View style={s.modalBtns}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setPendingModal(null)}>
                  <Text style={s.cancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.confirmBtn, (!pendingText.trim() || submitting) && s.btnDisabled]}
                  onPress={submitPendingIssue}
                  disabled={!pendingText.trim() || submitting}
                >
                  {submitting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.confirmText}>Confirmar</Text>}
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 14,
    },
    headerTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    greeting: {
      fontSize: 20,
      fontFamily: 'PlusJakartaSans_700Bold',
      fontWeight: '700' as const,
      color: colors.foreground,
    },
    dateText: {
      fontSize: 13,
      fontFamily: 'PlusJakartaSans_400Regular',
      color: colors.mutedForeground,
      marginTop: 2,
      textTransform: 'capitalize',
    },
    logoutBtn: {
      padding: 8,
      borderRadius: 10,
      backgroundColor: colors.muted,
    },
    chips: { flexDirection: 'row', gap: 8 },
    chip: {
      flex: 1,
      borderRadius: 12,
      padding: 10,
      alignItems: 'center',
    },
    chipVal: {
      fontSize: 22,
      fontFamily: 'PlusJakartaSans_700Bold',
      fontWeight: '700' as const,
    },
    chipLbl: {
      fontSize: 11,
      fontFamily: 'PlusJakartaSans_500Medium',
    },
    list: { padding: 16, gap: 0 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingTop: 18,
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: 'PlusJakartaSans_700Bold',
      fontWeight: '700' as const,
      color: colors.mutedForeground,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    sectionBadge: {
      backgroundColor: colors.muted,
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    sectionCount: {
      fontSize: 12,
      fontFamily: 'PlusJakartaSans_600SemiBold',
      color: colors.mutedForeground,
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { alignItems: 'center', paddingVertical: 80, gap: 12 },
    emptyTitle: {
      fontSize: 18,
      fontFamily: 'PlusJakartaSans_600SemiBold',
      color: colors.foreground,
    },
    emptyHint: {
      fontSize: 14,
      fontFamily: 'PlusJakartaSans_400Regular',
      color: colors.mutedForeground,
    },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    overlayInner: {
      paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 16),
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: 4,
    },
    modalCard: {
      backgroundColor: colors.card,
      marginHorizontal: 16,
      borderRadius: 24,
      padding: 24,
      gap: 12,
    },
    modalTitle: {
      fontSize: 18,
      fontFamily: 'PlusJakartaSans_700Bold',
      fontWeight: '700' as const,
      color: colors.foreground,
    },
    modalSub: {
      fontSize: 14,
      fontFamily: 'PlusJakartaSans_400Regular',
      color: colors.mutedForeground,
    },
    modalInput: {
      backgroundColor: colors.muted,
      borderRadius: 12,
      padding: 14,
      fontSize: 15,
      fontFamily: 'PlusJakartaSans_400Regular',
      color: colors.foreground,
      minHeight: 100,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
    cancelBtn: {
      flex: 1,
      height: 46,
      borderRadius: 12,
      backgroundColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: {
      fontSize: 15,
      fontFamily: 'PlusJakartaSans_600SemiBold',
      color: colors.foreground,
    },
    confirmBtn: {
      flex: 1,
      height: 46,
      borderRadius: 12,
      backgroundColor: '#f97316',
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnDisabled: { opacity: 0.5 },
    confirmText: {
      fontSize: 15,
      fontFamily: 'PlusJakartaSans_600SemiBold',
      color: '#fff',
    },
  });
}
