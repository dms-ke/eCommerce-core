// src/payments/transaction.entity.ts
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
  totalAmount: number; // What the customer paid (Subtotal + Shipping)

  // --- THE FEE SPLITS ---
  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  shippingFee: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  commissionAmount: number; // The Platform's Cut

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  penaltyFee: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  sellerShare: number; // The actual withdrawable amount for the Vendor

  // 🔥 ADDED: Tracks who is delivering so Escrow routes the fee correctly!
  @Column({ default: 'VENDOR' }) // Can be 'VENDOR' or 'PLATFORM'
  deliveryMethod: string;

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
  isPaidOut: boolean; // True once the vendor successfully withdraws to M-Pesa

  // --- TIMESTAMPS ---
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}