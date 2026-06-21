import 'dotenv/config';
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { db } from './shared/database/pool';
import userRoutes from './modules/users/user.routes'; // <-- Import user routes
import productRoutes from './modules/products/product.routes';
import cartRoutes from './modules/cart/cart.routes';
import orderRoutes from './modules/orders/order.routes';
import paymentRoutes from './modules/payments/payment.routes';
import { eventHub } from './shared/database/queue';
import { startNotificationWorker } from './modules/notifications/notification.worker';
import { startOutboxProcessor } from './shared/workers/outbox.processor';
import { startSagaOrchestrator } from './shared/saga/order.saga';
import { startPaymentWorker } from './modules/payments/payment.worker';
import { startOrderWorker } from './modules/orders/order.worker';

const app: Application = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); // Parses incoming JSON payloads

// Mount Module Routes
app.use('/api/users', userRoutes); // <-- Mount user routes
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'UP', message: 'E-commerce Monolith is running' });
});

async function startServer() {
  try {
    await db.query('SELECT NOW()');
    console.log('✅ Database connection established successfully.');

    await eventHub.initialize();
    
    // Start workers
    await startNotificationWorker();
    await startOutboxProcessor(); 
    await startSagaOrchestrator();
    await startPaymentWorker();
    await startOrderWorker();

    app.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('💥 Failed to start server due to dependency failures:', error);
    process.exit(1);
  }
}

startServer();