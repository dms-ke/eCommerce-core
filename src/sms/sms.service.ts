// src/sms/sms.service.ts

import { Injectable, Logger } from '@nestjs/common';
const Africastalking = require('africastalking');

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private africastalking: any;

  constructor() {
    // Initialize the Africa's Talking SDK
    this.africastalking = Africastalking({
      apiKey: 'atsk_10e90d260e6c9d7db4c68a1b653d82d89cf2f65af1eb077cf35ba4b3340c11e987205cac', // 🔥 Replace with your Sandbox API Key
      username: 'sandbox', // Must be 'sandbox' for testing
    });
  }

  async sendReceipt(phoneNumber: string, orderId: string, amount: number, receiptNumber: string) {
    try {
      const sms = this.africastalking.SMS;
      
      // The exact message the user will receive
      const message = `Confirmed. Ksh ${amount} has been received for Order #${orderId}. M-Pesa Receipt: ${receiptNumber}. Thank you for shopping with us!`;
      
      // Ensure phone number has a '+' at the beginning for Africa's Talking
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

      const response = await sms.send({
        to: [formattedPhone],
        message: message,
      });
      
      this.logger.log(`SMS receipt sent to ${formattedPhone} for Order #${orderId}`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${phoneNumber}:`, error);
    }
  }
}