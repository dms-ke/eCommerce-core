// src/orders/orders.controller.ts
import { Controller, Get, Post, Patch, Body, UseGuards, Request, Param, ParseIntPipe, BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; 
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get('all')
  @UseGuards(RolesGuard) 
  @Roles('admin')
  async getAllOrdersAdmin() {
    const orders = await this.ordersService.findAllAdmin();
    return { 
      message: `Found ${orders.length} total orders in the system`, 
      data: orders 
    };
  }

  // ==========================================
  // SELLER DASHBOARD ENDPOINT (RBAC ENFORCED)
  // ==========================================
  @Get('seller')
  async getSellerOrders(@Request() req) {
    const email = req.user.email || req.user.username;
    const role = req.user.role || req.user.roles; // Extract role from JWT
    
    if (!email) {
      throw new BadRequestException('Invalid user token: missing email/username');
    }

    // 🔥 RBAC LOGIC: Check if user is a global Admin
    const isAdmin = role === 'ADMIN' || role === 'admin' || (Array.isArray(role) && (role.includes('admin') || role.includes('ADMIN')));

    if (isAdmin) {
      const allOrders = await this.ordersService.findAllAdmin();
      return { message: `Found ${allOrders.length} total platform orders`, data: allOrders };
    }

    // 🔥 Strict Seller Boundary
    const orders = await this.ordersService.findOrdersBySellerEmail(email);
    return { 
      message: `Found ${orders.length} orders for your products`, 
      data: orders 
    };
  }
  
  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('admin') 
  async updateOrderStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string
  ) {
    if (!status) throw new BadRequestException('Status is required');
    return this.ordersService.updateOrderStatus(id, status);
  }

  @Get() 
  async findAll(@Request() req) {
    const userId = req.user.sub || req.user.userId || req.user.id;
    if (!userId) throw new BadRequestException('Invalid user token');

    const userOrders = await this.ordersService.findAllByUser(userId);
    return { message: `Found ${userOrders.length} orders`, orders: userOrders };
  }

  @Post()
  async createOrder(@Body() orderData: any, @Request() req) {
    const userId = req.user.sub || req.user.userId || req.user.id;
    if (!userId) throw new BadRequestException('Invalid user token');

    return this.ordersService.checkoutCart(userId, orderData);
  }

  @Patch(':id/pay')
  async payOrder(@Param('id', ParseIntPipe) id: number, @Body('paymentMethod') paymentMethod: string) {
    return this.ordersService.markAsPaid(id, paymentMethod);
  }

  @Patch(':id/cancel')
  async cancelOrder(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.cancelOrder(id);
  }
}