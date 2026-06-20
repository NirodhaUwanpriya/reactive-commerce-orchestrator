import client from 'prom-client';

export const checkoutCounter = new client.Counter({
  name: 'ecommerce_checkout_total',
  help: 'Total number of checkout requests initiated by clients',
});

export const sagaOutcomeCounter = new client.Counter({
  name: 'ecommerce_saga_outcome_total',
  help: 'Total number of Saga process completions tracking specific final states',
  labelNames: ['status', 'reason'],
});

// --- FORCE INITIALIZE BASELINES SO THEY DEPLOY IMMEDIATELY ON BOOT ---
sagaOutcomeCounter.labels({ status: 'COMPLETED', reason: 'PAYMENT_SUCCESS' }).inc(0);
sagaOutcomeCounter.labels({ status: 'FAILED', reason: 'BANK_REJECTION' }).inc(0);