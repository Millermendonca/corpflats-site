import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';

export interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  /** Changing this clears a caught error. Pass the route to recover on navigation. */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

function isDynamicImportError(error: Error | null): boolean {
  if (!error) return false;
  const msg = `${error.name || ''} ${error.message || ''} ${String(error)}`.toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('chunkloaderror') ||
    msg.includes('loading chunk') ||
    msg.includes('unable to preload css')
  );
}

function DefaultFallback({ error, resetError }: ErrorFallbackProps) {
  const isChunkError = isDynamicImportError(error);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-6">
      <div className="max-w-xl w-full text-center space-y-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {isChunkError ? 'Atualizando tela para a nova versão...' : 'Ops, ocorreu um erro nesta tela'}
        </h1>
        <p className="text-xs text-muted-foreground">
          {isChunkError
            ? 'Uma atualização do sistema ou oscilação de rede ocorreu. Toque no botão abaixo para recarregar.'
            : 'Detalhes do erro para diagnóstico:'}
        </p>
        <pre className="overflow-x-auto rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 p-3 text-left text-xs text-rose-800 dark:text-rose-300 font-mono whitespace-pre-wrap">
          {error.message || String(error)}
          {error.stack ? `\n\n${error.stack}` : ''}
        </pre>
        <button
          type="button"
          onClick={() => {
            if (isChunkError && typeof window !== 'undefined') {
              window.location.reload();
              return;
            }
            resetError();
          }}
          className="mt-4 rounded-xl bg-slate-900 dark:bg-slate-100 px-5 py-2.5 text-xs font-bold text-white dark:text-slate-900 hover:opacity-90"
        >
          Recarregar Componente
        </button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: toError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const errObj = toError(error);
    console.error(
      'ErrorBoundary caught an error:',
      errObj,
      info.componentStack,
    );

    if (isDynamicImportError(errObj) && typeof window !== 'undefined') {
      try {
        const lastReload = Number(sessionStorage.getItem('gfm_chunk_reload_ts') || '0');
        const now = Date.now();
        if (now - lastReload > 10000) {
          sessionStorage.setItem('gfm_chunk_reload_ts', String(now));
          window.location.reload();
        }
      } catch {
        // Ignore storage errors
      }
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.error !== null &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.resetError();
    }
  }

  resetError = (): void => {
    if (isDynamicImportError(this.state.error) && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    const Fallback = this.props.FallbackComponent ?? DefaultFallback;
    return <Fallback error={error} resetError={this.resetError} />;
  }
}
