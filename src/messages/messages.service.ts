// src/messages/messages.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './message.entity';
import { ChatsGateway } from '../chats/chats.gateway'; 

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @InjectRepository(Message)
    private messagesRepository: Repository<Message>,
    private readonly chatsGateway: ChatsGateway,
  ) {}

  async sendMessage(
    senderId: number, 
    sellerId: number, 
    sellerName: string, 
    content: string, 
    orderId: number, 
    productId: number, 
    isFromSeller: boolean = false
  ) {
    const newMessage = this.messagesRepository.create({
      senderId,
      sellerId, 
      sellerName,
      content,
      orderId,
      productId,
      isFromSeller, 
    });

    const savedMessage = await this.messagesRepository.save(newMessage);

    const fullMessage = await this.messagesRepository.findOne({
      where: { id: savedMessage.id },
      relations: ['sender', 'order', 'product'],
      // 🔥 FIX: Include soft-deleted products so real-time socket broadcasts 
      // don't send `null` products to the frontend and break the UI!
      withDeleted: true 
    });

    try {
      if (fullMessage) {
        this.chatsGateway.sendRealTimeMessage(orderId, fullMessage);
      }
    } catch (error) {
      this.logger.error(`Broadcast failed: ${error.message}`);
    }

    return fullMessage || savedMessage;
  }

  // Query messages for a specific product within an order.
  // This ensures the customer sees both their messages and the seller's replies.
  async getConversation(userId: number, sellerId: number, orderId: number, productId: number) {
    return this.messagesRepository.find({
      where: { 
        senderId: userId, // The thread is identified by the customer's ID
        sellerId: sellerId,
        orderId: orderId,
        productId: productId
      },
      order: { createdAt: 'ASC' },
    });
  }

  async getSellerInbox(sellerId: number) {
    return this.messagesRepository.find({
      where: { sellerId },
      relations: ['sender', 'order', 'product'],
      // 🔥 FIX: Force TypeORM to pull the historical/soft-deleted product data
      // This restores the Product Name and fixes the "Info" button!
      withDeleted: true,
      order: { createdAt: 'DESC' },
    });
  }
}