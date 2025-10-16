export interface IChannel {
  channel_id: string;
  dataset_id: string;
  group_name: string;
  channel_name: string;
  unit: string;
  has_time: boolean;
  n_rows: number;
}

export interface ITimeRange {
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