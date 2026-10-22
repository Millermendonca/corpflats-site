/**
 * Microsoft Graph API Service for Excel & OneDrive Integration
 * Connects directly to Microsoft 365 / OneDrive to fetch and sync Excel spreadsheets
 */

export class MicrosoftGraphService {
  constructor(config = {}) {
    this.tenantId = config.tenantId || process.env.MS_TENANT_ID || "common";
    this.clientId = config.clientId || process.env.MS_CLIENT_ID || "";
    this.clientSecret = config.clientSecret || process.env.MS_CLIENT_SECRET || "";
    this.userEmail = config.userEmail || process.env.MS_USER_EMAIL || "";
    this.filePath = config.filePath || process.env.MS_EXCEL_FILE_PATH || "/Hotel/Documentos hóspedes";
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.resolvedUserId = null;
  }

  isConfigured() {
    return Boolean(this.clientId && this.clientSecret);
  }

  /**
   * Acquire Access Token using Client Credentials Flow
   */
  async getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new Error("Credenciais do Microsoft Graph não configuradas.");
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId || "common"}/oauth2/v2.0/token`;
    const params = new URLSearchParams();
    params.append("client_id", this.clientId);
    params.append("client_secret", this.clientSecret);
    params.append("scope", "https://graph.microsoft.com/.default");
    params.append("grant_type", "client_credentials");

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Falha na autenticação Microsoft Graph (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
    return this.accessToken;
  }

  /**
   * Resolves target User ID for Application Permissions
   */
  async getTargetUserId(token) {
    if (this.resolvedUserId) return this.resolvedUserId;
    if (this.userEmail) {
      this.resolvedUserId = this.userEmail;
      return this.resolvedUserId;
    }

    try {
      const res = await fetch("https://graph.microsoft.com/v1.0/users?$top=1", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.value && json.value.length > 0) {
          this.resolvedUserId = json.value[0].id || json.value[0].userPrincipalName;
          return this.resolvedUserId;
        }
      }
    } catch {}

    return null;
  }

  /**
   * Download the Excel File Binary (.xlsx) directly from OneDrive / SharePoint
   */
  async downloadExcelBuffer(customFilePath) {
    const token = await this.getAccessToken();
    const targetPath = (customFilePath || this.filePath || "").trim();
    
    // Normalize path for Graph API
    let cleanPath = targetPath.replace(/^\//, "");
    if (!cleanPath.endsWith(".xlsx")) {
      cleanPath = `${cleanPath}/Planilha.xlsx`;
    }

    const userId = await this.getTargetUserId(token);
    let endpoint = "";

    if (userId) {
      endpoint = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/drive/root:/${encodeURIComponent(cleanPath)}:/content`;
    } else {
      endpoint = `https://graph.microsoft.com/v1.0/drive/root:/${encodeURIComponent(cleanPath)}:/content`;
    }

    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Cache-Control": "no-cache"
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erro ao baixar arquivo do Microsoft Graph (${res.status}): ${errText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
