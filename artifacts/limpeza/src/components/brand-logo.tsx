import React from "react"

/**
 * Ícone Quadrado Monograma CF (Aba do Chrome, Menu Lateral e Mobile Header)
 * Paleta Oficial: Azul Petróleo Noite (#091E26) + Bronze Champagne (#C5A059) + Branco (#F8FAFC)
 */
export function CorpFlatsIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 180 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} shrink-0 shadow-xs rounded-xl`}
      aria-label="CorpFlats"
    >
      <rect width="180" height="180" rx="40" fill="#091E26" />
      <rect x="6" y="6" width="168" height="168" rx="35" fill="none" stroke="#C5A059" strokeWidth="3.5" opacity="0.45" />
      <path d="M 84 52 A 40 40 0 1 0 84 128" fill="none" stroke="#F8FAFC" strokeWidth="14" strokeLinecap="round" />
      <path
        d="M 104 128 L 104 52 L 142 52 M 104 88 L 134 88"
        fill="none"
        stroke="#C5A059"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Escrita Tipográfica "CORP FLΛTS" para Cabeçalhos e Menus
 */
export function CorpFlatsWordmark({ className = "text-sm" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline tracking-wider font-extrabold text-foreground ${className}`}>
      <span>CORP</span>
      <span className="ml-1.5 font-light">FL</span>
      <span className="font-semibold text-[#C5A059]">Λ</span>
      <span className="font-light">TS</span>
    </span>
  )
}

/**
 * Logo Completa Modelo B (5 Torres Executivas + CORP FLΛTS em Vetor Puro)
 * Usada na Tela de Login, Portais Públicos e Tela de Carregamento Animada
 */
export function CorpFlatsLogo({
  variant = "auto",
  animated = false,
  className = "w-64 h-auto",
}: {
  variant?: "dark" | "light" | "auto"
  animated?: boolean
  className?: string
}) {
  // Em modo "dark" (fundo escuro), traços são brancos (#F8FAFC). Em modo "light" (fundo claro), traços são Azul Petróleo (#0F3D4C).
  const isDark = variant === "dark"
  const mainStroke = isDark ? "#F8FAFC" : "currentColor"
  const secondaryStroke = isDark ? "#F8FAFC" : "currentColor"
  const gold = "#C5A059"

  return (
    <svg
      viewBox="0 0 360 182"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} ${variant === "light" ? "text-[#0F3D4C]" : variant === "auto" ? "text-[#0F3D4C] dark:text-[#F8FAFC]" : ""}`}
      aria-label="CorpFlats Logo"
    >
      {animated && (
        <style>{`
          @keyframes cfDrawSkyline {
            0% { stroke-dashoffset: 1100; opacity: 0.35; }
            75% { stroke-dashoffset: 0; opacity: 1; }
            100% { stroke-dashoffset: 0; opacity: 1; }
          }
          @keyframes cfFadeUp {
            0%, 35% { opacity: 0; transform: translateY(8px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          .cf-anim-skyline {
            stroke-dasharray: 1100;
            stroke-dashoffset: 0;
            animation: cfDrawSkyline 1.9s cubic-bezier(0.22, 1, 0.36, 1) infinite alternate;
          }
          .cf-anim-fade {
            animation: cfFadeUp 1.9s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          }
        `}</style>
      )}

      {/* Pilares Arquitetônicos Internos (Bronze Champagne #C5A059) */}
      <g className={animated ? "cf-anim-fade" : undefined}>
        <line x1="180" y1="24" x2="180" y2="114" stroke={gold} strokeWidth="3" strokeLinecap="round" />
        <line x1="126" y1="52" x2="126" y2="114" stroke={gold} strokeWidth="2.2" strokeLinecap="round" />
        <line x1="234" y1="52" x2="234" y2="114" stroke={gold} strokeWidth="2.2" strokeLinecap="round" />
      </g>

      {/* Skyline Executivo Modelo B (5 Torres Simétricas) */}
      <path
        d="M 35 114 L 68 114 L 68 74 L 96 74 L 96 114 L 110 114 L 110 46 L 142 36 L 142 114 L 158 114 L 158 22 L 180 10 L 202 22 L 202 114 L 218 114 L 218 36 L 250 46 L 250 114 L 264 114 L 264 74 L 292 74 L 292 114 L 325 114"
        fill="none"
        stroke={mainStroke}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animated ? "cf-anim-skyline" : undefined}
      />

      {/* Tipografia Vetorial "CORP FLΛTS" (Kerning matematicamente alinhado) */}
      <g className={animated ? "cf-anim-fade" : undefined}>
        {/* CORP (Bold) */}
        <g fill="none" stroke={mainStroke} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 84.5 139.5 A 12 12 0 1 0 84.5 156.5" />
          <circle cx="104" cy="148" r="12" />
          <path d="M 126 160 L 126 136 L 136 136 A 6.5 6.5 0 0 1 136 149 L 126 149 M 134 149 L 143 160" />
          <path d="M 153 160 L 153 136 L 162.5 136 A 6.8 6.8 0 0 1 162.5 149.6 L 153 149.6" />
        </g>

        {/* FL TS (Light) */}
        <g fill="none" stroke={secondaryStroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 189 160 L 189 136 L 203 136 M 189 147.5 L 200 147.5" />
          <path d="M 211 136 L 211 160 L 224 160" />
          <path d="M 256 136 L 272 136 M 264 136 L 264 160" />
          <path d="M 294 139.5 C 292 136, 280 135.5, 280 141.5 C 280 148, 295 147, 295 154 C 295 160.5, 282 160.5, 279.5 156.5" />
        </g>

        {/* Λ Arquitetônico (Bronze Champagne) */}
        <path
          d="M 231 160 L 240 136 L 249 160"
          fill="none"
          stroke={gold}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}

/**
 * Tela de Carregamento Animada (Splash Screen) Oficial CorpFlats
 */
export function CorpFlatsSplashScreen({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#091E26] via-[#0D2E3A] to-[#091E26] px-6 select-none relative overflow-hidden">
      {/* Halo luminoso Champagne sutil ao fundo */}
      <div className="absolute w-80 h-80 rounded-full bg-[#C5A059]/10 blur-3xl pointer-events-none animate-pulse" />

      <div className="relative z-10 flex flex-col items-center">
        <CorpFlatsLogo variant="dark" animated={true} className="w-72 sm:w-80 h-auto" />

        {/* Barra de progresso executiva */}
        <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden mt-6">
          <div
            className="h-full bg-gradient-to-r from-[#0F3D4C] via-[#C5A059] to-[#E5C98B] rounded-full animate-pulse"
            style={{ width: "100%" }}
          />
        </div>

        <span className="text-[11px] text-[#C5A059]/90 font-semibold tracking-widest uppercase mt-3">
          {label}
        </span>
      </div>
    </div>
  )
}
