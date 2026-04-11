// src/mpesa/mpesa.module.ts
import { Module } from '@nestjs/common';
import { MpesaService } from './mpesa.service';

@Module({
  providers: [MpesaService],
  exports: [MpesaService] // <-- Add this so other modules can use it!
})
export class MpesaModule {}