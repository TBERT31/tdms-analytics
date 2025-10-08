import { Injectable, HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import { IDataset, IDatasetMeta } from './interfaces/dataset.interface';
import { IChannel, ITimeRange } from './interfaces/channel.interface';
import {
  IWindowResponse,
  IWindowFilteredResponse,
  IHealthResponse,
  IApiConstraints,
} from './interfaces/api-response.interface';
import { WindowQueryDto, WindowFilteredQueryDto } from './dto/window-query.dto';
import FormData = require('form-data');

@Injectable()
export class DatasetService {
  private readonly logger = new Logger(DatasetService.name);
  private readonly datasetServiceBaseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.datasetServiceBaseUrl = this.configService.get<string>(
      'DATASET_SERVICE_BASE_URL',
      'http://localhost:8000',
    );
    this.logger.log(`Dataset Service Base URL: ${this.datasetServiceBaseUrl}`);
  }

  // ========== Health ==========
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

  // ========== Datasets ==========
  async listDatasets(): Promise<IDataset[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<IDataset[]>(
          `${this.datasetServiceBaseUrl}/datasets`,
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to list datasets', error);
      throw new HttpException(
        error.response?.data || 'Failed to list datasets',
        error.response?.status || 500,
      );
    }
  }

  async getDatasetMeta(datasetId: string): Promise<IDatasetMeta> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<IDatasetMeta>(
          `${this.datasetServiceBaseUrl}/dataset_meta`,
          { params: { dataset_id: datasetId } },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get dataset meta for ${datasetId}`, error);
      throw new HttpException(
        error.response?.data || 'Failed to get dataset metadata',
        error.response?.status || 500,
      );
    }
  }

  async deleteDataset(datasetId: string): Promise<{ message: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.delete<{ message: string }>(
          `${this.datasetServiceBaseUrl}/datasets/${datasetId}`,
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to delete dataset ${datasetId}`, error);
      throw new HttpException(
        error.response?.data || 'Failed to delete dataset',
        error.response?.status || 500,
      );
    }
  }

  // ========== Channels ==========
  async listChannels(datasetId: string): Promise<IChannel[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<IChannel[]>(
          `${this.datasetServiceBaseUrl}/datasets/${datasetId}/channels`,
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to list channels for dataset ${datasetId}`,
        error,
      );
      throw new HttpException(
        error.response?.data || 'Failed to list channels',
        error.response?.status || 500,
      );
    }
  }

  async getChannelTimeRange(channelId: string): Promise<ITimeRange> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<ITimeRange>(
          `${this.datasetServiceBaseUrl}/channels/${channelId}/time_range`,
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to get time range for channel ${channelId}`,
        error,
      );
      throw new HttpException(
        error.response?.data || 'Failed to get channel time range',
        error.response?.status || 500,
      );
    }
  }

  // ========== Data Windows ==========
  async getWindow(
    query: WindowQueryDto,
    headers?: any,
  ): Promise<IWindowResponse | AxiosResponse> {
    try {
      const config: any = {
        params: query,
      };

      // Forward Accept header for Arrow support
      if (headers?.accept) {
        config.headers = { Accept: headers.accept };
        config.responseType = 'arraybuffer';
      }

      const response = await firstValueFrom(
        this.httpService.get(`${this.datasetServiceBaseUrl}/window`, config),
      );

      return response;
    } catch (error) {
      this.logger.error('Failed to get window data', error);
      throw new HttpException(
        error.response?.data || 'Failed to get window data',
        error.response?.status || 500,
      );
    }
  }

  async getWindowFiltered(
    query: WindowFilteredQueryDto,
    headers?: any,
  ): Promise<IWindowFilteredResponse | AxiosResponse> {
    try {
      const config: any = {
        params: query,
      };

      // Forward Accept header for Arrow support
      if (headers?.accept) {
        config.headers = { Accept: headers.accept };
        config.responseType = 'arraybuffer';
      }

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.datasetServiceBaseUrl}/get_window_filtered`,
          config,
        ),
      );

      return response;
    } catch (error) {
      this.logger.error('Failed to get filtered window data', error);
      throw new HttpException(
        error.response?.data || 'Failed to get filtered window data',
        error.response?.status || 500,
      );
    }
  }

  // ========== Ingestion ==========
  async ingestTdmsFile(file: Express.Multer.File): Promise<any> {
    try {
      const formData = new FormData();
      
      formData.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.datasetServiceBaseUrl}/ingest`,
          formData,
          {
            headers: {
              ...formData.getHeaders(), 
            },
            maxBodyLength: Infinity, 
            maxContentLength: Infinity,
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to ingest TDMS file', error);
      throw new HttpException(
        error.response?.data || 'Failed to ingest file',
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
}