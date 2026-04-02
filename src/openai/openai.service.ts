import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import OpenAI from 'openai';

// Initialize dayjs plugins
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('es');

export interface OpenAIResult {
  success: boolean;
  response?: string;
  data?: any;
  error?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

@Injectable()
export class OpenaiService {
  private readonly logger = new Logger(OpenaiService.name);
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPEN_API_KEY');

    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY no configurado en variables de entorno');
    }

    this.openai = new OpenAI({
      apiKey: apiKey || '',
    });
  }

  /**
   * Obtiene la fecha actual en la zona horaria especificada
   * @param tz - Zona horaria a usar (por defecto America/Bogota)
   * @returns Fecha formateada en español
   */
  private getCurrentDate(tz: string = 'America/Bogota'): string {
    try {
      return (
        dayjs().tz(tz).format('dddd, D [de] MMMM [de] YYYY, h:mm a') +
        ` hora de ${tz}`
      );
    } catch {
      return dayjs().format('dddd, D [de] MMMM [de] YYYY, h:mm a');
    }
  }

  /**
   * Genera una respuesta usando GPT
   * @param prompt - Texto de entrada para generar la respuesta
   * @param systemPrompt - Prompt del sistema (opcional)
   * @param model - Modelo a usar (por defecto gpt-3.5-turbo)
   * @param tz - Zona horaria para el contexto temporal (opcional)
   */
  async generateResponse(
    prompt: string,
    systemPrompt?: string,
    model: string = 'gpt-3.5-turbo',
    tz?: string,
  ): Promise<OpenAIResult> {
    try {
      const messages: any[] = [];

      // Agregar contexto de fecha actual
      const currentDate = this.getCurrentDate(tz);
      const contextoFecha = `\n\nIMPORTANTE - Contexto temporal: Fecha y hora actual del servidor: ${currentDate}. Ten en cuenta esta información al procesar el texto.`;

      if (systemPrompt) {
        messages.push({
          role: 'system',
          content: systemPrompt + contextoFecha,
        });
      } else {
        messages.push({ role: 'system', content: contextoFecha });
      }

      messages.push({ role: 'user', content: prompt });

      const completion = await this.openai.chat.completions.create({
        model,
        messages,
        max_tokens: 1500,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message?.content || '';

      this.logger.log(`Respuesta generada exitosamente con modelo ${model}`);

      return {
        success: true,
        response,
        data: completion,
        usage: completion.usage,
      };
    } catch (error: any) {
      this.logger.error('Error al generar respuesta:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Genera una respuesta con conversación completa
   * @param messages - Array de mensajes de la conversación
   * @param model - Modelo a usar
   * @param tz - Zona horaria para el contexto temporal (opcional)
   */
  async generateChatResponse(
    messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>,
    model: string = 'gpt-3.5-turbo',
    tz?: string,
  ): Promise<OpenAIResult> {
    try {
      // Agregar contexto de fecha actual al primer mensaje del sistema
      const currentDate = this.getCurrentDate(tz);
      const contextoFecha = `\n\nIMPORTANTE - Contexto temporal: Fecha y hora actual del servidor: ${currentDate}. Ten en cuenta esta información al procesar el texto.`;

      const messagesWithContext = messages.map((msg, index) => {
        if (msg.role === 'system' && index === 0) {
          return {
            ...msg,
            content: msg.content + contextoFecha,
          };
        }
        return msg;
      });

      // Si no hay mensaje de sistema, agregarlo al inicio
      if (!messagesWithContext.some((msg) => msg.role === 'system')) {
        messagesWithContext.unshift({
          role: 'system',
          content: contextoFecha,
        });
      }

      const completion = await this.openai.chat.completions.create({
        model,
        messages: messagesWithContext,
        max_tokens: 1500,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message?.content || '';

      this.logger.log('Respuesta de chat generada exitosamente');

      return {
        success: true,
        response,
        data: completion,
        usage: completion.usage,
      };
    } catch (error: any) {
      this.logger.error('Error al generar respuesta de chat:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Genera análisis o procesamiento de texto
   * @param text - Texto a procesar
   * @param instruction - Instrucción de qué hacer con el texto
   */
  async processText(text: string, instruction: string): Promise<OpenAIResult> {
    const systemPrompt = `Eres un asistente que procesa texto según las instrucciones dadas. ${instruction}`;
    return this.generateResponse(text, systemPrompt);
  }

  /**
   * Genera contenido estructurado en JSON
   * @param prompt - Prompt para generar el JSON
   * @param jsonStructure - Descripción de la estructura JSON esperada
   * @param tz - Zona horaria para el contexto temporal (opcional)
   */
  async generateJSON(
    prompt: string,
    jsonStructure: string,
    tz?: string,
  ): Promise<OpenAIResult> {
    const systemPrompt = `Eres un asistente que genera respuestas ÚNICAMENTE en formato JSON válido.
Estructura esperada: ${jsonStructure}
Responde SOLO con el JSON, sin texto adicional.`;

    return this.generateResponse(prompt, systemPrompt, 'gpt-3.5-turbo', tz);
  }

  /**
   * Transcribe audio usando Whisper
   * @param audioBuffer - Buffer del audio a transcribir
   * @param language - Idioma del audio (opcional, por defecto 'es')
   */
  async transcribeAudio(
    audioBuffer: Buffer,
    language: string = 'es',
  ): Promise<OpenAIResult> {
    try {
      // Crear un objeto File usando el constructor nativo de Node.js
      // El SDK de OpenAI requiere un objeto File real, no un objeto con funciones
      // Convertir Buffer a Uint8Array para compatibilidad
      const uint8Array = new Uint8Array(audioBuffer);
      const file = new File([uint8Array], 'audio.ogg', {
        type: 'audio/ogg',
        lastModified: Date.now(),
      });

      const transcription = await this.openai.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
        language: language,
      });

      this.logger.log('Audio transcrito exitosamente');

      return {
        success: true,
        response: transcription.text,
        data: transcription,
      };
    } catch (error: any) {
      this.logger.error('Error al transcribir audio:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Verifica si el servicio está disponible
   */
  async checkAvailability(): Promise<boolean> {
    try {
      await this.openai.models.list();
      return true;
    } catch (error: any) {
      this.logger.error('OpenAI no está disponible:', error.message);
      return false;
    }
  }
}
