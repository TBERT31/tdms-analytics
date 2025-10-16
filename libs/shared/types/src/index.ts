export interface Dataset {
  dataset_id: string;
  filename: string;
  created_at: string;
  total_points: number;
}

export interface Channel {
  channel_id: string;
  dataset_id: string;
  group_name: string;
  channel_name: string;
  unit: string;
  has_time: boolean;
  n_rows: number;
}

export interface TimeRange {
  channel_id: string;
  has_time: boolean;
  min_timestamp?: number;
  max_timestamp?: number;
  min_iso?: string;
  max_iso?: string;
  min_index?: number;
  max_index?: number;
  total_points: number;
}

export interface ApiConstraints {
  points: { min: number; max: number; default: number };
  limit: { min: number; max: number; default: number };
}

export type DownsamplingMethod = 'lttb' | 'uniform' | 'clickhouse';