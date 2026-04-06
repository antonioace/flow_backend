import {
  Controller,
  Post,
  Body,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { S3Service } from './s3.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('s3')
export class S3Controller {
  constructor(private readonly s3Service: S3Service) {}

  @UseGuards(JwtAuthGuard)
  @Post('signed-url')
  async getSignedUrl(@Body('path') path: string) {
    if (!path) {
      throw new BadRequestException('Path (key or url) is required');
    }

    // Logic to detect if it's a URL or a Key and handle accordingly
    // If it looks like a full URL from our system, extract the key.
    // Otherwise treat as key.

    let key = path;

    // Basic check if it is a URL - this logic might need refinement based on exact endpoint format
    // But the service can expose a helper for this.

    if (path.startsWith('http')) {
      const extracted = this.s3Service.extractKeyFromUrl(path);
      if (extracted) {
        key = extracted;
      } else {
        // If provided valid URL but not matching our bucket structure,
        // we might decide to reject or return as is (but signing won't work on external URLs)
        // For now, assume if extraction fails but it was http, it might be invalid for signing.
        throw new BadRequestException(
          'Invalid S3 URL or not belonging to configured bucket',
        );
      }
    }

    const signedUrl = await this.s3Service.getSignedUrl(key);

    return { signedUrl };
  }
}
