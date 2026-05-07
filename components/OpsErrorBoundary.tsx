import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { reportOpsAlert } from "../services/opsAlertService";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/**
 * Captura errores de render de React y los envía al bot de fallos (notify-ops-alert).
 */
export class OpsErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void reportOpsAlert({
      source: "frontend.react.error-boundary",
      severity: "error",
      message: error.message || "Error de render en React",
      details: `${info.componentStack?.slice(0, 1500) ?? ""}\n${error.stack ?? ""}`.slice(0, 3500),
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-50">
          <p className="text-lg font-semibold text-slate-800">Algo salió mal</p>
          <p className="text-slate-600 mt-2 max-w-md">
            Se ha enviado un aviso al canal de fallos. Prueba a recargar la página.
          </p>
          <button
            type="button"
            className="mt-6 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700"
            onClick={() => window.location.reload()}
          >
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
