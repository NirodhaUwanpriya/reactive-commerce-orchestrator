import { eventHub } from '../../shared/database/queue';

export async function startNotificationWorker() {
  const queueName = 'notification_service_queue';

  await eventHub.consumeEvents(queueName, async (event, data) => {
    if (event === 'OrderCreated') {
      console.log('\n================================================================');
      console.log('📧 [NOTIFICATION WORKER] Processing Order Confirmation Delivery...');
      console.log(`👉 Sending transactional receipt email to User ID: ${data.userId}`);
      console.log(`👉 Total Bill Summarized: $${data.totalAmount}`);
      console.log(`👉 Dispatched for Fulfillment Tracking Code: Order #${data.orderId}`);
      console.log('================================================================\n');
    }
  });
}