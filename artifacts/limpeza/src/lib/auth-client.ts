// ══════════════════════════════════════════════════════════════════════════════
// Guest Flow Manager - Client-side Authentication & Passkeys / Google One Tap
// ══════════════════════════════════════════════════════════════════════════════

export interface UserProfile {
  id: string | number
  email: string
  name: string
  role?: string
  avatarUrl?: string
  phone?: string
  document?: string
  companyData?: {
    cnpj?: string
    companyName?: string
    companyEmail?: string
    companyPhone?: string
  } | null
  vehicle?: {
    plate?: string
    brand?: string
    model?: string
    color?: string
  } | null
  googleConnected?: boolean
  passkeysCount?: number
  createdAt?: string
  lastLoginAt?: string
}

export interface AuthResponse {
  success: boolean
  user?: UserProfile
  message?: string
  error?: string
}

const API_BASE = "/api/v2/auth"

/**
 * 1. Login com E-mail e Senha (Emite Cookie HttpOnly Seguro)
 */
export async function loginWithEmail(email: string, password: string): Promise<AuthResponse> {
  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Falha no login.")
    return { success: true, user: data.user, message: data.message }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro de conexão." }
  }
}

/**
 * 2. Cadastro de Nova Conta com Validação de E-mail e Senha
 */
export async function registerAccount(payload: {
  name: string
  email: string
  password: string
  phone?: string
  document?: string
  vehicle?: { plate?: string; model?: string; brand?: string; color?: string }
  companyData?: { cnpj?: string; companyName?: string }
}): Promise<AuthResponse> {
  try {
    const res = await fetch(`${API_BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Erro ao criar conta.")
    return { success: true, user: data.user, message: data.message }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao conectar." }
  }
}

/**
 * 3. Login / Cadastro via Google One Tap (JWT)
 */
export async function loginWithGoogleCredential(credential: string): Promise<AuthResponse> {
  try {
    const res = await fetch(`${API_BASE}/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ credential })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Erro ao autenticar com o Google.")
    return { success: true, user: data.user, message: data.message }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro no Google Sign-In." }
  }
}

/**
 * 3.1 Login Oficial via Janela Popup do Google OAuth 2.0 (Token Client)
 */
export async function loginWithGooglePopup(onSuccess: (user: UserProfile) => void): Promise<AuthResponse> {
  return new Promise(async (resolve) => {
    try {
      let clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || ""
      if (!clientId) {
        const res = await fetch(`${API_BASE}/config`).catch(() => null)
        if (res && res.ok) {
          const data = await res.json()
          clientId = data.googleClientId || ""
        }
      }

      if (!clientId) {
        clientId = "415372338786-m41g9g4g0h6e5q745h5k1k9r4p0a9n.apps.googleusercontent.com"
      }

      const launchOAuthPopup = () => {
        const google = (window as any).google
        if (google?.accounts?.oauth2) {
          const client = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: "email profile openid",
            callback: async (tokenResponse: any) => {
              if (tokenResponse?.access_token) {
                try {
                  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                  })
                  const userInfo = await userInfoRes.json()
                  if (userInfo?.email) {
                    const authRes = await fetch(`${API_BASE}/google`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({
                        email: userInfo.email,
                        name: userInfo.name || userInfo.email.split("@")[0],
                        picture: userInfo.picture || "",
                        sub: userInfo.sub || ""
                      })
                    })
                    const authData = await authRes.json()
                    if (authData.success && authData.user) {
                      onSuccess(authData.user)
                      resolve({ success: true, user: authData.user })
                      return
                    }
                  }
                } catch (e: any) {
                  resolve({ success: false, error: e.message })
                  return
                }
              }
              resolve({ success: false, error: "Janela fechada ou sem autorização." })
            },
            error_callback: (err: any) => {
              console.warn("Google OAuth error:", err)
              resolve({ success: false, error: err?.message || "Erro no popup do Google." })
            }
          })

          client.requestAccessToken({ prompt: "select_account" })
        } else if (google?.accounts?.id) {
          google.accounts.id.prompt((notification: any) => {
            if (notification.isNotDisplayed()) {
              resolve({ success: false, error: "Prompt suprimido." })
            }
          })
        }
      }

      if ((window as any).google?.accounts?.oauth2) {
        launchOAuthPopup()
      } else {
        const script = document.createElement("script")
        script.src = "https://accounts.google.com/gsi/client"
        script.async = true
        script.defer = true
        script.onload = launchOAuthPopup
        document.head.appendChild(script)
      }
    } catch (err: any) {
      resolve({ success: false, error: err.message })
    }
  })
}

/**
 * 4. Obter Sessão Ativa Atual (Consome Cookie HttpOnly)
 */
export async function getCurrentSession(): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${API_BASE}/me`, {
      credentials: "include"
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.user || null
  } catch {
    return null
  }
}

/**
 * 5. Logout Seguro (Invalida Sessão e Limpa Cookie)
 */
export async function logoutAccount(): Promise<boolean> {
  try {
    await fetch(`${API_BASE}/logout`, {
      method: "POST",
      credentials: "include"
    })
    return true
  } catch {
    return false
  }
}

/**
 * 6. Solicitar Link / Token de Recuperação de Senha
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Erro ao solicitar recuperação.")
    return { success: true, message: data.message }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * 7. Redefinir Senha com Token
 */
export async function submitPasswordReset(token: string, newPassword: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Token inválido ou expirado.")
    return { success: true, message: data.message }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * 8. Alterar Senha Autenticada
 */
export async function changeAccountPassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ currentPassword, newPassword })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Senha atual incorreta.")
    return { success: true, message: data.message }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * 9. Atualizar Dados do Perfil
 */
export async function updateAccountProfile(payload: Partial<UserProfile>): Promise<AuthResponse> {
  try {
    const res = await fetch(`${API_BASE}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Erro ao atualizar perfil.")
    return { success: true, user: data.user, message: data.message }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * 10. Passkeys / WebAuthn: Registrar Biometria (Touch ID / Face ID / Windows Hello)
 */
export async function registerPasskeyDevice(deviceName = "Dispositivo Biométrico"): Promise<{ success: boolean; message?: string; error?: string }> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return { success: false, error: "Seu navegador ou dispositivo não possui suporte a Passkeys/Biometria." }
  }

  try {
    // 1. Obtém desafio do servidor
    const optRes = await fetch(`${API_BASE}/passkeys/register-options`, { credentials: "include" })
    const options = await optRes.json()
    if (!optRes.ok) throw new Error(options.error || "Falha ao gerar desafio.")

    // 2. Cria credencial no dispositivo do usuário
    const challengeBuffer = Uint8Array.from(atob(options.challenge.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))
    const userIdBuffer = new TextEncoder().encode(String(options.user.id))

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: challengeBuffer,
        rp: { name: "CorpFlats Macaé", id: window.location.hostname },
        user: {
          id: userIdBuffer,
          name: options.user.email,
          displayName: options.user.name || options.user.email
        },
        pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "preferred"
        },
        timeout: 60000
      }
    }) as any

    if (!credential) throw new Error("Registro de biometria cancelado.")

    // 3. Envia para o servidor verificar e salvar
    const verifyRes = await fetch(`${API_BASE}/passkeys/register-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        credentialId: credential.id,
        deviceName,
        rawId: credential.id
      })
    })
    const verifyData = await verifyRes.json()
    if (!verifyRes.ok) throw new Error(verifyData.error || "Erro ao salvar Passkey.")

    return { success: true, message: "Passkey biométrica registrada com sucesso!" }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro no registro biométrico." }
  }
}

/**
 * 11. Passkeys / WebAuthn: Login com Biometria
 */
export async function loginWithPasskey(email?: string): Promise<AuthResponse> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return { success: false, error: "Dispositivo sem suporte a Passkeys." }
  }

  try {
    const optRes = await fetch(`${API_BASE}/passkeys/auth-options?email=${encodeURIComponent(email || "")}`)
    const options = await optRes.json()
    if (!optRes.ok) throw new Error(options.error || "Nenhuma Passkey encontrada para este e-mail.")

    const challengeBuffer = Uint8Array.from(atob(options.challenge.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challengeBuffer,
        rpId: window.location.hostname,
        userVerification: "preferred",
        timeout: 60000
      }
    }) as any

    if (!assertion) throw new Error("Autenticação biométrica cancelada.")

    const verifyRes = await fetch(`${API_BASE}/passkeys/auth-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        credentialId: assertion.id,
        email: email || options.email
      })
    })

    const data = await verifyRes.json()
    if (!verifyRes.ok) throw new Error(data.error || "Falha na verificação biométrica.")
    return { success: true, user: data.user, message: data.message }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao entrar com Passkey." }
  }
}

/**
 * 12. Inicializador do Google One Tap e Botão Google Sign-In
 */
export async function initGoogleOneTap(
  onSuccess: (user: UserProfile) => void,
  buttonContainerId?: string
): Promise<void> {
  if (typeof window === "undefined") return

  try {
    // Limpa o cookie de cooldown do Google para forçar o One Tap a sempre tentar ser exibido
    try {
      document.cookie = "g_state=;path=/;expires=Thu, 01 Jan 1970 00:00:01 GMT"
    } catch {}

    // Busca client ID configurado pelo administrador ou no env
    let clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || ""
    if (!clientId) {
      const res = await fetch(`${API_BASE}/config`).catch(() => null)
      if (res && res.ok) {
        const data = await res.json()
        clientId = data.googleClientId || ""
      }
    }

    if (!clientId) {
      clientId = "415372338786-m41g9g4g0h6e5q745h5k1k9r4p0a9n.apps.googleusercontent.com"
    }

    const setupGoogle = () => {
      try {
        const google = (window as any).google
        if (!google?.accounts?.id) return

        google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: any) => {
            if (response?.credential) {
              const auth = await loginWithGoogleCredential(response.credential)
              if (auth.success && auth.user) {
                onSuccess(auth.user)
              }
            }
          },
          auto_select: false,
          cancel_on_tap_outside: false,
          itp_support: true,
          use_fedcm_for_prompt: false
        })

        // Renderiza o botão oficial caso um elemento container tenha sido fornecido
        if (buttonContainerId) {
          const btnEl = document.getElementById(buttonContainerId)
          if (btnEl) {
            google.accounts.id.renderButton(btnEl, {
              type: "standard",
              shape: "rectangular",
              theme: "outline",
              text: "continue_with",
              size: "large",
              logo_alignment: "left",
              width: 300
            })
          }
        }

        // Dispara o prompt do popup flutuante do Google One Tap
        google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed()) {
            console.log("Google One Tap não exibido (razão):", notification.getNotDisplayedReason?.())
          }
        })
      } catch (err) {
        console.warn("Google One Tap:", err)
      }
    }

    if ((window as any).google?.accounts?.id) {
      setupGoogle()
    } else {
      const script = document.createElement("script")
      script.src = "https://accounts.google.com/gsi/client"
      script.async = true
      script.defer = true
      script.onload = setupGoogle
      document.head.appendChild(script)
    }
  } catch {}
}

/**
 * 12.1 Renderiza o Botão Oficial do Google Sign-In
 */
export async function renderGoogleButton(
  containerId: string,
  onSuccess: (user: UserProfile) => void
): Promise<void> {
  return initGoogleOneTap(onSuccess, containerId)
}

/**
 * 13. Exportação de Dados em Conformidade com a LGPD
 */
export async function exportUserData(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/export-data`, { credentials: "include" })
    if (!res.ok) throw new Error("Falha ao exportar dados.")
    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `dados-cadastrais-corpflats-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  } catch (err: any) {
    alert(err.message || "Erro ao exportar dados.")
  }
}

/**
 * 14. Exclusão Definitiva de Conta (LGPD)
 */
export async function deleteUserAccount(): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/account`, {
      method: "DELETE",
      credentials: "include"
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Erro ao excluir conta.")
    return { success: true, message: data.message }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
