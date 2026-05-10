// src/logistics/logistics.service.ts
import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';

@Injectable()
export class LogisticsService {
  private readonly logger = new Logger(LogisticsService.name);
  private readonly apiKey = process.env.GOOGLE_MAPS_API_KEY;
  private readonly baseFee = Number(process.env.BASE_SHIPPING_FEE) || 200;
  private readonly ratePerKm = Number(process.env.RATE_PER_KM) || 50;

  /**
   * Calculates dynamic shipping fee based on driving distance
   * @param origin - Vendor's address or "lat,lng"
   * @param destination - Buyer's address or "lat,lng"
   */
  async calculateShippingFee(origin: string, destination: string) {
    if (!this.apiKey) {
      this.logger.error('GOOGLE_MAPS_API_KEY is missing in .env');
      throw new InternalServerErrorException('Shipping calculation is temporarily unavailable.');
    }

    try {
      // Format the URL for the Distance Matrix API
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${this.apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK') {
        throw new BadRequestException(`Google Maps API error: ${data.status}`);
      }

      const element = data.rows[0].elements[0];

      if (element.status !== 'OK') {
        // This happens if Google can't find a road route (e.g., across oceans)
        throw new BadRequestException(`No driving route found between these locations.`);
      }

      // Distance is returned in meters, convert to KM
      const distanceInMeters = element.distance.value;
      const distanceInKm = distanceInMeters / 1000;
      
      // Calculate the fee: Base Fee + (Distance * Rate per KM)
      const dynamicFee = this.baseFee + (distanceInKm * this.ratePerKm);

      return {
        distanceKm: Number(distanceInKm.toFixed(1)),
        estimatedDuration: element.duration.text, // e.g., "45 mins"
        originAddress: data.origin_addresses[0],
        destinationAddress: data.destination_addresses[0],
        shippingFee: Math.round(dynamicFee), // Round to nearest whole number
      };

    } catch (error: any) {
      this.logger.error(`Logistics Error: ${error.message}`);
      throw new BadRequestException(error.message || 'Failed to calculate shipping distance.');
    }
  }
}