import { Controller, Post, Get, Param, Body, Headers, UnauthorizedException, HttpCode, UseGuards, Req, Query, Patch } from '@nestjs/common';
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
    console.log("==================================================");
    console.log("➡️ WEBHOOK ENDPOINT WAS HIT BY NGROK!");
    console.log("Incoming Signature Header:", signature);
    console.log("==================================================");

    const isValid = this.paymentsService.verifySignature(signature, payload);
    
    if (!isValid) {
      console.log("❌ SIGNATURE VERIFICATION FAILED! Throwing 401 Unauthorized.");
      throw new UnauthorizedException('Invalid Webhook Signature');
    }

    console.log("✅ SIGNATURE VALID! 💰 INTASEND WEBHOOK RECEIVED:", JSON.stringify(payload, null, 2));

    const invoiceId = payload.invoice_id;
    const apiRef = payload.api_ref; 
    const state = payload.state;
    
    // 🔥 SMART PROVIDER EXTRACTION
    let provider = payload.provider || payload.payment_method;

    if (payload.charges && payload.charges.length > 0) {
       provider = payload.charges[0].payment_method || payload.charges[0].provider || provider;
    }

    if (!provider || provider.toUpperCase() === 'INTASEND' || provider.toUpperCase() === 'UNKNOWN') {
       const account = payload.account ? payload.account.toString() : '';
       if (account.includes('*')) {
          provider = 'CARD';
       } else if (account.startsWith('254') || account.startsWith('07') || account.startsWith('01')) {
          provider = 'M-PESA';
       } else {
          provider = 'CARD'; 
       }
    }

    provider = provider.toUpperCase();

    // 🔥 Pass both invoiceId AND apiRef to the service
    await this.paymentsService.processWebhook(invoiceId, apiRef, state, provider);

    return { received: true };
  }

  // --------------------------------------------------------
  // FRONTEND POLLING ROUTE 
  // --------------------------------------------------------
  @Get('verify')
  async verifyPaymentStatus(
    @Query('invoiceId') invoiceId: string,
    @Query('orderId') orderId?: string
  ) {
    return await this.paymentsService.verifyTransactionStatus(invoiceId, orderId);
  }

  @Get('balance/:sellerId')
  async getBalance(@Param('sellerId') sellerId: number) {
    const balance = await this.paymentsService.getAvailableBalance(sellerId);
    return { availableBalance: balance };
  }

  // --------------------------------------------------------
  // ESCROW VERIFICATION & DISPUTE ROUTES
  // --------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @Patch(':id/confirm-delivery')
  async confirmDelivery(@Req() req: any, @Param('id') orderId: number) {
    const customerId = req.user.id;
    return await this.paymentsService.releaseEscrowFunds(orderId, customerId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/dispute')
  async openDispute(
    @Req() req: any, 
    @Param('id') orderId: number,
    @Body('reason') reason: string
  ) {
    const customerId = req.user.id;
    return await this.paymentsService.freezeEscrowFunds(orderId, customerId, reason);
  }

  // --------------------------------------------------------
  // WITHDRAWALS
  // --------------------------------------------------------

  @UseGuards(JwtAuthGuard) 
  @Post('withdraw')
  async withdraw(
    @Req() req: any,
    @Body('phoneNumber') phoneNumber: string,
    @Body('amount') amount: number 
  ) {
    const sellerId = req.user.id; 
    return await this.paymentsService.withdrawFunds(sellerId, phoneNumber, amount);
  }
}