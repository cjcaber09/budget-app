import {invalidateReports} from '../lib/reportCache';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Category } from '../types/database';

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}

export interface AddCategoryInput {
  name: string;
  color: string;
}

export function useAddCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, color }: AddCategoryInput) => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const { error } = await supabase.from('categories').insert({
        user_id: userData.user.id,
        name,
        color,
        icon: 'tag',
        is_default: false,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateReports(queryClient);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export interface UpdateCategoryInput {
  id: string;
  name: string;
  color: string;
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name, color }: UpdateCategoryInput) => {
      const { error } = await supabase.from('categories').update({ name, color }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateReports(queryClient);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}
