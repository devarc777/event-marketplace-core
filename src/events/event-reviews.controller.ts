import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EventReviewsService } from './event-reviews.service';

@Controller('events/:eventId/reviews')
export class EventReviewsController {
  constructor(private readonly reviewsService: EventReviewsService) {}

  @Get()
  async list(
    @Param('eventId') eventId: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    if (!eventId) throw new BadRequestException('eventId is required');
    const s = skip ? Number(skip) : 0;
    const t = take ? Number(take) : 20;
    return this.reviewsService.list(eventId, s, t);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async getMine(@Param('eventId') eventId: string, @Req() req: any) {
    if (!eventId) throw new BadRequestException('eventId is required');
    return this.reviewsService.getMine(eventId, req.user.id);
  }

  @Get('eligibility')
  @UseGuards(JwtAuthGuard)
  async checkEligibility(@Param('eventId') eventId: string, @Req() req: any) {
    if (!eventId) throw new BadRequestException('eventId is required');
    return this.reviewsService.checkEligibility(eventId, req.user.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async upsert(
    @Param('eventId') eventId: string,
    @Body() body: { rating: number; comment?: string },
    @Req() req: any,
  ) {
    if (!eventId) throw new BadRequestException('eventId is required');
    if (!body || typeof body.rating !== 'number') {
      throw new BadRequestException('rating is required');
    }
    return this.reviewsService.upsert(
      eventId,
      req.user.id,
      body.rating,
      body.comment,
    );
  }

  @Delete('my')
  @UseGuards(JwtAuthGuard)
  async softDelete(@Param('eventId') eventId: string, @Req() req: any) {
    if (!eventId) throw new BadRequestException('eventId is required');
    return this.reviewsService.softDelete(eventId, req.user.id);
  }
}
