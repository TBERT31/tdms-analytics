export const API_ROUTES = {
  DATASETS: '/dataset/datasets',
  DATASET_META: '/dataset/dataset_meta',
  CHANNELS: (datasetId: string) => `/dataset/datasets/${datasetId}/channels`,
  CHANNEL_TIME_RANGE: (channelId: string) => `/dataset/channels/${channelId}/time_range`,
  WINDOW: '/dataset/window',
  WINDOW_FILTERED: '/dataset/get_window_filtered',
  INGEST: '/dataset/ingest',
  CONSTRAINTS: '/dataset/api/constraints',
} as const;

export const AUTH_ROUTES = {
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
  CALLBACK: '/auth/callback',
  CHECK_SESSION: '/auth/check-session',
  ME: '/users/me',
} as const;

export const DEFAULT_VALUES = {
  POINTS: 2000,
  ZOOM_POINTS: 5000,
  REQUEST_LIMIT: 250000,
  DOWNSAMPLING_METHOD: 'lttb' as const,
} as const;