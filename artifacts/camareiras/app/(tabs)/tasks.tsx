import React, { useState } from 'react';
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
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  useListPendingPeriodicTasks,
  useExecutePeriodicTask,
  type PendingPeriodicTask,
} from '@workspace/api-client-react';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';

export default function TasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading, refetch, isRefetching } = useListPendingPeriodicTasks(
    undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { refetchInterval: 60_000 } as any },
  );

  const executeTask = useExecutePeriodicTask();

  const [modal, setModal] = useState<PendingPeriodicTask | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleExecute() {
    if (!modal) return;
    setSubmitting(true);
    try {
      await executeTask.mutateAsync({
        id: modal.taskId,
        data: { flatId: modal.flatId, notes: notes.trim() || null },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries();
      setModal(null);
      setNotes('');
    } catch (e: any) {
      console.error('Execute task failed:', e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const s = makeStyles(colors, insets);

  const overdueCount = tasks.filter(t => t.daysOverdue > 0).length;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
        <Text style={s.title}>Tarefas Periódicas</Text>
        <View style={s.subtitleRow}>
          <Text style={s.subtitle}>{tasks.length} pendente{tasks.length !== 1 ? 's' : ''}</Text>
          {overdueCount > 0 && (
            <View style={s.overduePill}>
              <Text style={s.overdueCount}>{overdueCount} atrasada{overdueCount !== 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={item => `${item.taskId}-${item.flatId}`}
          renderItem={({ item }) => (
            <TaskCard
              task={item}
              colors={colors}
              onExecute={() => { setModal(item); setNotes(''); }}
            />
          )}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100 }]}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="checkmark-done-circle-outline" size={52} color={colors.mutedForeground} />
              <Text style={s.emptyTitle}>Tudo em dia!</Text>
              <Text style={s.emptyHint}>Nenhuma tarefa periódica pendente</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Execute modal */}
      <Modal
        visible={!!modal}
        transparent
        animationType="slide"
        onRequestClose={() => setModal(null)}
      >
        <Pressable style={s.overlay} onPress={() => setModal(null)}>
          <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24} style={s.overlayInner}>
            <Pressable style={s.modalCard} onPress={e => e.stopPropagation()}>
              <Text style={s.modalTitle}>Concluir Tarefa</Text>
              {modal && (
                <View style={s.modalInfo}>
                  <Text style={s.modalTask}>{modal.taskName}</Text>
                  <View style={s.modalMeta}>
                    <Ionicons name="home-outline" size={13} color={colors.mutedForeground} />
                    <Text style={s.modalMetaText}>Flat {modal.flatNumber}</Text>
                    <Ionicons name="repeat-outline" size={13} color={colors.mutedForeground} style={{ marginLeft: 10 }} />
                    <Text style={s.modalMetaText}>A cada {modal.periodDays}d</Text>
                  </View>
                </View>
              )}
              <TextInput
                style={s.notesInput}
                placeholder="Observações (opcional)..."
                placeholderTextColor={colors.mutedForeground}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
              <View style={s.modalBtns}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setModal(null)}>
                  <Text style={s.cancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.confirmBtn, submitting && s.btnDisabled]}
                  onPress={handleExecute}
                  disabled={submitting}
                >
                  {submitting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.confirmText}>Concluir</Text>}
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

function TaskCard({
  task,
  colors,
  onExecute,
}: {
  task: PendingPeriodicTask;
  colors: ReturnType<typeof useColors>;
  onExecute: () => void;
}) {
  const isOverdue = task.daysOverdue > 0;
  const isDueToday = task.daysOverdue === 0;

  const overdueLabel = isOverdue
    ? `${task.daysOverdue}d atrasado`
    : isDueToday
    ? 'Hoje'
    : `Em ${Math.abs(task.daysOverdue)}d`;

  const chipBg = isOverdue ? '#fee2e2' : isDueToday ? '#fef3c7' : colors.muted;
  const chipColor = isOverdue ? '#ef4444' : isDueToday ? '#f59e0b' : colors.mutedForeground;

  return (
    <View
      style={[
        cardStyles.card,
        { backgroundColor: colors.card, borderColor: isOverdue ? '#fecaca' : colors.border },
      ]}
    >
      <View style={cardStyles.topRow}>
        <Text style={[cardStyles.taskName, { color: colors.foreground }]} numberOfLines={2}>
          {task.taskName}
        </Text>
        <View style={[cardStyles.chip, { backgroundColor: chipBg }]}>
          <Text style={[cardStyles.chipText, { color: chipColor }]}>{overdueLabel}</Text>
        </View>
      </View>

      {task.taskDescription ? (
        <Text style={[cardStyles.desc, { color: colors.mutedForeground }]} numberOfLines={2}>
          {task.taskDescription}
        </Text>
      ) : null}

      <View style={cardStyles.metaRow}>
        <View style={cardStyles.metaItem}>
          <Ionicons name="home-outline" size={13} color={colors.mutedForeground} />
          <Text style={[cardStyles.metaText, { color: colors.mutedForeground }]}>Flat {task.flatNumber}</Text>
        </View>
        <View style={cardStyles.metaItem}>
          <Ionicons name="repeat-outline" size={13} color={colors.mutedForeground} />
          <Text style={[cardStyles.metaText, { color: colors.mutedForeground }]}>A cada {task.periodDays}d</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[cardStyles.execBtn, { backgroundColor: colors.primary }]}
        onPress={onExecute}
        activeOpacity={0.8}
      >
        <Ionicons name="checkmark-done-outline" size={16} color="#fff" />
        <Text style={cardStyles.execText}>Marcar como feito</Text>
      </TouchableOpacity>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  taskName: { flex: 1, fontSize: 16, fontFamily: 'PlusJakartaSans_600SemiBold' },
  chip: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' },
  desc: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular' },
  metaRow: { flexDirection: 'row', gap: 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular' },
  execBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
  },
  execText: { color: '#fff', fontSize: 14, fontFamily: 'PlusJakartaSans_600SemiBold' },
});

function makeStyles(colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 4,
    },
    title: {
      fontSize: 22,
      fontFamily: 'PlusJakartaSans_700Bold',
      fontWeight: '700' as const,
      color: colors.foreground,
    },
    subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    subtitle: { fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular', color: colors.mutedForeground },
    overduePill: {
      backgroundColor: '#fee2e2',
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    overdueCount: { fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold', color: '#ef4444' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { padding: 16, gap: 12 },
    empty: { alignItems: 'center', paddingVertical: 80, gap: 12 },
    emptyTitle: { fontSize: 18, fontFamily: 'PlusJakartaSans_600SemiBold', color: colors.foreground },
    emptyHint: { fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular', color: colors.mutedForeground },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    overlayInner: { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 16) },
    modalCard: {
      backgroundColor: colors.card,
      marginHorizontal: 16,
      borderRadius: 20,
      padding: 24,
      gap: 14,
    },
    modalTitle: {
      fontSize: 18,
      fontFamily: 'PlusJakartaSans_700Bold',
      fontWeight: '700' as const,
      color: colors.foreground,
    },
    modalInfo: { gap: 4 },
    modalTask: { fontSize: 16, fontFamily: 'PlusJakartaSans_600SemiBold', color: colors.foreground },
    modalMeta: { flexDirection: 'row', alignItems: 'center' },
    modalMetaText: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', color: colors.mutedForeground, marginLeft: 4 },
    notesInput: {
      backgroundColor: colors.muted,
      borderRadius: 12,
      padding: 14,
      fontSize: 15,
      fontFamily: 'PlusJakartaSans_400Regular',
      color: colors.foreground,
      minHeight: 80,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalBtns: { flexDirection: 'row', gap: 10 },
    cancelBtn: {
      flex: 1,
      height: 46,
      borderRadius: 12,
      backgroundColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: { fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold', color: colors.foreground },
    confirmBtn: {
      flex: 1,
      height: 46,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnDisabled: { opacity: 0.5 },
    confirmText: { fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold', color: '#fff' },
  });
}
