import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  orderId: number;

  @Column()
  sellerId: number;

  // 🔥 IntaSend's unique tracker
  @Column({ unique: true })
  invoiceId: string; 

  @Column('decimal', { precision: 10, scale: 2 })
  totalAmount: number; // What the customer paid

  // --- THE FEE SPLITS ---
  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  shippingFee: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  commissionAmount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  penaltyFee: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  sellerShare: number; // The actual withdrawable amount

  // --- STATUS & ESCROW ---
  @Column({ default: 'PENDING' }) // PENDING, COMPLETED, FAILED
  status: string;

  @Column({ default: false })
  clearedForPayout: boolean;

  @Column({ type: 'timestamp', nullable: true })
  releaseDate: Date;

  @Column({ default: false })
  isDisputed: boolean; // 🔥 The Refund Lock

  
  @Column({ default: false })
  isPaidOut: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}