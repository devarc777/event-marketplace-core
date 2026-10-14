// import { Module } from '@nestjs/common';
// import { UploadsController } from './uploads.controller';

// @Module({
//   controllers: [UploadsController],
// })
// export class UploadsModule {}

import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { S3UploadService } from './s3-upload.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [S3UploadService],
  controllers: [UploadsController],
  exports: [S3UploadService],
})
export class UploadsModule {}
