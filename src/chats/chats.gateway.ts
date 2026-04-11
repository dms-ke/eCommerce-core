// src/chats/chats.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatsGateway {
  @WebSocketServer() server: Server;
  private logger = new Logger('ChatsGateway');

  // Customer joins this room to hear replies for a specific order
  @SubscribeMessage('joinOrderChat')
  handleJoinRoom(@MessageBody() data: { orderId: number }, @ConnectedSocket() client: Socket) {
    const room = `order_${data.orderId}`;
    client.join(room);
    this.logger.log(`User joined Order Room: ${room}`);
  }

  // Admin joins this room to hear all new messages sent to them
  @SubscribeMessage('joinSellerInbox')
  handleJoinSellerInbox(
    @MessageBody() data: { sellerId: number },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data.sellerId) return;
    const room = `seller_id_${data.sellerId}`;
    client.join(room);
    this.logger.log(`Admin joined Seller Room: ${room}`);
  }

  sendRealTimeMessage(orderId: number, message: any) {
    const orderRoom = `order_${orderId}`;
    const sellerRoom = `seller_id_${message.sellerId}`;

    // 1. Send to the specific order (Customer hears this)
    this.server.to(orderRoom).emit('newChatMessage', message);
    
    // 2. Send to the seller's global inbox (Admin hears this)
    this.server.to(sellerRoom).emit('newChatMessage', message);
  }
}