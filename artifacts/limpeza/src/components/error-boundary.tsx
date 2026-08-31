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

function DefaultFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-6">
      <div className="max-w-xl w-full text-center space-y-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Ops, ocorreu um erro nesta tela
        </h1>
        <p className="text-xs text-muted-foreground">
          Detalhes do erro para diagnóstico:
        </p>
        <pre className="overflow-x-auto rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 p-3 text-left text-xs text-rose-800 dark:text-rose-300 font-mono whitespace-pre-wrap">
          {error.message || String(error)}
          {error.stack ? `\n\n${error.stack}` : ''}
        </pre>
        <button
          type="button"
          onClick={resetError}
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
    console.error(
      'ErrorBoundary caught an error:',
      toError(error),
      info.componentStack,
    );
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
