import React, { useState } from "react";
import { Globe, DollarSign, Percent, CreditCard, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChannelPricingConfig } from "./types";

interface ChannelsTabProps {
  baseRate: number;
}

const DEFAULT_CHANNELS: ChannelPricingConfig[] = [
  { id: "direct", name: "Site Direto (CorpFlats)", markupPct: 0.0, commissionPct: 0.0, cardFeePct: 0.025, active: true },
  { id: "booking", name: "Booking.com", markupPct: 0.15, commissionPct: 0.15, cardFeePct: 0.015, active: true },
  { id: "airbnb", name: "Airbnb", markupPct: 0.18, commissionPct: 0.18, cardFeePct: 0.0, active: true },
];

export const ChannelsTab: React.FC<ChannelsTabProps> = ({ baseRate }) => {
  const [channels, setChannels] = useState<ChannelPricingConfig[]>(DEFAULT_CHANNELS);

  const handleMarkupChange = (id: string, newMarkup: number) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, markupPct: newMarkup / 100 } : c));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {channels.map((c) => {
          const grossRate = baseRate * (1 + c.markupPct);
          const commissionVal = grossRate * c.commissionPct;
          const cardFeeVal = grossRate * c.cardFeePct;
          const netRate = grossRate - commissionVal - cardFeeVal;

          return (
            <Card key={c.id} className="border-border shadow-xs hover:shadow-sm transition-all">
              <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    <CardTitle className="text-sm font-bold text-foreground">
                      {c.name}
                    </CardTitle>
                  </div>
                  <Badge variant={c.id === "direct" ? "default" : "outline"} className="text-[10px]">
                    {c.id === "direct" ? "Direto" : "OTA XML"}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  {c.id === "direct" ? "Motor de reservas próprio" : "Conectado via WebBookingPro"}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-3 text-xs">
                {/* Markup setting */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-medium">Markup Aplicado:</span>
                  <div className="flex items-center gap-1 w-24">
                    <Input
                      type="number"
                      min="0"
                      max="50"
                      step="1"
                      value={(c.markupPct * 100).toFixed(0)}
                      onChange={(e) => handleMarkupChange(c.id, Number(e.target.value) || 0)}
                      className="h-7 text-xs text-right font-bold"
                    />
                    <span className="text-muted-foreground font-bold">%</span>
                  </div>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Comissão do Canal:</span>
                  <span className="font-semibold text-foreground font-mono">
                    {(c.commissionPct * 100).toFixed(1)}% (- R$ {commissionVal.toFixed(2)})
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Taxa Cartão / VCC:</span>
                  <span className="font-semibold text-foreground font-mono">
                    {(c.cardFeePct * 100).toFixed(1)}% (- R$ {cardFeeVal.toFixed(2)})
                  </span>
                </div>

                {/* Gross Rate */}
                <div className="p-2.5 bg-muted/30 rounded-lg flex justify-between items-baseline">
                  <span className="font-medium text-muted-foreground">Tarifa Anunciada (Bruta):</span>
                  <span className="text-base font-black text-foreground font-mono">
                    R$ {grossRate.toFixed(2)}
                  </span>
                </div>

                {/* Net Rate */}
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex justify-between items-baseline">
                  <span className="font-bold text-emerald-900 dark:text-emerald-200">Líquido na Conta:</span>
                  <span className="text-base font-black text-emerald-700 dark:text-emerald-400 font-mono">
                    R$ {netRate.toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
