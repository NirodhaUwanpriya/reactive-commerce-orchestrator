import '../shared/monitoring/tracer';
import express from 'express';
import client from 'prom-client';
import { db } from '../shared/database/pool';
import { eventHub } from '../shared/database/queue';
import { startOutboxProcessor } from '../shared/workers/outbox.processor';

const app = express();
client.collectDefaultMetrics();

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

async function bootOutbox() {
  try {
    await db.query('SELECT NOW()');
    await eventHub.initialize();
    
    await startOutboxProcessor();
    
    // Open metric listening socket channel
    app.listen(3000, () => {
      console.log('📊 Outbox telemetry channel online on port 3000.');
    });
  } catch (err) {
    process.exit(1);
  }
}

bootOutbox();