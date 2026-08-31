# 🚀 Guia de Deploy em Nuvem - Guest Flow Manager

Este guia explica como publicar o sistema na nuvem (usando a plataforma gratuita **Render** ou **Railway**) para que o sistema fique online **24 horas por dia**, sem precisar deixar o seu computador ligado.

---

## 🔑 Usuários e Senhas Padrão

O sistema vem configurado com os seguintes logins iniciais:

| Usuário | Perfil | Senha Inicial |
| :--- | :--- | :--- |
| **admin** | Administrador | `admin123` |
| **Cris** | Camareira | `1234` |
| **Grazi** | Camareira | `1234` |

> 💡 **Dica:** Cada usuária pode alterar sua própria senha clicando no ícone de chave 🔑 no rodapé do menu lateral. O Administrador pode cadastrar novas camareiras e redefinir a senha de qualquer uma no menu **Configurações & Flats**.

---

## ☁️ Como Publicar no Render (Opção Gratuita Recomendada)

### Passo 1: Criar conta no GitHub e enviar o projeto
1. Crie uma conta gratuita no [GitHub.com](https://github.com/) (se ainda não tiver).
2. Crie um novo repositório privado chamado `guest-flow-manager`.
3. Suba esta pasta do projeto para o repositório no GitHub.

### Passo 2: Criar o Web Service no Render
1. Acesse [render.com](https://render.com/) e faça login com sua conta do GitHub.
2. Clique no botão **New +** ➔ **Web Service**.
3. Conecte o repositório `guest-flow-manager`.
4. Preencha as opções:
   * **Name:** `guest-flow-hotel` (ou o nome do seu hotel)
   * **Region:** Ohio (ou a mais próxima)
   * **Branch:** `main`
   * **Runtime:** `Node`
   * **Build Command:** `pnpm install && pnpm --filter @workspace/limpeza build`
   * **Start Command:** `node server.mjs`
   * **Plan:** `Free` (Gratuito)
5. Clique em **Create Web Service**.

### Passo 3: Pronto! 🎉
* Em ~2 minutos o Render vai gerar um link seguro HTTPS para você (ex: `https://guest-flow-hotel.onrender.com`).
* Você e suas camareiras já podem acessar de qualquer celular ou computador pelo 4G/Wi-Fi!

---

## 💻 Como Rodar no Computador do Hotel (1 Clique)
Se preferir rodar localmente no computador da recepção/gerência:
* Basta dar 2 cliques no arquivo **`INICIAR_SISTEMA_HOTEL.bat`** na pasta do projeto.
* O sistema abrirá e estará disponível para os celulares no Wi-Fi pelo endereço IP exibido na tela.
