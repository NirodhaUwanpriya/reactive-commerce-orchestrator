import { Request, Response } from 'express';
import { db } from '../../shared/database/pool';
import { cache } from '../../shared/database/redis';

export const getProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const cacheKey = `product:${id}`;

    // 1. Try to fetch from Redis Cache Engine
    const cachedProduct = await cache.get(cacheKey);
    
    if (cachedProduct) {
      console.log(`🎯 Cache HIT for key: ${cacheKey}`);
      res.status(200).json(JSON.parse(cachedProduct));
      return;
    }

    console.log(`💨 Cache MISS for key: ${cacheKey}. Querying Primary Database...`);

    // 2. Cache Miss: Query the Relational Database
    const result = await db.query('SELECT * FROM products WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const product = result.rows[0];

    // 3. Write data to cache so subsequent requests hit memory (TTL = 5 Minutes)
    await cache.set(cacheKey, JSON.stringify(product), 300);

    // 4. Respond to client
    res.status(200).json(product);
  } catch (error) {
    console.error('💥 Fetch product error:', error);
    res.status(500).json({ error: 'Internal server error occurred.' });
  }
};

// Add a quick creation route so we have data to test with!
export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, price, category, sku, stock_quantity } = req.body;
    
    const query = `
      INSERT INTO products (name, description, price, category, sku, stock_quantity)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const result = await db.query(query, [name, description, price, category, sku, stock_quantity || 0]);
    
    res.status(201).json({ message: 'Product created', product: result.rows[0] });
  } catch (error) {
    console.error('💥 Create product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};