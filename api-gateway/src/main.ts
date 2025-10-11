import * as dotenv from 'dotenv';
dotenv.config();
import { NestFactory, Reflector } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import session from 'express-session';
import passport from 'passport';
import { RedisStore } from 'connect-redis';
import { createClient } from 'redis';
import { RolesGuard } from './common/guards/roles.guard';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import * as yaml from 'yaml';
import * as bodyParser from 'body-parser';

export async function bootstrap(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);

  app.use(bodyParser.json({ limit: '200mb' }));
  app.use(bodyParser.urlencoded({ limit: '200mb', extended: true }));

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('EGIS - BFF')
      .setDescription('Here the documentation of our API-GATEWAY')
      .setVersion('1.0.0')
      .addTag('Users', 'User management endpoints')
      .addTag('Auth', 'Authentification management endpoints')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);

    const outputPath = resolve(process.cwd(), 'docs');

    if (!existsSync(outputPath)) {
      mkdirSync(outputPath, { recursive: true });
    }

    writeFileSync(
      resolve(outputPath, 'swagger.json'),
      JSON.stringify(document, null, 2),
    );

    writeFileSync(
      resolve(outputPath, 'swagger.yaml'),
      yaml.stringify(document),
    );

    console.log('📄 Swagger documentation generated in /docs');
  }

  // Initialize client.
  const redisClient = createClient({
    socket: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    },
    username: process.env.REDIS_USERNAME ?? 'app',
    password: process.env.REDIS_PASSWORD ?? 'password',
    database: parseInt(process.env.REDIS_DB ?? '0', 10),
  });

  redisClient.on('error', (err) => {
    console.error('Redis connection error', err);
  });

  redisClient.on('connect', () => {
    console.info('Connected to Redis');
  });

  await redisClient.connect();

  // Initialize store.
  const sessionTTLSeconds = parseInt(
    process.env.SESSION_TTL_SECONDS ?? '3600',
    10,
  );
  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'sess:',
    ttl: sessionTTLSeconds,
  });

  app.use(
    session({
      store: redisStore, // Use Redis store for session management
      resave: false, // Avoids unnecessary entries in the Redis store
      saveUninitialized: false, // Prevents the creation of empty sessions in Redis for each visitor
      secret: process.env.SESSION_SECRET!, // Use a strong secret for signing the session ID cookie
      rolling: true, // Cookie's maxAge is reset with each request
      cookie: {
        maxAge: parseInt(
          process.env.SESSION_COOKIE_MAX_AGE_MS ?? '3600000',
          10,
        ), // Cookie lifetime in milliseconds (default 1 hour)
        sameSite: 'lax', // Possible values: 'strict', 'lax', 'none'. We have to use 'lax' for Keycloak OIDC login
        secure: process.env.NODE_ENV === 'production', // Controls whether the cookie should be sent only via HTTPS
        httpOnly: process.env.SESSION_COOKIE_HTTP_ONLY !== 'false', // Prevents access to the cookie via client-side JavaScript
        domain: process.env.SESSION_COOKIE_DOMAIN ?? undefined, // Defines the domain for which the cookie is valid.
      },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());

  app.useGlobalGuards(new RolesGuard(new Reflector()));

  app.enableShutdownHooks();
  app.enableCors();

  await app.listen(process.env.PORT ?? 3001);
  console.info(`App listening on PORT ${process.env.PORT ?? 3001}`, undefined);
  return app;
}

if (require.main === module) {
  void bootstrap().catch((err: string | undefined) => {
    console.error('Error during bootstrap:', err);
    process.exit(1);
  });
}