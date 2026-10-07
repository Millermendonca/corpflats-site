/**
 * CorpFlats / Guest Flow Manager - SERPRO FNRH v2.4.2 API Client
 * 
 * Integração oficial com a Ficha Nacional de Registro de Hóspedes (Ministério do Turismo / SERPRO).
 * Fornece métodos para:
 * - Cadastro de reservas e obtenção do link_precheckin oficial do Governo Federal (POST /reservas)
 * - Consulta de situação de reserva (GET /reservas/{id})
 * - Cancelamento de reserva no SERPRO (POST /reservas/{id}/cancelar)
 * - Health check e monitoramento de latência (GET /dominios/reservas/situacoes)
 * - Timeout estrito de 5s com AbortController e fallback fail-safe
 * - Suporte a mock para testes e validações automatizadas
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── URLs Oficiais da API SERPRO FNRH v2.4.2 ──────────────────────────────────
export const SERPRO_BASE_URLS = {
  homologacao: "https://hom-lowcode.serpro.gov.br/FNRH_API/rest/v2",
  producao: "https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2"
};

export const DEFAULT_CPF_SOLICITANTE = "12585736792";
export const DEFAULT_TIMEOUT_MS = 5000;

// ── Auto-carregador de .env (Padrão CorpFlats / Render Secrets) ───────────────
export function loadEnvFiles() {
  const potentialPaths = [
    "/etc/secrets/.env",
    "/etc/secrets/env",
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../../.env"),
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, ".env")
  ];

  if (fs.existsSync("/etc/secrets")) {
    try {
      const files = fs.readdirSync("/etc/secrets");
      for (const file of files) {
        const full = path.join("/etc/secrets", file);
        try {
          if (fs.statSync(full).isFile() && !potentialPaths.includes(full)) {
            potentialPaths.push(full);
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  for (const p of potentialPaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const idx = trimmed.indexOf("=");
          if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            let val = trimmed.slice(idx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key] || process.env[key] === "") {
              process.env[key] = val;
            }
          }
        }
      }
    } catch (_) {}
  }
}

// Inicializa variáveis de ambiente
loadEnvFiles();

/**
 * Cliente HTTP para a API FNRH SERPRO v2.4.2
 */
export class FnrhSerproClient {
  constructor(initialConfig = {}) {
    this.initialConfig = initialConfig;
    this.mockMode = Boolean(initialConfig.mock || process.env.SERPRO_MOCK === "true");
    this.mockError = null;
    this.mockTimeout = false;
  }

  /**
   * Habilita ou desabilita o modo de simulação / mock
   */
  setMockMode(enabled = true) {
    this.mockMode = Boolean(enabled);
  }

  /**
   * Configura mensagem de erro para simulação de falha
   */
  setMockError(errorMessage = null) {
    this.mockError = errorMessage;
  }

  /**
   * Simula timeout na resposta da API
   */
  setMockTimeout(enabled = true) {
    this.mockTimeout = Boolean(enabled);
  }

  /**
   * Resolve a configuração ativa com base na precedência:
   * 1. process.env
   * 2. settingsOverride.serproConfig (ou settingsOverride)
   * 3. defaults
   */
  resolveConfig(settingsOverride = null) {
    const serproConfig = settingsOverride?.serproConfig
      || settingsOverride?.db?.settings?.serproConfig
      || (settingsOverride && !settingsOverride.serproConfig && !settingsOverride.settings && (settingsOverride.user || settingsOverride.env || settingsOverride.cpfSolicitante) ? settingsOverride : {});

    const user = process.env.SERPRO_USER || serproConfig.user || this.initialConfig.user || "";
    const password = process.env.SERPRO_PASSWORD || serproConfig.password || this.initialConfig.password || "";
    const rawCpf = process.env.SERPRO_CPF_SOLICITANTE || serproConfig.cpfSolicitante || this.initialConfig.cpfSolicitante || DEFAULT_CPF_SOLICITANTE;
    const cpfSolicitante = String(rawCpf).replace(/\D/g, "");

    const rawEnv = (process.env.SERPRO_ENV || serproConfig.env || this.initialConfig.env || "homologacao").toLowerCase().trim();
    const env = (rawEnv === "producao" || rawEnv === "production" || rawEnv === "prod") ? "producao" : "homologacao";

    const baseUrl = (SERPRO_BASE_URLS[env] || SERPRO_BASE_URLS.homologacao).replace(/\/+$/, "");
    const timeoutMs = Number(process.env.SERPRO_TIMEOUT_MS) || settingsOverride?.timeoutMs || serproConfig.timeoutMs || this.initialConfig.timeoutMs || DEFAULT_TIMEOUT_MS;

    const mock = Boolean(
      this.mockMode ||
      process.env.SERPRO_MOCK === "true" ||
      serproConfig.mock ||
      settingsOverride?.mock
    );

    const mockError = this.mockError || settingsOverride?.mockError || serproConfig.mockError || null;
    const mockTimeout = Boolean(this.mockTimeout || settingsOverride?.mockTimeout || serproConfig.mockTimeout);

    return {
      user,
      password,
      cpfSolicitante,
      env,
      baseUrl,
      timeoutMs,
      mock,
      mockError,
      mockTimeout,
      isConfigured: Boolean((user && password) || mock)
    };
  }

  /**
   * Verifica se as credenciais do SERPRO estão preenchidas ou mock ativo
   */
  isConfigured(settingsOverride = null) {
    const cfg = this.resolveConfig(settingsOverride);
    return cfg.isConfigured;
  }

  /**
   * Constrói cabeçalhos obrigatórios da requisição HTTP
   */
  getHeaders(config) {
    const credentials = Buffer.from(`${config.user}:${config.password}`, "utf-8").toString("base64");
    return {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "cpf_solicitante": config.cpfSolicitante
    };
  }

  /**
   * Wrapper universal de chamadas HTTP com timeout estrito via AbortController
   */
  async request(endpoint, options = {}, timeoutOverride = null, settingsOverride = null) {
    const config = this.resolveConfig(settingsOverride);

    if (config.mock) {
      if (config.mockTimeout) {
        const timeoutErr = new Error(`SERPRO_TIMEOUT: Requisição à API SERPRO excedeu o tempo limite de ${config.timeoutMs}ms.`);
        timeoutErr.code = "ETIMEDOUT";
        timeoutErr.latencyMs = config.timeoutMs;
        throw timeoutErr;
      }
      if (config.mockError) {
        const err = new Error(`SERPRO_API_ERROR [HTTP 500]: ${config.mockError}`);
        err.status = 500;
        err.statusCode = 500;
        err.latencyMs = 25;
        throw err;
      }
      return {
        status: 200,
        latencyMs: 15,
        data: { ok: true, mock: true }
      };
    }

    if (!config.isConfigured) {
      const err = new Error("SERPRO_NOT_CONFIGURED: Usuário ou senha da API SERPRO não configurados.");
      err.code = "NOT_CONFIGURED";
      throw err;
    }

    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = `${config.baseUrl}${cleanEndpoint}`;
    const timeoutMs = timeoutOverride || config.timeoutMs;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    const headers = {
      ...this.getHeaders(config),
      ...(options.headers || {})
    };

    const startTime = Date.now();
    try {
      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });

      const latencyMs = Date.now() - startTime;
      const textResponse = await res.text();
      let data = null;

      try {
        data = textResponse ? JSON.parse(textResponse) : null;
      } catch (_) {
        data = { rawText: textResponse };
      }

      if (!res.ok) {
        const errorMsg = data?.message || data?.error || (data?.erros ? JSON.stringify(data.erros) : `HTTP ${res.status} ${res.statusText}`);
        const err = new Error(`SERPRO_API_ERROR [HTTP ${res.status}]: ${errorMsg}`);
        err.status = res.status;
        err.statusCode = res.status;
        err.data = data;
        err.latencyMs = latencyMs;
        throw err;
      }

      return {
        status: res.status,
        latencyMs,
        data
      };
    } catch (err) {
      if (err.name === "AbortError" || controller.signal.aborted) {
        const timeoutErr = new Error(`SERPRO_TIMEOUT: Requisição à API SERPRO excedeu o tempo limite de ${timeoutMs}ms.`);
        timeoutErr.code = "ETIMEDOUT";
        timeoutErr.latencyMs = Date.now() - startTime;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Registra uma reserva na API SERPRO (POST /reservas) e obtém o link_precheckin oficial
   * 
   * @param {Object} reservation Objeto da reserva do CorpFlats
   * @param {Object} settingsOverride Objeto de configurações do sistema (db.settings)
   * @returns {Promise<{ ok: boolean, serproReservaId: string, link_precheckin: string, serproPrecheckinUrl: string, situacao_reserva_id: string, raw: Object }>}
   */
  async registerReservation(reservation, settingsOverride = null) {
    if (!reservation) {
      throw new Error("Objeto de reserva inválido ou ausente.");
    }

    const numeroReserva = String(reservation.code || reservation.id || "").trim();
    if (!numeroReserva) {
      throw new Error("Reserva não possui código ou ID identificador.");
    }

    // Sanitiza e valida datas de check-in e check-out (YYYY-MM-DD)
    const checkinDateStr = String(reservation.checkinDate || "").substring(0, 10).trim();
    const checkoutDateStr = String(reservation.checkoutDate || "").substring(0, 10).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkinDateStr) || !/^\d{4}-\d{2}-\d{2}$/.test(checkoutDateStr)) {
      throw new Error(`Datas inválidas para registro no SERPRO: checkin=${checkinDateStr}, checkout=${checkoutDateStr}`);
    }

    // Hóspedes
    const adultos = Math.max(1, parseInt(reservation.adults || reservation.guestCount || 1, 10));
    const menores = Math.max(0, parseInt(reservation.children || 0, 10));

    // Código OTA se aplicável
    const isOta = reservation.channel === "booking" || reservation.channel === "airbnb";
    const numeroReservaOta = isOta ? String(reservation.otaReservationCode || reservation.externalId || "").trim() : "";

    const payload = {
      numero_reserva: numeroReserva,
      numero_reserva_ota: numeroReservaOta,
      data_entrada: checkinDateStr,
      data_saida: checkoutDateStr,
      quantidade_hospede_adulto: adultos,
      quantidade_hospede_menor: menores,
      origem_reserva_id: "MEIOHOSPEDAGEM"
    };

    const config = this.resolveConfig(settingsOverride);

    // Suporte ao modo Mock / Simulação
    if (config.mock) {
      if (config.mockTimeout) {
        const timeoutErr = new Error(`SERPRO_TIMEOUT: Requisição à API SERPRO excedeu o tempo limite de ${config.timeoutMs}ms.`);
        timeoutErr.code = "ETIMEDOUT";
        timeoutErr.latencyMs = config.timeoutMs;
        throw timeoutErr;
      }
      if (config.mockError) {
        const err = new Error(`SERPRO_API_ERROR [HTTP 500]: ${config.mockError}`);
        err.status = 500;
        err.statusCode = 500;
        throw err;
      }
      const cleanSuffix = numeroReserva.replace(/\W/g, "").slice(0, 12).padStart(12, "0");
      const mockUuid = `634eecb8-5973-47fd-a8a6-${cleanSuffix}`;
      const mockLink = `https://fnrh.turismo.gov.br/precheckin/${mockUuid}`;
      return {
        ok: true,
        serproReservaId: mockUuid,
        link_precheckin: mockLink,
        serproPrecheckinUrl: mockLink,
        situacao_reserva_id: "CRIADA",
        isMock: true,
        raw: {
          reserva: {
            reserva_id: mockUuid,
            numero_reserva: numeroReserva,
            situacao_reserva_id: "CRIADA",
            link_precheckin: mockLink
          }
        }
      };
    }

    const timeoutOverride = settingsOverride?.timeoutMs || null;
    const res = await this.request("/reservas", {
      method: "POST",
      body: JSON.stringify(payload)
    }, timeoutOverride, settingsOverride);

    const body = res.data;
    const reservaData = body?.reserva || body;

    const serproReservaId = reservaData?.reserva_id || reservaData?.id;
    const linkPrecheckin = reservaData?.link_precheckin || reservaData?.link;

    if (!linkPrecheckin) {
      throw new Error("A API do SERPRO não retornou o link_precheckin no objeto da reserva.");
    }

    return {
      ok: true,
      serproReservaId,
      link_precheckin: linkPrecheckin,
      serproPrecheckinUrl: linkPrecheckin,
      situacao_reserva_id: reservaData?.situacao_reserva_id || "CRIADA",
      raw: body
    };
  }

  /**
   * Consulta os detalhes de uma reserva existente no SERPRO pelo UUID
   * GET /reservas/{id}
   */
  async getReserva(reservaId, settingsOverride = null) {
    if (!reservaId) throw new Error("reservaId obrigatório.");
    const res = await this.request(`/reservas/${reservaId}`, { method: "GET" }, null, settingsOverride);
    return res.data?.reserva || res.data;
  }

  /**
   * Cancela uma reserva no SERPRO
   * POST /reservas/{reserva_id}/cancelar
   */
  async cancelReserva(reservaId, settingsOverride = null) {
    if (!reservaId) throw new Error("reservaId obrigatório.");
    const res = await this.request(`/reservas/${reservaId}/cancelar`, { method: "POST" }, null, settingsOverride);
    return res.data;
  }

  /**
   * Diagnóstico de Saúde e Conexão da API SERPRO
   * Consulta o endpoint leve GET /dominios/reservas/situacoes
   * 
   * @param {Object} settingsOverride Objeto de configurações do sistema (db.settings)
   * @returns {Promise<{ ok: boolean, status: string, statusCode: number, latencyMs: number, env: string, baseUrl: string, message: string, timestamp: string, error?: string }>}
   */
  async checkHealth(settingsOverride = null) {
    const config = this.resolveConfig(settingsOverride);
    const timestamp = new Date().toISOString();

    if (config.mock) {
      if (config.mockTimeout) {
        return {
          ok: false,
          status: "unreachable",
          statusCode: 0,
          latencyMs: config.timeoutMs,
          env: config.env,
          baseUrl: config.baseUrl,
          message: "Timeout de conexão (>5000ms) com os servidores do SERPRO (simulado).",
          timestamp,
          error: "ETIMEDOUT"
        };
      }
      if (config.mockError) {
        return {
          ok: false,
          status: "server_error",
          statusCode: 500,
          latencyMs: 15,
          env: config.env,
          baseUrl: config.baseUrl,
          message: config.mockError,
          timestamp,
          error: config.mockError
        };
      }
      return {
        ok: true,
        status: "healthy",
        statusCode: 200,
        latencyMs: 18,
        env: config.env,
        baseUrl: config.baseUrl,
        message: "Conexão com a API FNRH SERPRO operacional (modo mock).",
        timestamp
      };
    }

    if (!config.isConfigured) {
      return {
        ok: false,
        status: "not_configured",
        statusCode: 0,
        latencyMs: 0,
        env: config.env,
        baseUrl: config.baseUrl,
        message: "Credenciais SERPRO não configuradas no sistema (SERPRO_USER / SERPRO_PASSWORD ausentes).",
        timestamp
      };
    }

    const startTime = Date.now();
    try {
      const res = await this.request("/dominios/reservas/situacoes", {
        method: "GET"
      }, 5000, settingsOverride);

      const latencyMs = Date.now() - startTime;
      const situacoes = res.data?.dados || [];

      return {
        ok: true,
        status: "healthy",
        statusCode: res.status,
        latencyMs,
        env: config.env,
        baseUrl: config.baseUrl,
        message: `Conexão com a API FNRH SERPRO operacional (${situacoes.length} situações carregadas).`,
        timestamp
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const statusCode = err.status || err.statusCode || 0;

      let statusCategory = "error";
      let message = err.message;

      if (err.code === "ETIMEDOUT") {
        statusCategory = "unreachable";
        message = "Timeout de conexão (>5000ms) com os servidores do SERPRO.";
      } else if (statusCode === 401 || statusCode === 403) {
        statusCategory = "auth_error";
        message = "Credenciais de autenticação inválidas ou CPF não autorizado no SERPRO.";
      } else if (statusCode >= 500) {
        statusCategory = "server_error";
        message = `Servidor do SERPRO indisponível temporariamente (HTTP ${statusCode}).`;
      } else if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
        statusCategory = "unreachable";
        message = "Falha de rede ou DNS ao conectar com os servidores do SERPRO.";
      }

      return {
        ok: false,
        status: statusCategory,
        statusCode,
        latencyMs,
        env: config.env,
        baseUrl: config.baseUrl,
        message,
        error: err.message,
        timestamp
      };
    }
  }
}

// ── Instância Singleton Padrão ────────────────────────────────────────────────
export const fnrhSerproService = new FnrhSerproClient();
export default fnrhSerproService;

// ── Funções Utilitárias Exportadas ───────────────────────────────────────────
export async function registerSerproReservation(reservation, settings = null) {
  return fnrhSerproService.registerReservation(reservation, settings);
}

export async function checkSerproHealth(settings = null) {
  return fnrhSerproService.checkHealth(settings);
}

export function isSerproConfigured(settings = null) {
  return fnrhSerproService.isConfigured(settings);
}

export function getSerproConfig(settings = null) {
  return fnrhSerproService.resolveConfig(settings);
}

/**
 * Resolução de URL de check-in em nível de serviço independente
 */
export async function getCheckinUrl(reservation, guestIndex = 1, baseUrl = "", dbInstance = null) {
  const activeSettings = dbInstance?.settings || dbInstance || {};
  const currentProvider = activeSettings.checkinProvider || "proprio";
  const hostBase = (baseUrl || process.env.SERVER_BASE_URL || "https://corpflats.onrender.com").replace(/\/$/, "");
  const safeGuestIndex = Number(guestIndex) || 1;
  const resCode = reservation?.code || reservation?.id || "";
  const internalCheckinUrl = `${hostBase}/pre-checkin/${resCode}?guest=${safeGuestIndex}`;

  if (currentProvider !== "gov_fnrh") {
    return internalCheckinUrl;
  }

  if (reservation?.serproPrecheckinUrl || reservation?.link_precheckin) {
    return reservation.serproPrecheckinUrl || reservation.link_precheckin;
  }

  try {
    const serproResult = await fnrhSerproService.registerReservation(reservation, activeSettings);
    if (serproResult?.link_precheckin) {
      reservation.serproReservaId = serproResult.serproReservaId;
      reservation.serproPrecheckinUrl = serproResult.link_precheckin;
      reservation.link_precheckin = serproResult.link_precheckin;
      reservation.serproStatus = serproResult.situacao_reserva_id || "CRIADA";
      reservation.serproCreatedAt = new Date().toISOString();
      return serproResult.link_precheckin;
    }
    return internalCheckinUrl;
  } catch (err) {
    if (reservation) {
      reservation.serproError = err.message;
    }
    return internalCheckinUrl;
  }
}

export function getCheckinUrlSync(reservation, guestIndex = 1, baseUrl = "", dbInstance = null) {
  const activeSettings = dbInstance?.settings || dbInstance || {};
  const currentProvider = activeSettings.checkinProvider || "proprio";
  const hostBase = (baseUrl || process.env.SERVER_BASE_URL || "https://corpflats.onrender.com").replace(/\/$/, "");
  const safeGuestIndex = Number(guestIndex) || 1;
  const resCode = reservation?.code || reservation?.id || "";
  const internalCheckinUrl = `${hostBase}/pre-checkin/${resCode}?guest=${safeGuestIndex}`;

  if (currentProvider === "gov_fnrh" && (reservation?.serproPrecheckinUrl || reservation?.link_precheckin)) {
    return reservation.serproPrecheckinUrl || reservation.link_precheckin;
  }

  return internalCheckinUrl;
}

// ── Execução em Modo CLI (Diagnóstico Direto) ─────────────────────────────────
if (process.argv[1] && (process.argv[1].endsWith("fnrh-serpro-service.mjs") || process.argv[1].includes("fnrh-serpro-service"))) {
  console.log("==================================================================");
  console.log("   CorpFlats - Diagnóstico da API SERPRO FNRH v2.4.2");
  console.log("==================================================================");
  
  (async () => {
    try {
      const health = await checkSerproHealth();
      console.log(`[Status]      : ${health.ok ? "✅ Operacional (HEALTHY)" : "❌ " + health.status.toUpperCase()}`);
      console.log(`[Ambiente]    : ${health.env} (${health.baseUrl})`);
      console.log(`[Latência]    : ${health.latencyMs}ms`);
      console.log(`[Mensagem]    : ${health.message}`);
      if (health.error) {
        console.log(`[Detalhes]    : ${health.error}`);
      }
      process.exit(health.ok ? 0 : 1);
    } catch (err) {
      console.error("[Fatal Error]:", err);
      process.exit(1);
    }
  })();
}
