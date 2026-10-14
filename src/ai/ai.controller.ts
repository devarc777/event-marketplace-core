import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { EventsService } from '../events/events.service';

interface CreateEventFromTextDto {
  text: string;
  organizerEmail: string;
}

interface ParseEventDto {
  text: string;
}

interface VendorSuggestionDto {
  message: string;
  conversationHistory: Array<{ role: string; content: string }>;
  availableVendors: any[];
}

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly eventsService: EventsService,
  ) {}

  // parse NL → event fields (no create)
  @Post('parse-event')
  async parseEvent(@Body() body: ParseEventDto): Promise<{
    success: boolean;
    data: any;
    message?: string;
    error?: string;
  }> {
    if (!body.text || body.text.trim().length === 0) {
      throw new BadRequestException('Text is required');
    }

    try {
      const eventData = await this.aiService.parseEventFromText(body.text);
      return {
        success: true,
        data: eventData,
        message: 'Event details extracted successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  }

  // parse NL then create the event
  @Post('create-event')
  async createEventFromText(@Body() body: CreateEventFromTextDto): Promise<{
    success: boolean;
    data: any;
    message?: string;
    error?: string;
  }> {
    if (!body.text || body.text.trim().length === 0) {
      throw new BadRequestException('Text is required');
    }
    if (!body.organizerEmail) {
      throw new BadRequestException('organizerEmail is required');
    }

    try {
      const eventData = await this.aiService.parseEventFromText(body.text);

      const createdEvent = await this.eventsService.create({
        ...eventData,
        organizerEmail: body.organizerEmail,
      });

      return {
        success: true,
        data: createdEvent,
        message: 'Event created successfully from natural language',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  }

  // title suggestions from partial text
  @Get('suggestions')
  async getSuggestions(
    @Query('text') text: string,
  ): Promise<{ success: boolean; data: string[]; error?: string }> {
    if (!text || text.trim().length === 0) {
      throw new BadRequestException('Text query parameter is required');
    }

    try {
      const suggestions = await this.aiService.generateEventSuggestions(text);
      return {
        success: true,
        data: suggestions,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: [],
      };
    }
  }

  // vendor + package suggestions for chat
  @Post('vendor-suggestions')
  async getVendorSuggestions(@Body() body: VendorSuggestionDto): Promise<{
    message: string;
    vendorSuggestions: any[];
    suggestions?: any[];
  }> {
    if (!body.message || body.message.trim().length === 0) {
      throw new BadRequestException('Message is required');
    }

    try {
      const result = await this.aiService.suggestVendorsAndPackages(
        body.message,
        body.conversationHistory || [],
        body.availableVendors || [],
      );

      return {
        message: result.message,
        vendorSuggestions: result.vendorSuggestions,
        suggestions: result.vendorSuggestions, // alias for older clients
      };
    } catch (error) {
      return {
        message:
          'I understand your requirements. Let me help you find the perfect vendors!',
        vendorSuggestions: [],
        suggestions: [],
      };
    }
  }
}
