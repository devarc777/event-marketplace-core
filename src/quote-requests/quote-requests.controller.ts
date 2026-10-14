import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
  Get,
  Param,
  Delete,
} from '@nestjs/common';
import { QuoteRequestsService } from './quote-requests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('quote-requests')
export class QuoteRequestsController {
  constructor(private readonly quoteRequestsService: QuoteRequestsService) {}

  @Post('external')
  @UseGuards(JwtAuthGuard)
  async createExternalQuoteRequest(@Body() body: any, @Req() req: any) {
    const {
      externalVendorId,
      fullName,
      email,
      phone,
      eventType,
      eventDate,
      eventLocation,
      numberOfGuests,
      budgetRange,
      additionalDetails,
    } = body;
    if (
      !externalVendorId ||
      !fullName ||
      !eventType ||
      !eventDate ||
      !eventLocation ||
      !numberOfGuests ||
      !budgetRange
    ) {
      throw new HttpException('Missing required fields for external quote request', HttpStatus.BAD_REQUEST);
    }
    try {
      const created = await this.quoteRequestsService.createExternalQuoteRequest({
        externalVendorId,
        fullName,
        email: email ? String(email).trim() : '',
        phone: phone != null && phone !== '' ? String(phone) : '',
        eventType,
        eventDate: new Date(eventDate),
        eventLocation,
        numberOfGuests,
        budgetRange,
        additionalDetails: additionalDetails || null,
        userId: req.user?.id || null,
      });
      return created;
    } catch (error: any) {
      if (error?.message === 'External vendor not found') {
        throw new HttpException('Vendor not found', HttpStatus.NOT_FOUND);
      }
      throw new HttpException(
        error?.message || 'Failed to create quote request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createQuoteRequest(@Body() body: any, @Req() req: any) {
    console.log('📝 Creating quote request:', body);
    console.log('👤 User ID:', req.user?.id);

    const {
      fullName,
      email,
      phone,
      eventType,
      eventDate,
      eventLocation,
      numberOfGuests,
      budgetRange,
      additionalDetails,
      vendorId,
    } = body;

    // body contact, else profile
    const userEmail = req.user?.email;
    const userPhone = req.user?.phone;
    const finalEmail = email || userEmail;
    const finalPhone = phone || userPhone || '';

    if (
      !fullName ||
      !eventType ||
      !eventDate ||
      !eventLocation ||
      !numberOfGuests ||
      !budgetRange ||
      !vendorId
    ) {
      throw new HttpException(
        'Missing required fields',
        HttpStatus.BAD_REQUEST,
      );
    }

    // email required from body or user
    if (!finalEmail) {
      throw new HttpException(
        'Email is required via profile or request body',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const quoteRequest = await this.quoteRequestsService.createQuoteRequest({
        fullName,
        email: finalEmail,
        phone: finalPhone,
        eventType,
        eventDate: new Date(eventDate),
        eventLocation,
        numberOfGuests,
        budgetRange,
        additionalDetails: additionalDetails || null,
        vendorId,
        userId: req.user?.id || null,
      });

      console.log('✅ Quote request created:', quoteRequest.id);
      return quoteRequest;
    } catch (error) {
      console.error('❌ Failed to create quote request:', error);
      throw new HttpException(
        'Failed to create quote request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('my-requests')
  @UseGuards(JwtAuthGuard)
  async getUserQuoteRequests(@Req() req: any) {
    console.log('📋 Fetching quote requests for user:', req.user?.id);
    try {
      const requests = await this.quoteRequestsService.getUserQuoteRequests(
        req.user.id,
        req.user?.email,
      );
      console.log('✅ Found', requests.length, 'quote requests');
      return requests;
    } catch (error) {
      console.error('❌ Failed to fetch quote requests:', error);
      throw new HttpException(
        'Failed to fetch quote requests',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/respond')
  @UseGuards(JwtAuthGuard)
  async respondToQuote(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    console.log('💬 User responding to quote:', id, body);
    try {
      const result = await this.quoteRequestsService.respondToQuote(
        req.user.id,
        id,
        body,
      );
      console.log('✅ Quote response sent');
      return result;
    } catch (error) {
      console.error('❌ Failed to respond to quote:', error);
      throw new HttpException(
        'Failed to respond to quote',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/messages')
  @UseGuards(JwtAuthGuard)
  async sendMessage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    console.log('💬 User sending message to quote:', id);
    try {
      const result = await this.quoteRequestsService.sendMessage(
        id,
        req.user.id,
        'USER',
        body.message,
        body.attachments || [],
      );
      console.log('✅ Message sent');
      return result;
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      throw new HttpException(
        'Failed to send message',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id/messages')
  @UseGuards(JwtAuthGuard)
  async getQuoteMessages(@Req() req: any, @Param('id') id: string) {
    console.log('💬 User fetching messages for quote:', id);
    console.log('💬 User ID:', req.user.id);
    try {
      const messages = await this.quoteRequestsService.getQuoteMessages(id);
      console.log('✅ User messages fetched:', messages.length);
      console.log('💬 Messages data:', messages);
      return messages;
    } catch (error) {
      console.error('❌ Failed to fetch user messages:', error);
      throw new HttpException(
        'Failed to fetch messages',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id/delete')
  @UseGuards(JwtAuthGuard)
  async deleteUserQuoteRequest(@Req() req: any, @Param('id') id: string) {
    try {
      return await this.quoteRequestsService.deleteUserQuoteRequest(
        req.user.id,
        id,
        req.user?.email,
      );
    } catch (error) {
      console.error('❌ Failed to delete quote request:', error);
      throw new HttpException(
        'Failed to delete quote request',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
