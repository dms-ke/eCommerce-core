import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Transaction } from './transaction.entity';
import * as crypto from 'crypto';

// 🔥 ADDED: Import the OrdersService so we can update the order status
import { OrdersService } from '../orders/orders.service'; 

// Initialize IntaSend SDK
const IntaSend = require('intasend-node');

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private intasend: any;

  constructor(
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
    private dataSource: DataSource, 
    private ordersService: OrdersService, // 🔥 INJECTED: OrdersService
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
        redirect_url: 'http://localhost:3001/checkout/success', 
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
        status: 'PENDING',
      });
      await this.transactionRepo.save(tx);

      return data.url; 
    } catch (error: any) {
      this.logger.error('IntaSend checkout failed:', error.message || error);
      throw new BadRequestException('Could not generate payment link securely.');
    }
  }

  // 2. WEBHOOK PROCESSING & SPLIT CALCULATION
  // 🔥 FIX: Now accepts a 3rd argument for the payment provider (e.g., 'CARD' or 'MPESA')
  async processWebhook(invoiceId: string, state: string, provider: string = 'UNKNOWN') {
    const tx = await this.transactionRepo.findOne({ where: { invoiceId } });
    if (!tx) {
      this.logger.warn(`Webhook received for unknown invoiceId: ${invoiceId}`);
      return;
    }

    if (state === 'COMPLETED' && tx.status !== 'COMPLETED') {
      tx.status = 'COMPLETED';

      const COMMISSION_RATE = 0.10; 
      const itemTotal = tx.totalAmount - tx.shippingFee;
      tx.commissionAmount = itemTotal * COMMISSION_RATE;
      tx.penaltyFee = 0; 
      tx.sellerShare = itemTotal - tx.commissionAmount - tx.penaltyFee;

      const releaseDate = new Date();
      releaseDate.setDate(releaseDate.getDate() + 7);
      tx.releaseDate = releaseDate;

      await this.transactionRepo.save(tx);
      this.logger.log(`Payment COMPLETED for Order #${tx.orderId}. Escrow release on ${tx.releaseDate}`);

      // 🔥 FIX: Tell the Orders Service to actually mark the order as PAID and save the real provider!
      await this.ordersService.markAsPaid(tx.orderId, provider);
      this.logger.log(`Order #${tx.orderId} successfully marked as PAID with provider: ${provider}`);
    } 
    else if (state === 'FAILED') {
      tx.status = 'FAILED';
      await this.transactionRepo.save(tx);
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

  // 4. PROCESS PARTIAL & FULL WITHDRAWALS (THE "CASH CHANGE" ALGORITHM)
  async withdrawFunds(sellerId: number, phoneNumber: string, requestedAmount: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const eligibleTransactions = await queryRunner.manager.find(Transaction, {
        where: {
          sellerId: sellerId,
          clearedForPayout: true,
          isDisputed: false,
          isPaidOut: false,
        },
        lock: { mode: 'pessimistic_write' }, 
      });

      // 1. Calculate the absolute total they have available
      const totalAvailable = eligibleTransactions.reduce(
        (sum, tx) => sum + Number(tx.sellerShare),
        0
      );

      // 2. Validation Checks
      if (totalAvailable === 0) {
        throw new BadRequestException('No cleared funds available for withdrawal.');
      }
      if (requestedAmount <= 0) {
        throw new BadRequestException('Withdrawal amount must be greater than zero.');
      }
      if (requestedAmount > totalAvailable) {
        throw new BadRequestException(`Insufficient funds. You only have Ksh ${totalAvailable} available.`);
      }

      this.logger.log(`Initiating B2C Payout of Ksh ${requestedAmount} to ${phoneNumber}`);

      // 3. Process the actual IntaSend Payout for the specific amount requested
      const payouts = this.intasend.payouts();
      const response = await payouts.mpesa({
        currency: 'KES',
        transactions: [
          {
            name: `Seller ${sellerId}`,
            account: phoneNumber,
            amount: requestedAmount.toString(),
            narrative: 'Marketplace Earnings Withdrawal',
          },
        ],
      });

      // 4. 🔥 THE "CASH CHANGE" ALGORITHM
      let accumulated = 0;
      
      // 🔥 FIX: Explicitly tell TypeScript this array holds 'Transaction' objects!
      const transactionsToMarkPaid: Transaction[] = [];

      for (const tx of eligibleTransactions) {
        accumulated += Number(tx.sellerShare);
        tx.isPaidOut = true; 
        transactionsToMarkPaid.push(tx);

        // Stop checking past sales once we've covered the withdrawal amount!
        if (accumulated >= requestedAmount) {
          break; 
        }
      }

      const leftoverChange = accumulated - requestedAmount;

      // 5. If we "over-deducted" from their last sale record, refund the difference as a new balance
      if (leftoverChange > 0) {
        const lastTx = transactionsToMarkPaid[transactionsToMarkPaid.length - 1];
        
        const carryForwardTx = queryRunner.manager.create(Transaction, {
          sellerId: sellerId,
          sellerShare: leftoverChange,
          clearedForPayout: true,
          isDisputed: false,
          isPaidOut: false, 
          // Safeguard to prevent DB not-null constraints on standard required fields
          orderId: lastTx.orderId || 0,
          invoiceId: `CARRYFWD-${Date.now()}`,
          totalAmount: leftoverChange, 
          shippingFee: 0,
          status: 'COMPLETED',
          commissionAmount: 0,
          penaltyFee: 0
        });
        await queryRunner.manager.save(carryForwardTx);
      }

      // Save the updated old transactions
      await queryRunner.manager.save(transactionsToMarkPaid);
      
      await queryRunner.commitTransaction(); 

      return {
        success: true,
        message: 'Withdrawal processed successfully',
        amount: requestedAmount,
        batchId: response.tracking_id, 
      };

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
    const expectedSignature = crypto
      .createHmac('sha256', secretKey) 
      .update(JSON.stringify(payload))
      .digest('hex');

    return signature === expectedSignature;
  }
}