// src/cart/cart.service.ts

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart } from './cart.entity';
import { CartItem } from './cart-item.entity';
import { Product } from '../products/products.entity';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  /**
   * Fetches the user's cart. If they don't have one, it creates an empty one.
   */
  async getCart(userId: number): Promise<Cart> {
    let cart = await this.cartRepository.findOne({
      where: { user: { id: userId } },
      relations: ['items', 'items.product'],
    });

    if (!cart) {
      cart = this.cartRepository.create({ user: { id: userId } });
      await this.cartRepository.save(cart);
    }

    return cart;
  }

  /**
   * Adds an item to the cart, enforcing stock limits.
   */
  async addItemToCart(userId: number, productId: number, quantity: number): Promise<Cart> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }

    // 1. Check if the product exists
    const product = await this.productRepository.findOneBy({ id: productId });
    if (!product) {
      throw new NotFoundException(`Product #${productId} not found`);
    }

    // 2. Get the user's cart
    const cart = await this.getCart(userId);

    // 3. Check if the item is already in the cart
    const existingItem = cart.items?.find(item => item.product.id === productId);

    // Calculate what the NEW total quantity would be in the cart
    const newTotalQuantity = existingItem ? existingItem.quantity + quantity : quantity;

    // 4. Enforce Stock Limits!
    if (newTotalQuantity > product.stock) {
      throw new BadRequestException(
        `Cannot add ${quantity} items. Only ${product.stock} left in stock (You already have ${existingItem?.quantity || 0} in your cart).`
      );
    }

    // 5. Save the item
    if (existingItem) {
      existingItem.quantity = newTotalQuantity;
      await this.cartItemRepository.save(existingItem);
    } else {
      const newItem = this.cartItemRepository.create({
        cart: cart,
        product: product,
        quantity: quantity,
      });
      await this.cartItemRepository.save(newItem);
    }

    // 6. Return the updated cart
    return this.getCart(userId);
  }

  /**
   * Removes a specific product entirely from the user's cart.
   */
  async removeItemFromCart(userId: number, productId: number): Promise<Cart> {
    const cart = await this.getCart(userId);

    const existingItem = cart.items?.find(item => item.product.id === productId);

    if (!existingItem) {
      throw new NotFoundException(`Product #${productId} is not in your cart`);
    }

    // Remove the item from the database
    await this.cartItemRepository.remove(existingItem);

    // Fetch and return the updated cart
    return this.getCart(userId);
  }
}