import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useGetMe } from '@workspace/api-client-react';
import { Plus, GripVertical, CalendarPlus, Minimize2, Maximize2 } from 'lucide-react';
import PmsCalendar from '@/pages/pms-calendar';

const POS_STORAGE_KEY = 'corpflats_floating_new_res_pos_v1';
const COMPACT_STORAGE_KEY = 'corpflats_floating_new_res_compact_v1';

interface StoredRatio {
  xRatio: number;
  yRatio: number;
}

function getDefaultPosition(compact: boolean): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return { x: 20, y: 20 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isMobile = vw < 768;
  const approxWidth = compact ? 52 : 168;
  const approxHeight = 46;

  // Posição inicial padrão: canto inferior direito (acima da barra inferior no mobile)
  const defaultX = Math.max(12, vw - approxWidth - (isMobile ? 14 : 24));
  const defaultY = Math.max(12, vh - approxHeight - (isMobile ? 76 : 24));

  try {
    const raw = localStorage.getItem(POS_STORAGE_KEY);
    if (raw) {
      const parsed: StoredRatio = JSON.parse(raw);
      if (
        typeof parsed.xRatio === 'number' &&
        typeof parsed.yRatio === 'number' &&
        !isNaN(parsed.xRatio) &&
        !isNaN(parsed.yRatio)
      ) {
        const x = Math.min(Math.max(8, Math.round(parsed.xRatio * vw)), Math.max(8, vw - approxWidth - 8));
        const y = Math.min(Math.max(8, Math.round(parsed.yRatio * vh)), Math.max(8, vh - approxHeight - 8));
        return { x, y };
      }
    }
  } catch {
    // Fallback to default
  }

  return { x: defaultX, y: defaultY };
}

export function FloatingNewReservationButton() {
  const { data: user, isLoading } = useGetMe();
  const [location] = useLocation();

  const [isCompact, setIsCompact] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COMPACT_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [pos, setPos] = useState<{ x: number; y: number }>(() => getDefaultPosition(isCompact));
  const [isDragging, setIsDragging] = useState(false);
  const [isResModalOpen, setIsResModalOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const dragStartRef = useRef({
    clientX: 0,
    clientY: 0,
    startLeft: 0,
    startTop: 0,
  });

  // Mantém o botão sempre dentro dos limites visíveis da tela ao redimensionar ou girar o aparelho
  const clampToViewport = useCallback(() => {
    if (typeof window === 'undefined') return;
    const elWidth = containerRef.current?.offsetWidth || (isCompact ? 52 : 168);
    const elHeight = containerRef.current?.offsetHeight || 46;
    const maxX = Math.max(8, window.innerWidth - elWidth - 8);
    const maxY = Math.max(8, window.innerHeight - elHeight - 8);
    setPos(prev => ({
      x: Math.min(maxX, Math.max(8, prev.x)),
      y: Math.min(maxY, Math.max(8, prev.y)),
    }));
  }, [isCompact]);

  useEffect(() => {
    clampToViewport();
    window.addEventListener('resize', clampToViewport);
    return () => window.removeEventListener('resize', clampToViewport);
  }, [clampToViewport]);

  // Escuta estado do modal de Nova Reserva para não sobrepor o próprio modal aberto
  useEffect(() => {
    const handleModalState = (e: Event) => {
      const customEvent = e as CustomEvent<{ open: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.open === 'boolean') {
        setIsResModalOpen(customEvent.detail.open);
      }
    };
    window.addEventListener('gfm-res-modal-state', handleModalState);
    return () => window.removeEventListener('gfm-res-modal-state', handleModalState);
  }, []);

  // Exclusivo para login de Administrador / Dev em qualquer tela autenticada
  const isAdminUser = !isLoading && user && (user.role === 'admin' || user.role === 'dev');
  const isLoginScreen = location === '/login' || location.startsWith('/login');

  if (!isAdminUser || isLoginScreen) {
    return null;
  }

  const isOnReservationsPage = location === '/reservas';

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;

    isDraggingRef.current = true;
    hasMovedRef.current = false;
    setIsDragging(true);

    const rect = containerRef.current?.getBoundingClientRect();
    const currentLeft = rect ? rect.left : pos.x;
    const currentTop = rect ? rect.top : pos.y;

    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startLeft: currentLeft,
      startTop: currentTop,
    };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;

    if (!hasMovedRef.current && Math.hypot(dx, dy) > 6) {
      hasMovedRef.current = true;
    }

    if (hasMovedRef.current) {
      const elWidth = containerRef.current?.offsetWidth || (isCompact ? 52 : 168);
      const elHeight = containerRef.current?.offsetHeight || 46;
      const maxX = Math.max(8, window.innerWidth - elWidth - 8);
      const maxY = Math.max(8, window.innerHeight - elHeight - 8);
      const nextX = Math.min(maxX, Math.max(8, dragStartRef.current.startLeft + dx));
      const nextY = Math.min(maxY, Math.max(8, dragStartRef.current.startTop + dy));
      setPos({ x: nextX, y: nextY });
    }
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    if (hasMovedRef.current) {
      try {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect && window.innerWidth > 0 && window.innerHeight > 0) {
          localStorage.setItem(
            POS_STORAGE_KEY,
            JSON.stringify({
              xRatio: rect.left / window.innerWidth,
              yRatio: rect.top / window.innerHeight,
            })
          );
        }
      } catch {}

      setTimeout(() => {
        hasMovedRef.current = false;
      }, 60);
    }
  };

  const handleTriggerNewReservation = () => {
    if (hasMovedRef.current) return;
    window.dispatchEvent(new CustomEvent('open-new-reservation-modal'));
  };

  const toggleCompactMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsCompact(prev => {
      const next = !prev;
      try {
        localStorage.setItem(COMPACT_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  return (
    <>
      {/* Monta os modais do PMS silenciosamente quando o admin está fora da tela /reservas */}
      {!isOnReservationsPage && <PmsCalendar modalOnly />}

      {!isResModalOpen && (
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onClick={handleTriggerNewReservation}
          style={{
            left: `${pos.x}px`,
            top: `${pos.y}px`,
          }}
          className={`fixed z-40 print:hidden touch-none select-none flex items-center rounded-full bg-gradient-to-r from-primary via-blue-600 to-indigo-600 text-white shadow-xl border border-white/25 backdrop-blur-xs transition-shadow ${
            isDragging
              ? 'cursor-grabbing scale-105 shadow-2xl ring-2 ring-white/50'
              : 'cursor-grab hover:shadow-2xl hover:brightness-105 active:scale-95'
          } ${isCompact ? 'p-1.5 gap-0.5' : 'pl-2 pr-2 py-2 gap-1.5'}`}
          title="Clique para abrir Nova Reserva • Segure e arraste para mover para qualquer lugar da tela"
        >
          {/* Ícone de arraste visível no modo expandido */}
          {!isCompact && (
            <GripVertical className="w-3.5 h-3.5 text-white/70 shrink-0 -mr-0.5 pointer-events-none" />
          )}

          {/* Ícone principal + */}
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0 pointer-events-none">
            {isCompact ? (
              <CalendarPlus className="w-3.5 h-3.5 text-white" />
            ) : (
              <Plus className="w-4 h-4 text-white stroke-[2.5]" />
            )}
          </div>

          {/* Rótulo do botão */}
          {!isCompact && (
            <span className="text-xs font-extrabold tracking-tight whitespace-nowrap pr-0.5 pointer-events-none">
              Nova Reserva
            </span>
          )}

          {/* Botão discreto para encolher/expandir caso queira deixar ainda menor */}
          <button
            type="button"
            data-no-drag="true"
            onClick={toggleCompactMode}
            className="w-5 h-5 rounded-full hover:bg-white/25 text-white/75 hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            title={isCompact ? 'Expandir botão Nova Reserva' : 'Compactar botão (apenas ícone)'}
          >
            {isCompact ? (
              <Maximize2 className="w-2.5 h-2.5" />
            ) : (
              <Minimize2 className="w-3 h-3" />
            )}
          </button>
        </div>
      )}
    </>
  );
}
