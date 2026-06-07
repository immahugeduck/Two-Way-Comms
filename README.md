# Relay Secure Walkie

Relay is a privacy-first communication app combining secure messaging with push-to-talk walkie voice communication.

Think Signal meets Voxer — built with React Native, Expo, and Supabase.

## Phase 1 Features

- Phone/email authentication via Supabase Auth
- One-on-one encrypted-style text chat
- Push-to-talk voice messages (hold to record, tap to play)
- Contact discovery by username or email
- Privacy-focused interface with encryption status labels
- Disappearing message timer settings
- Foundation for end-to-end encryption (Phase 2: Signal Protocol)

## Tech Stack

| Layer | Tool |
|---|---|
| App | React Native + Expo (Expo Router) |
| Backend | Supabase |
| Database | PostgreSQL (Supabase) |
| Auth | Supabase Auth |
| Voice Recording | Expo AV |
| Real-time Messages | Supabase Realtime |
| File Storage | Supabase Storage |
| Encryption (Phase 2) | Signal Protocol / libsignal |

## Project Structure

```
relay-secure-walkie/
├── app/
│   ├── _layout.tsx          # Root layout + auth state listener
│   ├── index.tsx            # Entry redirect
│   ├── auth/
│   │   ├── login.tsx
│   │   └── signup.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx      # Tab bar
│   │   ├── chats.tsx        # Chat list
│   │   ├── walkie.tsx       # Push-to-talk screen
│   │   ├── contacts.tsx     # Contact management
│   │   └── settings.tsx     # Privacy settings
│   └── chats/
│       └── [chatId].tsx     # Individual chat screen
│
├── components/
│   ├── MessageBubble.tsx    # Text + audio message bubble
│   ├── WalkieButton.tsx     # Animated hold-to-talk button
│   ├── PrivacyBadge.tsx     # Encryption status label
│   └── ContactCard.tsx      # Contact list row
│
├── lib/
│   ├── supabase.ts          # Supabase client + DB types
│   ├── audio.ts             # Record, upload, playback
│   ├── messages.ts          # Send/fetch/subscribe to messages
│   └── encryption.ts        # Encryption layer (Phase 2 placeholder)
│
├── constants/
│   └── theme.ts             # Colors, spacing, typography
│
├── supabase/
│   └── schema.sql           # Full DB schema + RLS policies
│
└── assets/
```

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/immahugeduck/two-way-comms.git
cd two-way-comms
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the SQL editor
3. Copy your project URL and anon key

### 3. Configure environment

```bash
cp .env.example .env
# Fill in your Supabase URL and anon key
```

### 4. Run

```bash
npx expo start
```

Scan the QR code with Expo Go on your phone, or press `i` for iOS simulator / `a` for Android.

## Core Principle

> Private communication should be simple, fast, and honest.

## Roadmap

| Phase | Feature |
|---|---|
| 1 ✅ | Auth, chat, PTT voice, contacts, privacy settings |
| 2 | Signal Protocol E2E encryption |
| 3 | Group chats, channels |
| 4 | Video calls, screen share |
| 5 | Desktop app (Electron) |
