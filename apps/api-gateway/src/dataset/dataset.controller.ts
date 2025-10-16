import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  ParseUUIDPipe,
  ValidationPipe,
  Req,
  Res,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { DatasetService } from './dataset.service';
import { WindowQueryDto, WindowFilteredQueryDto } from './dto/window-query.dto';
import { DatasetDto, DatasetMetaDto } from './dto/dataset.dto';
import { ChannelDto } from './dto/channel.dto';
import { TimeRangeDto } from './dto/time-range.dto';
import { IngestResponseDto } from './dto/ingest.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedRequest } from 'src/common/auth/interfaces/authenticated-request';

@Controller('dataset')
@ApiTags('Datasets')
export class DatasetController {
  constructor(private readonly datasetService: DatasetService) {}

  // ========== Health ==========
  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async healthCheck() {
    return this.datasetService.healthCheck();
  }

  // ========== Datasets ==========
  @Get('datasets')
  @Roles('ADMIN', 'USER')
  @ApiOperation({ summary: 'List all datasets' })
  @ApiResponse({
    status: 200,
    description: 'List of datasets',
    type: [DatasetDto],
  })
  async listDatasets(@Req() req: AuthenticatedRequest): Promise<DatasetDto[]> {
    return this.datasetService.listDatasets(req);
  }

  @Get('dataset_meta')
  @Roles('ADMIN', 'USER')
  @ApiOperation({ summary: 'Get dataset metadata' })
  @ApiQuery({
    name: 'dataset_id',
    type: String,
    description: 'Dataset UUID',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Dataset metadata',
    type: DatasetMetaDto,
  })
  @ApiResponse({ status: 404, description: 'Dataset not found' })
  async getDatasetMeta(
    @Query('dataset_id', new ParseUUIDPipe()) datasetId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<DatasetMetaDto> {
    return this.datasetService.getDatasetMeta(datasetId, req);
  }

  @Delete('datasets/:datasetId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a dataset' })
  @ApiParam({
    name: 'datasetId',
    type: String,
    description: 'Dataset UUID',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Dataset deleted successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Dataset deleted successfully' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Dataset not found' })
  async deleteDataset(
    @Param('datasetId', new ParseUUIDPipe()) datasetId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    return this.datasetService.deleteDataset(datasetId, req);
  }

  // ========== Channels ==========
  @Get('datasets/:datasetId/channels')
  @Roles('ADMIN', 'USER')
  @ApiOperation({ summary: 'List channels for a dataset' })
  @ApiParam({
    name: 'datasetId',
    type: String,
    description: 'Dataset UUID',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'List of channels',
    type: [ChannelDto],
  })
  @ApiResponse({ status: 404, description: 'Dataset not found' })
  async listChannels(
    @Param('datasetId', new ParseUUIDPipe()) datasetId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ChannelDto[]> {
    return this.datasetService.listChannels(datasetId, req);
  }

  @Get('channels/:channelId/time_range')
  @Roles('ADMIN', 'USER')
  @ApiOperation({ summary: 'Get channel time range' })
  @ApiParam({
    name: 'channelId',
    type: String,
    description: 'Channel UUID',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Channel time range',
    type: TimeRangeDto,
  })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  async getChannelTimeRange(
    @Param('channelId', new ParseUUIDPipe()) channelId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<TimeRangeDto> {
    return this.datasetService.getChannelTimeRange(channelId, req);
  }

  // ========== Data Windows avec STREAMING ==========
  @Get('window')
  @Roles('ADMIN', 'USER')
  @ApiOperation({
    summary: 'Get windowed sensor data with streaming (JSON or Arrow)',
    description:
      'Streams data directly from FastAPI without buffering. ' +
      'Supports both JSON and Apache Arrow formats with minimal overhead.',
  })
  @ApiResponse({
    status: 200,
    description: 'Windowed sensor data (JSON or Arrow format)',
  })
  async getWindow(
    @Query(new ValidationPipe({ transform: true })) query: WindowQueryDto,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const isArrowRequest = req.headers.accept?.includes(
        'application/vnd.apache.arrow.stream',
      );

      if (isArrowRequest) {
        res.set('Content-Type', 'application/vnd.apache.arrow.stream');
        res.set('Content-Disposition', 'attachment; filename="window.arrow"');
      } else {
        res.set('Content-Type', 'application/json');
      }

      await this.datasetService.streamGetRequest(
        '/window',
        query,
        req.headers,
        res,
        req,
      );
    } catch (error) {
      if (!res.headersSent) {
        throw new HttpException(
          error.message || 'Failed to get window data',
          error.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  @Get('get_window_filtered')
  @Roles('ADMIN', 'USER')
  @ApiOperation({
    summary: 'Get filtered window data with streaming (JSON or Arrow)',
    description:
      'Streams filtered data directly from FastAPI without buffering. ' +
      'Supports both JSON and Apache Arrow formats with minimal overhead.',
  })
  @ApiResponse({
    status: 200,
    description: 'Filtered window data (JSON or Arrow format)',
  })
  async getWindowFiltered(
    @Query(new ValidationPipe({ transform: true }))
    query: WindowFilteredQueryDto,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const isArrowRequest = req.headers.accept?.includes(
        'application/vnd.apache.arrow.stream',
      );

      if (isArrowRequest) {
        res.set('Content-Type', 'application/vnd.apache.arrow.stream');
        res.set(
          'Content-Disposition',
          'attachment; filename="window_filtered.arrow"',
        );
      } else {
        res.set('Content-Type', 'application/json');
      }

      await this.datasetService.streamGetRequest(
        '/get_window_filtered',
        query,
        req.headers,
        res,
        req,
      );
    } catch (error) {
      if (!res.headersSent) {
        throw new HttpException(
          error.message || 'Failed to get filtered window data',
          error.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  // ========== Ingestion avec STREAMING ==========
  @Post('ingest')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Ingest TDMS file via streaming proxy (zero-copy)',
    description:
      'Streams the file directly to FastAPI backend without buffering in memory. ' +
      'This is optimized for very large files (GB to TB range) with < 5% overhead.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'TDMS file to ingest',
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'TDMS file (.tdms extension)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'File ingested successfully',
    type: IngestResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file or Content-Type' })
  @ApiResponse({ status: 500, description: 'Ingestion failed' })
  @ApiResponse({ status: 408, description: 'Request timeout' })
  async ingestTdmsFileStream(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('multipart/form-data')) {
      throw new HttpException(
        'Content-Type must be multipart/form-data',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      await this.datasetService.streamPostRequest('/ingest', req, res);
    } catch (error) {
      if (!res.headersSent) {
        throw new HttpException(
          error.message || 'Failed to ingest file',
          error.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  @Get('api/constraints')
  @ApiOperation({ summary: 'Get API constraints for frontend validation' })
  @ApiResponse({
    status: 200,
    description: 'API constraints',
    schema: {
      type: 'object',
      properties: {
        points_min: { type: 'number', example: 10 },
        points_max: { type: 'number', example: 100000 },
        default_points: { type: 'number', example: 2000 },
        limit_min: { type: 'number', example: 10000 },
        limit_max: { type: 'number', example: 1000000 },
        default_limit: { type: 'number', example: 250000 },
        chunk_size: { type: 'number', example: 500000 },
      },
    },
  })
  async getApiConstraints() {
    return this.datasetService.getApiConstraints();
  }
}
