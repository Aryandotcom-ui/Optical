import type { LensQuoteRequest } from '@optical/shared/lens';
import type { FastifyReply } from 'fastify';
import type { LensService } from './lens.service';

export class LensController {
  constructor(private readonly service: LensService) {}

  options(reply: FastifyReply) {
    void reply.header('cache-control', 'public, max-age=60, stale-while-revalidate=300');
    return this.service.options();
  }

  quote(request: LensQuoteRequest, reply: FastifyReply) {
    void reply.header('cache-control', 'no-store');
    return this.service.quote(request);
  }
}
