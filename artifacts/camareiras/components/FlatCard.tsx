import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { CleaningRequest } from '@workspace/api-client-react';

interface PendingTask {
  id: number;
  name: string;
  description?: string | null;
  flatId: number;
  isOverdue?: boolean;
}

interface FlatCardProps {
  request: CleaningRequest;
  currentUserId: number;
  onStatusChange: (requestId: number, status: string) => Promise<void>;
  onMarkVacant?: (requestId: number, isVacant: boolean) => Promise<void>;
  tasks?: PendingTask[];
}

type StatusKey = 'dirty' | 'will_clean' | 'cleaning_now' | 'pending_issue' | 'clean';

const STATUS_CONFIG: Record<StatusKey, { label: string; textColor: string; bg: string; icon: any }> = {
  dirty:         { label: 'Sujo',        textColor: '#991b1b', bg: '#fee2e2', icon: 'alert-circle' },
  will_clean:    { label: 'Vai Limpar',  textColor: '#1e40af', bg: '#dbeafe', icon: 'time' },
  cleaning_now:  { label: 'Limpando',    textColor: '#92400e', bg: '#fef3c7', icon: 'refresh' },
  pending_issue: { label: 'Pendência',   textColor: '#9a3412', bg: '#ffedd5', icon: 'warning' },
  clean:         { label: 'Limpo',       textColor: '#166534', bg: '#dcfce7', icon: 'checkmark-circle' },
};

export default function FlatCard({ request, currentUserId, onStatusChange, onMarkVacant, tasks = [] }: FlatCardProps) {
  const colors = useColors();
  const [loading, setLoading] = useState(false);
  const [vacantLoading, setVacantLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const config = STATUS_CONFIG[request.status as StatusKey] ?? STATUS_CONFIG.dirty;
  const isAssignedToMe = request.assignedUserId === currentUserId;
  const isUnassigned = !request.assignedUserId;
  const hasTasks = tasks.length > 0;

  async function act(status: string) {
    setLoading(true);
    try {
      await onStatusChange(request.id, status);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } finally {
      setLoading(false);
    }
  }

  async function toggleVacant() {
    if (!onMarkVacant) return;
    setVacantLoading(true);
    try {
      await onMarkVacant(request.id, !request.isVacant);
    } finally {
      setVacantLoading(false);
    }
  }

  const s = makeStyles(colors);

  const canToggleVacant = request.status !== 'clean';

  return (
    <TouchableOpacity
      style={s.card}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.92}
    >
      {/* Top row: flat number + indicators + status badge */}
      <View style={s.topRow}>
        <View style={s.flatInfo}>
          <Text style={s.flatLabel}>FLAT</Text>
          <Text style={s.flatNumber}>{request.flatNumber}</Text>
        </View>

        {/* Indicator pills */}
        <View style={s.indicators}>
          {request.hasCheckinToday && (
            <View style={s.checkinPill}>
              <Ionicons name="person-add" size={11} color="#92400e" />
              <Text style={s.checkinText}>Check-in hoje</Text>
            </View>
          )}
          {request.isVacant && (
            <View style={s.vacantPill}>
              <Ionicons name="exit-outline" size={11} color="#065f46" />
              <Text style={s.vacantText}>Desocupado</Text>
            </View>
          )}
        </View>

        <View style={[s.badge, { backgroundColor: config.bg }]}>
          <Ionicons name={config.icon} size={13} color={config.textColor} />
          <Text style={[s.badgeText, { color: config.textColor }]}>{config.label}</Text>
        </View>
      </View>

      {/* Assignee */}
      {request.assignedUsername ? (
        <View style={s.assigneeRow}>
          <Ionicons name="person-outline" size={13} color={colors.mutedForeground} />
          <Text style={s.assigneeText}>{request.assignedUsername}</Text>
        </View>
      ) : null}

      {/* Pending issue text */}
      {request.status === 'pending_issue' && request.pendingObservation ? (
        <View style={s.obsBox}>
          <Ionicons name="warning-outline" size={13} color="#f97316" />
          <Text style={s.obsText}>{request.pendingObservation}</Text>
        </View>
      ) : null}

      {/* Actions row */}
      <View style={s.actionsRow}>
        {loading ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <>
            {/* dirty + unassigned → claim */}
            {request.status === 'dirty' && isUnassigned && (
              <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary, flex: 1 }]} onPress={() => act('will_clean')} activeOpacity={0.8}>
                <Ionicons name="hand-right-outline" size={15} color="#fff" />
                <Text style={s.btnText}>Pegar</Text>
              </TouchableOpacity>
            )}

            {/* will_clean + mine → start */}
            {request.status === 'will_clean' && isAssignedToMe && (
              <TouchableOpacity style={[s.btn, { backgroundColor: '#f59e0b', flex: 1 }]} onPress={() => act('cleaning_now')} activeOpacity={0.8}>
                <Ionicons name="play-outline" size={15} color="#fff" />
                <Text style={s.btnText}>Iniciar</Text>
              </TouchableOpacity>
            )}

            {/* cleaning_now + mine → finish or report issue */}
            {request.status === 'cleaning_now' && isAssignedToMe && (
              <>
                <TouchableOpacity style={[s.btn, { backgroundColor: '#10b981', flex: 1 }]} onPress={() => act('clean')} activeOpacity={0.8}>
                  <Ionicons name="checkmark-outline" size={15} color="#fff" />
                  <Text style={s.btnText}>Concluir</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { backgroundColor: '#f97316', flex: 1 }]} onPress={() => act('pending_issue')} activeOpacity={0.8}>
                  <Ionicons name="warning-outline" size={15} color="#fff" />
                  <Text style={s.btnText}>Problema</Text>
                </TouchableOpacity>
              </>
            )}

            {/* clean → done indicator */}
            {request.status === 'clean' && (
              <View style={s.doneRow}>
                <Ionicons name="checkmark-circle" size={17} color="#10b981" />
                <Text style={s.doneText}>Concluído</Text>
              </View>
            )}

            {/* Vacant toggle — shown for any non-clean status */}
            {canToggleVacant && (
              <TouchableOpacity
                style={[s.vacantBtn, request.isVacant && s.vacantBtnActive]}
                onPress={toggleVacant}
                disabled={vacantLoading}
                activeOpacity={0.8}
              >
                {vacantLoading
                  ? <ActivityIndicator size="small" color={request.isVacant ? '#065f46' : colors.mutedForeground} />
                  : <Ionicons
                      name={request.isVacant ? 'exit' : 'exit-outline'}
                      size={17}
                      color={request.isVacant ? '#065f46' : colors.mutedForeground}
                    />
                }
              </TouchableOpacity>
            )}

            {/* Expand/collapse indicator */}
            {(hasTasks || request.status !== 'clean') && (
              <TouchableOpacity style={s.expandBtn} onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={17}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* Expanded section — tasks */}
      {expanded && (
        <View style={s.tasksSection}>
          <View style={s.tasksDivider} />
          {hasTasks ? (
            <>
              <Text style={s.tasksLabel}>
                <Ionicons name="list-outline" size={12} color={colors.mutedForeground} />
                {'  '}Tarefas deste flat
              </Text>
              {tasks.map(task => (
                <View key={task.id} style={s.taskRow}>
                  <View style={[s.taskDot, task.isOverdue && s.taskDotOverdue]} />
                  <View style={s.taskInfo}>
                    <Text style={s.taskName}>{task.name}</Text>
                    {task.description ? (
                      <Text style={s.taskDesc} numberOfLines={2}>{task.description}</Text>
                    ) : null}
                  </View>
                  {task.isOverdue && (
                    <View style={s.overdueBadge}>
                      <Text style={s.overdueText}>Atrasado</Text>
                    </View>
                  )}
                </View>
              ))}
            </>
          ) : (
            <Text style={s.noTasks}>Nenhuma tarefa periódica para este flat</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
      marginBottom: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    flatInfo: {
      minWidth: 52,
    },
    flatLabel: {
      fontSize: 10,
      fontFamily: 'PlusJakartaSans_600SemiBold',
      color: colors.mutedForeground,
      letterSpacing: 1.2,
    },
    flatNumber: {
      fontSize: 28,
      fontFamily: 'PlusJakartaSans_700Bold',
      fontWeight: '700' as const,
      color: colors.foreground,
      letterSpacing: -0.5,
    },
    indicators: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 5,
    },
    checkinPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#fef3c7',
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    checkinText: {
      fontSize: 10,
      fontFamily: 'PlusJakartaSans_600SemiBold',
      color: '#92400e',
    },
    vacantPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#d1fae5',
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    vacantText: {
      fontSize: 10,
      fontFamily: 'PlusJakartaSans_600SemiBold',
      color: '#065f46',
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    badgeText: {
      fontSize: 12,
      fontFamily: 'PlusJakartaSans_600SemiBold',
    },
    assigneeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    assigneeText: {
      fontSize: 13,
      fontFamily: 'PlusJakartaSans_400Regular',
      color: colors.mutedForeground,
    },
    obsBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 7,
      backgroundColor: '#fff7ed',
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: '#fed7aa',
    },
    obsText: {
      flex: 1,
      fontSize: 13,
      fontFamily: 'PlusJakartaSans_400Regular',
      color: '#9a3412',
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
    },
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    btnText: {
      color: '#fff',
      fontSize: 14,
      fontFamily: 'PlusJakartaSans_600SemiBold',
    },
    doneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    doneText: {
      fontSize: 14,
      fontFamily: 'PlusJakartaSans_600SemiBold',
      color: '#10b981',
    },
    vacantBtn: {
      padding: 8,
      borderRadius: 10,
      backgroundColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    vacantBtnActive: {
      backgroundColor: '#d1fae5',
    },
    expandBtn: {
      padding: 8,
      borderRadius: 10,
      backgroundColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tasksSection: {
      gap: 8,
    },
    tasksDivider: {
      height: 1,
      backgroundColor: colors.border,
    },
    tasksLabel: {
      fontSize: 11,
      fontFamily: 'PlusJakartaSans_600SemiBold',
      color: colors.mutedForeground,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    taskRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    taskDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: colors.primary,
      marginTop: 5,
      flexShrink: 0,
    },
    taskDotOverdue: {
      backgroundColor: '#ef4444',
    },
    taskInfo: {
      flex: 1,
      gap: 2,
    },
    taskName: {
      fontSize: 13,
      fontFamily: 'PlusJakartaSans_600SemiBold',
      color: colors.foreground,
    },
    taskDesc: {
      fontSize: 12,
      fontFamily: 'PlusJakartaSans_400Regular',
      color: colors.mutedForeground,
    },
    overdueBadge: {
      backgroundColor: '#fee2e2',
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    overdueText: {
      fontSize: 10,
      fontFamily: 'PlusJakartaSans_600SemiBold',
      color: '#991b1b',
    },
    noTasks: {
      fontSize: 13,
      fontFamily: 'PlusJakartaSans_400Regular',
      color: colors.mutedForeground,
      fontStyle: 'italic',
    },
  });
}
