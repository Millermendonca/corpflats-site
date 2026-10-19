import React, { useMemo } from 'react';
import { useRoute, useLocation } from 'wouter';
import { SmartFlatHub } from '@/components/smart-flat/SmartFlatHub';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Sparkles, Shield, Home } from 'lucide-react';

export default function SmartFlatPreview() {
  const [, paramsWithCode] = useRoute('/preview/smart-flat/:code');
  const [, setLocation] = useLocation();

  // Parse code or flat number from URL
  const { code, flatNumber } = useMemo(() => {
    let rawCode = paramsWithCode?.code || '';
    let flat = '313';

    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (!rawCode) {
        rawCode = sp.get('code') || sp.get('reserva') || 'RES-313-0301';
      }
      flat = sp.get('flat') || sp.get('quarto') || '313';
    }

    // Try extracting flat number from code (e.g. RES-313-0301 -> 313)
    const match = rawCode.match(/(?:RES-)?(\d{3,4})/i);
    if (match && match[1]) {
      flat = match[1];
    }

    return { code: rawCode || 'RES-313-0301', flatNumber: flat };
  }, [paramsWithCode]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-4xl mx-auto flex min-h-14 py-2 items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/dashboard')}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Painel</span>
            </Button>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="font-bold text-xs sm:text-sm tracking-tight text-foreground flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                <span>Smart Flat Hub Sandbox</span>
              </span>
              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 shrink-0">
                Preview Interno
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="font-mono text-xs hidden sm:flex items-center gap-1">
              <Shield className="h-3 w-3 text-emerald-600 shrink-0" />
              <span>Isolado de Hóspedes</span>
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation('/')}
              className="h-8 text-xs flex items-center gap-1 shrink-0"
            >
              <Home className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Início</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Sandbox Content */}
      <main className="flex-1 py-4 sm:py-6">
        <SmartFlatHub
          initialFlatNumber={flatNumber}
          reservationCode={code}
          isSandboxMode={true}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>CorpFlats Soho Residence Service — Smart Flat Hub v1.0</span>
          <span>Ambiente de Validação & Sandbox Domótico</span>
        </div>
      </footer>
    </div>
  );
}
