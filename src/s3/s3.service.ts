import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class S3Service {
  private s3Client: S3Client;
  private readonly logger = new Logger(S3Service.name);

  constructor(private readonly configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );

    if (!accessKeyId || !secretAccessKey) {
      this.logger.warn('AWS Credentials are missing');
    }

    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION') || 'auto',
      endpoint: this.configService.get<string>('AWS_URL'),
      credentials: {
        accessKeyId: accessKeyId || '',
        secretAccessKey: secretAccessKey || '',
      },
    });
  }

  async uploadFile(
    file: Express.Multer.File,
  ): Promise<{ key: string; url: string }> {
    const key = `${randomUUID()}-${file.originalname}`;
    const bucket = this.configService.get('AWS_S3_BUCKET_NAME');

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          // ACL: 'public-read', // Uncomment if you need public read access directly on S3/R2
        }),
      );

      // Construct URL. This depends on your provider (R2, AWS S3, etc)
      // For R2 with a custom domain or the r2.cloudflarestorage.com endpoint:
      // If using the endpoint in .env (AWS_URL), we can try to construct it.
      // Often for R2: https://<accountid>.r2.cloudflarestorage.com/<bucket>/<key>
      // Or if you have a public domain setup.
      // Let's assume the endpoint + bucket + key format for now, or just the stored key if using signed URLs later.

      const endpoint = this.configService.get('AWS_URL');
      const url = `${endpoint}/${bucket}/${key}`;

      return { key, url };
    } catch (error) {
      this.logger.error('Error uploading to S3', error);
      throw error;
    }
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const bucket = this.configService.get('AWS_S3_BUCKET_NAME');
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      this.logger.error('Error generating signed URL', error);
      throw error;
    }
  }

  extractKeyFromUrl(url: string): string | null {
    const endpoint = this.configService.get<string>('AWS_URL');
    const bucket = this.configService.get<string>('AWS_S3_BUCKET_NAME');

    if (!endpoint || !bucket) {
      return null;
    }

    // Constructed URL format: ${endpoint}/${bucket}/${key}
    // Example: https://....r2.cloudflarestorage.com/mybucket/my-key.png

    // Check if URL starts with endpoint
    if (!url.includes(endpoint)) {
      return null;
    }

    // Remove endpoint
    let temp = url.replace(endpoint, '');
    // Remove leading slash if any
    if (temp.startsWith('/')) temp = temp.substring(1);

    // Check if starts with bucket
    if (temp.startsWith(bucket)) {
      temp = temp.replace(bucket, '');
      if (temp.startsWith('/')) temp = temp.substring(1);
      return temp; // This should be the key
    }

    return null;
  }
}
