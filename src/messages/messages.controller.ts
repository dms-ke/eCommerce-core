// src/messages/messages.controller.ts
import { Controller, Get, Post, Body, Param, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  // 1. Customer sending a message
  @Post()
  async sendMessage(@Request() req, @Body() body: { sellerName: string; content: string; orderId: number; productId: number; sellerId: number }) {
    const userId = req.user.sub || req.user.userId || req.user.id;
    return this.messagesService.sendMessage(
      userId, 
      Number(body.sellerId), 
      body.sellerName, 
      body.content, 
      Number(body.orderId), 
      Number(body.productId), 
      false
    );
  }

  // 2. NEW: Customer fetching their specific thread (ID-BASED)
  // This is what was missing! It allows the customer to see the history.
  @Get(':sellerId/:orderId/:productId')
  async getConversation(
    @Request() req, 
    @Param('sellerId') sellerId: number, 
    @Param('orderId') orderId: number, 
    @Param('productId') productId: number
  ) {
    // The customer's identity comes from their token
    const userId = req.user.sub || req.user.userId || req.user.id;
    return this.messagesService.getConversation(userId, Number(sellerId), Number(orderId), Number(productId));
  }

  // 3. Seller fetching their entire inbox (ID-BASED)
  @Get('inbox')
  async getSellerInbox(@Request() req) {
    const sellerId = req.user.sub || req.user.userId || req.user.id;
    return this.messagesService.getSellerInbox(Number(sellerId));
  }

  // 4. Seller sending a reply
  @Post('reply')
  async sellerReply(
    @Request() req,
    @Body() body: { customerId: number; sellerName: string; content: string; orderId: number; productId: number }
  ) {
    if (!body.customerId || !body.content || !body.orderId || !body.productId) {
      throw new BadRequestException('Missing required fields');
    }

    const adminId = req.user.sub || req.user.userId || req.user.id;
    
    // We pass body.customerId as the 'senderId' to keep the thread grouped 
    // by the customer's ID, but set isFromSeller to true.
    return this.messagesService.sendMessage(
      body.customerId, 
      adminId, 
      body.sellerName, 
      body.content, 
      Number(body.orderId), 
      Number(body.productId), 
      true
    );
  }
}