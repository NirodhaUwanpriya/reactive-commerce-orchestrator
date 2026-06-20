import '../shared/monitoring/tracer';
import express from 'express';
import cors from 'cors';
import { db } from '../shared/database/pool';
import { cache } from '../shared/database/redis'; // <-- IMPORT CACHE ENGINE
import client from 'prom-client';
import userRoutes from '../modules/users/user.routes';
import productRoutes from '../modules/products/product.routes';
import cartRoutes from '../modules/cart/cart.routes';
import orderRoutes from '../modules/orders/order.routes';
import paymentRoutes from '../modules/payments/payment.routes';

const app = express();
const PORT = process.env.PORT || 3000;

// Enable default system metric collections (CPU, Memory, Garbage Collection)
client.collectDefaultMetrics();

app.use(cors());
app.use(express.json());

// --- EXPOSE METRICS ENDPOINT FOR PROMETHEUS ---
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);

async function bootApi() {
  try {
    await db.query('SELECT NOW()');
    await cache.initialize();
    
    app.listen(PORT, () => {
      console.log(`🚀 API Gateway operational on http://localhost:${PORT}`);
    });
  } catch (err) {
    process.exit(1);
  }
}

bootApi();