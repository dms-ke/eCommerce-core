// src/search/search.module.ts
import { Module } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch/elasticsearch.service';
import { SearchController } from './search.controller';

@Module({
  providers: [ElasticsearchService],
  exports: [ElasticsearchService], // Correctly exports the service for other modules to import
  controllers: [SearchController], 
})
export class SearchModule {}