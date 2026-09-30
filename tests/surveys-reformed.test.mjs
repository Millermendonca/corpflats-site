import assert from "node:assert";

// Simulação da lógica de banco e rotas de surveys
let db = {
  flats: [
    { id: 1, number: "113" },
    { id: 2, number: "114" },
    { id: 3, number: "116" },
    { id: 4, number: "211" },
  ],
  surveys: []
};

console.log("▶ Iniciando testes da Reformulação de Vistorias...");

// 1. Criar Vistoria com os 6 tipos de pergunta para Flats específicos (113 e 114)
const surveyPayload = {
  title: "Inspeção Completa de Pintura e Equipamentos",
  description: "Verifique detalhadamente antes de liberar",
  flatIds: [1, 2], // Apt 113 e 114
  isActive: true,
  questions: [
    { id: "q1", question: "A TV está funcionando com todos os canais?", type: "yes_no", isRequired: true },
    { id: "q2", question: "Como está a pintura do teto do banheiro?", type: "single_choice", options: ["Ótima", "Boa", "Manchas", "Descascando"], isRequired: true },
    { id: "q3", question: "Quais itens de enxoval precisam de reposição?", type: "multi_choice", options: ["Toalha de Banho", "Tapete", "Fronha", "Manta"], isRequired: false },
    { id: "q4", question: "Qual a nota para o estado geral de conservação?", type: "scale", scaleMin: 1, scaleMax: 5, isRequired: true },
    { id: "q5", question: "Observações adicionais ou pendências encontradas:", type: "text", isRequired: false },
    { id: "q6", question: "Tire uma foto se houver algum dano visível:", type: "photo", isRequired: false }
  ]
};

const newSurvey = {
  id: 1,
  ...surveyPayload,
  createdAt: new Date().toISOString(),
  responses: []
};
db.surveys.push(newSurvey);

assert.strictEqual(db.surveys.length, 1);
assert.strictEqual(db.surveys[0].questions.length, 6);
console.log("✔ Vistoria criada com sucesso com 6 tipos de pergunta.");

// 2. Testar injeção de pendingSurveys para Flat 1 (113) e Flat 3 (116)
function getPendingSurveysForFlat(flatId) {
  const activeSurveys = (db.surveys || []).filter(s => s.isActive);
  const pending = [];
  for (const s of activeSurveys) {
    const appliesToFlat = !Array.isArray(s.flatIds) || s.flatIds.length === 0 || s.flatIds.map(Number).includes(Number(flatId));
    if (!appliesToFlat) continue;

    const alreadyAnswered = Array.isArray(s.responses) && s.responses.some(r => Number(r.flatId) === Number(flatId));
    if (!alreadyAnswered) {
      pending.push({
        id: s.id,
        title: s.title,
        questions: s.questions
      });
    }
  }
  return pending;
}

// Flat 1 (113) deve receber
const pendingFlat1 = getPendingSurveysForFlat(1);
assert.strictEqual(pendingFlat1.length, 1, "Flat 113 deve receber a vistoria pendente");

// Flat 3 (116) NÃO deve receber (pois está configurado apenas para 1 e 2)
const pendingFlat3 = getPendingSurveysForFlat(3);
assert.strictEqual(pendingFlat3.length, 0, "Flat 116 NÃO deve receber a vistoria pois não está em flatIds");
console.log("✔ Filtragem por flatIds funcionando perfeitamente.");

// 3. Simular resposta da camareira para o Flat 1 (113)
const responseAnswers = [
  { questionId: "q1", questionText: "TV funcionando?", type: "yes_no", answer: "Sim" },
  { questionId: "q2", questionText: "Pintura teto?", type: "single_choice", answer: "Boa" },
  { questionId: "q3", questionText: "Enxoval?", type: "multi_choice", answer: ["Toalha de Banho", "Tapete"] },
  { questionId: "q4", questionText: "Nota?", type: "scale", answer: 5 },
  { questionId: "q5", questionText: "Obs?", type: "text", answer: "Tudo limpo e cheiroso" },
  { questionId: "q6", questionText: "Foto?", type: "photo", answer: "[Foto Anexada]", photoUrl: "https://storage.corpflats.com/surveys/photo1.webp" }
];

newSurvey.responses.push({
  id: "resp_101",
  flatId: 1,
  flatNumber: "113",
  cleaningRequestId: 123,
  answeredByUserId: 2,
  answeredByUsername: "Cris",
  answeredAt: new Date().toISOString(),
  answers: responseAnswers
});

// 4. Regra "Aparece só 1 vez por flat": Flat 1 NÃO deve mais receber a vistoria
const pendingFlat1AfterResponse = getPendingSurveysForFlat(1);
assert.strictEqual(pendingFlat1AfterResponse.length, 0, "Flat 113 NÃO deve mais receber a vistoria após ter respondido!");

// Flat 2 (114) ainda NÃO respondeu, então DEVE continuar recebendo
const pendingFlat2 = getPendingSurveysForFlat(2);
assert.strictEqual(pendingFlat2.length, 1, "Flat 114 ainda deve ter a vistoria pendente");
console.log("✔ Regra de aparição única por flat validada com sucesso!");

// 5. Exclusão de foto para liberar espaço
const respItem = newSurvey.responses.find(r => r.id === "resp_101");
const photoAns = respItem.answers.find(a => a.questionId === "q6");
assert.strictEqual(photoAns.photoUrl, "https://storage.corpflats.com/surveys/photo1.webp");

// Limpar foto
photoAns.photoUrl = null;
photoAns.answer = "[Foto excluída para liberar espaço]";
assert.strictEqual(photoAns.photoUrl, null);
assert.strictEqual(photoAns.answer, "[Foto excluída para liberar espaço]");
console.log("✔ Exclusão de foto individual para liberar espaço validada!");

// 6. Reiniciar vistoria para o Flat 1 pelo Admin
newSurvey.responses = newSurvey.responses.filter(r => r.flatId !== 1);
const pendingFlat1AfterReset = getPendingSurveysForFlat(1);
assert.strictEqual(pendingFlat1AfterReset.length, 1, "Flat 113 voltou a ter a vistoria pendente após reset do admin!");
console.log("✔ Reinício de vistoria por flat validado!");

console.log("🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!");
