import type {} from '@fastify/multipart';
import { apiErrorSchema } from '@optical/shared/api';
import { uploadedPrescriptionSchema } from '@optical/shared/checkout';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../lib/app-error';
import { rateLimit, rateLimits, type RateLimiter } from '../../lib/rate-limit';
import type { PrescriptionService } from './prescriptions.service';

export const prescriptionRoutes: FastifyPluginAsyncZod<{
  service: PrescriptionService;
  limiter: RateLimiter;
}> = (app, { service, limiter }) => {
  app.post(
    '/prescriptions/uploads',
    {
      preHandler: rateLimit(limiter, rateLimits.upload),
      schema: {
        tags: ['prescriptions'],
        summary: 'Upload a prescription',
        description:
          'Multipart form with one `file` field: a JPEG, PNG or WebP photo, or a PDF, up to 8 MB. The type is checked by content, image metadata (EXIF, GPS, XMP) is removed, and the file is stored privately. Use the returned id in a lens configuration (`prescription.mode = "upload"`) from the same browser.',
        consumes: ['multipart/form-data'],
        response: {
          201: uploadedPrescriptionSchema,
          413: apiErrorSchema,
          415: apiErrorSchema,
          422: apiErrorSchema,
          429: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const file = await request.file();
      if (!file) throw new AppError('VALIDATION_FAILED', 'Choose a file to upload.');
      const data = await file.toBuffer();
      const uploaded = await service.upload(await reply.ensureOwner(), data);
      void reply.header('cache-control', 'no-store');
      return reply.status(201).send(uploaded);
    },
  );

  app.get(
    '/files/rx/:name',
    {
      schema: {
        tags: ['prescriptions'],
        summary: 'Read an uploaded file',
        description:
          'Only through a signed link that expires after five minutes. Returns the file itself, or 403 for an expired or altered link.',
        params: z.object({ name: z.string().regex(/^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/) }),
        querystring: z.object({
          expires: z.coerce.number().int(),
          signature: z.string().regex(/^[0-9a-f]{64}$/),
        }),
      },
    },
    async (request, reply) => {
      const { data, mime } = await service.file(
        `rx/${request.params.name}`,
        request.query.expires,
        request.query.signature,
      );
      return reply
        .header('content-type', mime)
        .header('cache-control', 'private, no-store')
        .header('content-disposition', 'inline')
        .header('content-security-policy', "default-src 'none'; img-src 'self'; sandbox")
        .send(data);
    },
  );

  return Promise.resolve();
};
