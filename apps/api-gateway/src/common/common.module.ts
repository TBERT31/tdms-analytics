import { Module, Global } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomLoggerService } from './logger/logger.service';
import KeyvRedis from '@keyv/redis';
import { LoggingInterceptor } from './interceptors/logging.interceptor';

@Global()
@Module({
  providers: [CustomLoggerService, LoggingInterceptor],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisHost = configService.get<string>('REDIS_HOST', 'localhost');
        const redisPort = configService.get<number>('REDIS_PORT', 6379);
        const redisUsername = configService.get<string>(
          'REDIS_USERNAME',
          'app',
        );
        const redisPassword = configService.get<string>(
          'REDIS_PASSWORD',
          'password',
        );
        const redisDb = configService.get<number>('REDIS_DB', 0);
        const cacheTtl = configService.get<number>('CACHE_TTL', 120);

        const getAuthPart = (
          username: string | undefined,
          password: string | undefined,
        ): string => {
          if (username && password) {
            return `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
          }
          if (password) {
            return `:${encodeURIComponent(password)}@`;
          }
          return '';
        };

        const authPart = getAuthPart(redisUsername, redisPassword);
        const redisUrl = `redis://${authPart}${redisHost}:${redisPort}/${redisDb}`;

        const keyvRedisOptions = {
          url: redisUrl,
          socket: {
            host: redisHost,
            port: redisPort,
            reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
            tls: false,
            keepAlive: 1000,
          },
          username: redisUsername,
          password: redisPassword,
          db: redisDb,
        };

        return {
          ttl: cacheTtl,
          isGlobal: true,
          // @ts-ignore
          stores: [new KeyvRedis(keyvRedisOptions)],
        };
      },
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>('THROTTLER_DEFAULT_TTL', 60000),
          limit: configService.get<number>('THROTTLER_DEFAULT_LIMIT', 100000),
        },
        {
          name: 'short',
          ttl: configService.get<number>('THROTTLER_SHORT_TTL', 1000),
          limit: configService.get<number>('THROTTLER_SHORT_LIMIT', 30000),
        },
        {
          name: 'medium',
          ttl: configService.get<number>('THROTTLER_MEDIUM_TTL', 10000),
          limit: configService.get<number>('THROTTLER_MEDIUM_LIMIT', 200000),
        },
        {
          name: 'long',
          ttl: configService.get<number>('THROTTLER_LONG_TTL', 60000),
          limit: configService.get<number>('THROTTLER_LONG_LIMIT', 1000000),
        },
      ],
      inject: [ConfigService],
    }),
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        timeout: configService.get<number>('HTTP_TIMEOUT', 300000),
        maxRedirects: configService.get<number>('HTTP_MAX_REDIRECTS', 5),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: (status) => status < 500,
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [
    ConfigModule,
    CacheModule,
    ThrottlerModule,
    HttpModule,
    CustomLoggerService,
    LoggingInterceptor,
  ],
})
export class CommonModule {}
