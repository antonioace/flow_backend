import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpenaiService } from '../openai/openai.service';
import { S3Service } from '../s3/s3.service';
import { Audio } from './entities/audio.entity';

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);

  constructor(
    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,
    private readonly s3Service: S3Service,
    private readonly openaiService: OpenaiService,
  ) {}

  async uploadAndTranscribe(file: Express.Multer.File, userId: string) {
    try {
      // 1. Upload to S3
      const { key, url } = await this.s3Service.uploadFile(file);

      // 2. Transcribe with OpenAI
      let transcriptionText = '';
      try {
        const transcriptionResult = await this.openaiService.transcribeAudio(
          file.buffer,
        );
        if (transcriptionResult.success && transcriptionResult.response) {
          transcriptionText = transcriptionResult.response;
        } else {
          this.logger.warn(
            `Fallo la transcripcion para el archivo ${file.originalname}: ${transcriptionResult.error}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error transcribiendo archivo ${file.originalname}`,
          error,
        );
      }

      // 3. Save entity
      const audio = this.audioRepository.create({
        url,
        key,
        transcription: transcriptionText,
        userId,
      });

      return await this.audioRepository.save(audio);
    } catch (error) {
      this.logger.error('Error in uploadAndTranscribe', error);
      throw error;
    }
  }

  deleteAudio(id: string) {
    return this.audioRepository.update(id, { isActive: false });
  }
}
