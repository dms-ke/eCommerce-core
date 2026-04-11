// src/cart/cart.controller.ts

import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { CartService } from './cart.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('cart')
@UseGuards(JwtAuthGuard) // Every cart route requires the user to be logged in!
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async getCart(@Request() req) {
    // Extract user ID safely just like we did in the Products Controller
    const userId = req.user.sub || req.user.userId || req.user.id;
    if (!userId) throw new BadRequestException('Invalid user token');

    return this.cartService.getCart(userId);
  }

  @Post('items')
  async addItemToCart(
    @Request() req,
    @Body() body: { productId: number; quantity: number }
  ) {
    const userId = req.user.sub || req.user.userId || req.user.id;
    if (!userId) throw new BadRequestException('Invalid user token');

    return this.cartService.addItemToCart(userId, body.productId, body.quantity);
  }

  @Delete('items/:productId')
  async removeItemFromCart(
    @Request() req,
    @Param('productId') productId: string
  ) {
    const userId = req.user.sub || req.user.userId || req.user.id;
    if (!userId) throw new BadRequestException('Invalid user token');

    return this.cartService.removeItemFromCart(userId, Number(productId));
  }
}