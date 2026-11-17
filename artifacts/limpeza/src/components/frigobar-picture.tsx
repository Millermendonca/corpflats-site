import React, { useState } from "react";

const OPTIMIZED_FRIGOBAR_BASES = new Set<string>([
  "achocolatado",
  "agua_mineral_copo",
  "agua_mineral_garrafa",
  "amendoim_mendorato",
  "barra_cereal",
  "batata",
  "biscoito_salgado",
  "castanha_caju",
  "cerveja_long_neck",
  "chiclete",
  "chocolate",
  "chocolate_kinder_bueno",
  "chocolate_kitkat_snickers",
  "cookies",
  "energetico",
  "proposta_agua_mineral_copo_200ml",
  "proposta_agua_mineral_garrafa_500ml",
  "proposta_amendoim_mendorato_27g",
  "proposta_barra_nutry_22g",
  "proposta_batata_pringles_114g",
  "proposta_biscoito_club_social_24g",
  "proposta_castanha_dacolonia_50g",
  "proposta_cerveja_heineken_330ml",
  "proposta_cerveja_stella_artois_330ml",
  "proposta_chiclete_trident_8g",
  "proposta_chocolate_kinder_bueno_43g",
  "proposta_chocolate_kitkat_41g",
  "proposta_chocolate_nestle_80g",
  "proposta_coca_cola_350ml",
  "proposta_coca_cola_zero_350ml",
  "proposta_cookies_bauducco_100g",
  "proposta_energetico_red_bull_250ml",
  "proposta_smirnoff_ice_275ml",
  "proposta_suco_del_valle_290ml",
  "proposta_suco_uva_aurora_300ml",
  "proposta_toddynho_200ml",
  "refrigerante",
  "smirnoff_ice",
  "suco_fruta",
  "suco_uva_integral",
]);

export function extractFrigobarOptimizedBase(url?: string | null): string | null {
  if (!url) return null;
  const clean = String(url).trim().split("?")[0].split("#")[0];
  const match = clean.match(/\/images\/frigobar\/([a-zA-Z0-9_-]+?)(?:-(?:160|512|1024)w)?\.(?:png|webp|avif|jpg|jpeg)$/i);
  if (!match?.[1]) return null;
  const base = match[1];
  return OPTIMIZED_FRIGOBAR_BASES.has(base) ? base : null;
}

const warmedFrigobarBases = new Set<string>();
const warmRetentionPool: HTMLElement[] = [];

/**
 * Pré-aquece de forma ociosa e silenciosa as miniaturas 160w (~2 KB cada) do cardápio
 * sem competir com o carregamento crítico da página. Assim, quando o hóspede abre o
 * Cardápio Digital do Frigobar, todas as fotos pintam instantaneamente do cache em memória.
 */
export function warmFrigobarThumbnailsIdle(urls: Array<string | undefined | null>): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const conn = (navigator as any)?.connection;
  if (conn?.saveData) return;

  const pendingBases: string[] = [];
  for (const u of urls) {
    const base = extractFrigobarOptimizedBase(u);
    if (base && !warmedFrigobarBases.has(base)) {
      warmedFrigobarBases.add(base);
      pendingBases.push(base);
    }
  }
  if (pendingBases.length === 0) return;

  const runWarmup = () => {
    for (const base of pendingBases) {
      const pic = document.createElement("picture");
      const sourceAvif = document.createElement("source");
      sourceAvif.type = "image/avif";
      sourceAvif.srcset = `/images/frigobar/${base}-160w.avif 160w, /images/frigobar/${base}-512w.avif 512w, /images/frigobar/${base}-1024w.avif 1024w`;
      sourceAvif.sizes = "48px";

      const sourceWebp = document.createElement("source");
      sourceWebp.type = "image/webp";
      sourceWebp.srcset = `/images/frigobar/${base}-160w.webp 160w, /images/frigobar/${base}-512w.webp 512w, /images/frigobar/${base}-1024w.webp 1024w`;
      sourceWebp.sizes = "48px";

      const img = document.createElement("img");
      img.decoding = "async";
      img.setAttribute("fetchpriority", "low");
      img.src = `/images/frigobar/${base}.png`;

      pic.appendChild(sourceAvif);
      pic.appendChild(sourceWebp);
      pic.appendChild(img);
      warmRetentionPool.push(pic);
    }
    if (warmRetentionPool.length > 60) {
      warmRetentionPool.splice(0, warmRetentionPool.length - 60);
    }
  };

  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (typeof ric === "function") {
    ric(runWarmup, { timeout: 1500 });
  } else {
    window.setTimeout(runWarmup, 400);
  }
}

export interface FrigobarPictureProps {
  src?: string | null;
  alt: string;
  width: number;
  height: number;
  sizes?: string;
  loading?: "lazy" | "eager";
  className?: string;
  hideOnError?: boolean;
}

export function FrigobarPicture({
  src,
  alt,
  width,
  height,
  sizes = "48px",
  loading = "lazy",
  className = "",
  hideOnError = false,
}: FrigobarPictureProps) {
  const [failed, setFailed] = useState(false);

  if (!src || (failed && hideOnError)) {
    return null;
  }

  const base = !failed ? extractFrigobarOptimizedBase(src) : null;

  if (base) {
    return (
      <picture className="contents">
        <source
          type="image/avif"
          srcSet={`/images/frigobar/${base}-160w.avif 160w, /images/frigobar/${base}-512w.avif 512w, /images/frigobar/${base}-1024w.avif 1024w`}
          sizes={sizes}
        />
        <source
          type="image/webp"
          srcSet={`/images/frigobar/${base}-160w.webp 160w, /images/frigobar/${base}-512w.webp 512w, /images/frigobar/${base}-1024w.webp 1024w`}
          sizes={sizes}
        />
        <img
          src={`/images/frigobar/${base}.png`}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          decoding="async"
          className={className}
          onError={() => setFailed(true)}
        />
      </picture>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      className={className}
      onError={(e) => {
        if (hideOnError) {
          (e.currentTarget as HTMLElement).style.display = "none";
        }
      }}
    />
  );
}
