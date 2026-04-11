import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddressesService } from './addresses.service';
import { AddressesController } from './addresses.controller';
import { Address } from './address.entity'; // Import the new entity

@Module({
  // 1. Import TypeOrmModule so the Address repository can be injected into your service
  imports: [TypeOrmModule.forFeature([Address])],
  
  // 2. Register the controller to handle incoming HTTP requests (GET, POST)
  controllers: [AddressesController],
  
  // 3. Register the service containing your business logic
  providers: [AddressesService],
  
  // 4. (Optional) Export the service in case other modules need to use it later
  exports: [AddressesService], 
})
export class AddressesModule {}