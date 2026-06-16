# 2Way

2Way is a privacy-first communication app combining secure messaging with push-to-talk walkie voice communication.

Think Signal meets Voxer — built with React Native, Expo, and Supabase.

## Run on your iPhone with Expo Go

This project is set up to run in **Expo Go**. You do **not** need to create a custom development build just to start the app on your iPhone.

### 1) Install dependencies

```bash
npm install
```

### 2) Create your local env file

Copy `.env.example` to `.env` and fill in your real values:

```bash
cp .env.example .env
```

Required values:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_PROJECT_ID`

### 3) Start Expo

If you're on Windows using Git Bash, the most reliable option is usually tunnel mode:

```bash
npx expo start --tunnel
```

Or use the package script:

```bash
npm run start:tunnel
```

### 4) Open on your iPhone

- Install **Expo Go** from the App Store.
- Scan the QR code from the terminal/browser.
- Make sure your phone has internet access.

## Important note about `npx expo start --ios`

`npx expo start --ios` tries to open the **iOS Simulator on macOS**. It does **not** launch on a physical iPhone from Windows.

If your goal is to run the app on your own iPhone with Expo Go, use:

```bash
npx expo start --tunnel
```

## When you would need a development build

You only need a custom dev build if you add native modules that Expo Go does not support. This repository currently uses Expo-managed packages and is intended to work in Expo Go.

## Troubleshooting

### "Missing development build" or similar message

That usually means the app was started in a mode expecting a custom native build, or a simulator-specific command was used.

Use:

```bash
npx expo start --tunnel
```

instead of:

```bash
npx expo start --ios
```

### Clear cache

```bash
npx expo start --tunnel --clear
```

### If env vars are missing

The app expects these variables in `.env`:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_PROJECT_ID`

Without them, the app may load incorrectly or fail when connecting to Supabase or notifications.

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
│   └── notifications.ts     # Push token registration, handlers, badge
│
├── constants/
│   └── theme.ts             # Colors, spacing, radius, typography
│
```
