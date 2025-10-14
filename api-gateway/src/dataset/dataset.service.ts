import { Injectable, HttpException, Logger, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Request, Response } from 'express';
import * as http from 'http';
import * as https from 'https';
import { IDataset, IDatasetMeta } from './interfaces/dataset.interface';
import { IChannel, ITimeRange } from './interfaces/channel.interface';
import { IHealthResponse, IApiConstraints } from './interfaces/api-response.interface';
import { AuthenticatedRequest } from 'src/common/auth/interfaces/authenticated-request';

@Injectable()
export class DatasetService {
  private readonly logger = new Logger(DatasetService.name);
  private readonly datasetServiceBaseUrl: string;
  private readonly backendHostname: string;
  private readonly backendPort: number;
  private readonly isHttps: boolean;
  private readonly gatewaySecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.datasetServiceBaseUrl = this.configService.get<string>(
      'DATASET_SERVICE_BASE_URL',
      'http://localhost:3001/dataset',
    );

    this.gatewaySecret = this.configService.get<string>(
      'GATEWAY_SECRET',
      '',
    );

    if (!this.gatewaySecret) {
      this.logger.warn(
        '⚠️  GATEWAY_SECRET not configured! Backend communication is not secure.',
      );
    }

    // Parse URL once au démarrage
    const parsedUrl = new URL(this.datasetServiceBaseUrl);
    this.backendHostname = parsedUrl.hostname;
    this.backendPort = parseInt(parsedUrl.port) || (parsedUrl.protocol === 'https:' ? 443 : 8000);
    this.isHttps = parsedUrl.protocol === 'https:';

    this.logger.log(
      `Dataset Service configured: ${this.backendHostname}:${this.backendPort} (${this.isHttps ? 'HTTPS' : 'HTTP'})`,
    );
  }

  private getUserInfo(req: AuthenticatedRequest): { sub: string; email?: string } {
    if (!req.user?.userinfo?.sub) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return {
      sub: req.user.userinfo.sub,
      email: req.user.userinfo.email,
    };
  }

  private buildAuthHeaders(userSub: string, userEmail?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'X-User-Sub': userSub,
      'X-Gateway-Secret': this.gatewaySecret,
    };

    if (userEmail) {
      headers['X-User-Email'] = userEmail;
    }

    return headers;
  }

  // ========== Health (petit, pas besoin de streaming) ==========
  async healthCheck(): Promise<IHealthResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<IHealthResponse>(
          `${this.datasetServiceBaseUrl}/health`,
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Health check failed', error);
      throw new HttpException(
        error.response?.data || 'Health check failed',
        error.response?.status || 500,
      );
    }
  }

  // ========== Datasets (petit, pas besoin de streaming) ==========
  async listDatasets(req: AuthenticatedRequest): Promise<IDataset[]> {
    const { sub, email } = this.getUserInfo(req);
    
    try {
      const response = await firstValueFrom(
        this.httpService.get<IDataset[]>(
          `${this.datasetServiceBaseUrl}/datasets`,
          {
            headers: this.buildAuthHeaders(sub, email),
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to list datasets for user ${sub}`, error);
      throw new HttpException(
        error.response?.data || 'Failed to list datasets',
        error.response?.status || 500,
      );
    }
  }

  async getDatasetMeta(datasetId: string, req: AuthenticatedRequest): Promise<IDatasetMeta> {
    const { sub, email } = this.getUserInfo(req);
    
    try {
      const response = await firstValueFrom(
        this.httpService.get<IDatasetMeta>(
          `${this.datasetServiceBaseUrl}/dataset_meta`,
          { 
            params: { dataset_id: datasetId },
            headers: this.buildAuthHeaders(sub, email),
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get dataset meta for ${datasetId} (user: ${sub})`, error);
      throw new HttpException(
        error.response?.data || 'Failed to get dataset metadata',
        error.response?.status || 500,
      );
    }
  }

  async deleteDataset(datasetId: string, req: AuthenticatedRequest): Promise<{ message: string }> {
    const { sub, email } = this.getUserInfo(req);
    
    try {
      const response = await firstValueFrom(
        this.httpService.delete<{ message: string }>(
          `${this.datasetServiceBaseUrl}/datasets/${datasetId}`,
          {
            headers: this.buildAuthHeaders(sub, email),
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to delete dataset ${datasetId} (user: ${sub})`, error);
      throw new HttpException(
        error.response?.data || 'Failed to delete dataset',
        error.response?.status || 500,
      );
    }
  }

  // ========== Channels (petit, pas besoin de streaming) ==========
  async listChannels(datasetId: string, req: AuthenticatedRequest): Promise<IChannel[]> {
    const { sub, email } = this.getUserInfo(req);
    
    try {
      const response = await firstValueFrom(
        this.httpService.get<IChannel[]>(
          `${this.datasetServiceBaseUrl}/datasets/${datasetId}/channels`,
          {
            headers: this.buildAuthHeaders(sub, email),
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to list channels for dataset ${datasetId} (user: ${sub})`,
        error,
      );
      throw new HttpException(
        error.response?.data || 'Failed to list channels',
        error.response?.status || 500,
      );
    }
  }

  async getChannelTimeRange(channelId: string, req: AuthenticatedRequest): Promise<ITimeRange> {
    const { sub, email } = this.getUserInfo(req);
    
    try {
      const response = await firstValueFrom(
        this.httpService.get<ITimeRange>(
          `${this.datasetServiceBaseUrl}/channels/${channelId}/time_range`,
          {
            headers: this.buildAuthHeaders(sub, email),
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to get time range for channel ${channelId} (user: ${sub})`,
        error,
      );
      throw new HttpException(
        error.response?.data || 'Failed to get channel time range',
        error.response?.status || 500,
      );
    }
  }

  async getApiConstraints(): Promise<IApiConstraints> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<IApiConstraints>(
          `${this.datasetServiceBaseUrl}/api/constraints`,
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get API constraints', error);
      throw new HttpException(
        error.response?.data || 'Failed to get API constraints',
        error.response?.status || 500,
      );
    }
  }

  async streamGetRequest(
    path: string,
    queryParams: any,
    incomingHeaders: any,
    res: Response,
    req: AuthenticatedRequest,
  ): Promise<void> {
    const { sub, email } = this.getUserInfo(req);

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const queryString = Object.entries(queryParams)
        .filter(([_, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');

      const fullPath = queryString ? `${path}?${queryString}` : path;

      this.logger.log(`🚀 Streaming GET ${fullPath}`);

      const httpModule = this.isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: this.backendHostname,
        port: this.backendPort,
        path: fullPath,
        method: 'GET',
        headers: {
          Accept: incomingHeaders?.accept || 'application/json',
          'User-Agent': 'NestJS-API-Gateway/1.0',
          'Accept-Encoding': 'gzip, deflate',
          'X-User-Sub': sub,
          'X-User-Email': email || '',
          'X-Gateway-Secret': this.gatewaySecret,
        },
      };

      const proxyReq = httpModule.request(options, (proxyRes) => {
        const statusCode = proxyRes.statusCode || 200;

        this.logger.log(`📥 FastAPI responded: ${statusCode}`);

        res.status(statusCode);

        Object.entries(proxyRes.headers).forEach(([key, value]) => {
          if (value !== undefined) {
            res.setHeader(key, value);
          }
        });

        let downloadedBytes = 0;
        let lastLoggedMB = 0;
        const logIntervalMB = 50; 

        proxyRes.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          const currentMB = Math.floor(downloadedBytes / (1024 * 1024));

          if (currentMB >= lastLoggedMB + logIntervalMB) {
            this.logger.log(`📥 Downloaded ${currentMB} MB...`);
            lastLoggedMB = currentMB;
          }
        });

        proxyRes.pipe(res);

        proxyRes.on('end', () => {
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          const sizeMB = (downloadedBytes / (1024 * 1024)).toFixed(2);
          const speedMBps = (
            downloadedBytes /
            1024 /
            1024 /
            parseFloat(duration)
          ).toFixed(2);

          this.logger.log(
            `✅ Stream completed: ${sizeMB} MB in ${duration}s (${speedMBps} MB/s)`,
          );
          resolve();
        });

        proxyRes.on('error', (error) => {
          this.logger.error('❌ Error streaming from FastAPI', error);
          reject(
            new HttpException(
              'Error streaming response',
              HttpStatus.BAD_GATEWAY,
            ),
          );
        });
      });

      proxyReq.on('error', (error) => {
        this.logger.error('❌ Connection error', error);
        reject(
          new HttpException(
            `Backend connection failed: ${error.message}`,
            HttpStatus.SERVICE_UNAVAILABLE,
          ),
        );
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        this.logger.error('⏱️  Request timeout');
        reject(
          new HttpException('Request timeout', HttpStatus.REQUEST_TIMEOUT),
        );
      });

      proxyReq.end();
    });
  }

  async streamPostRequest(
    path: string,
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    const { sub, email } = this.getUserInfo(req);

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      this.logger.log(`🚀 Streaming POST ${path}`);

      const httpModule = this.isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: this.backendHostname,
        port: this.backendPort,
        path: path,
        method: 'POST',
        headers: {
          ...req.headers,
          host: this.backendHostname,
          connection: 'keep-alive',
          'X-User-Sub': sub,
          'X-User-Email': email || '',
          'X-Gateway-Secret': this.gatewaySecret,
        },
      };

      const proxyReq = httpModule.request(options, (proxyRes) => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        this.logger.log(
          `📥 FastAPI responded: ${proxyRes.statusCode} after ${duration}s`,
        );

        res.status(proxyRes.statusCode || 200);
        Object.entries(proxyRes.headers).forEach(([key, value]) => {
          if (value !== undefined) {
            res.setHeader(key, value);
          }
        });

        proxyRes.pipe(res);

        proxyRes.on('end', () => {
          const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
          this.logger.log(`✅ POST stream completed in ${totalDuration}s`);
          resolve();
        });

        proxyRes.on('error', (error) => {
          this.logger.error('❌ Error receiving response', error);
          reject(
            new HttpException(
              'Error receiving backend response',
              HttpStatus.BAD_GATEWAY,
            ),
          );
        });
      });

      proxyReq.on('error', (error) => {
        this.logger.error('❌ POST connection error', error);
        reject(
          new HttpException(
            `Backend connection failed: ${error.message}`,
            HttpStatus.SERVICE_UNAVAILABLE,
          ),
        );
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        this.logger.error('⏱️  POST timeout');
        reject(
          new HttpException('Backend timeout', HttpStatus.REQUEST_TIMEOUT),
        );
      });

      let uploadedBytes = 0;
      let lastLoggedMB = 0;
      const logIntervalMB = 10;

      req.on('data', (chunk: Buffer) => {
        uploadedBytes += chunk.length;
        const currentMB = Math.floor(uploadedBytes / (1024 * 1024));

        if (currentMB >= lastLoggedMB + logIntervalMB) {
          this.logger.log(`📤 Uploaded ${currentMB} MB...`);
          lastLoggedMB = currentMB;
        }
      });

      req.on('end', () => {
        const sizeMB = (uploadedBytes / (1024 * 1024)).toFixed(2);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        const speedMBps = (
          uploadedBytes /
          1024 /
          1024 /
          parseFloat(duration)
        ).toFixed(2);

        this.logger.log(
          `📊 Upload complete: ${sizeMB} MB in ${duration}s (${speedMBps} MB/s)`,
        );
      });

      req.on('error', (error) => {
        this.logger.error('❌ Error reading request', error);
        proxyReq.destroy();
        reject(
          new HttpException(
            'Error reading request',
            HttpStatus.INTERNAL_SERVER_ERROR,
          ),
        );
      });

      req.pipe(proxyReq);
    });
  }
}