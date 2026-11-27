// deno test --allow-env supabase/functions/_shared/azul-page.test.ts
// Con AZUL_AUTH_KEY = llave de PRUEBAS de Azul (no está en el repo) verifica una
// respuesta REAL del ambiente de pruebas (25-nov-2026, AzulOrderId 44958409) y
// que cualquier alteración se rechaza.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildSaleFields, fixedString, verifyResponse } from './azul-page.ts';

const KEY = Deno.env.get('AZUL_AUTH_KEY') || '';

// Querystring que Azul mandó a ApprovedUrl (la tarjeta viene enmascarada por Azul).
const REAL = {
  OrderNumber: 'PT1795602819850', Amount: '1000', Itbis: '153', AuthorizationCode: 'OK9790',
  DateTime: '20261125063432', ResponseCode: 'ISO8583', IsoCode: '00', ResponseMessage: 'APROBADA',
  ErrorDescription: '', RRN: '2026112506343444958409',
  AuthHash: '84c5cf8d7f2e6f66a9830236b306b7ab4e91b8e74bae5d201adaff93918bae3eb89f72129bd33465082ab6ac309324d1e26ac56401ee50f0852d869a4a917652',
  CardNumber: '60110009****9818', AzulOrderId: '44958409',
};

Deno.test('fixedString: centavos sin punto', () => {
  assertEquals(fixedString(150), '15000');
  assertEquals(fixedString(17483.21), '1748321');
  assertEquals(fixedString(1.18), '118');
  assertEquals(fixedString(0), '000');
});

Deno.test({ name: 'respuesta real de Azul: firma válida', ignore: !KEY, fn: async () => {
  assertEquals(await verifyResponse(REAL, KEY), true);
} });

Deno.test({ name: 'respuesta alterada: se rechaza', ignore: !KEY, fn: async () => {
  assertEquals(await verifyResponse({ ...REAL, Amount: '100' }, KEY), false);
  assertEquals(await verifyResponse({ ...REAL, OrderNumber: 'OTRA' }, KEY), false);
  assertEquals(await verifyResponse({ ...REAL, IsoCode: '99' }, KEY), false);
  assertEquals(await verifyResponse({ ...REAL, AuthHash: '' }, KEY), false);
  assertEquals(await verifyResponse(REAL, KEY + 'x'), false);
} });

Deno.test('solicitud: campos y hash estable', async () => {
  const f = await buildSaleFields({
    merchantId: '39038540035', merchantName: 'PLATA TECH SOLUTIONS', merchantType: 'ECommerce',
    currency: '$', orderNumber: 'X1', total: 1.18, itbis: 0.18,
    approvedUrl: 'https://a/ok', declinedUrl: 'https://a/no', cancelUrl: 'https://a/c',
    logoUrl: 'https://platatechs.com/images/logo-platatech.png',
  }, 'k');
  assertEquals(f.Amount, '118');
  assertEquals(f.ITBIS, '18');
  assertEquals(f.SaveToDataVault, '0');
  assertEquals(f.AuthHash.length, 128);
});
