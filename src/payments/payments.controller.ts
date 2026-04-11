import { Controller, Post, Get, Param, Body, Headers, UnauthorizedException, HttpCode, UseGuards, Req } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; 

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard) 
  @Post('checkout')
  async createCheckoutSession(
    @Req() req: any, 
    @Body() payload: { order: any; customer: any }
  ) {
    const secureCustomer = {
      ...payload.customer,
      email: req.user?.username || payload.customer?.email, 
    };

    const checkoutUrl = await this.paymentsService.initiateCheckout(
      payload.order, 
      secureCustomer
    );
    
    return { url: checkoutUrl };
  }

  // --------------------------------------------------------
  // WEBHOOK ROUTE
  // --------------------------------------------------------

  @Post('webhook')
  @HttpCode(200) 
  async handleIntaSendWebhook(
    @Headers('x-intasend-signature') signature: string,
    @Body() payload: any
  ) {
    const isValid = this.paymentsService.verifySignature(signature, payload);
    if (!isValid) {
      throw new UnauthorizedException('Invalid Webhook Signature');
    }

    // 🔥 DEBUGGING: Logs the full IntaSend payload to your terminal so you can inspect it!
    console.log("💰 INTASEND WEBHOOK RECEIVED:", JSON.stringify(payload, null, 2));

    const invoiceId = payload.invoice_id;
    const state = payload.state;
    
    // 🔥 SMART PROVIDER EXTRACTION
    let provider = payload.provider || payload.payment_method;

    // 1. Check if IntaSend hid the real method inside a 'charges' array
    if (payload.charges && payload.charges.length > 0) {
       provider = payload.charges[0].payment_method || payload.charges[0].provider || provider;
    }

    // 2. If it STILL says "IntaSend" or is unknown, we act as a detective based on the account format
    if (!provider || provider.toUpperCase() === 'INTASEND' || provider.toUpperCase() === 'UNKNOWN') {
       const account = payload.account ? payload.account.toString() : '';
       
       if (account.includes('*')) {
          // e.g., "****1234" -> It's a Card!
          provider = 'CARD';
       } else if (account.startsWith('254') || account.startsWith('07') || account.startsWith('01')) {
          // e.g., "254712345678" -> It's M-Pesa!
          provider = 'M-PESA';
       } else {
          provider = 'CARD'; // Fallback
       }
    }

    // Format it nicely (e.g., 'm-pesa' -> 'M-PESA')
    provider = provider.toUpperCase();

    // Pass the perfectly extracted provider to the service!
    await this.paymentsService.processWebhook(invoiceId, state, provider);

    return { received: true };
  }

  @Get('balance/:sellerId')
  async getBalance(@Param('sellerId') sellerId: number) {
    const balance = await this.paymentsService.getAvailableBalance(sellerId);
    return { availableBalance: balance };
  }

  @UseGuards(JwtAuthGuard) 
  @Post('withdraw')
  async withdraw(
    @Req() req: any,
    @Body('phoneNumber') phoneNumber: string,
    @Body('amount') amount: number // 🔥 NEW: Accept the specific amount
  ) {
    const sellerId = req.user.id; 
    return await this.paymentsService.withdrawFunds(sellerId, phoneNumber, amount);
  }
}