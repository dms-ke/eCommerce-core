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
      // 🔥 Include soft-deleted products so customer's order history stays intact!
      withDeleted: true,
      order: { orderDate: 'DESC' } 
    });
  }

  async checkoutCart(userId: number, orderData: any): Promise<any> {
    return this.dataSource.transaction(async (manager) => {
      
      // 🔥 UPDATED: Added deliveryMethod extraction here
      const { items, phoneNumber, paymentMethod = 'MPESA', shippingAddress, shippingFee = 0, deliveryMethod = 'VENDOR' } = orderData;

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

      // 🔥 UPDATED: Added deliveryMethod to the order creation
      const newOrder = manager.create(Order, {
        userId,
        totalAmount: grandTotal,
        status: 'PENDING_PAYMENT',
        shippingAddress,
        phoneNumber,
        paymentMethod,
        shippingFee: Number(shippingFee), // Good practice to ensure it's a number
        deliveryMethod, // Stores 'VENDOR' or 'PLATFORM'
        orderDate: new Date() // Explicitly set the date here!
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
            savedOrder.id // Just pass the raw number
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

  // 🔥 FIX: BULLETPROOF markAsPaid METHOD!
  async markAsPaid(orderId: number, provider: string): Promise<Order> {
    // 1. Query ONLY by the exact ID. Force TypeORM to find it even if soft-deleted/modified.
    const order = await this.ordersRepository.findOne({ 
      where: { id: orderId },
      withDeleted: true 
    });
    
    if (!order) {
      this.logger.error(`CRITICAL: markAsPaid failed. Order #${orderId} genuinely does not exist in the orders table.`);
      throw new NotFoundException(`Order #${orderId} not found`);
    }

    // 2. Safely update the status and provider
    order.status = 'PAID';
    order.paymentMethod = provider || 'MPESA'; 
    
    // 3. Save and return
    return this.ordersRepository.save(order);
  }

  async cancelOrder(orderId: number) {
    const order = await this.ordersRepository.findOne({ 
      where: { id: orderId },
      relations: ['items', 'items.product'],
      // Fetch order including soft-deleted products
      withDeleted: true 
    });
    
    if (!order) throw new NotFoundException(`Order #${orderId} not found`);

    for (const item of order.items) {
      // Safely check if the product exists using optional chaining (?.)
      if (item.product?.id) {
        const product = await this.productsRepository.findOne({
          where: { id: item.product.id },
          withDeleted: true // Ensure we can find and update stock even if soft-deleted
        });
        
        if (product) {
          product.stock += item.quantity;
          await this.productsRepository.save(product);
        }
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
      .withDeleted()
      .orderBy('order.createdAt', 'DESC')
      .getMany();
  }

  // ==========================================
  // DYNAMIC STATUS & DISPUTE HANDLER
  // ==========================================
  
  async updateOrderStatus(orderId: number, status: string, reason?: string): Promise<Order> {
    const order = await this.ordersRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order #${orderId} not found`);
    
    order.status = status;

    // If the PaymentsService passed a reason (e.g., when freezing Escrow), save it!
    if (reason) {
      order.disputeReason = reason;
    }

    return this.ordersRepository.save(order);
  }
}