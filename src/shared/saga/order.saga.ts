import { db } from '../database/pool';
import { eventHub } from '../database/queue';
import { sagaOutcomeCounter } from '../monitoring/metrics';

export async function startSagaOrchestrator() {
  const queueName = 'order_saga_orchestrator_queue';

  // Listen to all events flowing through our global exchange
  await eventHub.consumeEvents(queueName, async (event, data) => {
    
    // STEP 1: Catch the Initial Order Event
    if (event === 'OrderCreated') {
      console.log(`\n🤖 [SAGA ORCHESTRATOR] New Order detected (#${data.orderId}). Initializing Saga Instance...`);
      
      const client = await db.pool.connect();
      try {
        // Persist Saga instance initialization state
        await client.query(
          `INSERT INTO saga_instances (order_id, user_id, amount, current_state) 
           VALUES ($1, $2, $3, $4) ON CONFLICT (order_id) DO NOTHING`,
          [data.orderId, data.userId, data.totalAmount, 'PAYMENT_PENDING']
        );
        
        // Issue a commanding event down the message stream specifically targeting the Payment Domain
        // Generating a pseudo-idempotency key inside the saga payload
        await eventHub.publishEvent('Command_ProcessPayment', {
          orderId: data.orderId,
          amount: data.totalAmount,
          idempotencyKey: `SAGA_KEY_ORDER_${data.orderId}`
        });

        console.log(`🤖 [SAGA] Command dispatched: 'Command_ProcessPayment' for Order #${data.orderId}`);
      } catch (err) {
        console.error('💥 Failed to initialize Saga record:', err);
      } finally {
        client.release();
      }
    }

 // STEP 2: Catch Payment Success Event (The Happy Path)
    if (event === 'PaymentSucceeded') {
      console.log(`\n🤖 [SAGA ORCHESTRATOR] Payment confirmed for Order #${data.orderId}. Finalizing lifecycle...`);
      
      await db.query(
        "UPDATE saga_instances SET current_state = 'COMPLETED', updated_at = NOW() WHERE order_id = $1",
        [data.orderId]
      );
      
      // TELEMETRY: Mark a successful completed transaction block
      sagaOutcomeCounter.inc({ status: 'COMPLETED', reason: 'PAYMENT_SUCCESS' });

      await eventHub.publishEvent('OrderSettledSuccessfully', { orderId: data.orderId });
    }

    // STEP 3: Catch Payment Failure Event (The Compensating Rollback Path)
    if (event === 'PaymentFailed') {
      console.log(`\n🚨 [SAGA ORCHESTRATOR] CRITICAL: Payment failed for Order #${data.orderId}! Triggering compensating rollbacks...`);
      
      await db.query(
        "UPDATE saga_instances SET current_state = 'FAILED', updated_at = NOW() WHERE order_id = $1",
        [data.orderId]
      );

      // TELEMETRY: Mark a failed transaction block along with the domain reason
      sagaOutcomeCounter.inc({ status: 'FAILED', reason: data.reason || 'BANK_REJECTION' });

      await eventHub.publishEvent('Command_RollbackInventoryAndCancelOrder', { orderId: data.orderId });
    }
  });
}