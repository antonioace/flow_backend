import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { S3Service } from '../s3/s3.service';
import { File } from './entities/file.entity';

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(File)
    private readonly fileRepository: Repository<File>,
    private readonly s3Service: S3Service,
  ) {}

  async uploadFile(file: Express.Multer.File, userId: string) {
    const { key, url } = await this.s3Service.uploadFile(file);

    const newFile = this.fileRepository.create({
      url,
      key,
      userId,
    });

    return this.fileRepository.save(newFile);
  }
}
