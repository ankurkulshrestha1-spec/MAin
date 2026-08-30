import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  CompareResponse, FundDetail, FundSummary, HealthResponse,
  Period, RankingsResponse, ReturnWindow, ScrapeResult,
} from './types';

export function useFunds(options: { managedOnly?: boolean; rankWindow?: ReturnWindow } = {}) {
  const params = new URLSearchParams();
  if (options.managedOnly) params.set('managed', 'true');
  if (options.rankWindow) params.set('rankWindow', options.rankWindow);
  const qs = params.toString();

  return useQuery({
    queryKey: ['funds', options.managedOnly ?? false, options.rankWindow ?? 'y1'],
    queryFn: () => api.get<FundSummary[]>(`/api/funds${qs ? `?${qs}` : ''}`),
  });
}

export function useFundDetail(id: string | number | undefined, period: Period) {
  return useQuery({
    queryKey: ['fund', String(id), period],
    queryFn: () => api.get<FundDetail>(`/api/funds/${id}?period=${period}`),
    enabled: id !== undefined,
  });
}

export function useCompare(ids: Array<string | number>, period: Period) {
  return useQuery({
    queryKey: ['compare', ids.join(','), period],
    queryFn: () =>
      api.get<CompareResponse>(`/api/compare?ids=${ids.join(',')}&period=${period}`),
    enabled: ids.length > 0,
  });
}

export function useRankings(window: ReturnWindow) {
  return useQuery({
    queryKey: ['rankings', window],
    queryFn: () => api.get<RankingsResponse>(`/api/rankings?window=${window}`),
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/api/health'),
    retry: false,
  });
}

export function useSetManaged() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isManaged }: { id: number; isManaged: boolean }) =>
      api.patch<FundDetail>(`/api/funds/${id}`, { isManaged }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['funds'] });
      queryClient.invalidateQueries({ queryKey: ['fund', String(variables.id)] });
    },
  });
}

export function useTriggerScrape() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ScrapeResult>('/api/scrape'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funds'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
    },
  });
}
