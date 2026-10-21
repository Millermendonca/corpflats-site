import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useGetMe } from '@workspace/api-client-react';
import {
  Bot,
  Sparkles,
  Send,
  Trash2,
  X,
  RefreshCw,
  Building,
  Calendar,
  Wrench,
  Coffee,
  DollarSign,
  Package,
  Car,
  ChevronDown
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  time: string;
  modelUsed?: string;
}

const STORAGE_KEY = 'corpflats_admin_copilot_history_v1';

const QUICK_PROMPTS = [
  { label: 'Status dos flats hoje', icon: Building, query: 'Qual o status e ocupação dos flats hoje?' },
  { label: 'Próximos check-ins', icon: Calendar, query: 'Quais são os próximos check-ins e chegadas de hoje?' },
  { label: 'Manutenções pendentes', icon: Wrench, query: 'Tem alguma ordem de serviço ou manutenção urgente aberta?' },
  { label: 'Pedidos de café da manhã', icon: Coffee, query: 'Quais os pedidos de café da manhã agendados para hoje?' },
  { label: 'Resumo financeiro', icon: DollarSign, query: 'Qual o resumo financeiro, diária média e faturamento estimado das reservas?' },
  { label: 'Achados e perdidos', icon: Package, query: 'Quais itens temos cadastrados em achados e perdidos no momento?' },
  { label: 'Veículos na garagem', icon: Car, query: 'Quais veículos estão com autorização ativa de garagem hoje?' }
];

// ── Formatador Visual de Markdown Seguro ─────────────────────────────────────
function renderFormattedMarkdown(text: string) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];

  const flushTable = () => {
    if (inTable && tableHeaders.length > 0) {
      elements.push(
        <div key={`table-${elements.length}`} className="my-2.5 overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                {tableHeaders.map((th, i) => (
                  <th key={i} className="px-2.5 py-1.5 font-semibold text-slate-800 dark:text-slate-200">
                    {th.trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((tr, rowIdx) => (
                <tr key={rowIdx} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                  {tr.map((td, colIdx) => (
                    <td key={colIdx} className="px-2.5 py-1.5 text-slate-700 dark:text-slate-300">
                      {formatInlineText(td.trim())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableHeaders = [];
      tableRows = [];
      inTable = false;
    }
  };

  const formatInlineText = (str: string): React.ReactNode => {
    // Substitui negrito **texto** e código `codigo`
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*.*?\*\*|`.*?`)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        parts.push(str.substring(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith('**') && token.endsWith('**')) {
        parts.push(
          <strong key={match.index} className="font-semibold text-slate-900 dark:text-white">
            {token.slice(2, -2)}
          </strong>
        );
      } else if (token.startsWith('`') && token.endsWith('`')) {
        parts.push(
          <code key={match.index} className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
            {token.slice(1, -1)}
          </code>
        );
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < str.length) {
      parts.push(str.substring(lastIndex));
    }

    return parts.length > 0 ? parts : str;
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    // Detecção de Tabela Markdown
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const cols = line.split('|').slice(1, -1);
      // Linha de separação |--|--|
      if (cols.every(c => /^[\s-:]+$/.test(c))) {
        continue;
      }
      if (!inTable) {
        inTable = true;
        tableHeaders = cols;
        tableRows = [];
      } else {
        tableRows.push(cols);
      }
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Título H3 ###
    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={idx} className="font-bold text-sm text-indigo-600 dark:text-indigo-400 mt-2 mb-1 flex items-center gap-1.5">
          {formatInlineText(line.slice(4))}
        </h4>
      );
      continue;
    }

    // Título H2 ##
    if (line.startsWith('## ')) {
      elements.push(
        <h3 key={idx} className="font-bold text-base text-slate-900 dark:text-white mt-2.5 mb-1">
          {formatInlineText(line.slice(3))}
        </h3>
      );
      continue;
    }

    // Itens de lista • ou -
    if (/^\s*[•\-*]\s+/.test(line)) {
      const content = line.replace(/^\s*[•\-*]\s+/, '');
      elements.push(
        <li key={idx} className="ml-4 list-disc text-xs leading-relaxed text-slate-700 dark:text-slate-300">
          {formatInlineText(content)}
        </li>
      );
      continue;
    }

    // Linha em branco
    if (!line.trim()) {
      elements.push(<div key={idx} className="h-1.5" />);
      continue;
    }

    // Parágrafo comum
    elements.push(
      <p key={idx} className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 my-0.5">
        {formatInlineText(line)}
      </p>
    );
  }

  if (inTable) {
    flushTable();
  }

  return <div className="space-y-0.5">{elements}</div>;
}

export function AdminAiCopilot() {
  const { data: user } = useGetMe();
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hideEdgeTab, setHideEdgeTab] = useState<boolean>(() => {
    try {
      return localStorage.getItem('corpflats_copilot_hide_edge_tab') === 'true';
    } catch {
      return false;
    }
  });
  const [topPercent, setTopPercent] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('corpflats_copilot_top_pct'));
      return saved >= 15 && saved <= 85 ? saved : 45;
    } catch {
      return 45;
    }
  });
  const isDraggingRef = useRef(false);
  const dragMovedRef = useRef(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Somente renderiza para administradores e recepção em rotas internas do PMS
  const isAuthorizedRole = user && (user.role === 'admin' || user.role === 'recepcao');
  const isPublicRoute =
    location === '/' ||
    location === '/login' ||
    location.startsWith('/login') ||
    location.startsWith('/reservar') ||
    location.startsWith('/booking') ||
    location.startsWith('/pre-checkin') ||
    location.startsWith('/checkout') ||
    location.startsWith('/check-out') ||
    location.startsWith('/cafe') ||
    location.startsWith('/servico') ||
    location.startsWith('/service') ||
    location.startsWith('/portal-hospede') ||
    location.startsWith('/minha-reserva') ||
    location.startsWith('/pix');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Escuta eventos disparados pelo botão da Sidebar (Desktop) e Header (Mobile)
  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('toggle-sofia-copilot', handleToggle);
    window.addEventListener('open-sofia-copilot', handleOpen);
    return () => {
      window.removeEventListener('toggle-sofia-copilot', handleToggle);
      window.removeEventListener('open-sofia-copilot', handleOpen);
    };
  }, []);

  // Atalho de teclado: Ctrl + J para abrir/fechar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Foco no textarea quando abrir o drawer
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 150);
    }
  }, [isOpen]);

  const toggleHideEdgeTab = (hide: boolean, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setHideEdgeTab(hide);
    try {
      localStorage.setItem('corpflats_copilot_hide_edge_tab', String(hide));
    } catch {}
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    dragMovedRef.current = false;
    const startY = e.clientY;
    const startTop = topPercent;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const deltaY = moveEvent.clientY - startY;
      if (Math.abs(deltaY) > 5) {
        dragMovedRef.current = true;
      }
      const deltaPct = (deltaY / window.innerHeight) * 100;
      const nextPct = Math.min(85, Math.max(15, startTop + deltaPct));
      setTopPercent(nextPct);
      try {
        localStorage.setItem('corpflats_copilot_top_pct', String(Math.round(nextPct)));
      } catch {}
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  if (!isAuthorizedRole || isPublicRoute) {
    return null;
  }

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      text,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/admin/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          messages: newHistory.map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            text: m.text
          })),
          context: {
            currentPage: location,
            timestamp: new Date().toISOString()
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro HTTP ${response.status}`);
      }

      const data = await response.json();
      const assistantMsg: ChatMessage = {
        id: `ast_${Date.now()}`,
        role: 'assistant',
        text: data.reply || 'Informação processada pelo Copiloto IA.',
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: data.modelUsed
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        text: `⚠️ **Não foi possível completar a consulta:** ${err.message || 'Erro inesperado no servidor.'}`,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    if (confirm('Deseja limpar o histórico do Copiloto IA de Gestão?')) {
      setMessages([]);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <>
      {/* ── Aba Lateral Discreta, Retrátil e Arrastável na Borda Direita (Não bloqueia botões) ── */}
      {!isOpen && !hideEdgeTab && (
        <div
          onPointerDown={handlePointerDown}
          onClick={() => {
            if (!dragMovedRef.current) {
              setIsOpen(true);
            }
          }}
          style={{ top: `${topPercent}%` }}
          className="fixed right-0 z-30 -translate-y-1/2 translate-x-[calc(100%-32px)] hover:translate-x-0 group flex items-center gap-2 pl-2 pr-2.5 py-2 rounded-l-xl shadow-lg bg-gradient-to-r from-indigo-600/90 to-purple-700/95 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-semibold transition-transform duration-200 border border-r-0 border-white/20 cursor-pointer select-none backdrop-blur-xs"
          title="Clique para abrir a Sofia Copiloto (Ctrl+J) • Arraste para mover para cima/baixo"
        >
          <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
            <Bot className="w-4 h-4 text-amber-300" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </div>
          <span className="whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            Sofia IA
          </span>
          <button
            type="button"
            onClick={e => toggleHideEdgeTab(true, e)}
            className="opacity-0 group-hover:opacity-100 ml-0.5 p-0.5 rounded hover:bg-white/20 text-white/70 hover:text-white transition-all"
            title="Ocultar aba lateral (usar botão do Menu Lateral / Topo ou Ctrl+J)"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* ── Drawer Lateral Deslizante (Slide-Over) ── */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop com blur sutil */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          {/* Painel do Chat */}
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col z-10 border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-300">
            {/* Cabeçalho do Copiloto */}
            <div className="p-4 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white flex items-center justify-between border-b border-indigo-700/50 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-amber-300 shadow-inner">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm tracking-wide">Sofia Copiloto PMS</h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Gemini 2.0 Flash
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-200/80">Motor Universal de Inteligência & Gestão CorpFlats</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleHideEdgeTab(!hideEdgeTab)}
                  className={`px-2 py-1 text-[10px] font-semibold rounded-lg border transition-colors ${
                    hideEdgeTab
                      ? 'bg-white/5 border-white/15 text-indigo-200 hover:bg-white/15'
                      : 'bg-emerald-500/20 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/30'
                  }`}
                  title={hideEdgeTab ? 'Reativar atalho na borda direita da tela' : 'Ocultar atalho na borda da tela (abrir apenas pelo menu lateral ou Ctrl+J)'}
                >
                  {hideEdgeTab ? 'Mostrar Aba Lateral' : 'Ocultar Aba'}
                </button>
                {messages.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="p-1.5 text-indigo-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    title="Limpar histórico do chat"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-indigo-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  title="Fechar Copiloto (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Sugestões Rápidas de Pergunta com 1 Clique */}
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 overflow-x-auto flex gap-1.5 no-scrollbar">
              {QUICK_PROMPTS.map((qp, i) => {
                const IconComponent = qp.icon;
                return (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(qp.query)}
                    disabled={isLoading}
                    className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 transition-all shadow-xs cursor-pointer"
                  >
                    <IconComponent className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                    <span>{qp.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Feed de Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-100/50 dark:bg-slate-950/50">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-sm">
                    <Sparkles className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">Como posso te ajudar hoje?</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                      Consulte em tempo real qualquer dado de ocupação, reservas, financeiro, governança, ordens de serviço e regras.
                    </p>
                  </div>
                  <div className="w-full max-w-sm pt-2 space-y-1.5">
                    {QUICK_PROMPTS.slice(0, 4).map((qp, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(qp.query)}
                        className="w-full text-left p-2.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500 transition-all flex items-center justify-between group shadow-xs cursor-pointer"
                      >
                        <span className="text-slate-700 dark:text-slate-200">{qp.query}</span>
                        <ChevronDown className="w-3.5 h-3.5 -rotate-90 text-slate-400 group-hover:text-indigo-500" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-xs ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-800 rounded-bl-xs'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        renderFormattedMarkdown(msg.text)
                      ) : (
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.time}</span>
                  </div>
                ))
              )}

              {isLoading && (
                <div className="flex items-start gap-2">
                  <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl rounded-bl-xs shadow-xs">
                    <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Consultando dados do sistema com IA...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input e Controles Inferiores */}
            <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-end gap-2"
              >
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Pergunte sobre flats, financeiro, reservas, limpeza..."
                    rows={2}
                    className="w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                  />
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 flex justify-between px-1">
                    <span>Enter envia • Shift+Enter quebra linha</span>
                    <span>Ctrl+J fecha</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="p-3 mb-4 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer"
                  title="Enviar mensagem"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
