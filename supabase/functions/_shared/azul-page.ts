// Página de Pagos de AZUL — lógica compartida (sin red, sin BD).
//
// Fuente: "Documento técnico - Página de Pago AZUL 2026" (Azul, 23-nov-2026).
// La usan azul-create-payment (firma la solicitud) y azul-callback (verifica la
// respuesta), y también el arnés de pruebas local (scripts/azul-pp-sandbox.ts).
//
// La tarjeta la escribe el cliente EN LA PÁGINA DE AZUL. Nuestro servidor solo
// ve la tarjeta enmascarada que Azul devuelve (ej. 542418******1732).

export const PAGE_URLS: Record<string, string> = {
  test: 'https://pruebas.azul.com.do/PaymentPage/',
  prod: 'https://pagos.azul.com.do/PaymentPage/Default.aspx',
};

// Orden EXACTO de los campos del AuthHash de la solicitud de venta (doc, p. 7).
export const REQUEST_HASH_FIELDS = [
  'MerchantId', 'MerchantName', 'MerchantType', 'CurrencyCode', 'OrderNumber',
  'Amount', 'ITBIS', 'ApprovedUrl', 'DeclinedUrl', 'CancelUrl',
  'UseCustomField1', 'CustomField1Label', 'CustomField1Value',
  'UseCustomField2', 'CustomField2Label', 'CustomField2Value',
] as const;

// Orden EXACTO de los campos del AuthHash de la respuesta (doc, p. 7).
export const RESPONSE_HASH_FIELDS = [
  'OrderNumber', 'Amount', 'AuthorizationCode', 'DateTime', 'ResponseCode',
  'IsoCode', 'ResponseMessage', 'ErrorDescription', 'RRN',
] as const;

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

// "Unicode" en el doc = UTF-16LE (Encoding.Unicode de .NET; mb_convert_encoding
// 'UTF-16LE' en el ejemplo PHP). El doc dice que la solicitud acepta UTF-8 o
// Unicode y que la respuesta se firma en Unicode.
export const utf16le = (s: string): Uint8Array<ArrayBuffer> => {
  const b = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    b[i * 2] = c & 0xff;
    b[i * 2 + 1] = (c >> 8) & 0xff;
  }
  return b;
};

// HMAC-SHA512 en hex. La clave (AuthKey) va en UTF-8, como en el ejemplo PHP.
export async function hmacSha512Hex(keyStr: string, msgBytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(keyStr), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, msgBytes));
}

// Montos: entero de centavos sin punto. 150.00 -> "15000"; 0 -> "000" (doc).
export const fixedString = (n: number) => {
  const s = Math.round(n * 100).toString();
  return s === '0' ? '000' : s;
};

export interface SaleConfig {
  merchantId: string;
  merchantName: string;
  merchantType: string;
  currency: string;
  orderNumber: string;
  total: number;          // RD$ con decimales
  itbis: number;          // RD$ con decimales (0 si no aplica)
  approvedUrl: string;
  declinedUrl: string;
  cancelUrl: string;
  logoUrl?: string;       // debe estar publicado en NUESTRO dominio (Azul, 23-nov)
  saveToDataVault?: boolean;
}

// Campos que el navegador del cliente POSTea a la Página de Pagos.
export async function buildSaleFields(cfg: SaleConfig, authKey: string): Promise<Record<string, string>> {
  const f: Record<string, string> = {
    MerchantId:        cfg.merchantId,
    MerchantName:      cfg.merchantName,
    MerchantType:      cfg.merchantType,
    CurrencyCode:      cfg.currency,
    OrderNumber:       cfg.orderNumber,
    Amount:            fixedString(cfg.total),
    ITBIS:             fixedString(cfg.itbis),
    ApprovedUrl:       cfg.approvedUrl,
    DeclinedUrl:       cfg.declinedUrl,
    CancelUrl:         cfg.cancelUrl,
    UseCustomField1:   '0',
    CustomField1Label: '',
    CustomField1Value: '',
    UseCustomField2:   '0',
    CustomField2Label: '',
    CustomField2Value: '',
    // Fuera del hash:
    Locale:            'ES',
    SaveToDataVault:   cfg.saveToDataVault ? '1' : '0',
  };
  if (cfg.logoUrl) f.LogoImageUrl = cfg.logoUrl;
  f.AuthHash = await requestHash(f, authKey);
  return f;
}

export async function requestHash(f: Record<string, string>, authKey: string): Promise<string> {
  const msg = REQUEST_HASH_FIELDS.map((k) => f[k] ?? '').join('') + authKey;
  return hmacSha512Hex(authKey, utf16le(msg));
}

// Verifica el AuthHash que Azul pone en el querystring de ApprovedUrl/DeclinedUrl.
// Es la frontera de seguridad: sin la AuthKey nadie puede forjarlo.
export async function verifyResponse(data: Record<string, string>, authKey: string): Promise<boolean> {
  const recv = (data.AuthHash || '').toLowerCase();
  if (!recv) return false;
  const msg = RESPONSE_HASH_FIELDS.map((k) => data[k] ?? '').join('') + authKey;
  const h16 = await hmacSha512Hex(authKey, utf16le(msg));
  if (timingSafeEqual(recv, h16)) return true;
  // Tolerancia: el doc admite UTF-8 en la solicitud; por si la respuesta llega así.
  const h8 = await hmacSha512Hex(authKey, new TextEncoder().encode(msg));
  return timingSafeEqual(recv, h8);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
