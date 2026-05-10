// src/user/user.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findOneByEmail(email: string): Promise<User | null> { 
    return this.userRepository.findOne({ where: { email } });
  }

  async findOneByResetToken(token: string): Promise<User | null> { 
    return this.userRepository.findOne({ where: { resetPasswordToken: token } });
  }

  async create(email: string, pass: string, role: string = 'user'): Promise<User> {
    const password_hash = await bcrypt.hash(pass, 10);
    const newUser = this.userRepository.create({ 
      email, 
      password_hash,
      role 
    });
    
    await this.userRepository.save(newUser);
    return newUser;
  }

  async save(user: User): Promise<User> {
    return this.userRepository.save(user);
  }

  // ==========================================
  // SELLER DASHBOARD LOGIC (RBAC ENFORCED)
  // ==========================================

  async findCustomersBySeller(email: string, role?: string | string[]): Promise<any[]> {
    // 1. Determine if the user has Admin privileges
    const isAdmin = role === 'ADMIN' || role === 'admin' || (Array.isArray(role) && (role.includes('admin') || role.includes('ADMIN')));

    const query = this.userRepository.createQueryBuilder('customer')
      .innerJoinAndSelect('customer.orders', 'order')
      .innerJoinAndSelect('order.items', 'item')
      .leftJoinAndSelect('item.product', 'product')
      .withDeleted();

    // 🔥 RBAC LOGIC: If the user is NOT an admin, STRICTLY filter to only show their buyers
    if (!isAdmin) {
      query.where('product.sellerName = :email', { email });
    }

    const customers = await query.getMany();

    // 2. Data Aggregation: Map over the customers to calculate their total spend
    const customersMap = new Map();

    customers.forEach(customer => {
      if (!customersMap.has(customer.id)) {
        customersMap.set(customer.id, {
          id: customer.id,
          // 🔥 Fixed: Safely cast to any to bypass TS error if entity is missing this property
          fullName: (customer as any).fullName || (customer as any).username || 'Guest/Unknown', 
          email: customer.email,
          orderCount: 0,
          totalSpent: 0,
          uniqueOrders: new Set() // Used to prevent double counting an order with multiple items
        });
      }

      const customerStats = customersMap.get(customer.id);

      customer.orders.forEach(order => {
        let orderTotalForThisView = 0;
        let hasValidItem = false;

        order.items.forEach(item => {
           // If they are Admin, count everything. If Seller, count ONLY their own products.
           if (isAdmin || (item.product && item.product.sellerName === email)) {
              orderTotalForThisView += (Number(item.price) * item.quantity);
              hasValidItem = true;
           }
        });

        if (hasValidItem) {
           if (!customerStats.uniqueOrders.has(order.id)) {
             customerStats.orderCount += 1;
             customerStats.uniqueOrders.add(order.id);
           }
           customerStats.totalSpent += orderTotalForThisView;
        }
      });
    });

    // 3. Clean up the Set before returning JSON and sort by total spent
    const result = Array.from(customersMap.values()).map(c => {
      delete c.uniqueOrders; 
      return c;
    });

    return result.sort((a, b) => b.totalSpent - a.totalSpent);
  }
}