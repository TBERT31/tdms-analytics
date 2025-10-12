const API_GATEWAY_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'http://localhost:3001';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

interface FetchOptions extends RequestInit {
  useGateway?: boolean; 
  skipAuthRedirect?: boolean; 
}

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: FetchOptions = {}
  ): Promise<T> {
    const {
      useGateway = false,
      skipAuthRedirect = false,
      headers = {},
      ...fetchOptions
    } = options;

    const baseUrl = useGateway ? API_GATEWAY_URL : API_BASE;
    const url = `${baseUrl}${endpoint}`;

    const defaultHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      ...headers,
    };

    const config: RequestInit = {
      ...fetchOptions,
      headers: defaultHeaders,
      credentials: 'include', 
      cache: 'no-store', 
    };

    try {
      const response = await fetch(url, config);

      if (response.status === 401 && !skipAuthRedirect) {
        console.warn('Session expirée, redirection vers login');
        window.location.href = `${API_GATEWAY_URL}/auth/login`;
        throw new Error('Session expirée');
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Erreur API [${endpoint}]:`, error);
      throw error;
    }
  }

  async get<T>(endpoint: string, options?: FetchOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(
    endpoint: string,
    data?: any,
    options?: FetchOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async postFormData<T>(
    endpoint: string,
    formData: FormData,
    options?: FetchOptions
  ): Promise<T> {
    const { headers, ...restOptions } = options || {};

    return this.request<T>(endpoint, {
      ...restOptions,
      method: 'POST',
      headers: {
        ...headers,
      } as HeadersInit,
      body: formData,
    });
  }

  async put<T>(
    endpoint: string,
    data?: any,
    options?: FetchOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string, options?: FetchOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  async fetchArrow(endpoint: string, options?: FetchOptions): Promise<Response> {
    const { useGateway = false, ...fetchOptions } = options || {};
    const baseUrl = useGateway ? API_GATEWAY_URL : API_BASE;
    const url = `${baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...fetchOptions,
      credentials: 'include',
      headers: {
        'Accept': 'application/vnd.apache.arrow.stream',
        ...fetchOptions.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return response;
  }
}

export const apiClient = new ApiClient();

export const datasetApi = {
  getDatasets: () => 
    apiClient.get<any[]>('/datasets'),
  
  getDatasetChannels: (datasetId: string) => 
    apiClient.get<any[]>(`/datasets/${datasetId}/channels`),
  
  getChannelTimeRange: (channelId: string) => 
    apiClient.get<any>(`/channels/${channelId}/time_range`),
  
  getWindowFiltered: (params: URLSearchParams) => 
    apiClient.get<any>(`/get_window_filtered?${params}`),
  
  getWindowFilteredArrow: (params: URLSearchParams) => 
    apiClient.fetchArrow(`/get_window_filtered?${params}`),
  
  ingestTdms: (formData: FormData) => 
    apiClient.postFormData<any>('/ingest', formData),
  
  getConstraints: () => 
    apiClient.get<any>('/api/constraints'),
  
  getMultiWindow: (channelIds: string, points: number, agg: string) => 
    apiClient.get<any>(`/multi_window?channel_ids=${channelIds}&points=${points}&agg=${agg}`),
};

export const authApi = {
  checkSession: () => 
    apiClient.get<any>('/auth/check-session', { 
      useGateway: true, 
      skipAuthRedirect: true 
    }),
  
  getMe: () => 
    apiClient.get<any>('/users/me', { useGateway: true }),
  
  logout: () => {
    window.location.href = `${API_GATEWAY_URL}/auth/logout`;
  },
};

export default apiClient;