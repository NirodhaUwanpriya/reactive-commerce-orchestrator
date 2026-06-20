import { Response } from 'express';
import { AuthenticatedRequest } from '../../shared/middlewares/auth.middleware';
import { db } from '../../shared/database/pool';
import { cache } from '../../shared/database/redis';
import { checkoutCounter } from '../../shared/monitoring/metrics';

export const checkoutCart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  const client = await db.pool.connect();

  try {
    checkoutCounter.inc();
    const cartKey = `cart:${userId}`;
    const cartItems = await cache.rawClient.hGetAll(cartKey);

    if (!cartItems || Object.keys(cartItems).length === 0) {
      res.status(400).json({ error: 'Your shopping cart is completely empty.' });
      client.release();
      return;
    }

    // --- START TRANSACTION ---
    await client.query('BEGIN');

    let totalAmount = 0;
    const itemsToProcess = [];

    for (const [productId, quantityStr] of Object.entries(cartItems)) {
      const quantity = parseInt(quantityStr, 10);
      const prodId = parseInt(productId, 10);

      const productResult = await client.query(
        'SELECT id, name, price, stock_quantity FROM products WHERE id = $1 FOR UPDATE',
        [prodId]
      );

      if (productResult.rows.length === 0) {
        throw new Error(`Product ID ${prodId} no longer exists in our catalog.`);
      }

      const product = productResult.rows[0];

      if (product.stock_quantity < quantity) {
        res.status(400).json({ 
          error: `Overselling protection triggered. Product '${product.name}' only has ${product.stock_quantity} units left.` 
        });
        await client.query('ROLLBACK');
        client.release();
        return;
      }

      const itemTotal = parseFloat(product.price) * quantity;
      totalAmount += itemTotal;

      itemsToProcess.push({
        id: prodId,
        quantity,
        price: product.price,
        newStock: product.stock_quantity - quantity
      });
    }

    for (const item of itemsToProcess) {
      await client.query(
        'UPDATE products SET stock_quantity = $1, updated_at = NOW() WHERE id = $2',
        [item.newStock, item.id]
      );
      await cache.del(`product:${item.id}`);
    }

    const orderInsert = await client.query(
      'INSERT INTO orders (user_id, total_amount, status) VALUES ($1, $2, $3) RETURNING id',
      [userId, totalAmount, 'PENDING']
    );
    const orderId = orderInsert.rows[0].id;

    for (const item of itemsToProcess) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES ($1, $2, $3, $4)',
        [orderId, item.id, item.quantity, item.price]
      );
    }

    // --- NEW: WRITE TO TRANSACTIONAL OUTBOX INSTEAD OF RABBITMQ DIRECTLY ---
    const eventPayload = {
      orderId,
      userId,
      totalAmount,
      items: itemsToProcess.map(i => ({ productId: i.id, quantity: i.quantity }))
    };

    await client.query(
      'INSERT INTO transactional_outbox (event_type, payload) VALUES ($1, $2)',
      ['OrderCreated', JSON.stringify(eventPayload)]
    );

    // --- COMMIT ALL OPERATIONS ATOMICALLY ---
    // If the database crashes here, nothing is saved. If it succeeds, BOTH the order and the outbox event are saved!
    await client.query('COMMIT');
    client.release(); 

    await cache.rawClient.del(cartKey);

    res.status(201).json({
      message: 'Order captured securely inside ledger.',
      orderId,
      totalAmount,
      status: 'PENDING'
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    client.release();
    console.error('💥 Checkout failure transaction aborted:', error);
    res.status(500).json({ error: error.message || 'Internal server error processing checkout.' });
  }
};