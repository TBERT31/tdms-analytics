import { Injectable, Logger } from '@nestjs/common';
import { appendFileSync } from 'fs';
import { trace } from '@opentelemetry/api';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  traceId?: string;
  spanId?: string;
  traceFlags?: number;
  attributes: Record<string, any>;
  stack?: string;
}

@Injectable()
export class CustomLoggerService extends Logger {
  private createLogEntry(
    level: string,
    message: string,
    extra?: any,
    error?: Error,
  ): LogEntry {
    // Récupération du contexte OpenTelemetry actif
    const span = trace.getActiveSpan();
    let traceId: string | undefined;
    let spanId: string | undefined;
    let traceFlags: number | undefined;

    if (span) {
      const spanContext = span.spanContext();
      traceId = spanContext.traceId;
      spanId = spanContext.spanId;
      traceFlags = spanContext.traceFlags;
    }

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: error ? `${message}: ${error.message}` : message,
      traceId,
      spanId,
      traceFlags,
      attributes: {},
    };

    // Ajouter la stack trace dans les attributs pour les erreurs
    if (error?.stack) {
      logEntry.stack = error.stack;
    }

    // Merger les données extra dans attributes
    if (extra && typeof extra === 'object') {
      Object.assign(logEntry.attributes, extra);
    }

    // Supprimer les propriétés undefined pour un JSON plus propre
    Object.keys(logEntry).forEach((key) => {
      if (logEntry[key as keyof LogEntry] === undefined) {
        delete logEntry[key as keyof LogEntry];
      }
    });

    return logEntry;
  }

  private outputLog(logEntry: LogEntry): void {
    const logString = JSON.stringify(logEntry);

    // Always send to stdout/stderr (for Kubernetes)
    if (logEntry.level === 'error') {
      console.error(logString);
    } else {
      console.log(logString);
    }

    // Optionally to file (for local development)
    if (process.env.LOG_FILE) {
      try {
        appendFileSync(process.env.LOG_FILE, logString + '\n');
      } catch (fileError) {
        // If file write error, continue without blocking
        const errorMessage =
          fileError instanceof Error ? fileError.message : 'Unknown error';
        console.error('Failed to write to log file:', errorMessage);
      }
    }
  }

  // Flexible signatures for compatibility
  info(message: string, context?: string): void;
  info(
    message: string,
    extra?: Record<string, unknown>,
    context?: string,
  ): void;
  info(
    message: string,
    contextOrExtra?: string | Record<string, unknown>,
    context?: string,
  ): void {
    let extra: Record<string, unknown> | undefined;
    let finalContext: string | undefined;

    if (typeof contextOrExtra === 'string') {
      // Ancien format : info(message, context)
      finalContext = contextOrExtra;
    } else {
      // New format: info(message, extra, context)
      extra = contextOrExtra;
      finalContext = context;
    }

    const logEntry = this.createLogEntry('info', message, extra);
    this.outputLog(logEntry);
    super.log(message, finalContext);
  }

  warn(message: string, context?: string): void;
  warn(
    message: string,
    extra?: Record<string, unknown>,
    context?: string,
  ): void;
  warn(
    message: string,
    contextOrExtra?: string | Record<string, unknown>,
    context?: string,
  ): void {
    let extra: Record<string, unknown> | undefined;
    let finalContext: string | undefined;

    if (typeof contextOrExtra === 'string') {
      finalContext = contextOrExtra;
    } else {
      extra = contextOrExtra;
      finalContext = context;
    }

    const logEntry = this.createLogEntry('warn', message, extra);
    this.outputLog(logEntry);
    super.warn(message, finalContext);
  }

  // @ts-expect-error - Method overloading with different signatures than parent Logger class
  error(message: string, error?: Error, context?: string): void;
  // @ts-expect-error - Method overloading with different signatures than parent Logger class
  error(
    message: string,
    error?: Error,
    extra?: Record<string, unknown>,
    context?: string,
  ): void;
  // @ts-expect-error - Method overloading with different signatures than parent Logger class
  error(
    message: string,
    error?: Error,
    extraOrContext?: Record<string, unknown> | string,
    context?: string,
  ): void {
    let extra: Record<string, unknown> | undefined;
    let finalContext: string | undefined;

    if (typeof extraOrContext === 'string') {
      // Format : error(message, error, context)
      finalContext = extraOrContext;
    } else {
      // Format : error(message, error, extra, context)
      extra = extraOrContext;
      finalContext = context;
    }

    const logEntry = this.createLogEntry('error', message, extra, error);
    this.outputLog(logEntry);
    super.error(message, error?.stack, finalContext);
  }

  debug(message: string, context?: string): void;
  debug(
    message: string,
    extra?: Record<string, unknown>,
    context?: string,
  ): void;
  debug(
    message: string,
    contextOrExtra?: string | Record<string, unknown>,
    context?: string,
  ): void {
    let extra: Record<string, unknown> | undefined;
    let finalContext: string | undefined;

    if (typeof contextOrExtra === 'string') {
      finalContext = contextOrExtra;
    } else {
      extra = contextOrExtra;
      finalContext = context;
    }

    const logEntry = this.createLogEntry('debug', message, extra);
    this.outputLog(logEntry);
    super.debug(message, finalContext);
  }
}