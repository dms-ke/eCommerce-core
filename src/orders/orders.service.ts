// src/orders/orders.service.ts
import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order } from './orders.entity'; 
import { OrderItem } from './order-item.entity';
import { Product } from '../products/products.entity';
import { MpesaService } from '../mpesa/mpesa.service'; 

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order) private ordersRepository: Repository<Order>,
    @InjectRepository(Product) private productsRepository: Repository<Product>,
    private dataSource: DataSource,
    private mpesaService: MpesaService 
  ) {}

  async findAllByUser(userId: number): Promise<Order[]> {
    return this.ordersRepository.find({
      where: { userId: userId },
      relations: ['items', 'items.product'],
      // 🔥 FIX: Include soft-deleted products so customer's order history stays intact!
      withDeleted: true,
      order: { orderDate: 'DESC' } 
    });
  }

  async checkoutCart(userId: number, orderData: any): Promise<any> {
    return this.dataSource.transaction(async (manager) => {
      
      const { items, phoneNumber, paymentMethod = 'MPESA', shippingAddress, shippingFee = 0 } = orderData;

      if (!items || items.length === 0) {
        throw new BadRequestException('Your cart is empty. Add items before checking out.');
      }
      if (!shippingAddress) {
        throw new BadRequestException('A valid shipping address is required.');
      }

      let subtotal = 0;
      const processedItems: { product: Product; quantity: number }[] = [];

      for (const item of items) {
        const product = await manager.findOne(Product, { where: { id: item.productId } });
        if (!product) throw new NotFoundException(`Product #${item.productId} not found`);
        if (item.quantity > product.stock) {
          throw new BadRequestException(`Not enough stock for ${product.name}. Only ${product.stock} left.`);
        }
        
        subtotal += item.quantity * Number(product.price);
        processedItems.push({ product, quantity: item.quantity });
      }

      const grandTotal = subtotal + Number(shippingFee);

      const newOrder = manager.create(Order, {
        userId,
        totalAmount: grandTotal,
        status: 'PENDING_PAYMENT',
        shippingAddress,
        phoneNumber,
        paymentMethod,
        orderDate: new Date() // 🔥 FIX: Explicitly set the date here!
      });

      const savedOrder = await manager.save(newOrder);

      for (const { product, quantity } of processedItems) {
        const orderItem = manager.create(OrderItem, {
          order: savedOrder,
          product,
          quantity,
          price: Number(product.price)
        });
        await manager.save(orderItem);

        product.stock -= quantity;
        await manager.save(product);
      }

      if (paymentMethod === 'MPESA' && phoneNumber) {
        try {
          const mpesaResponse = await this.mpesaService.initiateStkPush(
            phoneNumber,
            Math.round(grandTotal).toString(),
            savedOrder.id // ✅ Fix: Just pass the raw number
          );
          return {
            message: 'Order created. Complete payment on your phone.',
            order: savedOrder,
            paymentData: mpesaResponse
          };
        } catch (error) {
          this.logger.error('M-Pesa STK push failed:', error);
          throw new BadRequestException('Failed to initiate M-Pesa payment.');
        }
      }

      return {
        message: 'Order created successfully.',
        order: savedOrder
      };
    });
  }

  async markAsPaid(orderId: number, paymentMethod: string) {
    const order = await this.ordersRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order #${orderId} not found`);

    order.status = 'PAID';
    order.paymentMethod = paymentMethod;
    return this.ordersRepository.save(order);
  }

  async cancelOrder(orderId: number) {
    const order = await this.ordersRepository.findOne({ 
      where: { id: orderId },
      relations: ['items', 'items.product']
    });
    if (!order) throw new NotFoundException(`Order #${orderId} not found`);

    for (const item of order.items) {
      const product = await this.productsRepository.findOneBy({ id: item.product.id });
      if (product) {
        product.stock += item.quantity;
        await this.productsRepository.save(product);
      }
    }
    
    order.status = 'CANCELLED';
    return this.ordersRepository.save(order);
  }

  // ==========================================
  // DASHBOARD DATA FETCHING
  // ==========================================

  async findAllAdmin(): Promise<Order[]> {
    return this.ordersRepository.find({
      relations: ['items', 'items.product', 'user'],
      // 🔥 FIX: Include soft-deleted products and users to prevent broken order history UI
      withDeleted: true,
      order: { createdAt: 'DESC' } 
    });
  }

  /**
   * Fetches ONLY orders that contain products belonging to the logged-in seller.
   */
  async findOrdersBySellerEmail(email: string): Promise<Order[]> {
    const sellerName = email;

    return this.ordersRepository.createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'item')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('order.user', 'customer')
      .where('product.sellerName = :sellerName', { sellerName }) 
      // 🔥 FIX: The query builder version of `withDeleted: true`
      .withDeleted()
      .orderBy('order.createdAt', 'DESC')
      .getMany();
  }

  async updateOrderStatus(orderId: number, status: string): Promise<Order> {
    const order = await this.ordersRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order #${orderId} not found`);
    
    order.status = status;
    return this.ordersRepository.save(order);
  }
}