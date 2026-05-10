// src/logistics/logistics.controller.ts
import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { LogisticsService } from './logistics.service';

@Controller('logistics')
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @Get('estimate')
  async getShippingEstimate(
    @Query('origin') origin: string,
    @Query('destination') destination: string
  ) {
    if (!origin || !destination) {
      throw new BadRequestException('Both origin and destination are required.');
    }
    
    return await this.logisticsService.calculateShippingFee(origin, destination);
  }
}