import React from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UnpublishedAlertBannerProps {
  stagedCount: number;
  onNavigateToPreview: () => void;
}

export const UnpublishedAlertBanner: React.FC<UnpublishedAlertBannerProps> = ({
  stagedCount,
  onNavigateToPreview,
}) => {
  if (stagedCount <= 0) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-xl p-3.5 px-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs transition-all">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div>
          <span className="font-bold text-sm text-amber-950 dark:text-amber-200">
            {stagedCount} alteraç{stagedCount > 1 ? "ões" : "ão"} de tarifas não publicada{stagedCount > 1 ? "s" : ""}
          </span>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/85">
            As alterações estão em rascunho. Revise na Pré-visualização antes de enviar às OTAs (Booking.com e Airbnb).
          </p>
        </div>
      </div>
      <Button
        onClick={onNavigateToPreview}
        size="sm"
        className="bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-xs text-xs h-8 shrink-0 self-end sm:self-auto gap-1.5"
      >
        Ir para Pré-visualização
        <ArrowRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
};
