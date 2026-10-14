import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BookingStatus,
  PaymentStatus,
  ReviewType,
  Prisma,
  TicketStatus,
} from '@prisma/client';

@Injectable()
export class EventReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  // find any booking for this user/event. If found, we'll treat as eligible
  private async findAnyBooking(eventId: string, userId: string) {
    return this.prisma.booking.findFirst({
      where: { eventId, userId },
      select: { id: true, status: true, paymentStatus: true },
    });
  }

  // Reviews allowed immediately after purchase (no end-date gate)
  private allowPreEventReviews() {
    return true;
  }

  private ensureEventEnded(_event: { endDate: Date | null; title: string }) {
    // Intentionally no-op: allow reviews as soon as a ticket is purchased
    return;
  }

  private async ensureUserAttended(eventId: string, userId: string) {
    // temporarily allow reviews as long as user is authenticated. If needed, re-enable strict booking checks here
    return;
  }

  private makeEmptyDistribution() {
    return { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  }

  private async updateAggregates(
    eventId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const active = await tx.review.findMany({
      where: {
        eventId,
        type: ReviewType.EVENT,
        isDeleted: false,
      },
      select: { rating: true },
    });

    const distribution = this.makeEmptyDistribution();
    for (const r of active) {
      const key = String(Math.max(1, Math.min(5, r.rating)));
      distribution[key] = (distribution[key] || 0) + 1;
    }

    const count = active.length;
    const average =
      count === 0
        ? 0
        : Number(
            (active.reduce((sum, r) => sum + r.rating, 0) / count).toFixed(2),
          );

    await tx.event.update({
      where: { id: eventId },
      data: {
        ratingAverage: average,
        ratingCount: count,
        ratingDistribution: distribution,
      },
    });

    return { average, count, distribution };
  }

  async list(eventId: string, skip = 0, take = 20) {
    const [summary, reviews] = await this.prisma.$transaction([
      this.prisma.event.findUnique({
        where: { id: eventId },
        select: {
          ratingAverage: true,
          ratingCount: true,
          ratingDistribution: true,
        },
      }),
      this.prisma.review.findMany({
        where: {
          eventId,
          type: ReviewType.EVENT,
          isDeleted: false,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          reviewer: {
            select: { id: true, email: true },
          },
        },
      }),
    ]);

    return {
      summary: summary || {
        ratingAverage: 0,
        ratingCount: 0,
        ratingDistribution: this.makeEmptyDistribution(),
      },
      reviews,
    };
  }

  async getMine(eventId: string, userId: string) {
    const existing = await this.prisma.review.findFirst({
      where: {
        eventId,
        reviewerId: userId,
        type: ReviewType.EVENT,
        isDeleted: false,
      },
    });
    return existing || null;
  }

  async checkEligibility(eventId: string, userId: string) {
    // Temporarily allow all authenticated users to review.
    return { eligible: true };
  }

  async upsert(
    eventId: string,
    userId: string,
    rating: number,
    comment?: string,
  ) {
    if (!rating || rating < 1 || rating > 5) {
      throw new HttpException(
        'Rating must be between 1 and 5',
        HttpStatus.BAD_REQUEST,
      );
    }

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new HttpException('Event not found', HttpStatus.NOT_FOUND);
    }

    this.ensureEventEnded(event);
    await this.ensureUserAttended(eventId, userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.review.findFirst({
        where: {
          eventId,
          reviewerId: userId,
          type: ReviewType.EVENT,
        },
      });

      if (existing) {
        await tx.review.update({
          where: { id: existing.id },
          data: {
            rating,
            comment,
            isDeleted: false,
            deletedAt: null,
          },
        });
      } else {
        await tx.review.create({
          data: {
            rating,
            comment,
            reviewerId: userId,
            eventId,
            type: ReviewType.EVENT,
          },
        });
      }

      const summary = await this.updateAggregates(eventId, tx);
      return summary;
    });

    return result;
  }

  async softDelete(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new HttpException('Event not found', HttpStatus.NOT_FOUND);
    }

    const existing = await this.prisma.review.findFirst({
      where: {
        eventId,
        reviewerId: userId,
        type: ReviewType.EVENT,
        isDeleted: false,
      },
    });

    if (!existing) {
      throw new HttpException('No review to delete', HttpStatus.BAD_REQUEST);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id: existing.id },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      const summary = await this.updateAggregates(eventId, tx);
      return summary;
    });

    return result;
  }
}
