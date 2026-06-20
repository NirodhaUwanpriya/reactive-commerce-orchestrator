import { connect } from 'amqplib';

type RabbitConnection = Awaited<ReturnType<typeof connect>>;
type RabbitChannel = Awaited<ReturnType<RabbitConnection['createChannel']>>;

class QueueManager {
  private connection: RabbitConnection | null = null;
  private channel: RabbitChannel | null = null;
  private readonly EXCHANGE_NAME = 'ecommerce_events';

  /**
   * Initializes network connections and registers global exchange structures
   */
  async initialize(retries = 5, delay = 3000): Promise<void> {
    // Dynamically look up the host at the exact moment of connection initialization
    const rabbitHost = process.env.RABBIT_HOST || 'localhost';

    for (let i = 0; i < retries; i++) {
      try {
        console.log(`Trying to connect to RabbitMQ at amqp://${rabbitHost}:5672 (Attempt ${i + 1}/${retries})...`);
        
        this.connection = await connect(`amqp://${rabbitHost}:5672`);
        
        if (!this.connection) {
          throw new Error('RabbitMQ connection object failed to allocate.');
        }

        this.channel = await this.connection.createChannel();
        await this.channel.assertExchange(this.EXCHANGE_NAME, 'fanout', { durable: true });
        
        console.log('🐇 Distributed Message Broker (RabbitMQ) connected cleanly.');
        return; 
        
      } catch (error: any) {
        console.warn(`⚠️ RabbitMQ handshake failed: ${error.message}. Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error('💥 Failed to connect to RabbitMQ broker after multiple retry sequences.');
  }

  /**
   * Publishes an asynchronous event data packet out onto the network exchange channel
   */
  async publishEvent(eventName: string, payload: any): Promise<void> {
    if (!this.channel) {
      console.warn('⚠️ Message broker channel uninitialized. Skipping event publish.');
      return;
    }

    const messageBuffer = Buffer.from(JSON.stringify({
      event: eventName,
      timestamp: new Date().toISOString(),
      data: payload
    }));

    this.channel.publish(this.EXCHANGE_NAME, '', messageBuffer, { persistent: true });
    console.log(`📡 Event Broadcasted successfully: [${eventName}]`);
  }

  /**
   * Spins up an isolated network worker consumer queue bound to our global event exchange
   */
  async consumeEvents(queueName: string, handler: (event: string, data: any) => Promise<void>): Promise<void> {
    if (!this.channel) {
      throw new Error('Message broker channel uninitialized. Cannot spin up consumer.');
    }

    await this.channel.assertQueue(queueName, { durable: true });
    await this.channel.bindQueue(queueName, this.EXCHANGE_NAME, '');

    this.channel.consume(queueName, async (msg) => {
      if (msg !== null) {
        try {
          const content = JSON.parse(msg.content.toString());
          await handler(content.event, content.data);
          this.channel!.ack(msg);
        } catch (error) {
          console.error(`💥 Failed to process event package in worker context [${queueName}]:`, error);
          this.channel!.nack(msg, false, true);
        }
      }
    });

    console.log(`📡 Background processing worker running cleanly for queue lines: [${queueName}]`);
  }
}

export const eventHub = new QueueManager();