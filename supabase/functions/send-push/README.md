# send-push Edge Function

Triggered by a Supabase Database Webhook on `messages` INSERT.
Looks up Expo push tokens for all chat recipients and delivers
notifications via the Expo Push API.

## Deploy

```bash
supabase functions deploy send-push --project-ref <your-project-ref>
```

## Database Webhook setup (Supabase Dashboard)

1. Go to **Database → Webhooks → Create a new hook**
2. Name: `on_new_message`
3. Table: `messages`
4. Events: ✅ Insert
5. Webhook URL: `https://<your-project-ref>.supabase.co/functions/v1/send-push`
6. HTTP Headers:
   - `Authorization`: `Bearer <your-service-role-key>`
   - `Content-Type`: `application/json`

## Environment variables (set in Supabase Dashboard → Edge Functions)

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (never expose to client) |

These are automatically injected by Supabase when the function runs.
