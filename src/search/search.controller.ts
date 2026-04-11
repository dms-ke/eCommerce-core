import { Controller, Get, Query } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch/elasticsearch.service';

@Controller('search')
export class SearchController {
  // Inject the ElasticsearchService to handle the heavy lifting
  constructor(private readonly elasticsearchService: ElasticsearchService) {}

  @Get() // Maps to GET http://localhost:3000/search
  async search(@Query('q') query: string) {
    // Extract the 'q' parameter (e.g., 'Luxury') and pass it to the service
    return this.elasticsearchService.search(query);
  }
}