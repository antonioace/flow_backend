import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SeedService } from './seed.service';

async function runSeed() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const seedService = app.get(SeedService);
    const result = await seedService.run();

    console.log('Seed completado:', result);
  } finally {
    await app.close();
  }
}

runSeed().catch((error) => {
  console.error('Error ejecutando seed:', error);
  process.exit(1);
});
