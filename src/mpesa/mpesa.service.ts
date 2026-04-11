// src/mpesa/mpesa.service.ts

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);
  
  // 🛑 PASTE YOUR CONSUMER KEY AND SECRET HERE 🛑
  private readonly consumerKey = '7dqBHyFKXEj2y5OaHr3uwgqQSqtRUTxzfMA48r8VYUuoNS3b';
  private readonly consumerSecret = 'k9qCmOi0k9iGvGZY0LVDiiLFfoqqvhgb9vTPUMHM9AlzUKH4l8boHAA7Vhd7VCUE';
  
  // Safaricom Sandbox Test Credentials (Leave these as they are)
  private readonly shortcode = '174379'; 
  private readonly passkey = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
  
  // We will set up ngrok later so Safaricom can reach your localhost!
  private readonly callbackUrl = 'https://4f59-129-222-147-113.ngrok-free.app/webhook/mpesa'; 

  /**
   * 1. Get OAuth Access Token from Daraja
   */
  async getAccessToken(): Promise<string> {
    const credentials = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    try {
      const response = await axios.get(
        'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
        { headers: { Authorization: `Basic ${credentials}` } }
      );
      return response.data.access_token;
    } catch (error) {
      this.logger.error('Failed to get M-Pesa access token', error.message);
      throw new HttpException('M-Pesa Authentication Failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 2. Trigger the STK Push to the user's phone
   */
  async initiateStkPush(amount: number, phoneNumber: string, orderId: number) {
    const accessToken = await this.getAccessToken();
    const timestamp = this.getTimestamp();
    
    // Safaricom requires a Base64 encoded password made of Shortcode + Passkey + Timestamp
    const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');

    // M-Pesa expects the number in format 2547XXXXXXXX
    const formattedPhone = this.formatPhoneNumber(phoneNumber);

    const payload = {
      BusinessShortCode: this.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(amount), // M-Pesa does not accept decimals
      PartyA: formattedPhone, 
      PartyB: this.shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: this.callbackUrl,
      AccountReference: `Order ${orderId}`,
      TransactionDesc: `Payment for Order #${orderId}`
    };

    try {
      const response = await axios.post(
        'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
        payload,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      this.logger.log(`STK Push successfully sent to ${formattedPhone} for Order #${orderId}`);
      return response.data;
    } catch (error) {
      this.logger.error('STK Push failed', error.response?.data || error.message);
      throw new HttpException('STK Push Request Failed', HttpStatus.BAD_REQUEST);
    }
  }

  // --- Helper Methods ---

  private getTimestamp() {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd}${hh}${min}${ss}`;
  }

  private formatPhoneNumber(phone: string): string {
    // Basic formatter: converts 07... to 2547...
    if (phone.startsWith('0')) {
      return '254' + phone.slice(1);
    }
    if (phone.startsWith('+')) {
      return phone.slice(1);
    }
    return phone;
  }
}