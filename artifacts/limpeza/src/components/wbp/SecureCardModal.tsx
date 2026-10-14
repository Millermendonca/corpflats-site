import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  Lock, 
  Key, 
  Eye, 
  Copy, 
  Check, 
  AlertTriangle, 
  Clock, 
  CreditCard,
  X
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DecryptedCardDetails } from "./types";

interface SecureCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservationId: string;
  orderId: string;
  guestName: string;
  cardLast4?: string;
  cardBrand?: string;
}

export const SecureCardModal: React.FC<SecureCardModalProps> = ({
  isOpen,
  onClose,
  reservationId,
  orderId,
  guestName,
  cardLast4 = "4242",
  cardBrand = "Visa",
}) => {
  const [step, setStep] = useState<"reauth" | "view">("reauth");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [cardDetails, setCardDetails] = useState<DecryptedCardDetails | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(300);
  const [copiedPan, setCopiedPan] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep("reauth");
      setPassword("");
      setErrorMsg("");
      setCardDetails(null);
      setSecondsRemaining(300);
      setCopiedPan(false);
    }
  }, [isOpen]);

  // 5-minute countdown timer once card is viewed
  useEffect(() => {
    if (step !== "view") return;
    const interval = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step, onClose]);

  const handleReauth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg("Digite sua senha de administrador.");
      return;
    }
    setIsLoading(true);
    setErrorMsg("");

    try {
      // Step 1: Re-authenticate admin
      const reauthRes = await fetch("/api/wbp/vault/reauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, reservationId, orderId }),
      });

      if (!reauthRes.ok) {
        const err = await reauthRes.json().catch(() => ({}));
        setErrorMsg(err.error || "Senha de administrador incorreta ou acesso não autorizado.");
        return;
      }

      const reauthData = await reauthRes.json().catch(() => ({}));
      const token = reauthData.token;
      if (!token) {
        setErrorMsg("Falha ao obter token de autorização.");
        return;
      }

      // Step 2: Fetch decrypted details with single-use token
      const viewRes = await fetch("/api/wbp/vault/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reservationId, orderId }),
      });

      if (!viewRes.ok) {
        const err = await viewRes.json().catch(() => ({}));
        setErrorMsg(err.error || "Token de visualização inválido ou expirado.");
        return;
      }

      const viewData = await viewRes.json().catch(() => ({}));
      if (!viewData.card) {
        setErrorMsg("Dados de cartão não encontrados ou já expurgados.");
        return;
      }

      setCardDetails({
        cardholderName: viewData.card.holderName || guestName.toUpperCase(),
        cardBrand: viewData.card.brand || cardBrand || "Visa",
        cardNumber: viewData.card.cardNumber || "",
        cardLast4: viewData.card.last4 || cardLast4 || "",
        cardExpMonth: viewData.card.expireMonth || "",
        cardExpYear: viewData.card.expireYear || "",
        cvvNotice: "Não armazenado — descartado na recepção conforme norma PCI-DSS",
      });

      setStep("view");
    } catch (err: any) {
      setErrorMsg(err?.message || "Erro de comunicação ao validar credenciais.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyPan = () => {
    if (!cardDetails?.cardNumber) return;
    navigator.clipboard.writeText(cardDetails.cardNumber.replace(/\s+/g, ""));
    setCopiedPan(true);
    setTimeout(() => setCopiedPan(false), 2500);
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <Lock className="w-5 h-5" />
            <DialogTitle className="text-base font-bold text-foreground">
              {step === "reauth" ? "Confirmação de Segurança (PCI-DSS)" : "Cartão de Crédito em Garantia"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            {step === "reauth"
              ? "A visualização de dados de cartão de crédito de hóspedes é auditada e exige redigitação de senha do administrador."
              : `Reserva ${orderId} • Titular: ${guestName}`}
          </DialogDescription>
        </DialogHeader>

        {step === "reauth" ? (
          <form onSubmit={handleReauth} className="space-y-4 py-2">
            <div className="p-3 bg-muted/40 rounded-xl space-y-1 text-xs border border-border/60">
              <div className="flex justify-between text-muted-foreground">
                <span>Reserva OTA:</span>
                <strong className="text-foreground font-mono">{orderId}</strong>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Cartão Mascarado:</span>
                <strong className="text-foreground font-mono">•••• {cardLast4} ({cardBrand})</strong>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-reauth-pw" className="text-xs font-semibold text-foreground">
                Digite sua senha de administrador:
              </Label>
              <Input
                id="admin-reauth-pw"
                type="password"
                placeholder="Sua senha atual..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="text-xs h-9"
              />
              {errorMsg && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                  {errorMsg}
                </p>
              )}
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Esta ação gerará um token de uso único com validade estrita de 5 minutos e será registrada em log de auditoria.
              </span>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isLoading}
                className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold gap-1.5"
              >
                <Key className="w-3.5 h-3.5" />
                {isLoading ? "Verificando..." : "Desbloquear Cartão"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4 py-2">
            {/* Countdown Badge */}
            <div className="flex items-center justify-between p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs">
              <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-300 font-medium">
                <Clock className="w-3.5 h-3.5 animate-spin" />
                Tempo restante para visualização:
              </div>
              <span className="font-mono font-black text-rose-700 dark:text-rose-300 text-sm">
                {formatTimer(secondsRemaining)}
              </span>
            </div>

            {/* Credit Card Mock Visual */}
            <div className="p-4 rounded-xl bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-900 text-white shadow-md space-y-3 font-mono border border-slate-700">
              <div className="flex justify-between items-center text-xs opacity-80">
                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                  CARTÃO EM GARANTIA
                </span>
                <span className="font-bold text-amber-400">{cardDetails?.cardBrand}</span>
              </div>

              {/* Number with copy */}
              <div className="flex items-center justify-between bg-black/30 p-2 rounded-lg border border-white/10">
                <span className="text-base sm:text-lg font-black tracking-widest text-white">
                  {cardDetails?.cardNumber}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCopyPan}
                  className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20"
                  title="Copiar número do cartão"
                >
                  {copiedPan ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div>
                  <span className="text-[9px] uppercase block text-slate-400">TITULAR</span>
                  <span className="font-bold truncate block">{cardDetails?.cardholderName}</span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] uppercase block text-slate-400">VALIDADE</span>
                  <span className="font-bold font-mono">
                    {cardDetails?.cardExpMonth}/{cardDetails?.cardExpYear}
                  </span>
                </div>
              </div>
            </div>

            {/* Zero CVV Compliance Notice */}
            <div className="p-3 bg-muted/40 border border-border rounded-xl text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-foreground">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Código de Segurança (CVV):
              </div>
              <p className="text-[11px] text-muted-foreground">
                <strong>Não armazenado</strong> — descartado imediatamente na memória durante o recebimento conforme norma PCI-DSS v4.0.
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              🔒 Visualização registrada na trilha de auditoria do sistema com IP e timestamp.
            </p>

            <DialogFooter className="pt-2">
              <Button
                size="sm"
                onClick={onClose}
                className="w-full text-xs font-semibold"
              >
                Fechar Visualização
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
