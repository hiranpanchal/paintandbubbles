const https = require('https');

// Simple HTTPS helper for the SumUp REST API
function sumupRequest(method, path, body, apiKey) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.sumup.com',
      path,
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const ok = r => r.status >= 200 && r.status < 300;

// Our references, matching what the admin dashboard and emails show.
const bookingReference  = id => `PB${String(id).padStart(5, '0')}`;
const customerReference = id => `PBC${String(id).padStart(5, '0')}`;

// Create (or update) the SumUp customer so their name / email / phone show
// against the payment. Returns the customer_id to put on the checkout, or
// null if SumUp wouldn't take it — a payment should never fail over this.
async function ensureSumupCustomer(apiKey, { customerId, name, email, phone }) {
  const [first, ...rest] = String(name || '').trim().split(/\s+/);
  const personal_details = {
    first_name: first || undefined,
    last_name: rest.join(' ') || undefined,
    email: email || undefined,
    phone: phone || undefined,
  };
  try {
    const created = await sumupRequest('POST', '/v0.1/customers', { customer_id: customerId, personal_details }, apiKey);
    if (ok(created)) return customerId;
    if (created.status === 409) {
      // Already there from an earlier booking — refresh their details.
      await sumupRequest('PUT', `/v0.1/customers/${encodeURIComponent(customerId)}`, { personal_details }, apiKey);
      return customerId;
    }
    console.error('[SumUp] Could not create customer', customerId, created.status, created.body?.message || created.body);
  } catch (err) {
    console.error('[SumUp] Could not create customer', customerId, err.message);
  }
  return null;
}

// Create a checkout whose reference is our order number. SumUp rejects a
// reused reference (e.g. the customer retries after a declined card), so
// later attempts become PB00042-2, PB00042-3, …
async function createCheckout(apiKey, { reference, customerId, ...fields }) {
  for (let attempt = 1; attempt <= 20; attempt++) {
    const body = {
      ...fields,
      checkout_reference: attempt === 1 ? reference : `${reference}-${attempt}`,
      ...(customerId ? { customer_id: customerId } : {}),
    };
    let result = await sumupRequest('POST', '/v0.1/checkouts', body, apiKey);
    if (result.status === 409) continue;
    if (!ok(result) && customerId) {
      // Don't lose the sale if SumUp objects to the customer link.
      console.error('[SumUp] Checkout with customer failed, retrying without:', result.body?.message || result.status);
      delete body.customer_id;
      result = await sumupRequest('POST', '/v0.1/checkouts', body, apiKey);
      if (result.status === 409) continue;
    }
    return result;
  }
  return { status: 409, body: { message: 'Too many payment attempts for this order' } };
}

module.exports = { sumupRequest, ensureSumupCustomer, createCheckout, bookingReference, customerReference };
