import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          phone: string | null;
          email: string | null;
          username: string;
          display_name: string;
          avatar_url: string | null;
          public_key: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      contacts: {
        Row: {
          id: string;
          owner_id: string;
          contact_user_id: string;
          status: 'pending' | 'accepted' | 'blocked';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['contacts']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['contacts']['Insert']>;
      };
      chats: {
        Row: {
          id: string;
          type: 'direct' | 'group';
          group_name: string | null;
          group_avatar_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['chats']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['chats']['Insert']>;
      };
      messages: {
        Row: {
          id: string;
          chat_id: string;
          sender_id: string;
          message_type: 'text' | 'audio' | 'system';
          content: string | null;
          audio_url: string | null;
          encryption_status: 'none' | 'in_transit' | 'e2e';
          expires_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['messages']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
      };
      push_tokens: {
        Row: {
          id: string;
          user_id: string;
          token: string;
          platform: 'ios' | 'android' | 'web';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['push_tokens']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['push_tokens']['Insert']>;
      };
      message_reads: {
        Row: {
          message_id: string;
          user_id: string;
          chat_id: string;
          read_at: string;
        };
        Insert: {
          message_id: string;
          user_id: string;
          chat_id: string;
          read_at?: string;
        };
        Update: Partial<Database['public']['Tables']['message_reads']['Insert']>;
      };
      group_keys: {
        Row: {
          chat_id: string;
          user_id: string;
          encrypted_sym_key: string;
          key_nonce: string;
          sender_public_key: string;
        };
        Insert: {
          chat_id: string;
          user_id: string;
          encrypted_sym_key: string;
          key_nonce: string;
          sender_public_key: string;
        };
        Update: Partial<Database['public']['Tables']['group_keys']['Insert']>;
      };
    };
  };
};
