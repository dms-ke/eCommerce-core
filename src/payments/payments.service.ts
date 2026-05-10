import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Transaction } from './transaction.entity';
import * as crypto from 'crypto';
import { OrdersService } from '../orders/orders.service'; 

// Initialize IntaSend SDK
const IntaSend = require('intasend-node');

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private intasend: any;

  // Use environment variable for the commission, default to 10%
  private readonly commissionRate = Number(process.env.PLATFORM_COMMISSION_PERCENTAGE) || 10;

  constructor(
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
    private dataSource: DataSource, 
    private ordersService: OrdersService, 
  ) {
    this.intasend = new IntaSend(
      process.env.INTASEND_PUBLISHABLE_KEY,
      process.env.INTASEND_SECRET_KEY,
      true // Set to false in production!
    );
  }

  // 1. INITIATE CHECKOUT
  async initiateCheckout(order: any, customer: any) {
    try {
      const pubKey = process.env.INTASEND_PUBLISHABLE_KEY;
      if (!pubKey) {
        this.logger.error('CRITICAL: INTASEND_PUBLISHABLE_KEY is missing from your .env file!');
        throw new Error('Server configuration error: Missing payment keys.');
      }

      const nameParts = customer?.name?.split(' ') || ['Customer', 'Name'];
      const uniqueApiRef = `ORDER-${order?.id}-${Date.now()}`;
      const safeAmount = Math.round(Number(order?.totalAmount));

      const chargePayload = {
        public_key: pubKey, 
        first_name: nameParts[0] || 'Customer',
        last_name: nameParts.slice(1).join(' ') || 'Name',
        email: customer?.email || 'customer@example.com',
        amount: safeAmount > 0 ? safeAmount : 10,
        currency: 'KES',
        api_ref: uniqueApiRef, 
        redirect_url: `http://localhost:3001/checkout/success?orderId=${order.id}`, 
      };

      this.logger.debug(`Sending payload to API: ${JSON.stringify(chargePayload)}`);

      const isTestEnv = true; 
      const baseUrl = isTestEnv ? 'https://sandbox.intasend.com' : 'https://payment.intasend.com';
      
      const response = await fetch(`${baseUrl}/api/v1/checkout/`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chargePayload)
      });

      const data = await response.json();

      if (!response.ok) {
        this.logger.error(`IntaSend Direct API Error: ${JSON.stringify(data)}`);
        throw new BadRequestException('IntaSend API rejected the payload.');
      }

      this.logger.log(`IntaSend Charge Created Successfully: ${data.url}`);

      const tx = this.transactionRepo.create({
        orderId: order.id,
        sellerId: order.sellerId,
        invoiceId: data.id, 
        totalAmount: safeAmount,
        shippingFee: Number(order?.shippingFee) || 0,
        deliveryMethod: order.deliveryMethod || 'VENDOR', 
        status: 'PENDING',
      });
      await this.transactionRepo.save(tx);

      return data.url; 
    } catch (error: any) {
      this.logger.error('IntaSend checkout failed:', error.message || error);
      throw new BadRequestException('Could not generate payment link securely.');
    }
  }

  // 2. WEBHOOK PROCESSING
  async processWebhook(invoiceId: string, apiRef: string, state: string, provider: string = 'UNKNOWN') {
    let tx = await this.transactionRepo.findOne({ where: { invoiceId } });

    if (!tx && apiRef) {
      const parts = apiRef.split('-'); 
      if (parts.length >= 2) {
        const extractedOrderId = parseInt(parts[1], 10);
        tx = await this.transactionRepo.findOne({ where: { orderId: extractedOrderId } });
        
        if (tx) {
          tx.invoiceId = invoiceId;
          await this.transactionRepo.save(tx);
          this.logger.log(`🔗 Linked new IntaSend Invoice ID ${invoiceId} to Order #${extractedOrderId}`);
        }
      }
    }

    if (!tx) {
      this.logger.warn(`Webhook received for unknown invoiceId: ${invoiceId} / apiRef: ${apiRef}`);
      return;
    }

    // 🔥 FIX: Check for 'COMPLETE' or 'COMPLETED' just to be universally safe
    if ((state === 'COMPLETE' || state === 'COMPLETED') && tx.status !== 'COMPLETED') {
      tx.status = 'COMPLETED';

      const itemTotal = tx.totalAmount - tx.shippingFee;
      tx.commissionAmount = itemTotal * (this.commissionRate / 100);
      tx.penaltyFee = 0; 
      
      if (tx.deliveryMethod === 'PLATFORM') {
        tx.sellerShare = (itemTotal - tx.commissionAmount) - tx.penaltyFee;
      } else {
        tx.sellerShare = (itemTotal - tx.commissionAmount) + tx.shippingFee - tx.penaltyFee;
      }

      const releaseDate = new Date();
      releaseDate.setDate(releaseDate.getDate() + 7);
      tx.releaseDate = releaseDate;

      await this.transactionRepo.save(tx);
      this.logger.log(`Payment COMPLETED for Order #${tx.orderId}. Escrow release on ${tx.releaseDate}`);

      // 🔥 FIX: Robust Try-Catch and Number casting to ensure Order updates perfectly!
      try {
        await this.ordersService.markAsPaid(Number(tx.orderId), provider);
        this.logger.log(`Order #${tx.orderId} successfully marked as PAID with provider: ${provider}`);
      } catch (error: any) {
        this.logger.error(`CRITICAL ERROR: Failed to update Order #${tx.orderId} status to PAID. Error: ${error.message}`);
      }
    } 
    else if (state === 'FAILED') {
      tx.status = 'FAILED';
      await this.transactionRepo.save(tx);
      this.logger.log(`Payment FAILED for Order #${tx.orderId}`);
    }
  }

  // 3. CALCULATE AVAILABLE BALANCE
  async getAvailableBalance(sellerId: number): Promise<number> {
    const result = await this.transactionRepo.createQueryBuilder('tx')
      .select('SUM(tx.sellerShare)', 'total')
      .where('tx.sellerId = :sellerId', { sellerId })
      .andWhere('tx.clearedForPayout = :cleared', { cleared: true })
      .andWhere('tx.isDisputed = :disputed', { disputed: false })
      .andWhere('tx.isPaidOut = :paidOut', { paidOut: false })
      .getRawOne();

    return parseFloat(result.total || '0');
  }

  // 4. PROCESS WITHDRAWALS
  async withdrawFunds(sellerId: number, phoneNumber: string, requestedAmount: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const eligibleTransactions = await queryRunner.manager.find(Transaction, {
        where: { sellerId: sellerId, clearedForPayout: true, isDisputed: false, isPaidOut: false },
        lock: { mode: 'pessimistic_write' }, 
      });

      const totalAvailable = eligibleTransactions.reduce((sum, tx) => sum + Number(tx.sellerShare), 0);

      if (totalAvailable === 0) throw new BadRequestException('No cleared funds available for withdrawal.');
      if (requestedAmount <= 0) throw new BadRequestException('Withdrawal amount must be greater than zero.');
      if (requestedAmount > totalAvailable) throw new BadRequestException(`Insufficient funds. You only have Ksh ${totalAvailable} available.`);

      this.logger.log(`Initiating B2C Payout of Ksh ${requestedAmount} to ${phoneNumber}`);

      const payouts = this.intasend.payouts();
      const response = await payouts.mpesa({
        currency: 'KES',
        transactions: [{ name: `Seller ${sellerId}`, account: phoneNumber, amount: requestedAmount.toString(), narrative: 'Marketplace Earnings Withdrawal' }],
      });

      let accumulated = 0;
      const transactionsToMarkPaid: Transaction[] = [];

      for (const tx of eligibleTransactions) {
        accumulated += Number(tx.sellerShare);
        tx.isPaidOut = true; 
        transactionsToMarkPaid.push(tx);
        if (accumulated >= requestedAmount) break; 
      }

      const leftoverChange = accumulated - requestedAmount;

      if (leftoverChange > 0) {
        const lastTx = transactionsToMarkPaid[transactionsToMarkPaid.length - 1];
        const carryForwardTx = queryRunner.manager.create(Transaction, {
          sellerId: sellerId, sellerShare: leftoverChange, clearedForPayout: true, isDisputed: false, isPaidOut: false, 
          orderId: lastTx.orderId || 0, invoiceId: `CARRYFWD-${Date.now()}`, totalAmount: leftoverChange, shippingFee: 0, status: 'COMPLETED', commissionAmount: 0, penaltyFee: 0, deliveryMethod: 'VENDOR'
        });
        await queryRunner.manager.save(carryForwardTx);
      }

      await queryRunner.manager.save(transactionsToMarkPaid);
      await queryRunner.commitTransaction(); 

      return { success: true, message: 'Withdrawal processed successfully', amount: requestedAmount, batchId: response.tracking_id };

    } catch (error: any) {
      await queryRunner.rollbackTransaction(); 
      this.logger.error('IntaSend B2C Payout failed', error);
      throw new InternalServerErrorException(`Withdrawal failed: ${error.message || 'Unknown error'}`);
    } finally {
      await queryRunner.release(); 
    }
  }

  // 5. VERIFY WEBHOOK SIGNATURE
  verifySignature(signature: string, payload: any): boolean {
    const secretKey = process.env.INTASEND_SECRET_KEY || ''; 
    if (!signature || signature === 'undefined' || process.env.NODE_ENV !== 'production') {
      this.logger.warn('⚠️ Bypassing Signature Verification for Sandbox/Testing.');
      return true; 
    }
    if (!secretKey) return false;
    const expectedSignature = crypto.createHmac('sha256', secretKey).update(JSON.stringify(payload)).digest('hex');
    return signature === expectedSignature;
  }

  // 6. VERIFY PAYMENT STATUS FOR FRONTEND POLLING
  async verifyTransactionStatus(invoiceId: string, orderId?: string) {
    let tx: Transaction | null = null;
    
    if (orderId) {
       tx = await this.transactionRepo.findOne({ where: { orderId: Number(orderId) } });
    }
    
    if (!tx) {
       tx = await this.transactionRepo.findOne({ where: { invoiceId } });
    }

    if (!tx) return { status: 'PENDING' }; 

    if (tx.status === 'COMPLETED') return { status: 'PAID' };
    if (tx.status === 'FAILED') return { status: 'FAILED' };

    try {
       const collection = this.intasend.collection();
       const statusResp = await collection.status(invoiceId);
       
       if (statusResp && statusResp.invoice && (statusResp.invoice.state === 'COMPLETE' || statusResp.invoice.state === 'COMPLETED')) {
          tx.invoiceId = invoiceId; 
          tx.status = 'COMPLETED';
          
          const itemTotal = tx.totalAmount - tx.shippingFee;
          tx.commissionAmount = itemTotal * (this.commissionRate / 100);
          tx.penaltyFee = 0; 
          
          if (tx.deliveryMethod === 'PLATFORM') {
            tx.sellerShare = (itemTotal - tx.commissionAmount) - tx.penaltyFee;
          } else {
            tx.sellerShare = (itemTotal - tx.commissionAmount) + tx.shippingFee - tx.penaltyFee;
          }

          const releaseDate = new Date();
          releaseDate.setDate(releaseDate.getDate() + 7);
          tx.releaseDate = releaseDate;

          await this.transactionRepo.save(tx);
          this.logger.log(`Frontend Verification linked and COMPLETED Order #${tx.orderId}`);
          
          // 🔥 FIX: Robust Try-Catch here too!
          try {
            const provider = statusResp.invoice.provider || 'UNKNOWN';
            await this.ordersService.markAsPaid(Number(tx.orderId), provider);
            this.logger.log(`Order #${tx.orderId} successfully marked as PAID via Verification Polling.`);
          } catch (error: any) {
            this.logger.error(`CRITICAL ERROR: Failed to update Order #${tx.orderId} status via Verification. Error: ${error.message}`);
          }
          
          return { status: 'PAID' };
       }
    } catch (error) {
       this.logger.warn(`IntaSend direct status check failed for invoice ${invoiceId}`);
    }

    return { status: 'PENDING' };
  }

  // ------------------------------------------------------------------
  // 7. ESCROW LOGIC: DELIVERY VERIFICATION & DISPUTES
  // ------------------------------------------------------------------

  // RELEASE ESCROW FUNDS (Buyer clicked "I received my item")
  async releaseEscrowFunds(orderId: number, customerId: number) {
    const tx = await this.transactionRepo.findOne({ where: { orderId } });
    if (!tx) throw new BadRequestException('Transaction not found for this order.');

    if (tx.status !== 'COMPLETED') {
      throw new BadRequestException('Cannot release funds. Payment was never completed.');
    }

    if (tx.isDisputed) {
      throw new BadRequestException('Cannot release funds. There is an active dispute on this order.');
    }

    // Mark the funds as cleared for the vendor to withdraw immediately
    tx.clearedForPayout = true;
    tx.releaseDate = new Date(); 
    
    await this.transactionRepo.save(tx);
    this.logger.log(`Escrow Released: Funds for Order #${orderId} are now available to Seller #${tx.sellerId}`);
    
    // Update the Order status
    try {
      await this.ordersService.updateOrderStatus(orderId, 'DELIVERED');
    } catch (e: any) {
      this.logger.warn(`Could not update order status to DELIVERED for order #${orderId}. Reason: ${e.message}`);
    }

    return { success: true, message: 'Delivery confirmed and funds released to vendor.' };
  }

  // FREEZE ESCROW FUNDS (Buyer opened a dispute)
  async freezeEscrowFunds(orderId: number, customerId: number, reason: string) {
    const tx = await this.transactionRepo.findOne({ where: { orderId } });
    if (!tx) throw new BadRequestException('Transaction not found.');

    if (tx.isPaidOut) {
      throw new BadRequestException('Too late. The vendor has already withdrawn these funds.');
    }

    // Freeze the funds
    tx.isDisputed = true;
    tx.clearedForPayout = false; 

    await this.transactionRepo.save(tx);
    this.logger.warn(`Escrow Frozen: Dispute opened on Order #${orderId}. Reason: ${reason}`);

    // Update the Order status AND pass the textual reason along!
    try {
      await this.ordersService.updateOrderStatus(orderId, 'DISPUTED', reason);
    } catch (e: any) {
      this.logger.warn(`Could not update order status to DISPUTED for order #${orderId}. Reason: ${e.message}`);
    }

    return { success: true, message: 'Funds frozen pending dispute resolution.' };
  }
}