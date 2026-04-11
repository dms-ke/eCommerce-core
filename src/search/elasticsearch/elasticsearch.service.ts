// src/search/elasticsearch/elasticsearch.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Client as ESClient } from '@elastic/elasticsearch';

const PRODUCTS_INDEX = 'products'; 

@Injectable()
export class ElasticsearchService {
  private esClient: ESClient;
  private readonly logger = new Logger(ElasticsearchService.name);

  constructor() {
    this.esClient = new ESClient({
      node: 'http://localhost:9200', 
    });
    this.createIndexIfNotExists();
  }

  private async createIndexIfNotExists() {
    try {
      const exists = await this.esClient.indices.exists({ index: PRODUCTS_INDEX });
      if (!exists) { 
        await this.esClient.indices.create({ index: PRODUCTS_INDEX });
        this.logger.log(`Created Elasticsearch index: ${PRODUCTS_INDEX}`);
      } else {
        this.logger.log(`Elasticsearch index ${PRODUCTS_INDEX} already exists.`);
      }
    } catch (error) {
      this.logger.error('Failed to connect to Elasticsearch or create index.', error.message);
    }
  }

  async indexProduct(product: any) {
    return this.esClient.index({
      index: PRODUCTS_INDEX,
      id: product.id.toString(),
      document: product,
    });
  }

  /**
   * 🔥 UPDATED: Added searchProducts to match the ProductService call.
   */
  async searchProducts(query: string, page: number = 1, size: number = 10) {
    const skip = (page - 1) * size;

    const response = await this.esClient.search({
      index: PRODUCTS_INDEX,
      from: skip,
      size: size,
      query: { 
        multi_match: {
          query: query,
          fields: ['name^3', 'description', 'category^2'], 
          fuzziness: 'AUTO', 
        },
      },
    }) as { hits: { hits: Array<{ _source: any }>, total: { value: number } } }; 

    const hits = response.hits.hits.map((hit: any) => hit._source);
    return { hits, total: response.hits.total.value };
  }

  /**
   * Maintained old search method just in case other parts of the app rely on it
   */
  async search(query: string, page: number = 1, size: number = 10) {
    return this.searchProducts(query, page, size);
  }

  /**
   * Removes a product from the Elasticsearch index
   */
  async removeProduct(productId: number) {
    try {
      await this.esClient.delete({
        index: PRODUCTS_INDEX,
        id: productId.toString(),
      });
      this.logger.log(`Removed product ${productId} from Elasticsearch`);
    } catch (error) {
      this.logger.error(`Failed to remove product ${productId} from ES`, error.message);
    }
  }
}