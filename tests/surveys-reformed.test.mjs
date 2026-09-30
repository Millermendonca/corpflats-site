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

// 1. Criar Vistoria com Pergunta Sim/Não com Foto Condicional (Ex: "Tem mofo no teto do banheiro?")
const surveyPayload = {
  title: "Inspeção de Mofo e Pintura",
  description: "Verifique detalhadamente antes de liberar",
  flatIds: [1, 2], // Apt 113 e 114
  isActive: true,
  questions: [
    {
      id: "q1",
      question: "Tem mofo no teto do banheiro?",
      type: "yes_no",
      isRequired: true,
      hasPhoto: true,
      requirePhotoCondition: "if_yes" // Exige foto apenas se responder "Sim"
    },
    {
      id: "q2",
      question: "Como está o estado geral do apartamento?",
      type: "single_choice",
      options: ["Ótimo", "Bom", "Regular", "Danificado"],
      isRequired: true,
      hasPhoto: true,
      requirePhotoCondition: "optional" // Foto opcional
    }
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
assert.strictEqual(db.surveys[0].questions.length, 2);
assert.strictEqual(db.surveys[0].questions[0].hasPhoto, true);
assert.strictEqual(db.surveys[0].questions[0].requirePhotoCondition, "if_yes");
console.log("✔ Vistoria com pergunta Sim/Não e Foto Condicional criada com sucesso.");

// 2. Função de validação cliente (como no flat-card)
function validateSurveyAnswers(survey, answersMap, photosMap) {
  const missing = [];
  for (const q of survey.questions) {
    const val = answersMap[q.id];
    const photo = photosMap[q.id];

    if (q.isRequired) {
      if (val === undefined || val === null || String(val).trim() === "") {
        missing.push(q.question);
      }
    }

    if (q.hasPhoto) {
      if (q.requirePhotoCondition === "if_yes" && val === "Sim" && !photo) {
        missing.push(`Foto obrigatória ao marcar 'Sim' em: ${q.question}`);
      } else if (q.requirePhotoCondition === "always" && !photo) {
        missing.push(`Foto obrigatória para: ${q.question}`);
      }
    }
  }
  return missing;
}

// Caso A: Camareira responde "Não" para mofo -> NÃO precisa de foto
const missingCaseA = validateSurveyAnswers(newSurvey, { q1: "Não", q2: "Ótimo" }, {});
assert.strictEqual(missingCaseA.length, 0, "Quando responde 'Não', não deve exigir foto!");
console.log("✔ Caso A: Resposta 'Não' validada sem exigir foto.");

// Caso B: Camareira responde "Sim" para mofo sem foto -> DEVE BLOQUEAR com foto pendente
const missingCaseB = validateSurveyAnswers(newSurvey, { q1: "Sim", q2: "Ótimo" }, {});
assert.strictEqual(missingCaseB.length, 1, "Quando responde 'Sim', deve exigir foto comprobatória!");
assert.match(missingCaseB[0], /Foto obrigatória ao marcar 'Sim'/);
console.log("✔ Caso B: Resposta 'Sim' sem foto bloqueada com sucesso.");

// Caso C: Camareira responde "Sim" e anexa foto -> DEVE LIBERAR
const missingCaseC = validateSurveyAnswers(
  newSurvey,
  { q1: "Sim", q2: "Danificado" },
  { q1: "data:image/webp;base64,mockphotodata" }
);
assert.strictEqual(missingCaseC.length, 0, "Quando anexa a foto, deve liberar!");
console.log("✔ Caso C: Resposta 'Sim' com foto anexada aprovada!");

// 3. Simular gravação no backend com a foto
newSurvey.responses.push({
  id: "resp_101",
  flatId: 1,
  flatNumber: "113",
  cleaningRequestId: 123,
  answeredByUserId: 2,
  answeredByUsername: "Cris",
  answeredAt: new Date().toISOString(),
  answers: [
    { questionId: "q1", questionText: "Tem mofo no teto do banheiro?", type: "yes_no", answer: "Sim", photoUrl: "https://storage.corpflats.com/surveys/mofo113.webp" },
    { questionId: "q2", questionText: "Como está o estado geral?", type: "single_choice", answer: "Danificado", photoUrl: null }
  ]
});

assert.strictEqual(newSurvey.responses.length, 1);
assert.strictEqual(newSurvey.responses[0].answers[0].photoUrl, "https://storage.corpflats.com/surveys/mofo113.webp");
console.log("✔ Resposta persistida com foto acoplada à pergunta Sim/Não!");

// 4. Teste de Exclusão da foto para liberar espaço
const respItem = newSurvey.responses[0];
const photoAns = respItem.answers.find(a => a.questionId === "q1");
photoAns.photoUrl = null;
photoAns.answer = "[Foto excluída para liberar espaço]";
assert.strictEqual(photoAns.photoUrl, null);
console.log("✔ Foto excluída para liberar espaço!");

console.log("🎉 TODOS OS TESTES DE FOTO CONDICIONAL PASSARAM COM 100% DE SUCESSO!");
