# Relatório de Handoff — Challenger 1: Avaliação Adversarial do Marco M2

**Autor:** Challenger 1 (`challenger_m2_1`)  
**Data:** 2026-10-22T11:40:00Z  
**Destinatário:** Orquestrador (`58ecb31f-60d2-4e1e-9aac-82400a58c263`)  
**Veredicto Oficial:** `REQUEST_CHANGES` (ou `APPROVE_WITH_MINOR_FIX` a critério do orquestrador)  
**Taxa de Sucesso nos Testes Adversariais:** 31/33 PASS (93.9%)

---

## 1. Observation

Durante a auditoria adversarial e execução do harness empírico dedicado (`.agents/teamwork/challenger_m2_1/stress_geofence.mjs`), foram realizadas as seguintes observações diretas no código e nos testes:

### 1.1 Limiares Críticos da Cerca Virtual (Haversine)
- **Localização Oficial do Soho:** `lat: -21.7584, lng: -41.3262, raio: 150m`.
- **Limiar 149.9m Norte (`lat: -21.7570519`):**
  - Distância calculada: `149.9m`.
  - `checkGeofence`: `isWithin: true`. (PASS)
- **Limiar 150.1m Norte (`lat: -21.7570501`):**
  - Distância calculada: `150.1m`.
  - `checkGeofence`: `isWithin: false`. (PASS)
- **Limiar Exato 150.0m Fronteira Inclusiva:**
  - Distância calculada: `150.0m`.
  - `checkGeofence`: `isWithin: true` (fronteira `<=` respeitada). (PASS)
- **Limiares 149.9m e 150.1m Leste (Longitude):**
  - Distâncias calculadas: `149.9m` (`isWithin: true`) e `150.1m` (`isWithin: false`). (PASS)
- **Coordenadas com Sinais Invertidos (`+21.7584, +41.3262`):**
  - Distância calculada: `10.180.210,9m` (~10.180 km).
  - `checkGeofence`: `isWithin: false`. (PASS)
- **Coordenadas Trocadas (`lat <-> lng`):**
  - Distância calculada: `2.844.642,2m`.
  - `checkGeofence`: `isWithin: false`. (PASS)

### 1.2 Defeito Empírico em `calculateDistanceHaversine`: Quebra com `NaN` em Antípodas e `Infinity`
Arquivo: `artifacts/api-server/hr/timekeeping.mjs` (linhas 41–68) e espelho `scripts/hr/timekeeping.mjs`:
```javascript
41: export function calculateDistanceHaversine(lat1, lon1, lat2, lon2) {
42:   const nLat1 = Number(lat1);
43:   const nLon1 = Number(lon1);
44:   const nLat2 = Number(lat2);
45:   const nLon2 = Number(lon2);
46: 
47:   if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) {
48:     return Infinity;
49:   }
...
59:   const a =
60:     Math.sin(dLat / 2) * Math.sin(dLat / 2) +
61:     Math.cos(rLat1) * Math.cos(rLat2) *
62:     Math.sin(dLon / 2) * Math.sin(dLon / 2);
63: 
64:   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
65:   const distance = R * c;
66: 
67:   return Math.round(distance * 10) / 10;
68: }
```
- **Caso 1: Antípodas com Arredondamento IEEE 754:**
  - Comando:
    ```javascript
    calculateDistanceHaversine(-88.40000000000009, 0, 88.40000000000009, 180);
    calculateDistanceHaversine(-52.20000000000131, 0, 52.20000000000131, 180);
    ```
  - *Resultado obtido verbatim:* `NaN`!
  - Causa raiz: Na linha 59-62, a acumulação de imprecisão de ponto flutuante produz `a = 1.0000000000000002` (estritamente maior que 1.0). Na linha 64, `1 - a` resulta em `-2.220446049250313e-16`. A raiz quadrada `Math.sqrt(1 - a)` retorna `NaN`, propagando `NaN` para `c` e `distance`.
- **Caso 2: Coordenadas Não-Finitas (`Infinity` / `-Infinity`):**
  - Comando:
    ```javascript
    calculateDistanceHaversine(Infinity, -41.3262, -21.7584, -41.3262);
    ```
  - *Resultado obtido verbatim:* `NaN`!
  - Causa raiz: Na linha 47, `isNaN(Infinity)` avalia como `false`. O valor `Infinity` entra nas funções trigonométricas: `Math.sin(Infinity)` retorna `NaN`, resultando em `distance = NaN` em vez do valor seguro esperado `Infinity`.
  - Impacto na API: `checkGeofence` retorna `{ distanceMeters: NaN }`, que ao ser serializado em JSON no Express vira `null` (`"distanceMeters": null`), violando o contrato de tipo numérico.
- O mesmo trecho sem clamp de `a` existe no fallback da linha 368 de `artifacts/api-server/hr/compliance.mjs`.

### 1.3 Validação de Selfie e Hashes SHA-256 (10/10 PASS)
- `validateAndHashSelfie` rejeitou rigorosamente:
  - `null`, `undefined`, `""` e espaços em branco (`"    "`).
  - DataURL com MIME inválido (`data:text/html`, `data:application/json`).
  - DataURL sem marcador `;base64,`.
  - Imagem excessivamente curta (< 50 caracteres base64).
  - Base64 corrompido com caracteres inválidos.
  - Imagem corrompida cujo buffer decodificado resulte em < 20 bytes.
- Imagem válida MTP 671 gerou hash SHA-256 de 64 caracteres hexadecimais em caixa baixa (`/^[a-f0-9]{64}$/`).
- Efeito avalanche comprovado: alteração de 1 caractere no payload de imagem resultou em hash 100% divergente.
- Proteção contra database bloat validada: imagem grande (~600 KB base64) foi validada criptograficamente com hash de 64 caracteres, mas `selfieUrl` foi gravado como `null` em `record` (regra `selfie.length < 500000 ? selfie : null`), prevenindo saturação da persistência.

### 1.4 Whitelist de Aparelhos e Vetores de Bypass (9/9 PASS)
- Com a whitelist ativada:
  - `deviceId` nulo, vazio, `undefined`, `{}` ou array vazio: sumariamente rejeitados com `reason: "device_id_missing"`.
  - Dispositivo não cadastrado: rejeitado com `reason: "device_not_registered"`.
  - Dispositivo revogado (`active: false`): rejeitado com `reason: "device_not_registered"`.
  - Usurpação de aparelho: celular pessoal registrado para `emp_cozinha_01` utilizado por `emp_camareira_01` foi rejeitado com `reason: "device_bound_to_different_employee"`.
  - Terminal compartilhado da recepção (`employeeId: null`): aceitou batida de qualquer colaborador CLT ativo.
  - Vetores de prototype pollution (`__proto__`, `constructor`, `toString`): tratados com segurança e rejeitados como não autorizados.
  - Injeção de array de múltiplos dispositivos: rejeitado.
- Com a whitelist desativada (`hrSettings.deviceWhitelist.enabled = false`):
  - Qualquer aparelho foi aceito com `isAuthorized: true` e `reason: "whitelist_disabled"`.

### 1.5 Validação da Suíte do Worker e Paridade Twin-Server
- Suíte `tests/hr-m2-timekeeping-compliance.test.mjs`: 8/8 testes executados e aprovados (0 falhas).
- Auditoria `scripts/check-twin-parity.mjs`: 32/32 arquivos auditados com paridade 100% SHA-256.

---

## 2. Logic Chain

1. **Premissa de Geofencing Submétrico:**
   A cerca virtual deve validar distâncias com precisão submétrica em torno de 150m e nunca entrar em falha silenciosa ou gerar `NaN`.
2. **Observação do Limiar de Cerca:**
   Para 149.9m, o sistema calculou 149.9m (`isWithin: true`). Para 150.1m, calculou 150.1m (`isWithin: false`). Para 150.0m, calculou 150.0m (`isWithin: true`). A precisão e a regra de negócio de borda estão 100% corretas.
3. **Observação da Falha Matemática em Haversine:**
   Ao testar pares de antípodas com imprecisão de ponto flutuante IEEE 754, `a` excedeu `1.0` por `2.22e-16`. Sem a função `Math.min(1, Math.max(0, a))`, `Math.sqrt(1 - a)` produziu `NaN`. Da mesma forma, `isNaN(Infinity)` avaliou como falso, deixando `Infinity` passar e virar `NaN` nas funções trigonométricas.
4. **Impacto da Falha:**
   Embora seja improvável que um funcionário na prática registre ponto a partir do exato antípoda ou com `lat: Infinity`, a diretiva do orquestrador foi explícita: *"Assegure que a fórmula não quebra com `NaN` e calcula distâncias precisas"*. Na presença de `NaN`, a API devolve `distanceMeters: null` em vez de um número válido ou `Infinity`.
5. **Correção Direta e Mínima:**
   Apenas 2 linhas em `timekeeping.mjs` (e no espelho twin-server) resolvem definitivamente 100% dos casos de `NaN`.

---

## 3. Caveats

- **Ambiente Real de GPS:** Aparelhos celulares reais fornecem latitudes no intervalo $[-90, +90]$ e longitudes $[-180, +180]$. Em condições normais em Campos dos Goytacazes/RJ, o cálculo de distância em torno de 150m do Soho Residence funciona com precisão métrica perfeita e sem qualquer risco de `NaN`.
- **Validação de Código de Produção:** Seguindo estritamente as instruções de agente revisor ("Review-only — do NOT modify implementation code"), nenhuma alteração foi realizada nos arquivos em `artifacts/` ou `scripts/`. A correção recomendada abaixo deve ser aplicada pelo worker.

---

## 4. Conclusion

**Veredicto:** `REQUEST_CHANGES`

A implementação do Marco M2 pelo `worker_m2` apresenta qualidade muito alta:
- A precisão da cerca virtual nos limites críticos (149.9m vs 150.1m) é perfeita.
- A validação biométrica de selfies e a criptografia SHA-256 (MTP 671) estão impecáveis e imunes a ataques de injeção e bloat.
- A whitelist de aparelhos é segura contra spoofing, usurpação entre colegas e prototype pollution.
- O motor de conformidade em 3 níveis e a blindagem de Cris e Grazi funcionam rigorosamente.

No entanto, para cumprir com 100% de rigor a diretiva matemática de **robustez total da fórmula de Haversine contra `NaN`**, solicita-se o seguinte ajuste pontual de 2 linhas pelo Worker:

### Proposta de Correção para o Worker M2:

Em `artifacts/api-server/hr/timekeeping.mjs` (e sincronizar em `scripts/hr/timekeeping.mjs`):
1. **Linha 47:** Substituir `isNaN` por `!Number.isFinite`:
   ```javascript
   // ANTES:
   if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) {
     return Infinity;
   }

   // DEPOIS:
   if (!Number.isFinite(nLat1) || !Number.isFinite(nLon1) || !Number.isFinite(nLat2) || !Number.isFinite(nLon2)) {
     return Infinity;
   }
   ```
2. **Linha 64:** Adicionar clamp de segurança em `a`:
   ```javascript
   // ANTES:
   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

   // DEPOIS:
   const safeA = Math.min(1, Math.max(0, a));
   const c = 2 * Math.atan2(Math.sqrt(safeA), Math.sqrt(1 - safeA));
   ```
*(Opcional: aplicar o mesmo clamp na linha 368 de `compliance.mjs`)*.

---

## 5. Verification Method

Para reproduzir os testes adversariais executados por este Challenger:

1. **Executar o Harness de Estresse Adversarial**:
   ```powershell
   node .agents/teamwork/challenger_m2_1/stress_geofence.mjs
   ```
   *Resultado Atual:* 31 PASS, 2 FAIL (os 2 testes de antípodas/Infinity descritos acima).  
   *Resultado Esperado após o patch:* 33 PASS, 0 FAIL.

2. **Executar a Suíte Unitária do M2**:
   ```powershell
   node --test tests/hr-m2-timekeeping-compliance.test.mjs
   ```
   *Resultado:* 8 PASS, 0 FAIL.

3. **Verificar Paridade Twin-Server**:
   ```powershell
   node scripts/check-twin-parity.mjs
   ```
   *Resultado:* 32/32 PASS.
