import { eventHub } from '../../shared/database/queue';
import { db } from '../../shared/database/pool';
import { cache } from '../../shared/database/redis';

export async function startOrderWorker() {
  const queueName = 'order_domain_saga_rollback_queue';

  await eventHub.consumeEvents(queueName, async (event, data) => {
    if (event === 'Command_RollbackInventoryAndCancelOrder') {
      console.log(`🚨 [ORDER SERVICE] Running Compensating Transaction for Order #${data.orderId}...`);

      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');

        // 1. Transition order state to CANCELLED
        await client.query("UPDATE orders SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1", [data.orderId]);

        // 2. Fetch the line items from the failed order to see what stock needs to be returned
        const itemsResult = await client.query(
          'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
          [data.orderId]
        );

        // 3. Return the stock back to the products catalog database table
        for (const item of itemsResult.rows) {
          await client.query(
            'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2',
            [item.quantity, item.product_id]
          );
          // Invalidate cache engine properties so customers immediately see restocked items
          await cache.del(`product:${item.product_id}`);
          console.log(`↩️ Restocked ${item.quantity} units back to Product ID: ${item.product_id}`);
        }

        await client.query('COMMIT');
        console.log(`🎉 [ORDER SERVICE] Architecture states successfully healed and rolled back.`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('💥 Failed to safely execute compensating transaction:', err);
      } finally {
        client.release();
      }
    }
  });
}