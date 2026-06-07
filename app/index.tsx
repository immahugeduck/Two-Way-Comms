import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/(tabs)/chats');
      } else {
        router.replace('/auth/login');
      }
    });
  }, []);

  return null;
}
