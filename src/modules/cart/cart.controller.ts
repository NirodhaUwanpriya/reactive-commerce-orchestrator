import { Response } from 'express';
import { AuthenticatedRequest } from '../../shared/middlewares/auth.middleware';
import { cache } from '../../shared/database/redis';
import { db } from '../../shared/database/pool';

/**
 * Add an item to the shopping cart, or increment quantity if it exists
 */
export const addItemToCart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { productId, quantity } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    if (!productId || !quantity || quantity <= 0) {
      res.status(400).json({ error: 'Valid Product ID and positive quantity are required.' });
      return;
    }

    // 1. Verify the product actually exists in our primary catalog database first
    const productCheck = await db.query('SELECT id, stock_quantity FROM products WHERE id = $1', [productId]);
    if (productCheck.rows.length === 0) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const product = productCheck.rows[0];
    
    // 2. Performance Safeguard: Check if requested amount exceeds current inventory
    if (quantity > product.stock_quantity) {
      res.status(400).json({ error: `Insufficient stock. Only ${product.stock_quantity} available.` });
      return;
    }

    const cartKey = `cart:${userId}`;

    // 3. Inject/Increment item directly inside Redis Hash mapping
    // HINCRBY increments the integer value of a hash field by the specified number
    await cache.rawClient.hIncrBy(cartKey, productId.toString(), quantity);
    
    // 4. Set an automatic rolling expiration window of 7 days so dead carts self-clean
    await cache.rawClient.expire(cartKey, 604800);

    res.status(200).json({ message: 'Item successfully added to cart' });
  } catch (error) {
    console.error('💥 Add to cart error:', error);
    res.status(500).json({ error: 'Internal server error occurred.' });
  }
};

/**
 * Retrieve full contents of the user's active cart matched with product information
 */
export const getCart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const cartKey = `cart:${userId}`;
    
    // Fetch all field-value pairs from the Redis hash
    const cartItems = await cache.rawClient.hGetAll(cartKey);

    if (!cartItems || Object.keys(cartItems).length === 0) {
      res.status(200).json({ cart: [] });
      return;
    }

    // Transform raw Redis string records into structured analytical structures
    const formattedCart = [];
    for (const [productId, quantity] of Object.entries(cartItems)) {
      // Pull down details (this will hit our Cache-Aside product layer beautifully!)
      const productResult = await db.query('SELECT id, name, price, sku FROM products WHERE id = $1', [productId]);
      
      if (productResult.rows.length > 0) {
        const prod = productResult.rows[0];
        formattedCart.push({
          product_id: prod.id,
          name: prod.name,
          price: prod.price,
          sku: prod.sku,
          quantity: parseInt(quantity, 10)
        });
      }
    }

    res.status(200).json({ cart: formattedCart });
  } catch (error) {
    console.error('💥 Fetch cart error:', error);
    res.status(500).json({ error: 'Internal server error occurred.' });
  }
};