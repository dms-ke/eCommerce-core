// src/products/products.service.ts

import { Injectable, Inject, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

import { ElasticsearchService } from '../search/elasticsearch/elasticsearch.service';
import { ProductsGateway } from './products.gateway';
import { Product } from './products.entity';
import { Review } from './review.entity'; 

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly elasticsearchService: ElasticsearchService,
    private readonly productsGateway: ProductsGateway,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Review) 
    private readonly reviewRepository: Repository<Review>,
  ) {}

  // ==========================================
  // UTILITY / SEARCH METHODS
  // ==========================================

  private async syncWithSearch(product: Product) {
    this.logger.log(`Syncing product #${product.id} to Elasticsearch...`);
    await this.elasticsearchService.indexProduct(product);
    await this.clearProductCache();

    if (product.stock > 0 && product.stock < 5) {
      this.logger.warn(`Low stock alert for ${product.name}: ${product.stock} left!`);
      this.productsGateway.emitLowStockAlert(product);
    }
  }

  private async clearProductCache() {
    await this.cacheManager.del('all_products');
  }

  async syncAllProductsToElasticsearch() {
    this.logger.log('Starting full Elasticsearch sync...');
    const products = await this.productRepository.find();
    for (const product of products) {
      await this.elasticsearchService.indexProduct(product);
    }
    return { message: `Successfully synced ${products.length} products to Elasticsearch.` };
  }

  async searchProducts(query: string) {
    return this.elasticsearchService.searchProducts(query);
  }

  // ==========================================
  // PRODUCT CRUD METHODS
  // ==========================================

  async findProductsBySeller(sellerEmail: string): Promise<Product[]> {
    return this.productRepository.find({
      where: { sellerName: sellerEmail },
      order: { id: 'DESC' }, 
    });
  }

  async getProductCatalog(sortBy?: string, order: 'ASC' | 'DESC' = 'DESC', page: number = 1, limit: number = 10) {
    const [data, total] = await this.productRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: sortBy ? { [sortBy]: order } : { id: 'DESC' },
    });

    return {
      data,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }

  async findOne(id: number): Promise<Product> {
    const product = await this.productRepository.findOne({ 
      where: { id },
      relations: ['reviews', 'reviews.user'],
      // 🔥 FIX: Include soft-deleted products so historical orders don't break!
      // This allows the frontend to fetch the product data for old receipts 
      // even though it's hidden from the main catalog.
      withDeleted: true, 
    });
    
    if (!product) throw new NotFoundException(`Product #${id} not found`);
    return product;
  }

  async createProduct(data: any): Promise<Product> {
    const price = parseFloat(data.price);
    const stock = parseInt(data.stock, 10);
    const discountPercentage = parseFloat(data.discountPercentage || '0');
    const deliveryFee = parseFloat(data.deliveryFee || '0');

    const newProduct = this.productRepository.create({
      name: data.name,
      description: data.description,
      price,
      stock,
      discountPercentage,
      shippingOrigin: data.shippingOrigin,
      deliveryFee,
      estimatedDelivery: data.estimatedDelivery,
      condition: data.condition,
      sellerName: data.sellerName,
      photoUrl: data.photoUrl, 
      gallery: data.gallery,   
    });

    const savedProduct = await this.productRepository.save(newProduct);
    await this.syncWithSearch(savedProduct);

    return savedProduct;
  }

  async updateProduct(id: number, updateData: any): Promise<Product> {
    const product = await this.findOne(id);

    if (updateData.name) product.name = updateData.name;
    if (updateData.description) product.description = updateData.description;
    if (updateData.shippingOrigin) product.shippingOrigin = updateData.shippingOrigin;
    if (updateData.estimatedDelivery) product.estimatedDelivery = updateData.estimatedDelivery;
    if (updateData.condition) product.condition = updateData.condition;
    if (updateData.sellerName) product.sellerName = updateData.sellerName;

    if (updateData.price) product.price = parseFloat(updateData.price);
    if (updateData.stock) product.stock = parseInt(updateData.stock, 10);
    if (updateData.discountPercentage) product.discountPercentage = parseFloat(updateData.discountPercentage);
    if (updateData.deliveryFee) product.deliveryFee = parseFloat(updateData.deliveryFee);

    const updatedProduct = await this.productRepository.save(product);
    await this.syncWithSearch(updatedProduct);

    return updatedProduct;
  }

  async deleteProduct(id: number): Promise<{ message: string }> {
    const product = await this.findOne(id);
    
    await this.productRepository.softRemove(product);
    
    await this.clearProductCache();
    
    return { message: `Product #${id} successfully archived (soft-deleted).` };
  }

  // ==========================================
  // REVIEW METHODS
  // ==========================================

  async addReview(productId: number, userId: number, rating: number, comment: string, reviewerName?: string): Promise<Review> {
    const product = await this.findOne(productId);

    const review = this.reviewRepository.create({
      product,
      user: { id: userId } as any, 
      rating,
      comment,
      reviewerName
    });

    await this.reviewRepository.save(review);
    await this.clearProductCache();
    return review;
  }

  async replyToReview(reviewId: number, reply: string): Promise<Review> {
    const review = await this.reviewRepository.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException(`Review #${reviewId} not found`);

    review.reply = reply; 
    await this.reviewRepository.save(review);
    return review;
  }

  async updateReview(reviewId: number, userId: number, isAdmin: boolean, updateData: { rating?: number; comment?: string; reviewerName?: string }): Promise<Review> {
    const review = await this.reviewRepository.findOne({ 
      where: { id: reviewId }, 
      relations: ['user'] 
    });

    if (!review) throw new NotFoundException(`Review #${reviewId} not found`);

    if (!isAdmin && review.user?.id !== userId) {
      throw new BadRequestException('You can only edit your own reviews.');
    }

    if (updateData.rating) review.rating = updateData.rating;
    if (updateData.comment) review.comment = updateData.comment;
    if (updateData.reviewerName) review.reviewerName = updateData.reviewerName;

    await this.reviewRepository.save(review);
    await this.clearProductCache();
    return review;
  }

  async deleteReview(reviewId: number, userId: number, isAdmin: boolean): Promise<{ message: string }> {
    const review = await this.reviewRepository.findOne({ 
      where: { id: reviewId }, 
      relations: ['user'] 
    });

    if (!review) throw new NotFoundException(`Review #${reviewId} not found`);

    if (!isAdmin && review.user?.id !== userId) {
      throw new BadRequestException('You can only delete your own reviews.');
    }

    await this.reviewRepository.remove(review);
    await this.clearProductCache();
    return { message: `Review #${reviewId} deleted successfully` };
  }
}