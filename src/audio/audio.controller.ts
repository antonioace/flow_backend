import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AudioService } from './audio.service';

@Controller('audio')
export class AudioController {
  constructor(private readonly audioService: AudioService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAudio(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { userId: string } },
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.audioService.uploadAndTranscribe(file, req.user.userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteAudio(@Body('id') id: string) {
    return this.audioService.deleteAudio(id);
  }
}
