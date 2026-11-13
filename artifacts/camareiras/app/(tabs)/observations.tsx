import React, { useState, useMemo } from 'react';
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
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  useListObservations,
  useCreateObservation,
  useListFlats,
  type Observation,
} from '@workspace/api-client-react';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';

const CATEGORIES = [
  { value: 'defeito',    label: 'Defeito',     color: '#991b1b', bg: '#fee2e2', icon: 'construct-outline' as const },
  { value: 'manutencao', label: 'Manutenção',   color: '#92400e', bg: '#fef3c7', icon: 'build-outline' as const },
  { value: 'outro',      label: 'Outro',        color: '#3730a3', bg: '#ede9fe', icon: 'information-circle-outline' as const },
];

const FILTERS = [
  { value: 'all',       label: 'Todas' },
  { value: 'aberta',    label: 'Abertas' },
  { value: 'resolvida', label: 'Resolvidas' },
];

type FilterVal = 'all' | 'aberta' | 'resolvida';

export default function ObservationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<FilterVal>('all');
  const [showAdd, setShowAdd] = useState(false);

  // Form state
  const [selFlatId, setSelFlatId] = useState<number | null>(null);
  const [selCategory, setSelCategory] = useState<string>('defeito');
  const [obsText, setObsText] = useState('');
  const [flatSearch, setFlatSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const queryParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (filter !== 'all') p.status = filter;
    return p;
  }, [filter]);

  const { data: observations = [], isLoading, refetch, isRefetching } = useListObservations(
    queryParams as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { refetchInterval: 60_000 } as any },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: flats = [] } = useListFlats({ query: { staleTime: 300_000 } } as any);
  const createObs = useCreateObservation();

  const visibleFlats = useMemo(() => {
    if (!flatSearch.trim()) return flats;
    return flats.filter(f => f.number.toLowerCase().includes(flatSearch.toLowerCase()));
  }, [flats, flatSearch]);

  function resetForm() {
    setSelFlatId(null);
    setSelCategory('defeito');
    setObsText('');
    setFlatSearch('');
  }

  async function handleCreate() {
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
      console.error('Create obs failed:', e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const s = makeStyles(colors, insets);

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
        <Text style={s.title}>Observações</Text>
        <View style={s.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.value}
              style={[s.filterBtn, filter === f.value && s.filterBtnOn]}
              onPress={() => setFilter(f.value as FilterVal)}
            >
              <Text style={[s.filterText, filter === f.value && s.filterTextOn]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={observations}
          keyExtractor={item => item.id.toString()}
          renderItem={({ item }) => <ObsCard obs={item} colors={colors} />}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100 }]}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="document-text-outline" size={52} color={colors.mutedForeground} />
              <Text style={s.emptyTitle}>Nenhuma observação</Text>
              <Text style={s.emptyHint}>Toque em + para registrar uma</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[s.fab, { bottom: insets.bottom + (Platform.OS === 'web' ? 34 + 84 : 84) + 12 }]}
        onPress={() => { resetForm(); setShowAdd(true); }}
        activeOpacity={0.85}
        testID="add-observation-fab"
      >
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>

      {/* Add modal — slide up from bottom */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <Pressable style={s.modalBg} onPress={() => setShowAdd(false)}>
          <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24} style={{ width: '100%' }}>
            <Pressable
              style={[s.sheet, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 16 }]}
              onPress={e => e.stopPropagation()}
            >
              <View style={s.handle} />
              <Text style={s.sheetTitle}>Nova Observação</Text>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Flat picker */}
                <Text style={s.fieldLabel}>Flat</Text>
                <View style={s.searchRow}>
                  <Ionicons name="search-outline" size={15} color={colors.mutedForeground} />
                  <TextInput
                    style={s.searchInput}
                    placeholder="Buscar flat..."
                    placeholderTextColor={colors.mutedForeground}
                    value={flatSearch}
                    onChangeText={setFlatSearch}
                  />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.flatPills}
                  style={{ flexGrow: 0 }}
                >
                  {visibleFlats.map(flat => (
                    <TouchableOpacity
                      key={flat.id}
                      style={[s.flatPill, selFlatId === flat.id && s.flatPillOn]}
                      onPress={() => setSelFlatId(flat.id)}
                    >
                      <Text style={[s.flatPillText, selFlatId === flat.id && s.flatPillTextOn]}>
                        {flat.number}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Category */}
                <Text style={[s.fieldLabel, { marginTop: 18 }]}>Categoria</Text>
                <View style={s.categoryRow}>
                  {CATEGORIES.map(cat => {
                    const isOn = selCategory === cat.value;
                    return (
                      <TouchableOpacity
                        key={cat.value}
                        style={[
                          s.catBtn,
                          { backgroundColor: isOn ? cat.bg : colors.muted, borderColor: isOn ? cat.color : colors.border },
                        ]}
                        onPress={() => setSelCategory(cat.value)}
                      >
                        <Ionicons name={cat.icon} size={15} color={isOn ? cat.color : colors.mutedForeground} />
                        <Text style={[s.catText, { color: isOn ? cat.color : colors.mutedForeground }]}>
                          {cat.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Description */}
                <Text style={[s.fieldLabel, { marginTop: 18 }]}>Descrição</Text>
                <TextInput
                  style={s.obsInput}
                  placeholder="Descreva o problema ou observação..."
                  placeholderTextColor={colors.mutedForeground}
                  value={obsText}
                  onChangeText={setObsText}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />

                <View style={s.sheetBtns}>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => setShowAdd(false)}>
                    <Text style={s.cancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.createBtn, (!selFlatId || !obsText.trim() || submitting) && s.btnDisabled]}
                    onPress={handleCreate}
                    disabled={!selFlatId || !obsText.trim() || submitting}
                  >
                    {submitting
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={s.createText}>Registrar</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

function ObsCard({ obs, colors }: { obs: Observation; colors: ReturnType<typeof useColors> }) {
  const cat = CATEGORIES.find(c => c.value === obs.category) ?? { label: obs.category, color: '#6b7280', bg: '#f3f4f6' };
  const isResolved = obs.status === 'resolvida';
  const dateLabel = new Date(obs.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });

  return (
    <View style={[obsStyles.card, { backgroundColor: colors.card, borderColor: isResolved ? colors.border : '#fecaca', opacity: isResolved ? 0.85 : 1 }]}>
      <View style={obsStyles.topRow}>
        <View style={obsStyles.left}>
          <Text style={[obsStyles.flatText, { color: colors.foreground }]}>Flat {obs.flatNumber}</Text>
          <View style={[obsStyles.catChip, { backgroundColor: (cat as any).bg }]}>
            <Text style={[obsStyles.catText, { color: cat.color }]}>{cat.label}</Text>
          </View>
        </View>
        <View style={[obsStyles.statusChip, { backgroundColor: isResolved ? '#dcfce7' : '#fee2e2' }]}>
          <Text style={[obsStyles.statusText, { color: isResolved ? '#166534' : '#991b1b' }]}>
            {isResolved ? 'Resolvida' : 'Aberta'}
          </Text>
        </View>
      </View>

      <Text style={[obsStyles.text, { color: colors.foreground }]}>{obs.text}</Text>

      <View style={obsStyles.meta}>
        <Text style={[obsStyles.metaText, { color: colors.mutedForeground }]}>{obs.authorUsername}</Text>
        <Text style={[obsStyles.metaText, { color: colors.mutedForeground }]}>·</Text>
        <Text style={[obsStyles.metaText, { color: colors.mutedForeground }]}>{dateLabel}</Text>
        {obs.resolvedNote ? (
          <>
            <Text style={[obsStyles.metaText, { color: colors.mutedForeground }]}>·</Text>
            <Text style={[obsStyles.metaText, { color: colors.mutedForeground, flex: 1 }]} numberOfLines={1}>
              {obs.resolvedNote}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const obsStyles = StyleSheet.create({
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
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flatText: { fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold' },
  catChip: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  catText: { fontSize: 11, fontFamily: 'PlusJakartaSans_600SemiBold' },
  statusChip: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontFamily: 'PlusJakartaSans_600SemiBold' },
  text: { fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular' },
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
      gap: 12,
    },
    title: {
      fontSize: 22,
      fontFamily: 'PlusJakartaSans_700Bold',
      fontWeight: '700' as const,
      color: colors.foreground,
    },
    filterRow: { flexDirection: 'row', gap: 8 },
    filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.muted },
    filterBtnOn: { backgroundColor: colors.primary },
    filterText: { fontSize: 13, fontFamily: 'PlusJakartaSans_500Medium', color: colors.mutedForeground },
    filterTextOn: { color: colors.primaryForeground },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { padding: 16, gap: 12 },
    empty: { alignItems: 'center', paddingVertical: 80, gap: 12 },
    emptyTitle: { fontSize: 18, fontFamily: 'PlusJakartaSans_600SemiBold', color: colors.foreground },
    emptyHint: { fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular', color: colors.mutedForeground },
    fab: {
      position: 'absolute',
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 10,
      elevation: 6,
    },
    modalBg: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingTop: 12,
      maxHeight: '90%',
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: 16,
    },
    sheetTitle: {
      fontSize: 20,
      fontFamily: 'PlusJakartaSans_700Bold',
      fontWeight: '700' as const,
      color: colors.foreground,
      marginBottom: 18,
    },
    fieldLabel: { fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold', color: colors.foreground, marginBottom: 8 },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.muted,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 40,
      marginBottom: 10,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'PlusJakartaSans_400Regular',
      color: colors.foreground,
    },
    flatPills: { gap: 8, paddingBottom: 2 },
    flatPill: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: colors.muted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    flatPillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    flatPillText: { fontSize: 14, fontFamily: 'PlusJakartaSans_600SemiBold', color: colors.foreground },
    flatPillTextOn: { color: '#fff' },
    categoryRow: { flexDirection: 'row', gap: 8 },
    catBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    catText: { fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' },
    obsInput: {
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
    sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 18 },
    cancelBtn: {
      flex: 1, height: 48, borderRadius: 12, backgroundColor: colors.muted,
      alignItems: 'center', justifyContent: 'center',
    },
    cancelText: { fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold', color: colors.foreground },
    createBtn: {
      flex: 1, height: 48, borderRadius: 12, backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    btnDisabled: { opacity: 0.4 },
    createText: { fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold', color: '#fff' },
  });
}
