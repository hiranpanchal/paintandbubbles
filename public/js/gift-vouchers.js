/* =============================================
   PAINT & BUBBLES — GIFT VOUCHERS PAGE
   ============================================= */

let stripe = null;
let paymentConfig = { stripe_enabled: false, sumup_enabled: false, stripe_publishable_key: '' };
let voucherState = {
  amountPence: 0,
  purchaserName: '',
  purchaserEmail: '',
  recipientName: '',
  recipientEmail: '',
  message: '',
  voucherId: null,
  voucherCode: null,
  clientSecret: null,
  stripeElements: null,
  sumupCheckoutId: null,
  activeProvider: null
};

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  applyDesignSettings();
  try {
    const res = await fetch('/api/payments/config');
    if (res.ok) {
      paymentConfig = await res.json();
      if (paymentConfig.stripe_enabled && paymentConfig.stripe_publishable_key) {
        stripe = Stripe(paymentConfig.stripe_publishable_key);
      }
    }
  } catch {}
});

async function applyDesignSettings() {
  try {
    const res = await fetch('/api/design/settings');
    if (!res.ok) return;
    const s = await res.json();
    const vars = [];
    if (s.color_rose)         vars.push(`--rose: ${s.color_rose}`);
    if (s.color_rose_deep)    vars.push(`--rose-deep: ${s.color_rose_deep}`);
    if (s.color_rose_dark)    vars.push(`--rose-dark: ${s.color_rose_dark}`);
    if (s.color_bg)           vars.push(`--bg: ${s.color_bg}`);
    if (s.color_text_dark)    vars.push(`--text-dark: ${s.color_text_dark}`);
    if (s.color_bg_footer)    vars.push(`--bg-footer: ${s.color_bg_footer}`);
    if (s.color_banner_start) vars.push(`--banner-start: ${s.color_banner_start}`);
    if (s.color_banner_mid)   vars.push(`--banner-mid: ${s.color_banner_mid}`);
    if (s.color_banner_end)   vars.push(`--banner-end: ${s.color_banner_end}`);
    if (vars.length) {
      const st = document.createElement('style');
      st.textContent = `:root { ${vars.join('; ')} }`;
      document.head.appendChild(st);
    }
    if (s.logo_url) {
      document.querySelectorAll('.logo-img').forEach(img => { img.src = s.logo_url; img.style.display = ''; });
      const fb = document.getElementById('logo-fallback');
      if (fb) fb.style.display = 'none';
    }
    if (s.footer_logo_url) {
      const fImg = document.querySelector('.footer-logo-img');
      if (fImg) { fImg.src = s.footer_logo_url; fImg.style.display = ''; }
      const fFb = document.getElementById('footer-logo-fallback');
      if (fFb) fFb.style.display = 'none';
    }
    if (s.footer_tagline) {
      const el = document.querySelector('.footer-tagline');
      if (el) el.textContent = s.footer_tagline;
    }
  } catch {}
}

// ---- AMOUNT SELECTION ----
function selectAmount(pence) {
  voucherState.amountPence = pence;

  // Update button states
  document.querySelectorAll('.voucher-amount-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  // Clear custom input
  const customInput = document.getElementById('voucher-custom-amount');
  if (customInput) customInput.value = '';
}

function onCustomAmount(val) {
  // Deselect preset buttons
  document.querySelectorAll('.voucher-amount-btn').forEach(btn => btn.classList.remove('active'));
  const num = parseFloat(val);
  if (!isNaN(num) && num >= 5) {
    voucherState.amountPence = Math.round(num * 100);
  } else {
    voucherState.amountPence = 0;
  }
}

// ---- STEP 1 → 2: PROCEED TO PAYMENT ----
async function proceedToVoucherPayment() {
  const purchaserName  = document.getElementById('v-purchaser-name').value.trim();
  const purchaserEmail = document.getElementById('v-purchaser-email').value.trim();
  const recipientName  = document.getElementById('v-recipient-name').value.trim();
  const recipientEmail = document.getElementById('v-recipient-email').value.trim();
  const message        = document.getElementById('v-message').value.trim();
  const errorEl        = document.getElementById('voucher-step1-error');

  errorEl.style.display = 'none';

  if (voucherState.amountPence < 500) {
    // Try custom input
    const customVal = parseFloat(document.getElementById('voucher-custom-amount').value);
    if (!isNaN(customVal)) {
      voucherState.amountPence = Math.round(customVal * 100);
    }
  }

  if (voucherState.amountPence < 500) {
    errorEl.textContent = 'Please select or enter an amount (minimum £5).';
    errorEl.style.display = 'block';
    return;
  }
  if (voucherState.amountPence > 50000) {
    errorEl.textContent = 'Maximum voucher amount is £500.';
    errorEl.style.display = 'block';
    return;
  }
  if (!purchaserName) {
    errorEl.textContent = 'Please enter your name.';
    errorEl.style.display = 'block';
    document.getElementById('v-purchaser-name').focus();
    return;
  }
  if (!purchaserEmail || !isValidEmail(purchaserEmail)) {
    errorEl.textContent = 'Please enter a valid email address.';
    errorEl.style.display = 'block';
    document.getElementById('v-purchaser-email').focus();
    return;
  }
  if (recipientEmail && !isValidEmail(recipientEmail)) {
    errorEl.textContent = 'Please enter a valid recipient email address.';
    errorEl.style.display = 'block';
    document.getElementById('v-recipient-email').focus();
    return;
  }

  Object.assign(voucherState, { purchaserName, purchaserEmail, recipientName, recipientEmail, message });

  const btn = document.getElementById('voucher-proceed-btn');
  btn.disabled = true;
  btn.textContent = 'Creating voucher…';

  try {
    const res = await fetch('/api/vouchers/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount_pence: voucherState.amountPence,
        purchaser_name: purchaserName,
        purchaser_email: purchaserEmail,
        recipient_name: recipientName || null,
        recipient_email: recipientEmail || null,
        message: message || null
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create voucher');

    voucherState.voucherId = data.voucher_id;
    voucherState.voucherCode = data.code;
    voucherState.activeProvider = data.provider;

    if (data.clientSecret) {
      voucherState.clientSecret = data.clientSecret;
    }
    if (data.checkoutId) {
      voucherState.sumupCheckoutId = data.checkoutId;
    }

    showVoucherStep2();
  } catch (err) {
    errorEl.textContent = err.message || 'Something went wrong. Please try again.';
    errorEl.style.display = 'block';
  }

  btn.disabled = false;
  btn.textContent = 'Continue to Payment →';
}

function showVoucherStep2() {
  document.getElementById('voucher-step-1').style.display = 'none';
  document.getElementById('voucher-step-2').style.display = '';

  // Render summary
  const amountStr = `£${(voucherState.amountPence / 100).toFixed(2)}`;
  const summaryEl = document.getElementById('voucher-summary');
  summaryEl.innerHTML = `
    <div class="summary-row"><span>Gift Voucher</span><span>${amountStr}</span></div>
    <div class="summary-row total"><span>Total</span><span>${amountStr}</span></div>`;

  document.getElementById('voucher-pay-btn').textContent = `Pay ${amountStr}`;

  mountVoucherPayment();
}

function backToVoucherStep1() {
  document.getElementById('voucher-step-2').style.display = 'none';
  document.getElementById('voucher-step-1').style.display = '';
  // Reset payment state so it recreates on next attempt
  voucherState.clientSecret = null;
  voucherState.stripeElements = null;
  voucherState.sumupCheckoutId = null;
}

async function mountVoucherPayment() {
  const provider = voucherState.activeProvider;
  if (provider === 'stripe') {
    await mountVoucherStripe();
  } else if (provider === 'sumup') {
    await mountVoucherSumUp();
  } else {
    // No payment provider — auto-confirm (dev/testing scenario)
    document.getElementById('voucher-payment-element').innerHTML =
      '<p style="color:var(--text-light);font-size:14px;text-align:center;">No payment provider configured.</p>';
  }
}

async function mountVoucherStripe() {
  const el = document.getElementById('voucher-payment-element');
  if (!stripe || !voucherState.clientSecret) {
    el.innerHTML = '<p style="color:var(--coral);font-size:14px;">Stripe is not configured. Please contact us.</p>';
    return;
  }
  const elements = stripe.elements({
    clientSecret: voucherState.clientSecret,
    appearance: {
      theme: 'stripe',
      variables: { colorPrimary: '#C4748A', borderRadius: '10px', fontFamily: 'Nunito, sans-serif' }
    }
  });
  elements.create('payment').mount('#voucher-payment-element');
  voucherState.stripeElements = elements;
}

async function mountVoucherSumUp() {
  const el = document.getElementById('voucher-payment-element');
  el.innerHTML = '<div id="sumup-voucher-card"></div>';

  if (!window.SumUpCard) {
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    } catch {
      el.innerHTML = '<p style="color:var(--coral);font-size:14px;">Could not load SumUp payment widget.</p>';
      return;
    }
  }

  SumUpCard.mount({
    id: 'sumup-voucher-card',
    checkoutId: voucherState.sumupCheckoutId,
    onResponse: async (type, body) => {
      if (type === 'success') {
        try {
          const res = await fetch('/api/vouchers/sumup-confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checkout_id: voucherState.sumupCheckoutId, voucher_id: voucherState.voucherId })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Confirmation failed');
          showVoucherSuccess(data.code || voucherState.voucherCode);
        } catch {
          alert('Payment taken but confirmation failed. Please contact us with your voucher code: ' + voucherState.voucherCode);
        }
      } else if (type === 'error') {
        const msgEl = document.getElementById('voucher-payment-message');
        if (msgEl) { msgEl.textContent = body?.message || 'Payment failed. Please try again.'; msgEl.classList.remove('hidden'); }
      }
    }
  });
}

// ---- SUBMIT PAYMENT ----
async function submitVoucherPayment() {
  const provider = voucherState.activeProvider;

  // SumUp handles via SDK
  if (provider === 'sumup') return;

  // No provider scenario
  if (provider === 'none') {
    const res = await fetch('/api/vouchers/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voucher_id: voucherState.voucherId, payment_reference: null })
    });
    const data = await res.json();
    if (res.ok) showVoucherSuccess(data.code || voucherState.voucherCode);
    return;
  }

  const elements = voucherState.stripeElements;
  if (!stripe || !elements) return;

  const payBtn = document.getElementById('voucher-pay-btn');
  payBtn.disabled = true;
  payBtn.textContent = 'Processing…';

  const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: 'if_required' });

  if (error) {
    const msgEl = document.getElementById('voucher-payment-message');
    msgEl.textContent = error.message;
    msgEl.classList.remove('hidden');
    payBtn.disabled = false;
    payBtn.textContent = `Pay £${(voucherState.amountPence / 100).toFixed(2)}`;
    return;
  }

  try {
    const res = await fetch('/api/vouchers/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voucher_id: voucherState.voucherId, payment_reference: paymentIntent.id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Confirmation failed');
    showVoucherSuccess(data.code || voucherState.voucherCode);
  } catch {
    alert('Payment taken but confirmation failed. Please contact us with your voucher code: ' + voucherState.voucherCode);
  }
}

// ---- SUCCESS ----
function showVoucherSuccess(code) {
  document.getElementById('voucher-step-2').style.display = 'none';
  document.getElementById('voucher-step-3').style.display = '';
  document.getElementById('voucher-code-display').textContent = code;
}

// ---- HELPERS ----
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
