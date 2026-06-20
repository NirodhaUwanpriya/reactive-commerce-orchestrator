import { eventHub } from '../../shared/database/queue';
import { db } from '../../shared/database/pool';

export async function startPaymentWorker() {
  const queueName = 'payment_domain_saga_queue';

  await eventHub.consumeEvents(queueName, async (event, data) => {
    if (event === 'Command_ProcessPayment') {
      console.log(`💳 [PAYMENT SERVICE] Intercepted request to settle $${data.amount} for Order #${data.orderId}`);

      // --- SIMULATE FRAUD/BANK REJECTION CHECK (Let's make orders over $500 fail automatically!) ---
      const shouldPaymentFail = parseFloat(data.amount) > 500.00;

      // Artificial banking gateway flight latency delay simulation (1 second)
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (shouldPaymentFail) {
        console.error(`❌ [PAYMENT SERVICE] Transaction rejected by bank: Insufficient Funds / Fraud Risk.`);
        // Notify the orchestrator that the operation failed
        await eventHub.publishEvent('PaymentFailed', { orderId: data.orderId, reason: 'BANK_REJECTION' });
      } else {
        console.log(`✅ [PAYMENT SERVICE] Credit card charged successfully. TxRef: TX_SAGA_${data.orderId}`);
        
        // Persist payment data locally
        await db.query(
          `INSERT INTO payments (order_id, idempotency_key, amount, status, transaction_reference)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
          [data.orderId, data.idempotencyKey, data.amount, 'SUCCESS', `TX_SAGA_${data.orderId}`]
        );

        // Transition the local order status view state to complete
        await db.query("UPDATE orders SET status = 'CONFIRMED', updated_at = NOW() WHERE id = $1", [data.orderId]);

        // Broadcast success to the orchestrator
        await eventHub.publishEvent('PaymentSucceeded', { orderId: data.orderId });
      }
    }
  });
}