# 2Way

2Way is a privacy-first communication app combining secure messaging with push-to-talk walkie voice communication.

Think Signal meets Voxer — built with React Native, Expo, and Supabase.

## Features (Phase 1–3)

- **Phone/email authentication** via Supabase Auth
- **E2E encrypted 1-on-1 text chat** (X25519 + NaCl box, same primitives as Signal)
- **Push-to-talk voice messages** — hold to record, slide up to cancel, tap to play
- **Group chats** with their own dedicated thread
- **Push notifications** via Expo + Supabase Edge Function (never exposes E2E ciphertext)
- **Contact discovery** by username or email
- **Privacy settings** with persistence (disappearing timer, read receipts, phone visibility)
- **AudioPlayer** with progress bar, elapsed/total duration, and auto-play on receive

## Tech Stack

| Layer | Tool |
|---|---|
| App | React Native + Expo (Expo Router) |
| Backend | Supabase |
| Database | PostgreSQL (Supabase) |
| Auth | Supabase Auth |
| E2E Crypto | tweetnacl (X25519 + XSalsa20-Poly1305) |
| Voice Recording | Expo AV |
| Real-time Messages | Supabase Realtime |
| File Storage | Supabase Storage |
| Push Notifications | Expo Notifications + Supabase Edge Function |
| Haptics | expo-haptics |

## Project Structure

```
2way/
├── app/
│   ├── _layout.tsx          # Root layout, auth listener, key setup, push registration
│   ├── index.tsx            # Entry redirect
│   ├── auth/
│   │   ├── login.tsx
│   │   └── signup.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx      # Tab bar
│   │   ├── chats.tsx        # Chat list (1-on-1 + groups)
│   │   ├── walkie.tsx       # Push-to-talk hub
│   │   ├── contacts.tsx     # Contact management
│   │   └── settings.tsx     # Privacy settings (persisted)
│   └── chats/
│       ├── [chatId].tsx     # Chat thread with inline PTT
│       └── new-group.tsx    # Group creation modal
│
├── components/
│   ├── MessageBubble.tsx    # Text + audio message bubble
│   ├── WalkieButton.tsx     # Hold-to-talk with cancel gesture + haptics
│   ├── AudioPlayer.tsx      # Progress bar, duration, play/pause
│   ├── PrivacyBadge.tsx     # Encryption status label
│   └── ContactCard.tsx      # Contact list row
│
├── lib/
│   ├── supabase.ts          # Supabase client + full TypeScript DB types
│   ├── keystore.ts          # X25519 key gen, SecureStore, public key sync
│   ├── encryption.ts        # NaCl box encrypt/decrypt, E2E payload validation
│   ├── audio.ts             # Record, upload, cancel, AudioPlayer handle
│   ├── messages.ts          # Send/fetch/subscribe, E2E auto-encrypt/decrypt
│   └── notifications.ts     # Push token registration, handlers, badge
│
├── constants/
│   └── theme.ts             # Colors, spacing, radius, typography
│
├── supabase/
│   ├── schema.sql           # Full DB schema + RLS policies
│   ├── migrations/
│   │   ├── 002_push_tokens.sql
│   │   └── 003_phase3.sql   # public_key on profiles, group_name on chats
│   └── functions/
│       └── send-push/       # Deno Edge Function — push on message INSERT
│
└── assets/
    └── logo.png             # 2Way logo
```

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/immahugeduck/Two-Way-Comms.git
cd Two-Way-Comms
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the SQL editor
3. Run `supabase/migrations/002_push_tokens.sql`
4. Run `supabase/migrations/003_phase3.sql`
5. Deploy the edge function: `supabase functions deploy send-push --project-ref <ref>`
6. Create a Database Webhook (table: `messages`, event: INSERT → send-push function URL)

### 3. Configure environment

```bash
cp .env.example .env
# Fill in your Supabase URL, anon key, and Expo project ID
```

### 4. Run

```bash
npx expo start
```

## Core Principle

> Private communication should be simple, fast, and honest.

## Roadmap

| Phase | Feature | Status |
|---|---|---|
| 1 | Auth, chat, PTT foundation, contacts, privacy | ✅ |
| 2 | Push notifications | ✅ |
| 3 | E2E encryption + PTT overhaul + group chats | ✅ |
| 4 | Profile (avatar, phone OTP, QR sharing), group E2E, read receipts | 🔜 |
| 5 | Video calls, screen share | 📋 |
| 6 | Desktop app (Electron / Tauri) | 📋 |
