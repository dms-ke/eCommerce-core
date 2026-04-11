import { 
  WebSocketGateway, 
  SubscribeMessage, 
  MessageBody, 
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*', 
  },
})
export class ProductsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ProductsGateway.name);

  @WebSocketServer() 
  server: Server; // Injected WebSocket server instance

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    client.emit('status', { message: 'Connected to E-commerce Updates' });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribeToProduct')
  handleSubscribe(client: Socket, @MessageBody() data: { productId: number }) {
    // Client joins a "room" for a specific product ID
    client.join(`product:${data.productId}`); 
    this.logger.log(`Client ${client.id} subscribed to Product ID: ${data.productId}`);
    client.emit('product_subscription_status', { subscribed: true, productId: data.productId });
  }

  /**
   * Pushes real-time stock updates only to clients interested in a specific product
   */
  public notifyProductStockUpdate(productId: number, newStock: number) {
    const payload = { 
      productId, 
      newStock, 
      timestamp: new Date().toISOString() 
    };

    // Emits the update only to clients in the specific product room
    this.server.to(`product:${productId}`).emit('stock_update', payload);
    this.logger.log(`Emitted stock update for Product ID: ${productId} to room product:${productId}`);
  }

  /**
   * 🔥 NEW: Emits a system-wide or specific low stock alert 
   * This is called by ProductsService when stock drops below 5
   */
  public emitLowStockAlert(product: any) {
    this.server.emit('lowStockAlert', {
      message: `Hurry! Only ${product.stock} left in stock for ${product.name}!`,
      product,
    });
    this.logger.log(`Emitted low stock alert for ${product.name}`);
  }
}