import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  expandBrazilianPhoneVariants,
  buildGuestCallerIdContactData,
  buildGooglePersonPayload,
  areGuestNamesCompatible,
  mergeGuestRecords,
  syncSingleGuestToGoogleContacts
} from '../artifacts/api-server/demo-server.mjs';

describe('Adversarial Stress Test: Google Contacts Sync & Caller ID Isolation', () => {

  // All 67 official Brazilian Area Codes (DDDs)
  const ALL_BRAZILIAN_DDDS = [
    '11', '12', '13', '14', '15', '16', '17', '18', '19',
    '21', '22', '24', '27', '28',
    '31', '32', '33', '34', '35', '37', '38',
    '41', '42', '43', '44', '45', '46', '47', '48', '49',
    '51', '53', '54', '55',
    '61', '62', '63', '64', '65', '66', '67', '68', '69',
    '71', '73', '74', '75', '77', '79',
    '81', '82', '83', '84', '85', '86', '87', '88', '89',
    '91', '92', '93', '94', '95', '96', '97', '98', '99'
  ];

  describe('1. 8-digit suffix isolation across all 67 Brazilian DDDs', () => {
    it('1.1. Zero suffix collisions across all 2,211 pairwise combinations of DDDs with identical 8-digit local suffix', () => {
      const commonLocal8 = '76403551'; // Roselene's 8-digit suffix
      const dddVariants = new Map();

      for (const ddd of ALL_BRAZILIAN_DDDS) {
        const phone = `${ddd}9${commonLocal8}`;
        const res = expandBrazilianPhoneVariants([phone]);
        dddVariants.set(ddd, res.suffixKeys);

        // Every key must have at least 10 digits and strictly start with the DDD
        for (const key of res.suffixKeys) {
          assert.ok(key.length >= 10, `Key ${key} for DDD ${ddd} must have >= 10 digits`);
          assert.ok(key.startsWith(ddd), `Key ${key} must strictly start with DDD ${ddd}`);
          // Key must never be just the 8-digit suffix
          assert.notStrictEqual(key, commonLocal8, `Key must not be pure 8 digits`);
        }
      }

      // Exhaustive pairwise intersection check: 67 * 66 / 2 = 2,211 pairs
      let pairsChecked = 0;
      for (let i = 0; i < ALL_BRAZILIAN_DDDS.length; i++) {
        for (let j = i + 1; j < ALL_BRAZILIAN_DDDS.length; j++) {
          const dddA = ALL_BRAZILIAN_DDDS[i];
          const dddB = ALL_BRAZILIAN_DDDS[j];
          const keysA = dddVariants.get(dddA);
          const keysB = dddVariants.get(dddB);

          const collision = keysA.filter(k => keysB.includes(k));
          assert.strictEqual(
            collision.length,
            0,
            `Collision detected between DDD ${dddA} and DDD ${dddB}: ${collision.join(', ')}`
          );
          pairsChecked++;
        }
      }
      assert.strictEqual(pairsChecked, 2211, 'All 2,211 DDD pairs must be checked');
    });

    it('1.2. Landline numbers (8-digit local) never collide with mobile numbers across DDDs', () => {
      // Landline in DDD 21: (21) 3764-0355 vs Mobile in DDD 28: (28) 97640-3551
      const landlineRJ = expandBrazilianPhoneVariants(['2137640355']);
      const mobileES = expandBrazilianPhoneVariants(['28976403551']);
      const landlineES = expandBrazilianPhoneVariants(['2837640355']);

      const collision1 = landlineRJ.suffixKeys.filter(k => mobileES.suffixKeys.includes(k));
      assert.strictEqual(collision1.length, 0);

      const collision2 = landlineRJ.suffixKeys.filter(k => landlineES.suffixKeys.includes(k));
      assert.strictEqual(collision2.length, 0);

      // Landline RJ keys must start with 21
      for (const k of landlineRJ.suffixKeys) {
        assert.ok(k.startsWith('21'));
      }
    });

    it('1.3. Various raw phone formats (with +55, spaces, dashes, leading zero) normalize without DDD loss', () => {
      const inputsRJ = [
        '+55 (21) 97640-3551',
        '+5521976403551',
        '021976403551',
        '21976403551',
        '21 97640-3551'
      ];
      const inputsES = [
        '+55 (28) 97640-3551',
        '+5528976403551',
        '028976403551',
        '28976403551',
        '28 97640-3551'
      ];

      for (const rj of inputsRJ) {
        const resRJ = expandBrazilianPhoneVariants([rj]);
        for (const es of inputsES) {
          const resES = expandBrazilianPhoneVariants([es]);
          const overlap = resRJ.suffixKeys.filter(k => resES.suffixKeys.includes(k));
          assert.strictEqual(overlap.length, 0, `Format ${rj} vs ${es} caused overlap!`);
        }
      }
    });
  });

  describe('2. Companion phone leakage prevention in Caller ID payload', () => {
    it('2.1. Unconditional isolation: Multiple companions in reservation never leak into primary guest', () => {
      const mockDb = {
        guests: [
          {
            id: 1,
            fullName: 'Roselene da Silva',
            phone: '21976403551',
            additionalPhones: []
          },
          {
            id: 2,
            fullName: 'Raiza Castro Tavares',
            phone: '21988887777',
            additionalPhones: []
          }
        ],
        reservations: [
          {
            id: 1001,
            code: 'RES-001',
            guestId: 1,
            guestName: 'Roselene da Silva',
            guestPhone: '21976403551',
            status: 'hospedado',
            flatNumber: '302',
            guests: [
              { index: 1, name: 'Roselene da Silva', phone: '21976403551' },
              { index: 2, name: 'Raiza Castro Tavares', phone: '21988887777' }, // Hostile companion
              { index: 3, name: 'Companheiro Desconhecido', phone: '21999991111' },
              { index: 4, name: 'Roselene Junior', phone: '21966662222' }
            ]
          }
        ]
      };

      const contactData = buildGuestCallerIdContactData(mockDb, mockDb.guests[0]);

      // Assert primary phone is present
      assert.strictEqual(contactData.e164Phone, '+5521976403551');

      // Assert companion phones NEVER appear in phoneVariants or notes
      const variants = contactData.phoneVariants;
      assert.ok(!variants.some(v => v.includes('988887777')), 'Raiza phone must not appear');
      assert.ok(!variants.some(v => v.includes('999991111')), 'Unknown companion phone must not appear');
      assert.ok(!variants.some(v => v.includes('966662222')), 'Similar name companion phone must not appear');

      // Check notesLines
      assert.ok(!contactData.notesText.includes('988887777'));
      assert.ok(!contactData.notesText.includes('999991111'));
      assert.ok(!contactData.notesText.includes('966662222'));
    });

    it('2.2. Rejection of reservation phone when reservation titular is incompatible with guest', () => {
      const mockDb = {
        guests: [
          {
            id: 359,
            fullName: 'Fabiana de Souza',
            phone: '28999136926',
            additionalPhones: []
          }
        ],
        reservations: [
          {
            id: 2002,
            code: 'RES-002',
            guestId: 359, // Erroneously mapped guestId
            guestName: 'João Eduardo Leal Correa', // Incompatible name!
            guestPhone: '28999887766',
            status: 'hospedado'
          }
        ]
      };

      const contactData = buildGuestCallerIdContactData(mockDb, mockDb.guests[0]);
      assert.strictEqual(contactData.fullName, 'Fabiana de Souza');
      assert.ok(!contactData.phoneVariants.some(v => v.includes('999887766')));
      assert.ok(!contactData.displayName.includes('João Eduardo'));
    });

    it('2.3. Filtering of contaminated additionalPhones when phone is registered to another guest', () => {
      const mockDb = {
        guests: [
          {
            id: 10,
            fullName: 'Francine Castro Silva',
            phone: '22991110001',
            additionalPhones: [
              '22992220002', // Clean additional phone
              '28999136926'  // Contaminated: belongs to Fabiana (ID 359)!
            ]
          },
          {
            id: 359,
            fullName: 'Fabiana de Souza',
            phone: '28999136926',
            additionalPhones: []
          }
        ],
        reservations: []
      };

      const contactData = buildGuestCallerIdContactData(mockDb, mockDb.guests[0]);
      // Fabiana's phone must be excluded from Francine's variants
      assert.ok(
        !contactData.phoneVariants.some(v => v.includes('999136926')),
        'Contaminated additional phone belonging to Fabiana must be excluded from Francine'
      );
      // Clean phone must be included
      assert.ok(
        contactData.phoneVariants.some(v => v.includes('992220002')),
        'Clean additional phone must be retained'
      );
    });

    it('2.4. Primary guest with empty phone produces empty e164Phone without leaking companions', () => {
      const mockDb = {
        guests: [
          {
            id: 50,
            fullName: 'Hóspede Sem Telefone',
            phone: '',
            additionalPhones: []
          }
        ],
        reservations: [
          {
            id: 3003,
            guestId: 50,
            guestName: 'Hóspede Sem Telefone',
            guestPhone: '',
            guests: [
              { index: 1, name: 'Hóspede Sem Telefone', phone: '' },
              { index: 2, name: 'Acompanhante Intruso', phone: '21999998888' }
            ]
          }
        ]
      };

      const contactData = buildGuestCallerIdContactData(mockDb, mockDb.guests[0]);
      assert.strictEqual(contactData.e164Phone, '');
      assert.strictEqual(contactData.phoneVariants.length, 0);
      assert.strictEqual(contactData.e164Phones.length, 0);
    });
  });

  describe('3. Google Contact Overwrite & Hijack Guards (Single Sync)', () => {
    // Preserve global fetch
    const originalFetch = global.fetch;

    it('3.1. Name conflict on existing resourceName: blocks PATCH, clears stale link, and invokes createContact', async () => {
      const calls = [];
      global.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), method: options.method || 'GET', body: options.body });

        if (url.includes('oauth2.googleapis.com/token')) {
          return { ok: true, json: async () => ({ access_token: 'fake-token', expires_in: 3600 }) };
        }
        if (url.includes('people/c5362578501072660427')) {
          // Returning João Eduardo contact
          return {
            ok: true,
            status: 200,
            json: async () => ({
              resourceName: 'people/c5362578501072660427',
              etag: 'etag-joao-123',
              names: [{ displayName: 'João Eduardo Leal Correa' }],
              userDefined: [{ key: 'CRM_ID', value: '20' }]
            })
          };
        }
        if (url.includes('people:createContact')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              resourceName: 'people/c_isolated_fabiana_999',
              etag: 'etag-fabiana-new'
            })
          };
        }
        return { ok: false, status: 404, text: async () => 'Not found' };
      };

      try {
        const mockDb = {
          googleContactsConfig: {
            enabled: true,
            accessToken: 'valid-mock-token',
            syncLogs: []
          },
          guests: [
            {
              id: 359,
              fullName: 'Fabiana de Souza',
              phone: '28999136926',
              googleContactResourceName: 'people/c5362578501072660427', // Stale link to João
              googleContactDisplayName: 'João Eduardo Leal Correa • CorpFlats'
            }
          ]
        };

        const guest = mockDb.guests[0];
        const result = await syncSingleGuestToGoogleContacts(mockDb, guest, { skipSave: true });

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.action, 'created', 'Must create a new isolated contact rather than updating João');
        assert.strictEqual(guest.googleContactResourceName, 'people/c_isolated_fabiana_999');

        // Verify that NO PATCH request was sent to update João's contact
        const patchCalls = calls.filter(c => c.method === 'PATCH');
        assert.strictEqual(patchCalls.length, 0, 'No PATCH request must be made to overwrite third-party contact');

        // Verify that POST createContact was called with Fabiana's payload
        const createCall = calls.find(c => c.url.includes('people:createContact'));
        assert.ok(createCall, 'Must call createContact');
        const parsedBody = JSON.parse(createCall.body);
        assert.ok(parsedBody.names[0].givenName.includes('Fabiana'));
        assert.ok(parsedBody.phoneNumbers.some(p => p.value.includes('28999136926')));
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('3.2. CRM_ID mismatch on existing resourceName: blocks PATCH and creates isolated contact', async () => {
      const calls = [];
      global.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), method: options.method || 'GET', body: options.body });

        if (url.includes('people/c8888')) {
          // Name is compatible, but CRM_ID belongs to Guest 77, not Guest 99
          return {
            ok: true,
            status: 200,
            json: async () => ({
              resourceName: 'people/c8888',
              etag: 'etag-8888',
              names: [{ displayName: 'Roberto Silva' }],
              userDefined: [{ key: 'CRM_ID', value: '77' }] // Mismatched CRM_ID
            })
          };
        }
        if (url.includes('people:createContact')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              resourceName: 'people/c_isolated_roberto_99',
              etag: 'etag-roberto-99'
            })
          };
        }
        return { ok: false, status: 404, text: async () => 'Not found' };
      };

      try {
        const mockDb = {
          googleContactsConfig: {
            enabled: true,
            accessToken: 'valid-mock-token',
            syncLogs: []
          },
          guests: [
            {
              id: 99,
              fullName: 'Roberto Silva',
              phone: '21998765432',
              googleContactResourceName: 'people/c8888',
              googleContactDisplayName: 'Roberto Silva • CorpFlats'
            }
          ]
        };

        const guest = mockDb.guests[0];
        const result = await syncSingleGuestToGoogleContacts(mockDb, guest, { skipSave: true });

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.action, 'created');
        assert.strictEqual(guest.googleContactResourceName, 'people/c_isolated_roberto_99');

        const patchCalls = calls.filter(c => c.method === 'PATCH');
        assert.strictEqual(patchCalls.length, 0, 'PATCH must be strictly blocked due to CRM_ID mismatch');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('3.3. searchContacts returning third-party contact with incompatible name is rejected', async () => {
      const calls = [];
      global.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), method: options.method || 'GET', body: options.body });

        if (url.includes('people:searchContacts')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  person: {
                    resourceName: 'people/c_raiza_123',
                    etag: 'etag-raiza',
                    names: [{ displayName: 'Raiza Castro Tavares' }], // Incompatible name!
                    phoneNumbers: [{ value: '+5521976403551' }]
                  }
                }
              ]
            })
          };
        }
        if (url.includes('people:createContact')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              resourceName: 'people/c_isolated_roselene_456',
              etag: 'etag-roselene'
            })
          };
        }
        return { ok: false, status: 404, text: async () => 'Not found' };
      };

      try {
        const mockDb = {
          googleContactsConfig: {
            enabled: true,
            accessToken: 'valid-mock-token',
            syncLogs: []
          },
          guests: [
            {
              id: 1,
              fullName: 'Roselene da Silva',
              phone: '21976403551',
              googleContactResourceName: null,
              googleContactDisplayName: null
            }
          ]
        };

        const guest = mockDb.guests[0];
        const result = await syncSingleGuestToGoogleContacts(mockDb, guest, { skipSave: true });

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.action, 'created');
        assert.strictEqual(guest.googleContactResourceName, 'people/c_isolated_roselene_456');

        // Verify that Raiza's contact was NOT adopted or patched
        assert.ok(!calls.some(c => c.url.includes('people/c_raiza_123')));
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('4. areGuestNamesCompatible robustness against adversary attacks', () => {
    it('4.1. Rejects prefix and sound-alike name confusions', () => {
      assert.strictEqual(areGuestNamesCompatible('Fabiano Alvarenga', 'Fabiana Alvarenga'), false);
      assert.strictEqual(areGuestNamesCompatible('Gabriel Santos', 'Gabriela Santos'), false);
      assert.strictEqual(areGuestNamesCompatible('Daniel Moreira', 'Daniela Moreira'), false);
      assert.strictEqual(areGuestNamesCompatible('Marcelo Souza', 'Marcela Souza'), false);
      assert.strictEqual(areGuestNamesCompatible('Paulo Mendes', 'Paula Mendes'), false);
    });

    it('4.2. Rejects completely distinct people with identical first names', () => {
      assert.strictEqual(areGuestNamesCompatible('Leonardo Portugal', 'Leonardo Rodrigues'), false);
      assert.strictEqual(areGuestNamesCompatible('Carlos Drummond', 'Carlos Eduardo Silva'), false);
      assert.strictEqual(areGuestNamesCompatible('Rodrigo Faro', 'Rodrigo Santoro'), false);
      assert.strictEqual(areGuestNamesCompatible('Fernanda Montenegro', 'Fernanda Lima'), false);
    });

    it('4.3. Rejects system roles, departments and service orders', () => {
      const systemNames = [
        'Ordem de Serviço',
        'OS #452 Manutenção Ar',
        'Governança',
        'Camareira Cris',
        'Recepção CorpFlats',
        'Limpeza Flat 204',
        'Café da Manhã'
      ];
      for (const sys of systemNames) {
        assert.strictEqual(
          areGuestNamesCompatible(sys, 'Roselene da Silva'),
          false,
          `System name "${sys}" must be rejected`
        );
      }
    });
  });

  it('5. Clean process termination after stress suite', () => {
    setTimeout(() => { process.exit(0); }, 50);
  });
});
