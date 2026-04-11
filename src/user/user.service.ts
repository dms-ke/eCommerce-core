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
  // SELLER DASHBOARD LOGIC
  // ==========================================

  /**
   * Fetches customers based on role. Admins see all customers who bought anything.
   */
  async findCustomersBySeller(email: string, role?: string): Promise<User[]> {
    const query = this.userRepository.createQueryBuilder('customer')
      .innerJoin('customer.orders', 'order')
      .innerJoin('order.items', 'item')
      // 🔥 FIX: Changed from innerJoin to leftJoin! 
      // This stops TypeORM from aggressively dropping the customer if the product is soft-deleted.
      .leftJoin('item.product', 'product')
      .select([
        'customer.id', 
        'customer.email', 
        'customer.role', 
        'customer.created_at' 
      ])
      .distinct(true)
      // 🔥 Keep this flag to allow soft-deleted records through
      .withDeleted();

    // If the user is NOT an admin, only show them customers who bought products matching their email as sellerName
    if (role !== 'admin') {
       query.where('product.sellerName = :email', { email });
    }

    return query.getMany();
  }
}