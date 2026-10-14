import {
  Controller,
  Post,
  Get,
  Param,
  Res,
  UploadedFile,
  UseInterceptors,
  Req,
  HttpException,
  HttpStatus,
  Body,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { S3UploadService } from './s3-upload.service';

@Controller()
export class UploadsController {
  constructor(
    private prisma: PrismaService,
    private s3UploadService: S3UploadService,
  ) {}

  // Files are now served directly from S3, so these endpoints are no longer needed
  // But keeping them for backward compatibility - they'll redirect to S3 URLs if needed

  // Main generic upload endpoint
  // Frontend calls `${API_BASE}/uploads` in both local and live
  @Post('uploads')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/webp',
          'image/heic',
          'image/heif',
        ];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new Error(
              'Only PDF, DOC, DOCX, JPG, PNG, WEBP, and HEIC files are allowed',
            ),
            false,
          );
        }
      },
    }),
  )
  async upload(@UploadedFile() file: any, @Req() req: any, @Body() body: any) {
    console.log('📤 Upload request received');
    console.log(
      '📁 File:',
      file
        ? {
            originalname: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
          }
        : 'No file',
    );

    // Check if file was uploaded
    if (!file) {
      console.error('❌ No file uploaded');
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    // Upload to S3
    const s3Url = await this.s3UploadService.uploadFile(file, 'general');
    console.log('✅ File uploaded to S3:', s3Url);

    // If this is an image and userId is provided, update user avatar in database
    if (body.userId && file.mimetype.startsWith('image/')) {
      try {
        console.log(
          '🔄 Updating user avatar in database for user:',
          body.userId,
        );
        await this.prisma.user.update({
          where: { id: body.userId },
          data: { avatar: s3Url },
        });
        console.log('✅ User avatar updated in database');
      } catch (error) {
        console.error('❌ Failed to update user avatar:', error);
      }
    }

    return { url: s3Url };
  }

  // Portfolio image uploads
  // Frontend calls `${API_BASE}/uploads/portfolio`
  @Post('uploads/portfolio')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for portfolio files
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new Error(
              'Only JPG, PNG, WEBP, and HEIC images are allowed for portfolio',
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadPortfolio(@UploadedFile() file: any, @Req() req: any) {
    console.log('📤 Portfolio upload request received');
    console.log(
      '📁 File:',
      file
        ? {
            originalname: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
          }
        : 'No file',
    );

    if (!file) {
      console.error('❌ No file uploaded');
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    // Upload to S3
    const s3Url = await this.s3UploadService.uploadFile(file, 'portfolios');
    console.log('✅ Portfolio image uploaded to S3:', s3Url);

    return {
      url: s3Url,
      originalname: file.originalname,
    };
  }

  // Service image uploads
  // Frontend calls `${API_BASE}/uploads/service-image`
  @Post('uploads/service-image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for service images
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Only JPG, PNG, WEBP, and HEIC images are allowed'), false);
        }
      },
    }),
  )
  async uploadServiceImage(@UploadedFile() file: any, @Req() req: any) {
    console.log('📤 Service image upload request received');
    console.log(
      '📁 File:',
      file
        ? {
            originalname: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
          }
        : 'No file',
    );

    if (!file) {
      console.error('❌ No file uploaded');
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    // Upload to S3
    const s3Url = await this.s3UploadService.uploadFile(file, 'services');
    console.log('✅ Service image uploaded to S3:', s3Url);
    return { url: s3Url };
  }

  // Vendor profile picture uploads
  // Frontend calls `${API_BASE}/uploads/vendor-profile-picture`
  @Post('uploads/vendor-profile-picture')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for profile pictures
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Only JPG, PNG, WEBP, and HEIC images are allowed'), false);
        }
      },
    }),
  )
  async uploadVendorProfilePicture(@UploadedFile() file: any, @Req() req: any) {
    console.log('📤 Vendor profile picture upload request received');
    console.log(
      '📁 File:',
      file
        ? {
            originalname: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
          }
        : 'No file',
    );
    console.log('👤 User ID:', req.user?.id);

    if (!file) {
      console.error('❌ No file uploaded');
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    if (!req.user?.id) {
      console.error('❌ No user ID in request');
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Upload to S3
    const s3Url = await this.s3UploadService.uploadFile(file, 'vendor-profiles');
    console.log('✅ Vendor profile picture uploaded to S3:', s3Url);

    // Update vendor profile picture in database
    try {
      console.log(
        '🔄 Updating vendor profile picture in database for user:',
        req.user.id,
      );

      // First check if vendor exists
      const existingVendor = await this.prisma.vendor.findUnique({
        where: { userId: req.user.id },
      });

      if (!existingVendor) {
        console.error('❌ Vendor not found for user:', req.user.id);
        throw new HttpException(
          'Vendor profile not found',
          HttpStatus.NOT_FOUND,
        );
      }

      console.log('✅ Found vendor:', existingVendor.id);

      const updatedVendor = await this.prisma.vendor.update({
        where: { userId: req.user.id },
        data: { profilePicture: s3Url },
      });
      console.log(
        '✅ Vendor profile picture updated in database:',
        updatedVendor.id,
      );
    } catch (error) {
      console.error('❌ Failed to update vendor profile picture:', error);
      // Don't throw error if it's just a database update issue - file was uploaded successfully
      console.log('⚠️ Database update failed, but file upload was successful');
    }

    return { url: s3Url };
  }
}
