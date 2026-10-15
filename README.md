# Overview

Frontend for reviewing AQMS subnet triggers. An analyst looks at the
waveforms behind each trigger and labels it as a local event, a teleseism or
noise. Its backend is aqmsTriggerReviewBackend, which keeps its own user
accounts - separate from the duty review's - and the app manages them.

## Development

    npm install
    npm run dev

The dev server proxies `/api` to the backend at `http://127.0.0.3:8091`; see
`vite.config.ts` and `.env.example`.
