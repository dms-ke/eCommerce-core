// src/orders/webhook.controller.ts

import { Controller, Post, Body, Headers, Param, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { SmsService } from '../sms/sms.service'; // 🔥 IMPORT SMS SERVICE

@Controller('webhook')
export class WebhookController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly smsService: SmsService // 🔥 INJECT SMS SERVICE
  ) {}

  // --- STRIPE WEBHOOK ---
  // POST http://localhost:3000/webhook/stripe
  @Post('stripe')
  @HttpCode(HttpStatus.OK) // Stripe requires a 200 OK response
  async handleStripeWebhook(
    @Body() payload: any,
    @Headers('stripe-signature') signature: string 
  ) {
    console.log('[Webhook] Received event from simulated Stripe:', payload.type);

    if (payload.type === 'payment_intent.succeeded') {
      const orderId = payload.data.object.metadata.orderId;
      
      if (!orderId) {
        throw new BadRequestException('Order ID missing in metadata');
      }

      console.log(`[Webhook] Fulfilling Order #${orderId}...`);
      await this.ordersService.markAsPaid(Number(orderId), 'Credit Card (Stripe)');
    }

    return { received: true }; 
  }

  // --- M-PESA WEBHOOK ---
  // POST http://localhost:3000/webhook/mpesa/:orderId
  @Post('mpesa/:orderId')
  @HttpCode(HttpStatus.OK) // Safaricom also expects a 200 OK
  async handleMpesaWebhook(
    @Param('orderId') orderId: string,
    @Body() payload: any
  ) {
    console.log(`[M-Pesa Webhook] Received callback for Order #${orderId}`);
    
    // Safaricom nests the callback data inside Body.stkCallback
    const stkCallback = payload?.Body?.stkCallback;
    
    if (!stkCallback) {
      return { received: true }; // Ignore malformed requests to prevent retries
    }

    // ResultCode 0 means the user successfully entered their PIN and paid
    if (stkCallback.ResultCode === 0) {
      console.log(`[M-Pesa Webhook] Payment Successful for Order #${orderId}! Fulfilling...`);
      await this.ordersService.markAsPaid(Number(orderId), 'M-Pesa');

      // 🔥 EXTRACT SAFARICOM'S METADATA FOR THE SMS
      const metadataItems = stkCallback.CallbackMetadata?.Item || [];
      
      // Helper to find specific values in Daraja's array structure
      const getMetaValue = (name: string) => metadataItems.find(item => item.Name === name)?.Value;

      const amount = getMetaValue('Amount');
      const mpesaReceipt = getMetaValue('MpesaReceiptNumber');
      const phoneNumber = getMetaValue('PhoneNumber');

      // 🔥 FIRE THE SMS RECEIPT!
      if (phoneNumber && amount) {
         // Fired asynchronously so it doesn't hold up Safaricom's response
         this.smsService.sendReceipt(phoneNumber.toString(), orderId, amount, mpesaReceipt);
      }

    } else {
      // Any other code means the user cancelled, timed out, or had insufficient funds
      console.log(`[M-Pesa Webhook] Payment Failed/Cancelled for Order #${orderId}: ${stkCallback.ResultDesc}`);
    }

    // Always return a success response so Daraja knows we received it
    return { received: true };
  }
}