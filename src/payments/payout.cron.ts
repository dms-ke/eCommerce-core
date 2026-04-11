import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Transaction } from './transaction.entity';

@Injectable()
export class PayoutCronService {
  private readonly logger = new Logger(PayoutCronService.name);

  constructor(
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
  ) {}

  // Runs every midnight
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async clearFundsForPayout() {
    this.logger.log('CRON: Scanning for funds to clear for payout...');

    const now = new Date();

    // Find all COMPLETED transactions where releaseDate has passed 
    // AND they are NOT disputed AND not already cleared.
    const eligibleTransactions = await this.transactionRepo.find({
      where: {
        status: 'COMPLETED',
        clearedForPayout: false,
        isDisputed: false, // 🔥 The Refund Lock Check
        releaseDate: LessThanOrEqual(now),
      },
    });

    if (eligibleTransactions.length === 0) {
      this.logger.log('CRON: No funds to clear tonight.');
      return;
    }

    for (const tx of eligibleTransactions) {
      tx.clearedForPayout = true;
      // Note: You could also emit a WebSocket event here to notify 
      // the seller's dashboard that new funds are available!
    }

    await this.transactionRepo.save(eligibleTransactions);
    
    this.logger.log(`CRON: Successfully cleared ${eligibleTransactions.length} transactions for payout.`);
  }
}