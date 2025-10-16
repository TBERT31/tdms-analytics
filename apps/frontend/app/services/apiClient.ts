const API_GATEWAY_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'http://localhost:3001';

interface FetchOptions extends RequestInit {
  skipAuthRedirect?: boolean; 
}

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: FetchOptions = {}
  ): Promise<T> {
    const {
      skipAuthRedirect = false,
      headers = {},
      ...fetchOptions
    } = options;

    const url = `${API_GATEWAY_URL}${endpoint}`;

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
    const headersWithoutContentType = { ...headers };
    delete (headersWithoutContentType as any)['Content-Type'];
    
    return this.request<T>(endpoint, {
      ...restOptions,
      method: 'POST',
      headers: headersWithoutContentType as HeadersInit,
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
    const url = `${API_GATEWAY_URL}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      credentials: 'include', 
      headers: {
        'Accept': 'application/vnd.apache.arrow.stream',
        ...options?.headers,
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
  // Datasets
  getDatasets: () => 
    apiClient.get<any[]>('/dataset/datasets'),
  
  getDatasetChannels: (datasetId: string) => 
    apiClient.get<any[]>(`/dataset/datasets/${datasetId}/channels`),

  getChannelTimeRange: (channelId: string) => 
    apiClient.get<any>(`/dataset/channels/${channelId}/time_range`),
  
  getWindowFiltered: (params: URLSearchParams) => 
    apiClient.get<any>(`/dataset/get_window_filtered?${params}`),
  
  getWindowFilteredArrow: (params: URLSearchParams) => 
    apiClient.fetchArrow(`/dataset/get_window_filtered?${params}`),
  
  ingestTdms: (formData: FormData) => 
    apiClient.postFormData<any>('/dataset/ingest', formData),
  
  getConstraints: () => 
    apiClient.get<any>('/dataset/api/constraints'),
  
  getMultiWindow: (channelIds: string, points: number, agg: string) => 
    apiClient.get<any>(`/dataset/multi_window?channel_ids=${channelIds}&points=${points}&agg=${agg}`),
};

export const authApi = {
  checkSession: () => 
    apiClient.get<any>('/auth/check-session', { 
      skipAuthRedirect: true 
    }),
  
  getMe: () => 
    apiClient.get<any>('/users/me'),
  
  logout: () => {
    window.location.href = `${API_GATEWAY_URL}/auth/logout`;
  },
};

export default apiClient;