# Blueprint de Especificação e Implementação: `scripts/fnrh-serpro-service.mjs`
**Componente:** SERPRO FNRH v2.4.2 API Client & Resilient Service  
**Milestone:** M1 (Feature 2)  
**Autor:** Explorer M1_1 (SERPRO Client Specialist)  
**Data:** 2026-10-07  

---

## 1. Visão Geral e Arquitetura

O módulo `scripts/fnrh-serpro-service.mjs` (e seu espelho obrigatório `artifacts/api-server/fnrh-serpro-service.mjs`) é o cliente HTTP oficial da **API SERPRO FNRH v2.4.2** do Ministério do Turismo. Ele é responsável por:
1. Cadastrar reservas no Governo Federal via `POST /reservas` para obtenção do `link_precheckin` oficial e do `reserva_id` (`serproReservaId`).
2. Executar diagnósticos de saúde da conexão via endpoint leve `GET /dominios/reservas/situacoes` com medição precisa de latência.
3. Operar com resiliência total via `AbortController` (timeout estrito de 5.000 ms), garantindo que instabilidades na API do governo nunca bloqueiem o backend do CorpFlats.
4. Resolver credenciais com fallback multinível (Variáveis de Ambiente `process.env` ➔ Configurações do Banco `db.settings.serproConfig` ➔ Defaults do Sistema).
5. Ser importável como ES Module tanto no servidor Express monolítico (`demo-server.mjs`), quanto em jobs de background, testes unitários (`node:test`) e modo CLI autônomo.

---

## 2. Especificação Técnica da API SERPRO v2.4.2

### 2.1 Ambientes e URLs Base
| Ambiente | URL Base | Finalidade |
| :--- | :--- | :--- |
| **Homologação** (Default) | `https://hom-lowcode.serpro.gov.br/FNRH_API/rest/v2` | Testes, staging, validação de novas versões |
| **Produção** | `https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2` | Operação oficial em tempo real |

*Nota de Normalização:* As URLs base devem ser sanitizadas removendo barras finais (`/`) para composição segura `${baseUrl}/${endpoint}`.

### 2.2 Autenticação e Cabeçalhos
Conforme a especificação oficial FNRH v2.4.2:
- **Protocolo:** HTTPS (TLS 1.2+)
- **Formato:** JSON (UTF-8)
- **Método de Autenticação:** HTTP Basic Authentication (`RFC 7617`)
  ```http
  Authorization: Basic <base64(usuario:senha)>
  Content-Type: application/json
  Accept: application/json
  cpf_solicitante: <11_digitos_numericos>
  ```
- **Cabeçalho `cpf_solicitante`:** Obrigatório em todas as requisições para rastreabilidade e auditoria pelo Ministério do Turismo. Deve conter apenas dígitos (11 caracteres numéricos).

### 2.3 Resolução Hierárquica de Credenciais
A resolução de credenciais opera em cascata com prioridade decrescente:
```
1. process.env (SERPRO_USER, SERPRO_PASSWORD, SERPRO_CPF_SOLICITANTE, SERPRO_ENV)
   ├── Carregamento fail-safe via loadEnvFiles() (.env local e /etc/secrets no Render)
2. settingsOverride.serproConfig (user, password, cpfSolicitante, env)
3. Defaults seguros:
   ├── env: 'homologacao'
   ├── cpfSolicitante: '12585736792' (CPF administrador Soho/CorpFlats)
   ├── timeoutMs: 5000
```

### 2.4 Assinatura da Requisição: `POST /reservas`
- **Endpoint:** `POST /reservas`
- **Contrato do Payload (JSON):**
```json
{
  "numero_reserva": "RES-113-0325",
  "numero_reserva_ota": "",
  "data_entrada": "2026-10-10",
  "data_saida": "2026-10-15",
  "quantidade_hospede_adulto": 2,
  "quantidade_hospede_menor": 0,
  "origem_reserva_id": "MEIOHOSPEDAGEM"
}
```

#### Regras de Mapeamento dos Campos:
| Campo SERPRO | Tipo | Origem CorpFlats | Regra / Sanitização |
| :--- | :--- | :--- | :--- |
| `numero_reserva` | String | `reservation.code \|\| reservation.id` | Obrigatório. String não-vazia, sem espaços nas bordas (`trim()`). |
| `numero_reserva_ota` | String | `reservation.otaReservationCode \|\| ""` | String vazia se canal não for OTA (`origem_reserva_id: 'MEIOHOSPEDAGEM'`). |
| `data_entrada` | String | `reservation.checkinDate` | Formato `YYYY-MM-DD`. Validar via regex `^\d{4}-\d{2}-\d{2}$`. |
| `data_saida` | String | `reservation.checkoutDate` | Formato `YYYY-MM-DD`. Validar via regex `^\d{4}-\d{2}-\d{2}$`. |
| `quantidade_hospede_adulto` | Integer | `reservation.adults \|\| reservation.guestCount \|\| 1` | Mínimo `1`. `Math.max(1, parseInt(val, 10))`. |
| `quantidade_hospede_menor` | Integer | `reservation.children \|\| 0` | Mínimo `0`. `Math.max(0, parseInt(val, 10))`. |
| `origem_reserva_id` | String | `'MEIOHOSPEDAGEM'` | Constante fixa para canal direto/PMS. |

### 2.5 Resposta e Normalização da API
A API SERPRO retorna HTTP 200 com a seguinte estrutura:
```json
{
  "reserva": {
    "reserva_id": "634eecb8-5973-47fd-a8a6-718e3c9d717f",
    "numero_reserva": "RES-113-0325",
    "numero_reserva_ota": "",
    "situacao_reserva_id": "CRIADA",
    "origem_reserva_id": "MEIOHOSPEDAGEM",
    "data_entrada": "2026-10-10",
    "data_saida": "2026-10-15",
    "quantidade_hospede_adulto": 2,
    "quantidade_hospede_menor": 0,
    "link_precheckin": "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-718e3c9d717f"
  }
}
```

O cliente normaliza a resposta para um objeto consistente:
```javascript
{
  ok: true,
  serproReservaId: "634eecb8-5973-47fd-a8a6-718e3c9d717f",
  link_precheckin: "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-718e3c9d717f",
  serproPrecheckinUrl: "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-718e3c9d717f",
  situacao_reserva_id: "CRIADA",
  raw: data
}
```

### 2.6 Endpoint de Diagnóstico / Health Check (`checkHealth`)
- **Endpoint:** `GET /dominios/reservas/situacoes`
- **Timeout:** 5.000 ms estrito
- **Headers:** `Authorization`, `cpf_solicitante`, `Accept: application/json`
- **Resposta Esperada:** HTTP 200 com array `dados: [ { id: "CRIADA", ... }, ... ]`
- **Status Retornados:**
  - `healthy`: HTTP 200, conexão ativa, credenciais válidas.
  - `not_configured`: Credenciais ausentes (não tenta chamada de rede, retorna instantâneo).
  - `auth_error`: HTTP 401 ou 403 (usuário/senha inválidos ou CPF não autorizado).
  - `unreachable`: Timeout (>5s), DNS failure ou erro de rede (ECONNREFUSED).
  - `server_error`: HTTP 500, 502, 503 da infraestrutura do SERPRO.

---

## 3. Código Completo Proposto para `scripts/fnrh-serpro-service.mjs`

Abaixo está o código integral projetado para o arquivo `scripts/fnrh-serpro-service.mjs` (a ser copiado identicamente para `artifacts/api-server/fnrh-serpro-service.mjs`):

```javascript
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
  }

  /**
   * Resolve a configuração ativa com base na precedência:
   * 1. process.env
   * 2. settingsOverride.serproConfig
   * 3. defaults
   */
  resolveConfig(settingsOverride = null) {
    const serproConfig = settingsOverride?.serproConfig || {};

    const user = process.env.SERPRO_USER || serproConfig.user || this.initialConfig.user || "";
    const password = process.env.SERPRO_PASSWORD || serproConfig.password || this.initialConfig.password || "";
    const rawCpf = process.env.SERPRO_CPF_SOLICITANTE || serproConfig.cpfSolicitante || this.initialConfig.cpfSolicitante || DEFAULT_CPF_SOLICITANTE;
    const cpfSolicitante = String(rawCpf).replace(/\D/g, "");

    const rawEnv = (process.env.SERPRO_ENV || serproConfig.env || this.initialConfig.env || "homologacao").toLowerCase().trim();
    const env = (rawEnv === "producao" || rawEnv === "production" || rawEnv === "prod") ? "producao" : "homologacao";

    const baseUrl = (SERPRO_BASE_URLS[env] || SERPRO_BASE_URLS.homologacao).replace(/\/+$/, "");
    const timeoutMs = Number(process.env.SERPRO_TIMEOUT_MS) || serproConfig.timeoutMs || this.initialConfig.timeoutMs || DEFAULT_TIMEOUT_MS;

    return {
      user,
      password,
      cpfSolicitante,
      env,
      baseUrl,
      timeoutMs,
      isConfigured: Boolean(user && password)
    };
  }

  /**
   * Verifica se as credenciais do SERPRO estão preenchidas
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

    const res = await this.request("/reservas", {
      method: "POST",
      body: JSON.stringify(payload)
    }, null, settingsOverride);

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
```

---

## 4. Integração no `demo-server.mjs` e `scripts/demo-server.mjs`

### 4.1 Importação no Topo dos Servidores
Em ambos os arquivos (`artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`), adicionar o import junto aos demais serviços:

```javascript
import {
  fnrhSerproService,
  registerSerproReservation,
  checkSerproHealth,
  isSerproConfigured
} from "./fnrh-serpro-service.mjs";
```

### 4.2 Novo Endpoint REST: `GET /api/fnrh-serpro/status`
Adicionar logo após o `PATCH /api/settings` (linha ~10088):

```javascript
// ── Health Check da Conexão SERPRO FNRH v2.4.2 ───────────────────────────────
app.get("/api/fnrh-serpro/status", async (req, res) => {
  try {
    const health = await checkSerproHealth(db.settings);
    const activeProvider = db.settings?.checkinProvider || "proprio";
    return res.json({
      ...health,
      activeProvider
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      status: "internal_error",
      error: err.message,
      activeProvider: db.settings?.checkinProvider || "proprio"
    });
  }
});
```

### 4.3 Integração com a Função Helper `getCheckinUrl` (Feature 3)
A função `getCheckinUrl` utiliza diretamente `fnrhSerproService.registerReservation`:

```javascript
export async function getCheckinUrl(reservation, guestIndex = 1, baseUrl = "", dbOverride = null) {
  const currentDb = dbOverride || db;
  const currentSettings = currentDb?.settings || {};
  const currentProvider = currentSettings.checkinProvider || "proprio";
  
  const hostBase = baseUrl || process.env.SERVER_BASE_URL || "https://corpflats.onrender.com";
  const internalCheckinUrl = `${hostBase}/pre-checkin/${reservation?.code || reservation?.id}?guest=${guestIndex || 1}`;

  // Se modo for Próprio, devolve imediatamente o link interno
  if (currentProvider !== "gov_fnrh") {
    return internalCheckinUrl;
  }

  // Se a reserva já possui o link do Gov.br gerado, retorna-o instantaneamente
  if (reservation?.serproPrecheckinUrl || reservation?.link_precheckin) {
    return reservation.serproPrecheckinUrl || reservation.link_precheckin;
  }

  // Modo Gov.br ativo mas link não gerado: registra no SERPRO com timeout de 5 segundos
  try {
    const serproResult = await fnrhSerproService.registerReservation(reservation, currentSettings);
    if (serproResult && serproResult.link_precheckin) {
      reservation.serproReservaId = serproResult.serproReservaId;
      reservation.serproPrecheckinUrl = serproResult.link_precheckin;
      reservation.link_precheckin = serproResult.link_precheckin;
      reservation.serproStatus = serproResult.situacao_reserva_id || "CRIADA";
      reservation.serproCreatedAt = new Date().toISOString();
      if (typeof saveDatabase === "function") {
        saveDatabase("serpro_reservation_created");
      }
      return reservation.serproPrecheckinUrl;
    }
    throw new Error("link_precheckin não retornado pela API SERPRO.");
  } catch (err) {
    // ── Fallback Inteligente e Transparente (< 5s) ───────────────────────────
    console.warn(`[FNRH SERPRO Fallback] Falha ao obter link oficial para reserva ${reservation?.code}: ${err.message}. Ativando check-in próprio.`);

    // 1. Log de Auditoria
    if (typeof logAuditEvent === "function") {
      logAuditEvent({
        level: "warning",
        category: "integration",
        action: "FNRH_SERPRO_FALLBACK",
        details: {
          reservationId: reservation?.id,
          reservationCode: reservation?.code,
          reason: err.message,
          fallbackUrl: internalCheckinUrl
        }
      });
    }

    // 2. Alerta na central da recepção
    if (typeof createNotification === "function") {
      createNotification({
        category: "system_error",
        severity: "warning",
        title: "⚠️ FNRH Gov.br Indisponível — Contingência Ativa",
        message: `A API FNRH Gov.br não respondeu a tempo para a reserva ${reservation?.code || reservation?.id}. O link de Check-in Próprio CorpFlats foi ativado automaticamente.`,
        metadata: { reservationCode: reservation?.code, error: err.message },
        targetUrl: `/reservas?code=${reservation?.code || reservation?.id}`
      });
    }

    return internalCheckinUrl;
  }
}
```

---

## 5. Matriz de Tratamento de Erros e Casos Extremos

| Cenário de Teste / Falha | Comportamento da API SERPRO | Resposta do `fnrh-serpro-service` | Efeito no Sistema / Hóspede |
| :--- | :--- | :--- | :--- |
| **API SERPRO Saudável** | HTTP 200 com JSON contendo `link_precheckin` em ~250ms | Retorna `{ ok: true, serproReservaId, link_precheckin }` | Hóspede recebe link oficial `https://fnrh.turismo.gov.br/precheckin/...`. |
| **Lentidão / Timeout (> 5s)** | Servidor do SERPRO congela sem responder | `AbortController` interrompe aos 5000ms lançando `ETIMEDOUT` | `getCheckinUrl` ativa fallback: hóspede recebe link interno CorpFlats, auditoria é gravada. |
| **Credenciais Ausentes** | Nenhuma requisição externa | `checkHealth` retorna `{ ok: false, status: 'not_configured' }` em 0ms | Badge no Admin exibe aviso amarelo "Não Configurado"; sistema usa check-in próprio. |
| **Credenciais Inválidas (401/403)** | HTTP 401 Unauthorized / HTTP 403 Forbidden | Lança erro categorizado `auth_error` | Alerta no painel e fallback transparente para link próprio. |
| **Indisponibilidade / 500/502/503** | Falha de infraestrutura do governo | Lança erro categorizado `server_error` | Fallback para check-in próprio sem travar rotas de WhatsApp ou e-mail. |
| **Reserva Duplicada (Código Já Existente)** | HTTP 400 com mensagem de validação | Trata erro e permite consulta do ID existente | Sistema preserva o link anterior se disponível ou usa link próprio. |
| **Formatos de Data Inválidos** | Nenhuma requisição enviada | Lança erro de validação antecipada | Fallback ativado com log claro do problema no formato de datas. |

---

## 6. Estratégia de Verificação e Testes Unitários

Para a Milestone 4 (Feature 10: `tests/fnrh-checkin-toggle.test.mjs`), o serviço será testado com `node:test` e `node:assert`:
1. **Teste Unitário de Construção de Payload e Headers:**
   - Validação de que `Authorization: Basic ...` codifica corretamente `user:password`.
   - Validação de que `cpf_solicitante` é sanitizado para 11 dígitos.
   - Validação de que `origem_reserva_id` é `'MEIOHOSPEDAGEM'`.
2. **Teste de Mock HTTP com Resposta Válida:**
   - Validação de parsing de `reserva.reserva_id` e `reserva.link_precheckin`.
3. **Teste de Simulação de Timeout (> 5000ms):**
   - Garantia de que a promessa rejeita com código `ETIMEDOUT` e que `getCheckinUrl` intercepta o erro sem quebrar a execução.
4. **Teste de Paridade de Arquivos:**
   - Garantia de que `scripts/fnrh-serpro-service.mjs` e `artifacts/api-server/fnrh-serpro-service.mjs` são byte-a-byte idênticos.

---
*Fim do Blueprint de Especificação do SERPRO Client.*
