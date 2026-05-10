// src/disputes/disputes.controller.ts
import { Controller, Get, Patch, Post, Body, Param, UseGuards, Request, UnauthorizedException } from '@nestjs/common';
import { DisputesService } from './disputes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Get()
  async fetchDisputes(@Request() req) {
    const userId = req.user.sub || req.user.userId || req.user.id;
    const role = req.user.role || req.user.roles;
    return this.disputesService.getDisputes(Number(userId), role);
  }

  @Patch(':id/accept')
  async acceptDispute(@Request() req, @Param('id') disputeId: number) {
    const userId = req.user.sub || req.user.userId || req.user.id;
    const role = req.user.role || req.user.roles; 
    return this.disputesService.acceptAndRefund(Number(disputeId), Number(userId), role);
  }

  @Patch(':id/escalate')
  async escalateDispute(@Request() req, @Param('id') disputeId: number) {
    const userId = req.user.sub || req.user.userId || req.user.id;
    const role = req.user.role || req.user.roles; 
    return this.disputesService.escalateDispute(Number(disputeId), Number(userId), role);
  }

  @Post()
  async createDispute(@Request() req, @Body() body: any) {
    const customerId = req.user.sub || req.user.userId || req.user.id;
    const customerName = req.user.fullName || req.user.username || req.user.email || 'Customer'; 
    return this.disputesService.createDispute(Number(customerId), customerName, body);
  }

  // ========================================================
  // 🔥 NEW: ADMIN GOD-MODE ENDPOINTS
  // ========================================================

  // PATCH /disputes/:id/admin-refund -> Admin favors Customer
  @Patch(':id/admin-refund')
  async adminForceRefund(@Request() req, @Param('id') disputeId: number) {
    const role = req.user.role || req.user.roles;
    const isSuperAdmin = role === 'ADMIN' || role === 'admin' || (Array.isArray(role) && (role.includes('admin') || role.includes('ADMIN')));
    
    if (!isSuperAdmin) {
      throw new UnauthorizedException('Access denied. Only Admins can force refunds.');
    }
    
    return this.disputesService.adminForceRefund(Number(disputeId));
  }

  // PATCH /disputes/:id/admin-release -> Admin favors Seller
  @Patch(':id/admin-release')
  async adminReleaseFunds(@Request() req, @Param('id') disputeId: number) {
    const role = req.user.role || req.user.roles;
    const isSuperAdmin = role === 'ADMIN' || role === 'admin' || (Array.isArray(role) && (role.includes('admin') || role.includes('ADMIN')));
    
    if (!isSuperAdmin) {
      throw new UnauthorizedException('Access denied. Only Admins can release funds.');
    }
    
    return this.disputesService.adminReleaseFunds(Number(disputeId));
  }
}