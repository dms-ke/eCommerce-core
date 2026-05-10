// src/disputes/disputes.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';
import { Dispute } from './dispute.entity';
import { Order } from '../orders/orders.entity'; // 🔥 Import Order entity

@Module({
  imports: [TypeOrmModule.forFeature([Dispute, Order])], // 🔥 Register the entity here
  providers: [DisputesService],
  controllers: [DisputesController],
  exports: [DisputesService],
})
export class DisputesModule {}