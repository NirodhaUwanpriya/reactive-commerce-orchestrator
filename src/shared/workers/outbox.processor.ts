import { db } from '../database/pool';
import { eventHub } from '../database/queue';

export async function startOutboxProcessor() {
  console.log('🔄 Transactional Outbox Relay Poller active.');

  setInterval(async () => {
    // Acquire a clean connection from the pool
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const selectQuery = `
        SELECT id, event_type, payload 
        FROM transactional_outbox 
        WHERE status = 'PENDING' 
        ORDER BY created_at ASC 
        LIMIT 10 
        FOR UPDATE SKIP LOCKED
      `;
      const result = await client.query(selectQuery);

      // FIX: If no pending events, just commit and exit. 
      // Do NOT call client.release() here; let the finally block do it!
      if (result.rows.length === 0) {
        await client.query('COMMIT');
        return;
      }

      console.log(`📦 Outbox found ${result.rows.length} pending events to forward...`);

      for (const row of result.rows) {
        await eventHub.publishEvent(row.event_type, row.payload);
        
        await client.query(
          "UPDATE transactional_outbox SET status = 'PROCESSED', processed_at = NOW() WHERE id = $1",
          [row.id]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      // If any internal step throws, abort the work safely
      await client.query('ROLLBACK');
      console.error('💥 Failed to process transactional outbox cycle:', error);
    } finally {
      // CENTRAL CLEANUP: This block is GUARANTEED to execute exactly once 
      // whether the try block finishes cleanly, exits early, or catches an error.
      client.release();
    }
  }, 2000);
}