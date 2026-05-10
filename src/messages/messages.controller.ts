// src/messages/messages.controller.ts
import { Controller, Get, Post, Body, Param, UseGuards, Request, BadRequestException, UnauthorizedException } from '@nestjs/common';
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
      body.sellerName || 'Vendor', 
      body.content, 
      Number(body.orderId), 
      Number(body.productId), 
      false
    );
  }

  // 2. Customer fetching their specific thread (ID-BASED)
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
    @Body() body: { customerId: number; sellerName?: string; content: string; orderId: number; productId: number }
  ) {
    if (!body.customerId || !body.content || !body.orderId || !body.productId) {
      throw new BadRequestException('Missing required fields');
    }

    const adminId = req.user.sub || req.user.userId || req.user.id;
    
    // 🔥 FIX: Extract sellerName from JWT token instead of relying on frontend body!
    const sellerName = req.user.username || req.user.fullName || req.user.email || 'System Vendor';
    
    // We pass body.customerId as the 'senderId' to keep the thread grouped 
    // by the customer's ID, but set isFromSeller to true
    return this.messagesService.sendMessage(
      body.customerId, // senderId (the customer)
      adminId,         // sellerId
      sellerName,      // 🔥 Passing the extracted token name!
      body.content,
      body.orderId,
      body.productId,
      true             // isFromSeller
    );
  }

  // ========================================================
  // 🔥 NEW: ADMIN EVIDENCE FETCHER ENDPOINT
  // ========================================================

  // GET /messages/admin/thread/:orderId/:productId
  @Get('admin/thread/:orderId/:productId')
  async getAdminThread(
    @Request() req, 
    @Param('orderId') orderId: number, 
    @Param('productId') productId: number
  ) {
    const role = req.user.role || req.user.roles;
    const isSuperAdmin = role === 'ADMIN' || role === 'admin' || (Array.isArray(role) && (role.includes('admin') || role.includes('ADMIN')));

    // Security Check: If the user is a Seller or Customer, they get blocked!
    if (!isSuperAdmin) {
      throw new UnauthorizedException('Access denied. Only Admins can view third-party chat logs.');
    }

    return this.messagesService.getAdminThread(Number(orderId), Number(productId));
  }
}