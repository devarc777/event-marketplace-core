import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { put, del } from '@vercel/blob';

@Injectable()
export class S3UploadService {
  constructor(private configService: ConfigService) {}

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'general',
  ): Promise<string> {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = file.originalname.split('.').pop();
    const pathname = `${folder}/${unique}.${ext}`;

    const blob = await put(pathname, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
    });

    return blob.url;
  }

  async deleteFile(url: string): Promise<void> {
    try {
      if (url && url.includes('blob.vercel-storage.com')) {
        await del(url);
      } else {
        console.log(`⚠️ Skipping delete for non-Vercel Blob URL: ${url}`);
      }
    } catch (error) {
      console.error(`❌ Failed to delete file from Vercel Blob:`, error);
    }
  }
}
