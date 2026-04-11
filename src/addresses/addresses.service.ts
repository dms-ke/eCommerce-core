import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from './address.entity';

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address)
    private addressRepository: Repository<Address>,
  ) {}

  // Fetch all addresses for a specific user
  async getUserAddresses(userId: number): Promise<Address[]> {
    return this.addressRepository.find({
      where: { user: { id: userId } },
      order: {
        isDefault: 'DESC', // Put the default address at the top of the list!
        id: 'DESC',        // Then sort the rest by newest first
      },
    });
  }

  // Save a new address
  async createAddress(userId: number, addressData: Partial<Address>): Promise<Address> {
    
    // If the new address is marked as default, we must un-default all other addresses for this user
    if (addressData.isDefault) {
      await this.addressRepository.update(
        { user: { id: userId } }, 
        { isDefault: false }
      );
    }

    // Create and save the new address
    const newAddress = this.addressRepository.create({
      ...addressData,
      user: { id: userId }, // Link it to the user who created it
    });

    return this.addressRepository.save(newAddress);
  }
}