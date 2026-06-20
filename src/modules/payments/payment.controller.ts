import { Response } from 'express';
import { AuthenticatedRequest } from '../../shared/middlewares/auth.middleware';
import { db } from '../../shared/database/pool';

/**
 * Simulates an external banking API network bridge
 */
const mockExternalGatewayPayment = async (amount: number): Promise<{ success: boolean; txRef: string }> => {
  // Simulate network flight delay time (1 Second)
  await new Promise((resolve) => setTimeout(resolve, 1000));
  
  return {
    success: true,
    txRef: `TX_REF_${Math.random().toString(36).substring(2, 11).toUpperCase()}`
  };
};

export const processPayment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { orderId, idempotencyKey } = req.body;

    if (!orderId || !idempotencyKey) {
      res.status(400).json({ error: 'Order ID and a unique Idempotency Key are required.' });
      return;
    }

    // 1. SAFEGUARD: Check if this identical idempotency token has been processed already
    const processedCheck = await db.query(
      'SELECT id, status, transaction_reference, amount FROM payments WHERE idempotency_key = $1',
      [idempotencyKey]
    );

    if (processedCheck.rows.length > 0) {
      const recordedPayment = processedCheck.rows[0];
      console.log(`🛡️ Double-Charge Intercepted! Returning cached receipt for key: ${idempotencyKey}`);
      
      res.status(200).json({
        message: 'Duplicate request safely handled. Payment was already processed previously.',
        paymentId: recordedPayment.id,
        status: recordedPayment.status,
        transactionReference: recordedPayment.transaction_reference,
        amount: recordedPayment.amount
      });
      return;
    }

    // 2. Look up the matching order to pull the definitive monetary amount
    const orderResult = await db.query('SELECT total_amount, status FROM orders WHERE id = $1', [orderId]);
    if (orderResult.rows.length === 0) {
      res.status(404).json({ error: 'Target order record not found.' });
      return;
    }

    const order = orderResult.rows[0];

    if (order.status === 'CONFIRMED') {
      res.status(400).json({ error: 'This order has already been fully paid and confirmed.' });
      return;
    }

    console.log(`💳 Routing outbound settlement charge for Order #${orderId} (Amount: $${order.total_amount})...`);

    // 3. Fire request into the simulated gateway network
    const gatewayResult = await mockExternalGatewayPayment(parseFloat(order.total_amount));

    // 4. Wrap up updates inside an atomic database client lock
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Record payment into ledger
      const paymentInsert = await client.query(
        `INSERT INTO payments (order_id, idempotency_key, amount, status, transaction_reference)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [orderId, idempotencyKey, order.total_amount, 'SUCCESS', gatewayResult.txRef]
      );
      const paymentId = paymentInsert.rows[0].id;

      // Transition the state machine of the order from PENDING to CONFIRMED
      await client.query("UPDATE orders SET status = 'CONFIRMED', updated_at = NOW() WHERE id = $1", [orderId]);

      await client.query('COMMIT');
      client.release();

      res.status(201).json({
        message: 'Payment captured and authorized successfully.',
        paymentId,
        status: 'SUCCESS',
        transactionReference: gatewayResult.txRef
      });

    } catch (txError) {
      await client.query('ROLLBACK');
      client.release();
      throw txError;
    }

  } catch (error) {
    console.error('💥 Payment processing engine error:', error);
    res.status(500).json({ error: 'Internal system fault occurred during payment routing.' });
  }
};