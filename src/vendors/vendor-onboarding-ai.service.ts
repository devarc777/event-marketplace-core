import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

export interface Question {
  questionId: string;
  text: string;
  type: 'multiple_choice' | 'text' | 'multi_select';
  options?: string[];
  category: 'initial' | 'follow_up' | 'category_specific';
  triggers?: {
    if_answered?: string[];
    then_ask?: string[];
  };
}

export interface Answer {
  questionId: string;
  answer: string | string[];
  timestamp: Date;
}

export interface OnboardingSession {
  sessionId: string;
  vendorId: string;
  answers: Answer[];
  currentTags: string[];
  currentQuestionIndex: number;
  completed: boolean;
}

@Injectable()
export class VendorOnboardingAiService {
  private readonly logger = new Logger(VendorOnboardingAiService.name);

  // question bank (could move to DB later)
  private readonly questionPool: Question[] = [
    // always asked first
    {
      questionId: 'Q001',
      text: 'What type of events do you primarily serve?',
      type: 'multi_select',
      options: [
        'Weddings',
        'Corporate Events',
        'Birthdays',
        'Festivals',
        'Conferences',
        'Concerts',
        'Sports Events',
        'Exhibitions',
        'Workshops',
        'Graduations',
        'Anniversaries',
        'Baby Showers',
        'Engagement Parties',
        'Religious Events',
        'Cultural Events',
        'Charity Events',
        'Product Launches',
        'Networking Events',
        'Award Ceremonies',
        'Gala Dinners',
        'Other'
      ],
      category: 'initial',
    },
    {
      questionId: 'Q002',
      text: 'What is your typical event size?',
      type: 'multiple_choice',
      options: ['Small (0-50 guests)', 'Medium (50-200 guests)', 'Large (200-500 guests)', 'Extra Large (500+ guests)'],
      category: 'initial',
    },
    {
      questionId: 'Q003',
      text: 'When are you busiest?',
      type: 'multi_select',
      options: ['Spring', 'Summer', 'Fall', 'Winter'],
      category: 'initial',
    },
    {
      questionId: 'Q004',
      text: 'How many years of experience do you have?',
      type: 'multiple_choice',
      options: ['1-2 years', '3-5 years', '6-10 years', '10+ years'],
      category: 'initial',
    },
    // conditional follow-ups
    {
      questionId: 'Q005',
      text: 'What cuisine types do you specialize in?',
      type: 'multi_select',
      options: ['Italian', 'Asian', 'American', 'Mediterranean', 'Mexican', 'Fusion', 'Other'],
      category: 'follow_up',
      triggers: {
        if_answered: ['CATERING'],
        then_ask: ['Q001'],
      },
    },
    {
      questionId: 'Q006',
      text: 'What photography styles do you offer?',
      type: 'multi_select',
      options: ['Portrait', 'Candid', 'Traditional', 'Artistic', 'Documentary', 'Other'],
      category: 'follow_up',
      triggers: {
        if_answered: ['PHOTOGRAPHY'],
        then_ask: ['Q001'],
      },
    },
    {
      questionId: 'Q014',
      text: 'What videography services do you provide?',
      type: 'multi_select',
      options: ['Event Coverage', 'Highlight Reels', 'Drone Footage', 'Live Streaming', 'Documentary', 'Other'],
      category: 'follow_up',
      triggers: {
        if_answered: ['VIDEOGRAPHY'],
        then_ask: ['Q001'],
      },
    },
    {
      questionId: 'Q015',
      text: 'What music genres or DJ services do you offer?',
      type: 'multi_select',
      options: ['Hip-Hop', 'Electronic', 'Pop', 'Rock', 'Classical', 'Jazz', 'Bollywood', 'Custom Playlists', 'Other'],
      category: 'follow_up',
      triggers: {
        if_answered: ['MUSIC_DJ'],
        then_ask: ['Q001'],
      },
    },
    {
      questionId: 'Q016',
      text: 'What types of decoration themes do you specialize in?',
      type: 'multi_select',
      options: ['Modern', 'Traditional', 'Rustic', 'Luxury', 'Minimalist', 'Themed Events', 'Other'],
      category: 'follow_up',
      triggers: {
        if_answered: ['DECORATION'],
        then_ask: ['Q001'],
      },
    },
    {
      questionId: 'Q017',
      text: 'What types of floral arrangements do you provide?',
      type: 'multi_select',
      options: ['Bridal Bouquets', 'Centerpieces', 'Ceremony Arches', 'Boutonnieres', 'Event Decor', 'Other'],
      category: 'follow_up',
      triggers: {
        if_answered: ['FLOWERS'],
        then_ask: ['Q001'],
      },
    },
    {
      questionId: 'Q018',
      text: 'What transportation services do you offer?',
      type: 'multi_select',
      options: ['Luxury Vehicles', 'Buses', 'Shuttles', 'Airport Transfers', 'Event Transportation', 'Other'],
      category: 'follow_up',
      triggers: {
        if_answered: ['TRANSPORTATION'],
        then_ask: ['Q001'],
      },
    },
    {
      questionId: 'Q019',
      text: 'What security services do you provide?',
      type: 'multi_select',
      options: ['Event Security', 'Crowd Control', 'VIP Protection', 'Access Control', 'Surveillance', 'Other'],
      category: 'follow_up',
      triggers: {
        if_answered: ['SECURITY'],
        then_ask: ['Q001'],
      },
    },
    {
      questionId: 'Q020',
      text: 'What cleaning services do you offer?',
      type: 'multi_select',
      options: ['Pre-Event', 'Post-Event', 'Deep Cleaning', 'Maintenance', 'Specialized Cleaning', 'Other'],
      category: 'follow_up',
      triggers: {
        if_answered: ['CLEANING'],
        then_ask: ['Q001'],
      },
    },
    {
      questionId: 'Q021',
      text: 'What types of equipment do you rent?',
      type: 'multi_select',
      options: ['Audio/Visual', 'Lighting', 'Furniture', 'Tents', 'Staging', 'Other'],
      category: 'follow_up',
      triggers: {
        if_answered: ['EQUIPMENT_RENTAL'],
        then_ask: ['Q001'],
      },
    },
    {
      questionId: 'Q022',
      text: 'What type of venue space do you provide?',
      type: 'multi_select',
      options: ['Indoor', 'Outdoor', 'Rooftop', 'Garden', 'Ballroom', 'Conference Hall', 'Other'],
      category: 'follow_up',
      triggers: {
        if_answered: ['VENUE'],
        then_ask: ['Q001'],
      },
    },
    {
      questionId: 'Q007',
      text: 'What is your service pricing model?',
      type: 'multiple_choice',
      options: ['Fixed packages', 'Hourly rate', 'Per event', 'Custom quotes'],
      category: 'follow_up',
    },
    {
      questionId: 'Q008',
      text: 'What makes your service unique?',
      type: 'text',
      category: 'follow_up',
    },
    {
      questionId: 'Q009',
      text: 'What is your typical response time for inquiries?',
      type: 'multiple_choice',
      options: ['Within 1 hour', 'Within 4 hours', 'Within 24 hours', 'Within 2-3 days'],
      category: 'follow_up',
    },
    {
      questionId: 'Q010',
      text: 'Do you offer any special packages or discounts?',
      type: 'multiple_choice',
      options: ['Yes, multiple packages', 'Yes, seasonal discounts', 'Yes, custom packages', 'No special packages'],
      category: 'follow_up',
    },
    {
      questionId: 'Q011',
      text: 'What is your preferred method of communication with clients?',
      type: 'multi_select',
      options: ['Email', 'Phone', 'WhatsApp', 'In-person meetings', 'Video calls'],
      category: 'follow_up',
    },
    {
      questionId: 'Q012',
      text: 'How far in advance do clients typically book your services?',
      type: 'multiple_choice',
      options: ['Less than 1 month', '1-3 months', '3-6 months', '6+ months'],
      category: 'follow_up',
    },
    {
      questionId: 'Q013',
      text: 'What additional services or add-ons do you offer?',
      type: 'text',
      category: 'follow_up',
    },
  ];

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  async startSession(vendorId: string, vendorCategory?: string): Promise<{
    sessionId: string;
    questions: Question[];
    currentQuestion: Question;
  }> {
    const initialQuestions = this.getInitialQuestions(vendorCategory);

    const sessionId = `session_${Date.now()}_${vendorId}`;

    await this.prisma.onboardingSession.create({
      data: {
        id: sessionId,
        vendorId,
        sessionData: {
          answers: [],
          currentQuestionIndex: 0,
          startedAt: new Date().toISOString(),
        },
        tags: [],
      },
    });

    return {
      sessionId,
      questions: initialQuestions,
      currentQuestion: initialQuestions[0],
    };
  }

  // save answer → tags → next question (or done)
  async submitAnswer(
    vendorId: string,
    sessionId: string,
    questionId: string,
    answer: string | string[],
  ): Promise<{
    nextQuestion?: Question;
    tags: string[];
    completed: boolean;
    profile?: any;
  }> {
    const session = await this.prisma.onboardingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.vendorId !== vendorId) {
      throw new Error('Session not found or unauthorized');
    }

    const sessionData = session.sessionData as any;
    const answers: Answer[] = sessionData.answers || [];

    answers.push({
      questionId,
      answer,
      timestamp: new Date(),
    });

    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { category: true },
    });

    const answerText = Array.isArray(answer) ? answer.join(', ') : answer;
    const question = this.questionPool.find((q) => q.questionId === questionId);
    const questionText = question?.text || '';

    const allAnswers = answers.map((a) => {
      const q = this.questionPool.find((q) => q.questionId === a.questionId);
      return {
        question: q?.text || '',
        answer: Array.isArray(a.answer) ? a.answer.join(', ') : String(a.answer),
      };
    });

    const tagResult = await this.aiService.generateTags(
      `${questionText}: ${answerText}`,
      {
        category: vendor?.category,
        previousAnswers: allAnswers,
        currentTags: session.tags,
      },
    );

    const allTags = [...new Set([...session.tags, ...tagResult.tags])];

    const nextQuestion = this.selectNextQuestion(answers, vendor?.category);

    const completed = !nextQuestion || answers.length >= 12; // cap at 12

    const updatedSessionData = {
      ...sessionData,
      answers,
      currentQuestionIndex: answers.length,
      lastUpdated: new Date().toISOString(),
    };

    await this.prisma.onboardingSession.update({
      where: { id: sessionId },
      data: {
        sessionData: updatedSessionData,
        tags: allTags,
      },
    });

    let profile = null;
    if (completed) {
      profile = await this.generateFinalProfile(vendorId, answers, allTags);
    }

    return {
      nextQuestion,
      tags: allTags,
      completed,
      profile,
    };
  }

  // finalize profile + write to vendor
  async completeOnboarding(
    vendorId: string,
    sessionId: string,
  ): Promise<{
    profile: any;
    tags: string[];
  }> {
    const session = await this.prisma.onboardingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.vendorId !== vendorId) {
      throw new Error('Session not found or unauthorized');
    }

    const sessionData = session.sessionData as any;
    const answers: Answer[] = sessionData.answers || [];

    const profile = await this.generateFinalProfile(
      vendorId,
      answers,
      session.tags,
    );

    // confidence scores not tracked yet — default
    const confidenceScores: number[] = [];
    const avgConfidence = confidenceScores.length > 0
      ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
      : 0.75;

    await this.prisma.vendor.update({
      where: { id: vendorId },
      data: {
        aiProfile: profile,
        aiTags: session.tags,
        aiPersona: profile.persona,
        aiConfidenceScore: avgConfidence,
        aiOnboardingCompleted: true,
        aiOnboardingData: sessionData,
      },
    });

    await this.prisma.onboardingSession.update({
      where: { id: sessionId },
      data: {
        finalProfile: profile,
      },
    });

    return {
      profile,
      tags: session.tags,
    };
  }

  async getSession(sessionId: string): Promise<any> {
    return this.prisma.onboardingSession.findUnique({
      where: { id: sessionId },
    });
  }

  async getProfile(vendorId: string): Promise<any> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        aiProfile: true,
        aiTags: true,
        aiPersona: true,
        aiConfidenceScore: true,
        aiOnboardingCompleted: true,
      },
    });

    return vendor;
  }

  private getInitialQuestions(vendorCategory?: string): Question[] {
    const initial = this.questionPool.filter((q) => q.category === 'initial');

    if (vendorCategory) {
      const categorySpecific = this.questionPool.filter(
        (q) =>
          q.category === 'category_specific' &&
          q.triggers?.if_answered?.includes(vendorCategory.toUpperCase()),
      );
      return [...initial, ...categorySpecific];
    }

    return initial;
  }

  // category follow-up first, then shared Q007–Q013
  private selectNextQuestion(
    answers: Answer[],
    vendorCategory?: string,
  ): Question | undefined {
    if (answers.length >= 12) return undefined;

    const answeredQuestionIds = answers.map((a) => a.questionId);

    if (vendorCategory) {
      const categoryUpper = vendorCategory.toUpperCase();

      if (categoryUpper === 'CATERING' && !answeredQuestionIds.includes('Q005')) {
        return this.questionPool.find((q) => q.questionId === 'Q005');
      }
      if (categoryUpper === 'PHOTOGRAPHY' && !answeredQuestionIds.includes('Q006')) {
        return this.questionPool.find((q) => q.questionId === 'Q006');
      }
      if (categoryUpper === 'VIDEOGRAPHY' && !answeredQuestionIds.includes('Q014')) {
        return this.questionPool.find((q) => q.questionId === 'Q014');
      }
      if (categoryUpper === 'MUSIC_DJ' && !answeredQuestionIds.includes('Q015')) {
        return this.questionPool.find((q) => q.questionId === 'Q015');
      }
      if (categoryUpper === 'DECORATION' && !answeredQuestionIds.includes('Q016')) {
        return this.questionPool.find((q) => q.questionId === 'Q016');
      }
      if (categoryUpper === 'FLOWERS' && !answeredQuestionIds.includes('Q017')) {
        return this.questionPool.find((q) => q.questionId === 'Q017');
      }
      if (categoryUpper === 'TRANSPORTATION' && !answeredQuestionIds.includes('Q018')) {
        return this.questionPool.find((q) => q.questionId === 'Q018');
      }
      if (categoryUpper === 'SECURITY' && !answeredQuestionIds.includes('Q019')) {
        return this.questionPool.find((q) => q.questionId === 'Q019');
      }
      if (categoryUpper === 'CLEANING' && !answeredQuestionIds.includes('Q020')) {
        return this.questionPool.find((q) => q.questionId === 'Q020');
      }
      if (categoryUpper === 'EQUIPMENT_RENTAL' && !answeredQuestionIds.includes('Q021')) {
        return this.questionPool.find((q) => q.questionId === 'Q021');
      }
      if (categoryUpper === 'VENUE' && !answeredQuestionIds.includes('Q022')) {
        return this.questionPool.find((q) => q.questionId === 'Q022');
      }
    }

    if (!answeredQuestionIds.includes('Q007')) {
      return this.questionPool.find((q) => q.questionId === 'Q007');
    }
    if (!answeredQuestionIds.includes('Q008')) {
      return this.questionPool.find((q) => q.questionId === 'Q008');
    }
    if (!answeredQuestionIds.includes('Q009')) {
      return this.questionPool.find((q) => q.questionId === 'Q009');
    }
    if (!answeredQuestionIds.includes('Q010')) {
      return this.questionPool.find((q) => q.questionId === 'Q010');
    }
    if (!answeredQuestionIds.includes('Q011')) {
      return this.questionPool.find((q) => q.questionId === 'Q011');
    }
    if (!answeredQuestionIds.includes('Q012')) {
      return this.questionPool.find((q) => q.questionId === 'Q012');
    }
    if (!answeredQuestionIds.includes('Q013')) {
      return this.questionPool.find((q) => q.questionId === 'Q013');
    }

    return undefined;
  }

  private async generateFinalProfile(
    vendorId: string,
    answers: Answer[],
    tags: string[],
  ): Promise<any> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        businessName: true,
        category: true,
        city: true,
      },
    });

    const answerSummary = answers
      .map((a) => {
        const question = this.questionPool.find((q) => q.questionId === a.questionId);
        const answerText = Array.isArray(a.answer) ? a.answer.join(', ') : a.answer;
        return `${question?.text || 'Question'}: ${answerText}`;
      })
      .join('\n');

    const personaPrompt = `Based on these vendor responses:
${answerSummary}

Generate a short persona description (2-4 words) like "Experienced Premium Event Specialist" or "Rising Star Catering Expert".

Return ONLY the persona text, no other text.`;

    try {
      const response = await fetch(
        'https://router.huggingface.co/models/openai/gpt-oss-20b',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.HF_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: personaPrompt }],
            max_tokens: 50,
            temperature: 0.3,
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        const persona =
          data.choices?.[0]?.message?.content ||
          data.generated_text ||
          'Event Service Provider';
        const cleanPersona = persona.trim().replace(/^["']|["']$/g, '');

        return {
          vendorId,
          persona: cleanPersona,
          tags,
          insights: this.extractInsights(answers),
          generatedAt: new Date().toISOString(),
        };
      }
    } catch (error) {
      this.logger.error(`Error generating persona: ${error.message}`);
    }

    return {
      vendorId,
      persona: 'Event Service Provider',
      tags,
      insights: this.extractInsights(answers),
      generatedAt: new Date().toISOString(),
    };
  }

  private extractInsights(answers: Answer[]): any {
    const insights: any = {};

    const sizeAnswer = answers.find((a) => a.questionId === 'Q002');
    if (sizeAnswer) {
      insights.preferredEventSize = sizeAnswer.answer;
    }

    const seasonAnswer = answers.find((a) => a.questionId === 'Q003');
    if (seasonAnswer) {
      insights.peakSeasons = Array.isArray(seasonAnswer.answer)
        ? seasonAnswer.answer
        : [seasonAnswer.answer];
    }

    const expAnswer = answers.find((a) => a.questionId === 'Q004');
    if (expAnswer) {
      insights.experienceLevel = expAnswer.answer;
    }

    return insights;
  }
}

