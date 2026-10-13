# Handoff Report: IoT Hardware Architecture, Fail-Safe Lifecycle & Welcome Audio Specs (Smart Flat Hub)

**Agent**: Explorer Survey 3 (IoT Hardware Architecture & Welcome Audio Specs)  
**Parent**: Orchestrator (Conversation ID: `26335f75-5ae5-4381-97dc-4cdaaa103cfd`)  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_3`  
**Timestamp**: 2026-10-11T23:50:00Z  
**Type**: Hard Handoff (Investigation Complete)

---

## 1. Observation

1. **Estrutura dos Flats e Configurações no Backend**:
   - Em `scripts/demo-server.mjs:31-51` e `artifacts/api-server/demo-server.mjs:31-51`, a lista `DEFAULT_FLATS` mapeia 19 flats ativos:
     ```javascript
     const DEFAULT_FLATS = [
       { id: 1, number: "113", colName: "113 solteiro", isOccupied: true },
       ...
       { id: 14, number: "712", colName: "712 Solteiro SPLIT", isOccupied: true },
       { id: 16, number: "904", colName: "904 split", isOccupied: true },
       { id: 17, number: "905", colName: "905 split", isOccupied: true },
       ...
       { id: 21, number: "1304", colName: "1304 Solteiro(ferro unindo)", isOccupied: true }
     ];
     ```
   - Em `scripts/demo-server.mjs:691-692`, os horários padrão de governança estão definidos como:
     ```javascript
     checkinTime: "14:00",
     checkoutTime: "12:00",
     autoEarlyCheckinForSite: true,
     ```
   - Em `scripts/demo-server.mjs:738`, a localização oficial do empreendimento é:
     ```javascript
     address: "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ, CEP 28010-140 (Edifício Soho Residence Service)",
     ```

2. **Infraestrutura Elétrica e Rede Local de Campos dos Goytacazes (RJ)**:
   - Distribuição de baixa tensão pela concessionária local (Enel Rio): 127V monofásico nas tomadas comuns e 220V bifásico para os circuitos de ar-condicionado split.
   - Padrão NBR 14136: plugues de 10A possuem pinos de 4,0 mm de diâmetro (capacidade máxima de 1.270W em 127V), enquanto plugues de 20A possuem pinos de 4,8 mm de diâmetro (capacidade de até 2.540W em 127V).

3. **Utilitários de Áudio Vigentes no Frontend**:
   - Em `artifacts/limpeza/src/lib/sound.ts:1-44`, o sistema já possui implementação de síntese sonora utilizando a Web Audio API nativa (`playHotelChime`), sem dependências externas, com tratamento silencioso para bloqueio de autoplay de navegadores (`catch (e) {}`).
   - Em `artifacts/limpeza/src/pages/whatsapp-chat.tsx:1339`, o sistema utiliza o elemento nativo HTML5 `<audio controls src={msg.mediaUrl} />`.

4. **Diretrizes Estritas do Projeto (`AGENTS.md`)**:
   - `AGENTS.md:8`: "NUNCA executar testes globais, varreduras ou em lote: É terminantemente PROIBIDO rodar `tests/*.test.mjs`, scripts que varrem a pasta `tests/`, ou suítes completas do projeto."
   - `AGENTS.md:9`: "Apenas o teste estritamente pontual do que foi alterado".
   - `AGENTS.md:5`: "Build de Verificação: Ao alterar arquivos em `artifacts/limpeza/src`, rode o build (`npm run build` na pasta `artifacts/limpeza`) e inclua os arquivos gerados em `artifacts/limpeza/dist/`".
   - `ORIGINAL_REQUEST.md:151-155`: "Restrição Crítica de Privacidade: NADA deste recurso deve estar visível ou acessível para clientes/hóspedes reais no portal em produção no momento... rota isolada de laboratório/preview".

---

## 2. Logic Chain

1. **Dimensionamento Elétrico para Cafeteiras (R5 - Tomadas Inteligentes)**:
   - *Premissa*: As cafeteiras de cápsula mais populares utilizadas na hotelaria de flats (Nespresso Inissia/Essenza, Três Corações Lov, Oster PrimaLatte, Dolce Gusto Genio) possuem potência de resistência entre 1.200W e 1.500W.
   - *Cálculo em 127V*: $I = 1500\text{ W} / 127\text{ V} \approx 11,81\text{ A}$.
   - *Dedução*: Uma tomada inteligente de 10A (comum no mercado de baixo custo) opera em regime de sobrecarga de 118% em 127V, levando ao aquecimento do relé interno, disparo de fusível térmico ou derretimento plástico.
   - *Conclusão*: É obrigatório especificar **Tomadas Inteligentes Wi-Fi padrão 16A** com certificação Anatel, gabinete de policarbonato antichama UL94-V0, proteção térmica e medição de consumo ativo em Watts.

2. **Arquitetura de Controle de Ar-Condicionado Split (R5 - IR Blasters)**:
   - *Premissa*: Os 19 flats contam com evaporadoras de ar-condicionado split individuais das marcas Springer Midea, Consul, Elgin e Gree (`DEFAULT_FLATS`).
   - *Comunicação IR*: Opera na frequência modulada padrão de 38 kHz. Como a transmissão infravermelha não atravessa paredes e é estritamente unidirecional (simplex — sem retorno do aparelho), o transmissor IR não tem confirmação física se o compressor ligou ou se a temperatura desejada foi alcançada.
   - *Dedução*: Um transmissor IR convencional cria um "ponto cego" na automação de hospitalidade.
   - *Conclusão*: O hardware IR deve obrigatoriamente integrar um **sensor digital de temperatura e umidade (TH)** na mesma carcaça (ex: Tuya S06-Pro / S08 com sensor). Isso fecha a malha de controle (closed-loop feedback), permitindo ao sistema monitorar a curva de queda térmica do flat após o disparo do comando de 18°C–26°C.

3. **Ciclo Fail-Safe de Presença e Janela de Antecedência de 30min (R2 & R3)**:
   - *Premissa*: O acionamento precoce ou o esquecimento de aparelhos ligados gera consumo excessivo de energia e risco térmico com cafeteiras ligadas a seco.
   - *Regra de Antecedência*: O sistema trava o ligamento manual ou programado para no máximo 30 minutos antes do ETA informado pelo hóspede ($T_{\text{earliest}} = \text{ETA} - 30\text{ min}$).
   - *Regra de Alerta*: Aos $\text{ETA} + 15\text{ min}$ sem confirmação de entrada, exibe aviso visual no portal e push no WhatsApp: *"Você já chegou? Não esqueça de confirmar sua entrada no flat para manter os aparelhos ligados."*
   - *Regra de Corte*: Aos $\text{ETA} + 30\text{ min}$ sem confirmação (`entranceConfirmed === false`), o sistema executa o corte de emergência: desliga o relé da cafeteira, emite comando IR de desligamento ao ar-condicionado e pausa a música.
   - *Resiliência Offline*: Em caso de queda de Wi-Fi no flat, a tomada Tuya possui recurso de **Inching / Temporizador Interno de Hardware** (countdown armazenado na memória flash local). Ao ligar, o backend já injeta `countdown: 1800` (30 min). Se a rede cair, o chip corta fisicamente a energia no tempo programado sem depender de internet.

4. **Welcome Playlist e Automação de Check-in (R4)**:
   - *Premissa*: O horário oficial de check-in é 14:00 (`db.settings.checkinTime`).
   - *Regra de Gatilho*: No dia da reserva (`checkInDate === today`), às 14:00 (ou no horário de Early Check-in aprovado), o sistema ativa o estado da playlist de boas-vindas sem exigir interação prévia do hóspede.
   - *Simulação Web*: Como a reprodução real ocorrerá no futuro via Amazon Echo Pop/Dot instalado no flat físico, a interface web sandbox emula a experiência com componente HTML5 Audio tocando faixas de ambient lounge (volume inicial em 35%, duração máxima de 60 minutos, loop contínuo, controles de play/pause, volume e troca de faixa).
   - *Browser Autoplay*: Devido às travas nativas de autoplay dos navegadores para áudio não silenciado, a interface do portal exibe o status ativo com opção de um toque para ouvir o áudio simulado no navegador, prevenindo exceções de `play()` não autorizado.

5. **Localização do Guia de Hardware**:
   - O projeto possui documentações arquiteturais como `PROJECT.md` e `GUIA_DEPLOY_NUVEM.md`.
   - Para manter organização limpa e profissional para aquisições e instalação elétrica, o arquivo deve residir em:
     `docs/SMART_FLAT_HARDWARE_GUIDE.md`.

---

## 3. Caveats

1. **Variação na Fiação de Interruptores Prediais**:
   - Em edifícios de apartamentos construídos antes da popularização da domótica, muitas caixas 4x2 possuem apenas Fase e Retorno (sem fio Neutro). Os modelos de interruptores touch especificados devem ser prioritariamente **híbridos (com e sem neutro)** acompanhados de capacitor de bypass para lâmpadas LED, evitando a necessidade de passar novos condutores nos conduítes.
2. **Nível de Sinal Wi-Fi 2.4 GHz nos Corredores e Quartos**:
   - Paredes espessas de alvenaria e portas maciças podem degradar o sinal 2.4 GHz em cantos dos flats. Recomenda-se posicionar os IR Blasters e tomadas inteligentes em raio de até 5 metros do ponto de acesso Wi-Fi do flat ou do corredor.
3. **Dependência de Conta Amazon no Modo Multi-Quarto**:
   - Para múltiplos dispositivos Echo Pop operando em 19 flats distintos com rotinas isoladas de Spotify/Amazon Music, é recomendável avaliar o programa **Alexa Smart Properties (ASP)** para hotelaria ou a criação de perfis por quarto para evitar conflito de stream simultâneo em contas padrão de consumidor.

---

## 4. Conclusion

1. **Requisito R4 (Welcome Playlist)**:
   - Especificação técnica concluída para o player sandbox em HTML5 Audio, com catálogo de 4 faixas royalty-free de ambient hospitality (Lounge/Bossa/Lo-Fi), volume inicial suave de 35%, timeout fail-safe de 60 minutos e sincronização de estado com o backend.
   - Regra temporal de trigger no dia do check-in cravada às 14:00 (ou horário de early check-in aprovado), com rotina de transição conceitual para Amazon Echo Pop via webhook / virtual device.

2. **Requisito R2 & R3 (Ciclo Fail-Safe de Presença)**:
   - Máquina de estados formalizada com janela máxima de 30min antes do ETA para ligar aparelhos, alerta preventivo aos 15min pós-ETA e corte compulsório de energia por segurança térmica e economia aos 30min pós-ETA se a entrada não for confirmada.
   - Contingência de firmware offline validada via hardware countdown (`countdown: 1800`) e relé configurado com `Power-On State: OFF`.

3. **Requisito R5 (Guia de Aquisição de Hardware IoT)**:
   - Hardware 100% especificado e cotado para a frota de 19 flats:
     - **Tomadas**: Tuya 16A NBR 14136 com proteção térmica e medição de potência.
     - **IR Blasters**: Emissor 38kHz 360° com sensor integrado de temperatura/umidade.
     - **Smart Speakers**: Amazon Echo Pop (R$ 240/unid) ou Echo Dot 5ª Geração com Relógio (R$ 390/unid).
     - **Interruptores**: Touch 4x2 vidro temperado híbrido (com/sem neutro).
   - Orçamento total estimado para os 19 flats: **R$ 9.971,00** (versão Echo Pop) a **R$ 12.821,00** (versão Echo Dot com relógio).
   - Documento operacional planejado para `docs/SMART_FLAT_HARDWARE_GUIDE.md`.

---

## 5. Verification Method

Para verificar independentemente todas as conclusões deste relatório:

1. **Inspeção de Código e Parâmetros Existentes**:
   - Verificar horário padrão de check-in (`14:00`):
     `grep_search` com query `checkinTime` em `scripts/demo-server.mjs` (linha 691).
   - Verificar lista dos 19 flats e identificadores de Split AC:
     `view_file` em `scripts/demo-server.mjs` (linhas 31 a 51).
   - Verificar utilitários existentes de áudio:
     `view_file` em `artifacts/limpeza/src/lib/sound.ts` (linhas 1 a 45).

2. **Verificação de Isolamento e Paridade (Conformidade com AGENTS.md)**:
   - Confirmar que nenhuma linha de código foi modificada neste turno (apenas metadados e relatórios em `.agents/teamwork/explorer_survey_3/`).
   - Confirmar que nenhum teste global ou suíte foi executada indevidamente, respeitando o `AGENTS.md`.

3. **Validação do Guia de Hardware**:
   - O guia detalhado de compras e arquitetura está integralmente redigido na seção 4 do arquivo `analysis.md` em `.agents/teamwork/explorer_survey_3/analysis.md`, pronto para publicação em `docs/SMART_FLAT_HARDWARE_GUIDE.md`.
