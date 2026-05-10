// src/products/products.controller.ts

import { 
  Controller, Get, Post, Delete, Patch, Body, Param, UseGuards, 
  Request, ParseIntPipe, BadRequestException, Query, 
  UseInterceptors, UploadedFiles 
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('search')
  async searchProducts(@Query('q') query: string) {
    if (!query) {
      throw new BadRequestException('Please provide a search query (e.g., ?q=keyboard)');
    }
    return this.productsService.searchProducts(query);
  }

  // ==========================================
  // SELLER DASHBOARD ENDPOINT (RBAC ENFORCED)
  // ==========================================
  @Get('seller')
  @UseGuards(JwtAuthGuard)
  async getSellerProducts(@Request() req) {
    const email = req.user.email || req.user.username;
    const role = req.user.role || req.user.roles;
    
    if (!email) throw new BadRequestException('Invalid user token: missing email/username');

    // 櫨 RBAC LOGIC
    const isAdmin = role === 'ADMIN' || role === 'admin' || (Array.isArray(role) && (role.includes('admin') || role.includes('ADMIN')));

    if (isAdmin) {
      // 櫨 Fixed: Calling your existing method name
      return this.productsService.getProductCatalog(); 
    }

    // Sellers ONLY see their own products
    // 櫨 Fixed: Using the correct method name 'findProductsBySeller'
    return this.productsService.findProductsBySeller(email); 
  }

  @Get()
  async getProducts(
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: 'ASC' | 'DESC',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const currentPage = page ? parseInt(page, 10) : 1;
    const currentLimit = limit ? parseInt(limit, 10) : 10;
    const currentOrder = order === 'ASC' ? 'ASC' : 'DESC'; 

    return this.productsService.getProductCatalog(sortBy, currentOrder, currentPage, currentLimit);
  }

  @Get(':id')
  async getProduct(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'seller')
  @UseInterceptors(
    FilesInterceptor('photos', 5, { 
      storage: diskStorage({
        destination: './uploads', 
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async addProduct(
    @UploadedFiles() files: Array<Express.Multer.File>, 
    @Body() productData: any,
    @Request() req // 🔥 FIX 1: Inject the Request object to read the JWT token
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one product photo is required.');
    }
    
    const photoUrls = files.map(file => `/uploads/${file.filename}`);
    
    // 🔥 FIX 2: Securely extract the seller's exact identity from their token
    const tokenEmail = req.user.email || req.user.username || 'System Vendor';
    
    // 櫨 Fixed method name
    return this.productsService.createProduct({
      ...productData,
      sellerName: tokenEmail, // 🔥 FIX 3: Force the database to use the token's email, overriding the frontend
      photoUrl: photoUrls[0], 
      gallery: photoUrls,     
    });
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin','seller')
  async updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateData: any
  ) {
    // 櫨 Fixed method name
    return this.productsService.updateProduct(id, updateData);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'seller')
  async deleteProduct(@Param('id', ParseIntPipe) id: number) {
    // 櫨 Fixed method name
    return this.productsService.deleteProduct(id);
  }

  @Post('sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async syncElasticsearch() {
    return this.productsService.syncAllProductsToElasticsearch();
  }

  // ==========================================
  // REVIEW ENDPOINTS
  // ==========================================

  @Post(':id/reviews')
  @UseGuards(JwtAuthGuard) 
  async addReview(
    @Param('id', ParseIntPipe) productId: number,
    @Body() reviewData: { rating: number; comment: string; reviewerName?: string },
    @Request() req, 
  ) {
    const userId = req.user.sub || req.user.userId || req.user.id;
    return this.productsService.addReview(
      productId, 
      userId, 
      reviewData.rating, 
      reviewData.comment,
      reviewData.reviewerName
    );
  }

  @Post('reviews/:reviewId/reply')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin') 
  async replyToReview(
    @Param('reviewId', ParseIntPipe) reviewId: number,
    @Body('reply') reply: string
  ) {
    if (!reply) throw new BadRequestException('Reply message cannot be empty');
    return this.productsService.replyToReview(reviewId, reply);
  }

  @Patch('reviews/:reviewId')
  @UseGuards(JwtAuthGuard)
  async updateReview(
    @Param('reviewId', ParseIntPipe) reviewId: number,
    @Body() updateData: { rating?: number; comment?: string; reviewerName?: string },
    @Request() req
  ) {
    const userId = req.user.sub || req.user.userId || req.user.id;
    const isAdmin = req.user.roles?.includes('admin') || req.user.role === 'admin' || req.user.role === 'ADMIN';
    return this.productsService.updateReview(reviewId, userId, isAdmin, updateData);
  }

  @Delete('reviews/:reviewId')
  @UseGuards(JwtAuthGuard)
  async deleteReview(
    @Param('reviewId', ParseIntPipe) reviewId: number,
    @Request() req
  ) {
    const userId = req.user.sub || req.user.userId || req.user.id;
    const isAdmin = req.user.roles?.includes('admin') || req.user.role === 'admin' || req.user.role === 'ADMIN';
    return this.productsService.deleteReview(reviewId, userId, isAdmin);
  }
}