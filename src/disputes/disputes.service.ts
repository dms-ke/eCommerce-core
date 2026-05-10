// src/disputes/disputes.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dispute } from './dispute.entity';
import { Order } from '../orders/orders.entity'; 

@Injectable()
export class DisputesService {
  constructor(
    @InjectRepository(Dispute)
    private disputeRepository: Repository<Dispute>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  // 1. Fetch disputes based on Role
  async getDisputes(userId: number, role: string | string[]) {
    const isSuperAdmin = role === 'ADMIN' || role === 'admin' || (Array.isArray(role) && (role.includes('admin') || role.includes('ADMIN')));

    if (isSuperAdmin) {
      return this.disputeRepository.find({ order: { createdAt: 'DESC' } });
    } else {
      return this.disputeRepository.find({ 
        where: { sellerId: userId }, 
        order: { createdAt: 'DESC' } 
      });
    }
  }

  // 2. Accept & Refund (🔥 UPDATED TO ALLOW ADMINS)
  async acceptAndRefund(disputeId: number, userId: number, role?: string | string[]) {
    const isSuperAdmin = role === 'ADMIN' || role === 'admin' || (Array.isArray(role) && (role.includes('admin') || role.includes('ADMIN')));
    
    // Admins query by ID only. Sellers query by ID + sellerId.
    const whereClause = isSuperAdmin ? { id: disputeId } : { id: disputeId, sellerId: userId };
    
    const dispute = await this.disputeRepository.findOne({ where: whereClause });
    if (!dispute) throw new NotFoundException('Dispute not found or unauthorized');

    dispute.status = 'RESOLVED';
    await this.disputeRepository.save(dispute);

    const order = await this.orderRepository.findOne({ where: { id: dispute.orderId } });
    if (order) {
      order.status = 'REFUNDED';
      await this.orderRepository.save(order);
    }

    return { message: 'Dispute resolved and customer refunded', dispute };
  }

  // 3. Escalate to Admin (🔥 UPDATED TO ALLOW ADMINS)
  async escalateDispute(disputeId: number, userId: number, role?: string | string[]) {
    const isSuperAdmin = role === 'ADMIN' || role === 'admin' || (Array.isArray(role) && (role.includes('admin') || role.includes('ADMIN')));
    
    const whereClause = isSuperAdmin ? { id: disputeId } : { id: disputeId, sellerId: userId };

    const dispute = await this.disputeRepository.findOne({ where: whereClause });
    if (!dispute) throw new NotFoundException('Dispute not found or unauthorized');

    dispute.status = 'ESCALATED';
    return this.disputeRepository.save(dispute);
  }

  // 4. Customer creates a new dispute
  async createDispute(customerId: number, customerName: string, data: any) {
    const dispute = this.disputeRepository.create({
      customerId,
      customerName,
      orderId: data.orderId,
      productId: data.productId,
      productName: data.productName,
      sellerId: data.sellerId,
      amount: data.amount,
      reason: data.reason,
      photos: data.photos || [],
      status: 'OPEN',
    });

    const savedDispute = await this.disputeRepository.save(dispute);

    const order = await this.orderRepository.findOne({ where: { id: data.orderId } });
    if (order) {
      order.status = 'DISPUTED';
      order.disputeReason = data.reason;
      await this.orderRepository.save(order);
    }

    return savedDispute;
  }

  // ========================================================
  // 🔥 NEW: ADMIN GOD-MODE ACTIONS
  // ========================================================

  // 5. Admin Verdict: Force Refund (Customer Wins)
  async adminForceRefund(disputeId: number) {
    const dispute = await this.disputeRepository.findOne({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('Dispute not found');

    // Mark dispute as resolved in favor of the customer
    dispute.status = 'ADMIN_REFUNDED'; 
    await this.disputeRepository.save(dispute);

    // Update the actual order status to refund the money
    const order = await this.orderRepository.findOne({ where: { id: dispute.orderId } });
    if (order) {
      order.status = 'REFUNDED';
      await this.orderRepository.save(order);
    }

    return { message: 'Admin forced refund to customer', dispute };
  }

  // 6. Admin Verdict: Release Funds (Seller Wins)
  async adminReleaseFunds(disputeId: number) {
    const dispute = await this.disputeRepository.findOne({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('Dispute not found');

    // Mark dispute as closed (customer claim denied)
    dispute.status = 'ADMIN_CLOSED'; 
    await this.disputeRepository.save(dispute);

    // Revert the order status to DELIVERED so the seller gets paid
    const order = await this.orderRepository.findOne({ where: { id: dispute.orderId } });
    if (order) {
      order.status = 'DELIVERED'; 
      await this.orderRepository.save(order);
    }

    return { message: 'Admin closed dispute and released funds to seller', dispute };
  }
}