import crypto from 'crypto';

export function hasBearerSecret(request: Request, expectedSecret?: string) {
  if (!expectedSecret) {
    return false;
  }

  const authorization = request.headers.get('authorization') || '';
  const bearer = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  return safeEqual(bearer, expectedSecret);
}

export function hasQuerySecret(request: Request, expectedSecret?: string) {
  if (!expectedSecret) {
    return false;
  }

  const { searchParams } = new URL(request.url);
  return safeEqual(searchParams.get('secret') || '', expectedSecret);
}

export function isAutomationAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret && process.env.NODE_ENV !== 'production') {
    return true;
  }

  // Vercel cron sends `Authorization: Bearer ${CRON_SECRET}` natively.
  // Query-string secrets are rejected because they leak into Vercel access logs.
  return hasBearerSecret(request, secret);
}

export function isWebhookSecretAuthorized(request: Request, secretName: string) {
  const secret = process.env[secretName];

  if (!secret && process.env.NODE_ENV !== 'production') {
    return true;
  }

  const headerSecret = request.headers.get('x-denver-webhook-secret') || '';
  return safeEqual(headerSecret, secret || '') || hasQuerySecret(request, secret);
}

export async function verifyTwilioRequest(
  request: Request,
  params: Record<string, string>
) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = request.headers.get('x-twilio-signature');

  if (!authToken && process.env.NODE_ENV !== 'production') {
    return true;
  }

  if (!authToken || !signature) {
    return false;
  }

  const sortedKeys = Object.keys(params).sort();
  const signedPayload =
    request.url + sortedKeys.map((key) => `${key}${params[key]}`).join('');
  const expected = crypto
    .createHmac('sha1', authToken)
    .update(signedPayload)
    .digest('base64');

  return safeEqual(signature, expected);
}

function safeEqual(value: string, expected: string) {
  if (!value || !expected) {
    return false;
  }

  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return (
    valueBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(valueBuffer, expectedBuffer)
  );
}
