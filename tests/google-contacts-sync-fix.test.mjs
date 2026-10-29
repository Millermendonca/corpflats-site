import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  expandBrazilianPhoneVariants,
  buildGuestCallerIdContactData,
  buildGooglePersonPayload,
  areGuestNamesCompatible,
  mergeGuestRecords,
  reconcileAndMergeGuests,
  executeFullGoogleContactsSyncAndRepair
} from '../artifacts/api-server/demo-server.mjs';

describe('Google Contacts Sync & Caller ID Hardening', () => {
  const rootDir = process.cwd();
  const primaryServerPath = path.join(rootDir, 'artifacts', 'api-server', 'demo-server.mjs');
  const mirrorServerPath = path.join(rootDir, 'scripts', 'demo-server.mjs');

  it('1. Paridade estrita byte-a-byte entre artifacts/api-server/demo-server.mjs e scripts/demo-server.mjs', () => {
    const fileA = fs.readFileSync(primaryServerPath);
    const fileB = fs.readFileSync(mirrorServerPath);
    assert.strictEqual(fileA.equals(fileB), true, 'demo-server.mjs nos dois diretórios devem ter hash SHA-256 e bytes idênticos');
  });

  it('2. expandBrazilianPhoneVariants: Não colide sufixos de DDDs diferentes (DDD 21 vs DDD 28)', () => {
    const phoneRJ = '21976403551';
    const phoneES = '28976403551';

    const expandedRJ = expandBrazilianPhoneVariants([phoneRJ]);
    const expandedES = expandBrazilianPhoneVariants([phoneES]);

    // As chaves de sufixo não podem ter 8 dígitos puros sem o DDD
    for (const key of expandedRJ.suffixKeys) {
      assert.ok(key.length >= 10, `Chave ${key} do RJ deve incluir o DDD e ter no mínimo 10 dígitos`);
      assert.ok(key.startsWith('21'), `Chave ${key} do RJ deve iniciar com DDD 21`);
    }

    for (const key of expandedES.suffixKeys) {
      assert.ok(key.length >= 10, `Chave ${key} do ES deve incluir o DDD e ter no mínimo 10 dígitos`);
      assert.ok(key.startsWith('28'), `Chave ${key} do ES deve iniciar com DDD 28`);
    }

    // Interseção entre sufixos deve ser rigorosamente vazia
    const intersection = expandedRJ.suffixKeys.filter(k => expandedES.suffixKeys.includes(k));
    assert.strictEqual(intersection.length, 0, 'Telefones com mesmo número local mas DDDs diferentes não podem compartilhar chaves');
  });

  it('3. areGuestNamesCompatible: Diferencia hóspedes com mesmo primeiro nome e rejeita ordens de serviço', () => {
    // Nomes com mesmo primeiro nome mas sobrenomes totalmente distintos não podem ser compatíveis
    assert.strictEqual(
      areGuestNamesCompatible('Leonardo Portugal', 'Leonardo da Silva Rodrigues'),
      false,
      'Leonardo Portugal e Leonardo da Silva Rodrigues não devem ser compatíveis'
    );
    assert.strictEqual(
      areGuestNamesCompatible('Fabiana', 'João Eduardo Leal Correa'),
      false,
      'Fabiana e João Eduardo não devem ser compatíveis'
    );

    // Sistema / Ordens de serviço nunca são compatíveis com hóspedes humanos
    assert.strictEqual(
      areGuestNamesCompatible('Ordem de Servico #123', 'Miller Mendonça'),
      false,
      'Ordem de serviço não pode ser compatível com hóspede humano'
    );
    assert.strictEqual(
      areGuestNamesCompatible('Governanca', 'Leonardo Portugal'),
      false,
      'Governança não pode ser compatível com hóspede humano'
    );

    // Variações legítimas com conectivos ou sobrenome composto são compatíveis
    assert.strictEqual(
      areGuestNamesCompatible('Francine Castro Silva', 'Francine Dias de Castro e Silva'),
      true,
      'Variações legítimas de nomes com mesmo sobrenome devem ser compatíveis'
    );

    // strictSingleToken rejeita match se um dos dois for apenas o primeiro nome
    assert.strictEqual(
      areGuestNamesCompatible('Leonardo', 'Leonardo Portugal', { strictSingleToken: true }),
      false,
      'strictSingleToken deve rejeitar match entre token único e nome completo'
    );
  });

  it('4. buildGuestCallerIdContactData: Não contamina Caller ID com telefones de acompanhantes', () => {
    const mockDb = {
      guests: [
        {
          id: 101,
          fullName: 'Carlos Alberto Santos',
          phone: '21999990001',
          additionalPhones: []
        },
        {
          id: 102,
          fullName: 'Mariana Lima',
          phone: '21988880002',
          additionalPhones: []
        }
      ],
      reservations: [
        {
          id: 901,
          code: 'RES-101-0901',
          guestId: 101,
          guestName: 'Carlos Alberto Santos',
          guestPhone: '21999990001',
          flatNumber: '402',
          status: 'hospedado',
          guests: [
            { index: 1, name: 'Carlos Alberto Santos', phone: '21999990001' },
            { index: 2, name: 'Mariana Lima', phone: '21988880002' } // Acompanhante
          ]
        }
      ]
    };

    const contactData = buildGuestCallerIdContactData(mockDb, mockDb.guests[0]);

    // O telefone principal de Carlos deve estar presente
    assert.ok(contactData.e164Phone.includes('21999990001'));

    // O telefone da acompanhante Mariana (21988880002) NÃO PODE constar nas variantes de Carlos
    const variantsText = contactData.phoneVariants.join(' ');
    assert.ok(
      !variantsText.includes('988880002'),
      'O Caller ID do hóspede titular NÃO pode conter o telefone da acompanhante'
    );
  });

  it('5. buildGuestCallerIdContactData: Rejeita telefone de reserva se o titular da reserva for incompatível', () => {
    const mockDb = {
      guests: [
        {
          id: 201,
          fullName: 'Roberto Albuquerque',
          phone: '22997771111'
        }
      ],
      reservations: [
        {
          id: 902,
          code: 'RES-201-0902',
          guestId: 201, // ID falsamente vinculado
          guestName: 'Outra Pessoa Estranha',
          guestPhone: '22998882222',
          flatNumber: '305',
          status: 'confirmada'
        }
      ]
    };

    const contactData = buildGuestCallerIdContactData(mockDb, mockDb.guests[0]);

    // Não deve conter o telefone da pessoa com nome incompatível
    const variantsText = contactData.phoneVariants.join(' ');
    assert.ok(
      !variantsText.includes('998882222'),
      'Não deve incorporar telefone de reserva cujo guestName seja incompatível com o hóspede'
    );
  });

  it('6. buildGooglePersonPayload: Constrói payload seguro com CRM_ID e campos estruturados', () => {
    const mockDb = {
      guests: [
        {
          id: 77,
          guestCode: 'HOSP-00077',
          fullName: 'Beatriz Vasconcelos',
          phone: '21991234567',
          email: 'beatriz@example.com',
          companyName: 'Petrobras',
          document: '12345678909',
          docType: 'CPF',
          birthDate: '1985-04-12'
        }
      ],
      reservations: [
        {
          id: 501,
          code: 'RES-601-0501',
          guestId: 77,
          guestName: 'Beatriz Vasconcelos',
          guestPhone: '21991234567',
          flatNumber: '601',
          status: 'hospedado'
        }
      ]
    };

    const contactData = buildGuestCallerIdContactData(mockDb, mockDb.guests[0]);
    const payload = buildGooglePersonPayload(contactData, 77);

    assert.strictEqual(payload.names[0].givenName, 'Beatriz Vasconcelos • Petrobras [UH 601]');
    assert.strictEqual(payload.names[0].unstructuredName, 'Beatriz Vasconcelos • Petrobras [UH 601]');
    assert.strictEqual(payload.phoneNumbers[0].value, '+5521991234567');
    assert.strictEqual(payload.phoneNumbers[0].type, 'mobile');
    assert.strictEqual(payload.emailAddresses[0].value, 'beatriz@example.com');
    assert.strictEqual(payload.organizations[0].name, 'Petrobras • CorpFlats');

    // Valida CRM_ID nas chaves userDefined
    const crmIdEntry = (payload.userDefined || []).find(ud => ud.key === 'CRM_ID');
    assert.ok(crmIdEntry, 'Payload deve incluir CRM_ID no userDefined');
    assert.strictEqual(crmIdEntry.value, '77');
  });

  it('7. mergeGuestRecords: Não transfere telefone para additionalPhones se pertencer a outro hóspede distinto', () => {
    const mockDb = {
      guests: [
        {
          id: 50,
          fullName: 'Alice Fernandes',
          phone: '22991112233',
          additionalPhones: []
        },
        {
          id: 51,
          fullName: 'Bruno Martins',
          phone: '22994445566',
          additionalPhones: []
        }
      ]
    };

    const target = { ...mockDb.guests[0] };
    const source = {
      name: 'Alice Fernandes',
      phone: '22994445566' // Telefone de Bruno Martins!
    };

    mergeGuestRecords(target, source, mockDb);

    // O telefone de Bruno não pode ter entrado em target.additionalPhones
    assert.ok(
      !target.additionalPhones.some(p => p.includes('994445566')),
      'Telefone pertencente a outro hóspede conhecido não pode ser injetado em additionalPhones'
    );
  });

  it('8. reconcileAndMergeGuests: Desmembra Guest 143 (Roselene) quando sobrescrita por Raiza Castro Tavares no PostgreSQL', () => {
    const mockPgDb = {
      guests: [
        {
          id: 143,
          name: 'Raiza Castro Tavares',
          fullName: 'Raiza Castro Tavares',
          phone: '21997598289',
          additionalPhones: ['21976403551'],
          googleContactResourceName: 'people/c_corpflats_guest_143'
        },
        {
          id: 203,
          name: 'Sintia',
          fullName: 'Sintia',
          phone: '21997598289',
          additionalPhones: []
        }
      ],
      reservations: [
        {
          id: 12,
          code: 'RES-712-0012',
          guestId: 143,
          guestName: 'Roselene',
          guestPhone: '21997598289',
          flatNumber: '712',
          status: 'hospedado'
        },
        {
          id: 999,
          code: 'RES-712-0999',
          guestId: 143,
          guestName: 'Raiza Castro Tavares',
          guestPhone: '21976403551',
          flatNumber: '712',
          status: 'confirmada'
        }
      ],
      whatsappConversations: []
    };

    reconcileAndMergeGuests(mockPgDb);

    const g143 = mockPgDb.guests.find(g => Number(g.id) === 143);
    assert.ok(g143, 'Guest 143 deve existir');
    assert.strictEqual(g143.name, 'Roselene', 'Guest 143 deve ser restaurada para Roselene');
    assert.strictEqual(g143.phone, '21976403551', 'Guest 143 deve ter exclusivamente o telefone 21976403551');
    assert.deepStrictEqual(g143.additionalPhones, [], 'Guest 143 não deve ter telefones adicionais de terceiros');
    assert.strictEqual(g143.googleContactResourceName, null, 'IDs sintéticos c_corpflats_guest_* devem ser removidos');

    const raiza = mockPgDb.guests.find(g => g.name === 'Raiza Castro Tavares');
    assert.ok(raiza, 'Raiza Castro Tavares deve ser separada em seu próprio cadastro');
    assert.notStrictEqual(Number(raiza.id), 143, 'Raiza não pode ocupar o ID 143 da Roselene');
    assert.ok(!String(raiza.phone || '').includes('76403551'), 'Raiza não pode reter o telefone 21976403551 da Roselene');
  });

  it('9. executeFullGoogleContactsSyncAndRepair: Renomeia e descontamina contatos corrompidos no Google Contatos (Raiza->Roselene, João Eduardo/Fabiana)', async () => {
    const mockDb = {
      googleContactsConfig: {
        enabled: true,
        accessToken: 'valid-test-token',
        tokenExpiresAt: Date.now() + 3600000,
        syncLogs: []
      },
      guests: [
        {
          id: 20,
          name: 'João Eduardo Leal Correa',
          fullName: 'João Eduardo Leal Correa',
          phone: '22999554855',
          additionalPhones: [],
          googleContactResourceName: 'people/c5362578501072660427'
        },
        {
          id: 359,
          name: 'Fabiana',
          fullName: 'Fabiana',
          phone: '28999136926',
          additionalPhones: []
        },
        {
          id: 143,
          name: 'Roselene',
          fullName: 'Roselene',
          phone: '21976403551',
          additionalPhones: []
        }
      ],
      reservations: [
        {
          id: 539,
          code: 'RES-509-0539',
          guestId: 359,
          guestName: 'Fabiana',
          guestPhone: '28999136926',
          flatNumber: '509',
          status: 'hospedado'
        },
        {
          id: 12,
          code: 'RES-712-0012',
          guestId: 143,
          guestName: 'Roselene',
          guestPhone: '21976403551',
          flatNumber: '712',
          status: 'hospedado'
        }
      ]
    };

    const originalFetch = global.fetch;
    const batchUpdatesReceived = [];
    const batchCreatesReceived = [];

    global.fetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.includes('people/me/connections')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            connections: [
              {
                resourceName: 'people/c_raiza_corrupted',
                etag: 'etag-raiza',
                names: [{ displayName: 'Raiza Castro Tavares • CorpFlats [UH 712]' }],
                phoneNumbers: [
                  { value: '+5521976403551' },
                  { value: '+5521997598289' }
                ],
                userDefined: [{ key: 'CRM_ID', value: '143' }]
              },
              {
                resourceName: 'people/c5362578501072660427',
                etag: 'etag-joao',
                names: [{ displayName: 'João Eduardo Leal Correa • CorpFlats [UH 509]' }],
                phoneNumbers: [
                  { value: '+5528999136926' }
                ],
                userDefined: [{ key: 'CRM_ID', value: '359' }]
              }
            ]
          })
        };
      }
      if (u.includes('people:batchUpdateContacts')) {
        const body = JSON.parse(opts.body);
        batchUpdatesReceived.push(body);
        const updateResult = {};
        for (const rn of Object.keys(body.contacts || {})) {
          updateResult[rn] = {
            httpStatusCode: 200,
            person: { resourceName: rn, etag: 'etag-updated' }
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ updateResult })
        };
      }
      if (u.includes('people:batchCreateContacts')) {
        const body = JSON.parse(opts.body);
        batchCreatesReceived.push(body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            createdPeople: (body.contacts || []).map((_, idx) => ({
              person: { resourceName: `people/c_new_${idx}`, etag: 'etag-new' }
            }))
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    try {
      const result = await executeFullGoogleContactsSyncAndRepair(mockDb);
      assert.strictEqual(result.success, true, 'Sincronização e reparo devem ter sucesso');
      assert.strictEqual(batchUpdatesReceived.length, 1, 'Deve enviar lote de atualização');

      const updatedContacts = batchUpdatesReceived[0].contacts;
      // 1. O contato people/c_raiza_corrupted deve ter sido atualizado in-place para Roselene com apenas o telefone 21976403551
      const roseleneContact = updatedContacts['people/c_raiza_corrupted'];
      assert.ok(roseleneContact, 'Contato corrompido como Raiza deve ser atualizado in-place para Roselene');
      assert.ok(roseleneContact.names[0].givenName.startsWith('Roselene •'), 'Nome no Google deve passar a ser Roselene');
      assert.ok(roseleneContact.phoneNumbers.every(pn => pn.value.replace(/\D/g, '').includes('76403551')), 'Apenas o telefone de Roselene deve permanecer');
      assert.ok(!roseleneContact.phoneNumbers.some(pn => pn.value.replace(/\D/g, '').includes('97598289')), 'Telefone de Sintia deve ter sido expurgado');

      // 2. O contato people/c5362578501072660427 deve ter sido restaurado para João Eduardo sem o telefone da Fabiana
      const joaoContact = updatedContacts['people/c5362578501072660427'];
      assert.ok(joaoContact, 'Contato de João Eduardo deve ser atualizado');
      assert.ok(joaoContact.names[0].givenName.startsWith('João Eduardo Leal Correa •'), 'Nome deve ser João Eduardo Leal Correa');
      assert.ok(joaoContact.phoneNumbers.every(pn => pn.value.replace(/\D/g, '').includes('99554855')), 'Apenas o telefone de João Eduardo deve permanecer');
      assert.ok(!joaoContact.phoneNumbers.some(pn => pn.value.replace(/\D/g, '').includes('99136926')), 'Telefone da Fabiana deve ter sido removido de João Eduardo');

      // 3. Fabiana deve ter seu próprio contato criado com 28999136926
      assert.strictEqual(batchCreatesReceived.length, 1, 'Deve criar o contato dedicado da Fabiana');
      const fabianaContact = batchCreatesReceived[0].contacts[0].contactPerson;
      assert.ok(fabianaContact.names[0].givenName.startsWith('Fabiana •'), 'Contato criado deve ser da Fabiana');
      assert.ok(fabianaContact.phoneNumbers.every(pn => pn.value.replace(/\D/g, '').includes('99136926')), 'Contato da Fabiana deve ter apenas 28999136926');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('10. Limpeza de processo pós-testes', () => {
    setTimeout(() => { process.exit(0); }, 50);
  });
});
