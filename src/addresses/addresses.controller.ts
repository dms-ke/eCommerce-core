// src/addresses/addresses.controller.ts
import { Controller, Get, Post, Delete, Patch, Param, Body, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from './address.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; 

@UseGuards(JwtAuthGuard)
@Controller('addresses')
export class AddressesController {
  constructor(
    @InjectRepository(Address)
    private addressRepository: Repository<Address>,
  ) {}

  @Post()
  async createAddress(@Body() body: any, @Request() req) {
    const userId = req.user.userId || req.user.sub || req.user.id;
    if (!userId) throw new BadRequestException("User ID not found in token");

    if (body.isDefault) {
      await this.addressRepository.update({ user: { id: userId } }, { isDefault: false });
    }

    const newAddress = this.addressRepository.create({
      ...body,
      user: { id: userId },
    });
    
    return this.addressRepository.save(newAddress);
  }

  @Get()
  async getUserAddresses(@Request() req) {
    const userId = req.user.userId || req.user.sub || req.user.id;
    if (!userId) throw new BadRequestException("User ID not found in token");

    return this.addressRepository.find({
      where: { user: { id: userId } },
      order: { isDefault: 'DESC', id: 'DESC' }, 
    });
  }

  @Delete(':id')
  async deleteAddress(@Param('id') id: string, @Request() req) {
    const userId = req.user.userId || req.user.sub || req.user.id;
    if (!userId) throw new BadRequestException("User ID not found in token");

    const result = await this.addressRepository.delete({ 
      id: id as any, 
      user: { id: userId } 
    });

    if (result.affected === 0) {
      throw new BadRequestException("Address not found or you are not authorized to delete it.");
    }

    return { message: "Address deleted successfully" };
  }

  // 🔥 NEW: Edit Address Endpoint
  @Patch(':id')
  async updateAddress(@Param('id') id: string, @Body() body: any, @Request() req) {
    const userId = req.user.userId || req.user.sub || req.user.id;
    if (!userId) throw new BadRequestException("User ID not found in token");

    // If they are making this the new default address, unset all others first
    if (body.isDefault) {
      await this.addressRepository.update({ user: { id: userId } }, { isDefault: false });
    }

    // Update the specific address ensuring it belongs to this user
    const result = await this.addressRepository.update(
      { id: id as any, user: { id: userId } }, 
      body
    );

    if (result.affected === 0) {
      throw new BadRequestException("Address not found or unauthorized to edit.");
    }

    // Return the newly updated address
    return this.addressRepository.findOne({ where: { id: id as any } });
  }
}