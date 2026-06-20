import '../shared/monitoring/tracer';
import express from 'express';
import client from 'prom-client';
import { eventHub } from '../shared/database/queue';
import { cache } from '../shared/database/redis';

// --- CRITICAL FIX: FORCE TELEMETRY REGISTRATION ---
import '../shared/monitoring/metrics'; 

import { startNotificationWorker } from '../modules/notifications/notification.worker';
import { startSagaOrchestrator } from '../shared/saga/order.saga';
import { startPaymentWorker } from '../modules/payments/payment.worker';
import { startOrderWorker } from '../modules/orders/order.worker';

const app = express();
client.collectDefaultMetrics();

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

async function bootWorkers() {
  try {
    await eventHub.initialize();
    await cache.initialize();
    
    await startNotificationWorker();
    await startSagaOrchestrator();
    await startPaymentWorker();
    await startOrderWorker();
    
    app.listen(3000, () => {
      console.log('🐇 Asynchronous Saga Worker Engine telemetry channel online on port 3000.');
    });
  } catch (err) {
    console.error('💥 Worker boot failure:', err);
    process.exit(1);
  }
}

bootWorkers();