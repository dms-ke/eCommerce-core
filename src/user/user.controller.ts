// src/user/user.controller.ts
import { Controller, Get, UseGuards, Request, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('customers/seller')
  @UseGuards(JwtAuthGuard)
  async getSellerCustomers(@Request() req) {
    try {
      const email = req.user.email || req.user.username; 
      const role = req.user.role || req.user.roles; // Ensure role array/string is captured
      
      if (!email) {
        throw new BadRequestException('No email/username found in token');
      }

      // Passes BOTH email and role to the service where the RBAC filtering actually happens!
      const customers = await this.userService.findCustomersBySeller(email, role);
      
      return { 
        message: `Found ${customers?.length || 0} unique customers.`,
        data: customers 
      };
      
    } catch (error: any) {
      console.error("❌ [FATAL ERROR in getSellerCustomers]:", error);
      throw new InternalServerErrorException(
        error.message || 'An unexpected error occurred while fetching customers'
      );
    }
  }
}